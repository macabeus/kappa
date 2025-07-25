import * as vscode from 'vscode';
import { loadKappaConfig, KappaConfigPlatforms } from '../configurations/kappa-config-json';
import { database } from '../db/db';
import { getWorkspaceRoot } from '../utils/vscode-utils';

// Platform mapping from Kappa to decomp.me
const platformMapping: Record<KappaConfigPlatforms, string> = {
  gba: 'gba',
  nds: 'nds',
  n3ds: '3ds',
};

// Default compilers for each platform
const defaultCompilers: Record<KappaConfigPlatforms, string> = {
  gba: 'agbcc',
  nds: 'gcc2.95.3',
  n3ds: 'gcc4.9.2',
};

type CreateScratchPayload = {
  target_asm: string;
  context: string;
  platform: string;
  compiler: string;
  compiler_flags?: string;
  diff_flags: string[];
  diff_label: string;
  preset?: number;
};

type CreateScratchResponse = {
  slug: string;
  claim_token: string;
};

const decompMeUrl = 'https://decomp.me';

/**
 * Create a new scratch on decomp.me for the given function
 */
export async function createDecompMeScratch(functionId: string): Promise<void> {
  try {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('No workspace found.');
      return;
    }

    // Load Kappa configuration
    const kappaConfig = await loadKappaConfig();

    if (!kappaConfig) {
      vscode.window.showErrorMessage('Kappa configuration not found. Please run Kappa setup first.');
      return;
    }

    if (!kappaConfig.decompme) {
      vscode.window.showErrorMessage(
        'decomp.me integration is not configured. Please update your Kappa configuration.',
      );
      return;
    }

    // Get function from database
    const decompFunction = await database.getFunctionById(functionId);
    if (!decompFunction) {
      vscode.window.showErrorMessage(`Function with ID "${functionId}" not found in database.`);
      return;
    }

    // Map platform
    const decompMePlatform = platformMapping[kappaConfig.platform];
    if (!decompMePlatform) {
      vscode.window.showErrorMessage(`Platform "${kappaConfig.platform}" is not supported by decomp.me integration.`);
      return;
    }

    // Get compiler
    const compiler = kappaConfig.decompme.compiler;

    // Get context
    const contextPath = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), kappaConfig.decompme.contextPath);
    let context: string;
    try {
      const contextContent = await vscode.workspace.fs.readFile(contextPath);
      context = new TextDecoder().decode(contextContent);
    } catch (error) {
      vscode.window.showWarningMessage(`Could not read context file: ${kappaConfig.decompme.contextPath}`);
      return;
    }

    // Prepare payload
    const payload: CreateScratchPayload = {
      target_asm: decompFunction.asmCode,
      context: context,
      platform: decompMePlatform,
      compiler: compiler,
      diff_flags: [`--disassemble=${decompFunction.name}`],
      diff_label: decompFunction.name,
    };

    // Add preset if configured
    if (kappaConfig.decompme?.preset) {
      payload.preset = kappaConfig.decompme.preset;
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
