import { parse } from '@ast-grep/napi';
import * as vscode from 'vscode';

import { DecompYamlPlatforms, ensureDecompYamlDefinesTool } from '@configurations/decomp-yaml';
import { DecompFunction, database } from '@db/db';
import { getWorkspaceUri } from '@utils/vscode-utils';
import { CtxDecompYaml } from '~/context';
import { getFuncContext } from '~/get-context-from-asm-function';

// Platform mapping from decomp.yaml to decomp.me
const platformMapping: Record<DecompYamlPlatforms, string> = {
  gba: 'gba',
  nds: 'nds_arm9',
  n3ds: 'n3ds',
  n64: 'n64',
  gc: 'gc_wii',
  wii: 'gc_wii',
  ps1: 'ps1',
  ps2: 'ps2',
  psp: 'psp',
  win32: 'win32',
};

type CreateScratchPayload = {
  target_asm: string;
  context: string;
  platform: string;
  compiler: string;
  compiler_flags?: string;
  diff_label: string;
  preset?: number;
  source_code?: string;
};

type CreateScratchResponse = {
  slug: string;
  claim_token: string;
};

const decompMeUrl = 'https://decomp.me';

async function getInitialSourceCode(context: string, decompFunction: DecompFunction): Promise<string | undefined> {
  const { asmDeclaration, calledFunctionsDeclarations, typeDefinitions } = await getFuncContext(decompFunction);

  let initialSourceCode = '';

  // Target function code
  if (asmDeclaration) {
    initialSourceCode = asmDeclaration.replace(/;/g, ' {\n    // ...\n}\n');
  }

  // Add called functions declarations
  const declarationsNotInContext = Object.keys(calledFunctionsDeclarations).filter((name) => !context.includes(name));
  const declarationsSourceCode = declarationsNotInContext.map((name) => calledFunctionsDeclarations[name]).join('\n');
  initialSourceCode = `${declarationsSourceCode}\n\n${initialSourceCode}`;

  // Add type definitions
  const typesNotInContext = typeDefinitions.filter((type) => {
    const typeSource = parse('c', type);
    const typeName = typeSource
      .root()
      .find({
        rule: {
          kind: 'type_identifier',
          inside: {
            kind: 'type_definition',
          },
        },
      })
      ?.text();

    if (!typeName) {
      return false;
    }

    const inContext = context.includes(typeName);
    return !inContext;
  });
  initialSourceCode = `${typesNotInContext.join('\n\n')}\n${initialSourceCode}`;

  return initialSourceCode;
}

/**
 * Create a new scratch on decomp.me for the given function
 */
export async function createDecompMeScratch(ctx: CtxDecompYaml, functionId: string): Promise<void> {
  try {
    const workspaceUri = getWorkspaceUri();

    const decompmeTool = await ensureDecompYamlDefinesTool({ ctx, tool: 'decompme' });

    // Get function from database
    const decompFunction = await database.getFunctionById(functionId);
    if (!decompFunction) {
      vscode.window.showErrorMessage(`Function with ID "${functionId}" not found in database.`);
      return;
    }

    // Map platform
    const decompMePlatform = platformMapping[ctx.decompYaml.platform];
    if (!decompMePlatform) {
      vscode.window.showErrorMessage(
        `Platform "${ctx.decompYaml.platform}" is not supported by decomp.me integration.`,
      );
      return;
    }

    // Get context
    const contextPath = vscode.Uri.joinPath(workspaceUri, decompmeTool.contextPath);
    let context: string;
    try {
      const contextContent = await vscode.workspace.fs.readFile(contextPath);
      context = new TextDecoder().decode(contextContent);
    } catch {
      vscode.window.showWarningMessage(`Could not read context file: ${decompmeTool.contextPath}`);
      return;
    }

    // Get initial source code
    const initialSourceCode = await getInitialSourceCode(context, decompFunction);

    // Prepare payload
    const payload: CreateScratchPayload = {
      target_asm: decompFunction.asmCode,
      context,
      platform: decompMePlatform,
      compiler: decompmeTool.compiler,
      diff_label: decompFunction.name,
      source_code: initialSourceCode,
    };

    // Add preset if configured
    if (decompmeTool.preset) {
      payload.preset = decompmeTool.preset;
    }

    // Show progress while creating scratch
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Creating decomp.me scratch...',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 30, message: 'Sending request to decomp.me...' });

        // Create scratch
        const response = await fetch(`${decompMeUrl}/api/scratch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        progress.report({ increment: 40, message: 'Processing response...' });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to create scratch: ${response.status} ${response.statusText}\n${errorText}`);
        }

        const result = (await response.json()) as CreateScratchResponse;

        progress.report({ increment: 30, message: 'Opening scratch...' });

        // Build the scratch URL
        const scratchUrl = `${decompMeUrl}/scratch/${result.slug}/claim?token=${result.claim_token}`;

        // Open the scratch in browser
        await vscode.env.openExternal(vscode.Uri.parse(scratchUrl));

        vscode.window.showInformationMessage(`Scratch created successfully! Opening in browser...`);
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to create decomp.me scratch: ${errorMessage}`);
    console.error('Error creating decomp.me scratch:', error);
  }
}
