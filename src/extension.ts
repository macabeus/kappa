import * as vscode from 'vscode';
import type { BaseLanguageClient } from 'vscode-languageclient';
import { activateClangd } from './clangd/activate-clangd';
import { ClangdExtension } from './clangd/vscode-clangd';
import { ASTVisitor } from './ast-visitor';
import { ASTRequestType } from './clangd/ast';
import { runTestsForCurrentKappaPlugin, loadKappaPlugins } from './kappa-plugins';
import { ClangdExtensionImpl } from './clangd/api';
import { createDecompilePromptFile, DecompilePromptCodeActionProvider } from './prompt-builder/prompt-builder';
import { AttachCodeActionProvider } from './prompt-builder/attach-code-action-provider';
import { attachedCodeStorage } from './prompt-builder/attached-code-storage';
import { AttachedCodeStatusBar } from './prompt-builder/attached-code-status-bar';
import { registerClangLanguage } from './utils/ast-grep-utils';

// Constants for configuration
const CLANGD_CHECK_INTERVAL = 100;
const CLANGD_CHECK_TIMEOUT = 30_000;

/**
 * Waits for the clangd client to be running with timeout
 */
async function waitForClangdClient(clangd: ClangdExtensionImpl): Promise<ClangdExtensionImpl> {
  const startTime = Date.now();

  return new Promise<ClangdExtensionImpl>((resolve, reject) => {
    const check = () => {
      if (clangd.client?.isRunning()) {
        resolve(clangd);
        return;
      }

      if (Date.now() - startTime > CLANGD_CHECK_TIMEOUT) {
        reject(new Error('Timeout waiting for clangd client to start'));
        return;
      }

      setTimeout(check, CLANGD_CHECK_INTERVAL);
    };

    check();
  });
}

/**
 * Gets the clangd client instance, throwing an error if not available
 */
async function getClangdClient(apiInstance: Promise<ClangdExtensionImpl>): Promise<BaseLanguageClient> {
  const api = await apiInstance;
  const client = api.client;

  if (!client) {
    throw new Error('Clangd client is not available');
  }

  return client;
}

export async function activate(context: vscode.ExtensionContext): Promise<ClangdExtension> {
  let apiInstance: Promise<ClangdExtensionImpl>;

  try {
    const clangd = await activateClangd(context);
    apiInstance = waitForClangdClient(clangd);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to activate clangd: ${error}`);
    throw error;
  }

  // Initialize status bar for attached code
  const statusBar = new AttachedCodeStatusBar();
  context.subscriptions.push(statusBar);

  // Register commands
  vscode.commands.registerCommand('kappa.runKappaPlugins', async () => {
    const client = await getClangdClient(apiInstance);
    const converter = client.code2ProtocolConverter;
    const editor = vscode.window.activeTextEditor;

    const item = await client.sendRequest(ASTRequestType, {
      textDocument: converter.asTextDocumentIdentifier(editor!.document),
      range: converter.asRange(editor!.selection),
    });

    if (!item) {
      vscode.window.showErrorMessage('No AST found for the current selection.');
      return;
    }

    const visitor = new ASTVisitor(client);

    // Load custom plugins from kappa-plugins folder
    await loadKappaPlugins(visitor);

    await visitor.walk(item);

    await visitor.applyPendingEdits();
  });

  vscode.commands.registerCommand('kappa.runTestsForCurrentKappaPlugin', async () => {
    const client = await getClangdClient(apiInstance);
    const visitor = new ASTVisitor(client);
    await runTestsForCurrentKappaPlugin(visitor);

    vscode.window.showInformationMessage('Tests for current Kappa plugin completed.');
  });

  vscode.commands.registerCommand('kappa.buildDecompilePrompt', async () => {
    registerClangLanguage();

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showErrorMessage('Please select an assembly function to build a decompilation prompt.');
      return;
    }

    const assemblyCode = editor.document.getText(editor.selection);
    await createDecompilePromptFile(assemblyCode);
  });

  vscode.commands.registerCommand('kappa.attachCodeForPrompt', async (selectedCode: string) => {
    attachedCodeStorage.attach(selectedCode);
    statusBar.updateStatusBar();

    const attachedMessage = attachedCodeStorage.hasAttached()
      ? 'Code attached for next decompilation prompt. It will be automatically included when you build the next prompt.'
      : 'Failed to attach code.';

    vscode.window.showInformationMessage(attachedMessage);
  });

  vscode.commands.registerCommand('kappa.clearAttachedCode', async () => {
    attachedCodeStorage.clear();
    statusBar.updateStatusBar();
    vscode.window.showInformationMessage('Attached code cleared.');
  });

  vscode.commands.registerCommand('kappa.updateStatusBar', async () => {
    statusBar.updateStatusBar();
  });

  // Register code actions
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [{ language: 'arm' }, { pattern: '**/*.{s,S,asm}' }],
      new DecompilePromptCodeActionProvider(),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.Refactor],
      },
    ),
  );

  // Register code action provider for attaching code (works on all file types)
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      '*', // Apply to all file types
      new AttachCodeActionProvider(),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.RefactorRewrite],
      },
    ),
  );

  return apiInstance;
}
