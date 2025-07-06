import * as vscode from 'vscode';
import type { BaseLanguageClient } from 'vscode-languageclient';
import { activateClangd } from './clangd/activate-clangd';
import { ClangdExtension } from './clangd/vscode-clangd';
import { ASTVisitor } from './ast-visitor';
import { ASTRequestType } from './clangd/ast';
import { runTestsForCurrentKappaPlugin, loadKappaPlugins } from './kappa-plugins';
import { ClangdExtensionImpl } from './clangd/api';
import { createDecompilePromptFile } from './prompt-builder/prompt-builder';
import { registerClangLanguage } from './utils/ast-grep-utils';
import { indexCodebase } from './db/index-codebase';
import { showChart } from './db/show-chart';
import { AssemblyCodeLensProvider } from './providers/assembly-code-lens';

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

  // Register providers
  const codeLensProvider = new AssemblyCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider([{ language: 'arm' }, { pattern: '**/*.{s,S,asm}' }], codeLensProvider),
  );

  // Register commands
  vscode.commands.registerCommand('kappa.indexCodebase', async () => {
    await indexCodebase();

    // Refresh code lenses after indexing
    codeLensProvider.refresh();
  });

  vscode.commands.registerCommand('kappa.runPromptBuilder', async (functionId?: string) => {
    registerClangLanguage();

    if (!functionId) {
      vscode.window.showErrorMessage('No function id provided when calling runPromptBuilder command.');
      return;
    }

    await createDecompilePromptFile(functionId);
  });

  vscode.commands.registerCommand('kappa.showChart', async () => {
    showChart();
  });

  vscode.commands.registerCommand('kappa.changeVoyageApiKey', async () => {
    const currentApiKey = vscode.workspace.getConfiguration('kappa').get('voyageApiKey', '');

    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your Voyage AI API Key',
      value: currentApiKey,
      password: true,
      placeHolder: 'pa-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      validateInput: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'API key cannot be empty';
        }
        if (!value.startsWith('pa-')) {
          return 'Voyage AI API key should start with "pa-"';
        }
        return null;
      },
    });

    if (apiKey !== undefined) {
      await vscode.workspace
        .getConfiguration('kappa')
        .update('voyageApiKey', apiKey, vscode.ConfigurationTarget.Global);

      vscode.commands.executeCommand('setContext', 'walkthroughVoyageApiKeySet', true);
    }
  });

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

  return apiInstance;
}
