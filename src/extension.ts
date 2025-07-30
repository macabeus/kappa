import * as vscode from 'vscode';
import type { BaseLanguageClient } from 'vscode-languageclient';
import { activateClangd } from './clangd/activate-clangd';
import { ClangdExtension } from './clangd/vscode-clangd';
import { ASTVisitor } from './ast-visitor';
import { ASTRequestType } from './clangd/ast';
import { runTestsForCurrentKappaPlugin, loadKappaPlugins } from './kappa-plugins';
import { ClangdExtensionImpl } from './clangd/api';
import { createDecompilePrompt } from './prompt-builder/prompt-builder';
import { registerClangLanguage } from './utils/ast-grep-utils';
import { removeAssemblyFunction } from './utils/asm-utils';
import { getRelativePath, getWorkspaceRoot, showFilePicker, showPicker } from './utils/vscode-utils';
import { database } from './db/db';
import { indexCodebase } from './db/index-codebase';
import { showChart } from './db/show-chart';
import { embeddingConfigManager } from './configurations/embedding-config';
import { GetDiffBetweenObjectFiles } from './language-model-tools/objdiff';
import { AssemblyCodeLensProvider } from './providers/assembly-code-lens';
import { objdiff } from './objdiff/objdiff';
import { createDecompYaml, ensureDecompYamlExists, loadDecompYaml } from './configurations/decomp-yaml';
import { createDecompMeScratch } from './decompme/create-scratch';

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

  // Initialize local embedding service
  database.initializeLocalEmbedding(context);

  // Register providers
  const codeLensProvider = new AssemblyCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider([{ language: 'arm' }, { pattern: '**/*.{s,S,asm}' }], codeLensProvider),
  );

  // Register commands
  vscode.commands.registerCommand('kappa.indexCodebase', async () => {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('No workspace found, cannot index codebase. Please open a folder instead.');
      return;
    }

    await indexCodebase();

    // Refresh code lenses after indexing
    codeLensProvider.refresh();
  });

  vscode.commands.registerCommand('kappa.runPromptBuilder', async (functionId?: string) => {
    registerClangLanguage();
    await ensureDecompYamlExists();

    if (!functionId) {
      // TODO: Should show a dropdown selector with all functions in the current file if in an assembly file;
      // otherwise, show all functions not decompiled. Use the database to get the list of functions.
      // For now, just show an error message.

      vscode.window.showErrorMessage('No function id provided when calling runPromptBuilder command.');
      return;
    }

    const decompFunction = await database.getFunctionById(functionId);
    if (!decompFunction) {
      vscode.window.showErrorMessage(`Function with ID "${functionId}" not found in database.`);
      return;
    }

    const prompt = await createDecompilePrompt(decompFunction, { type: 'ask' });
    if (!prompt) {
      return;
    }

    const document = await vscode.workspace.openTextDocument({
      content: prompt,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(document);
  });

  vscode.commands.registerCommand('kappa.startDecompilerAgent', async (functionId?: string) => {
    registerClangLanguage();
    await ensureDecompYamlExists();

    if (!functionId) {
      // TODO: Same as from `kappa.startDecompilerAgent`.
      vscode.window.showErrorMessage('No function id provided when calling startDecompilerAgent command.');
      return;
    }

    const decompFunction = await database.getFunctionById(functionId);
    if (!decompFunction) {
      vscode.window.showErrorMessage(`Function with ID "${functionId}" not found in database.`);
      return;
    }

    // Show pickers
    const cFiles = await vscode.workspace.findFiles('**/*.{c,cpp}', 'tools/**');
    const sourceFilePath = await showFilePicker({
      title: 'Select The Target Source File (where the decompiled function should be placed on)',
      files: cFiles,
    });

    if (!sourceFilePath) {
      return;
    }

    const objectFiles = await vscode.workspace.findFiles('**/*.o', 'tools/**');
    const currentObjectFilePath = await showFilePicker({
      title: 'Select Current Object File (the one compiled from your source)',
      files: objectFiles,
    });

    if (!currentObjectFilePath) {
      return;
    }

    const targetObjectFilePath = await showFilePicker({
      title: 'Select Target Object File (the one you want to compare against)',
      files: objectFiles,
      allowCustomPath: true,
    });

    if (!targetObjectFilePath) {
      return;
    }

    // Start the decompiler agent for the selected function
    const prompt = await createDecompilePrompt(decompFunction, {
      type: 'agent',
      sourceFilePath: getRelativePath(sourceFilePath),
      currentObjectFilePath: getRelativePath(currentObjectFilePath),
      targetObjectFilePath: getRelativePath(targetObjectFilePath),
    });
    if (!prompt) {
      return;
    }

    await removeAssemblyFunction(decompFunction.asmModulePath, decompFunction.name);

    await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
  });

  vscode.commands.registerCommand('kappa.showChart', async () => {
    showChart();
  });

  vscode.commands.registerCommand('kappa.changeVoyageApiKey', async () => {
    const currentApiKey = embeddingConfigManager.getVoyageApiKey();

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
      await embeddingConfigManager.setVoyageApiKey(apiKey);
      vscode.commands.executeCommand('setContext', 'walkthroughVoyageApiKeySet', true);
    }
  });

  vscode.commands.registerCommand('kappa.changeEmbeddingProvider', async () => {
    const currentProvider = embeddingConfigManager.getEmbeddingProvider();
    const status = await embeddingConfigManager.getEmbeddingProviderStatus();

    const provider = await vscode.window.showQuickPick(
      [
        {
          label: 'Voyage AI',
          description: 'High-quality embeddings via API (requires API key)',
          detail:
            currentProvider === 'voyage'
              ? '✓ Currently selected'
              : status.voyageAvailable
                ? 'API key configured, ready to use'
                : 'Requires internet connection and API costs',
          value: 'voyage',
        },
        {
          label: 'Local Embedding',
          description: 'Free local embeddings (runs offline)',
          detail:
            currentProvider === 'local'
              ? '✓ Currently selected'
              : status.localAvailable
                ? 'Model downloaded and ready'
                : 'Downloads model on first use (~100MB), lower quality than Voyage AI',
          value: 'local',
        },
      ],
      {
        placeHolder: 'Choose your embedding provider',
        title: 'Select Embedding Provider for Semantic Search',
      },
    );

    if (provider) {
      await embeddingConfigManager.setEmbeddingProvider(provider.value as 'voyage' | 'local');

      if (provider.value === 'voyage') {
        if (!embeddingConfigManager.isVoyageAvailable()) {
          const setApiKey = await vscode.window.showInformationMessage(
            'Voyage AI requires an API key. Would you like to set it now?',
            'Set API Key',
            'Later',
          );
          if (setApiKey === 'Set API Key') {
            await vscode.commands.executeCommand('kappa.changeVoyageApiKey');
          }
        }
      } else if (provider.value === 'local') {
        vscode.window.showInformationMessage(
          'Local embedding model will be downloaded on first use (~100MB). This may take a few minutes.',
        );
      }

      vscode.window.showInformationMessage(`Embedding provider changed to ${provider.label}`);
    }
  });

  vscode.commands.registerCommand('kappa.enableLocalEmbeddingModel', async () => {
    try {
      // Check if local embedding service is available
      if (!database.isLocalEmbeddingEnabled) {
        vscode.window.showErrorMessage('Local embedding service is not initialized. Please restart VS Code.');
        return;
      }

      // Get the local embedding service from database
      const localService = (database as any).localEmbeddingService;
      if (!localService) {
        vscode.window.showErrorMessage('Local embedding service is not available. Please restart VS Code.');
        return;
      }

      // Check current status using configuration manager
      const config = embeddingConfigManager.getLocalEmbeddingConfig();
      const isAlreadyDownloaded = config?.enabled && config?.isInitialized;

      if (isAlreadyDownloaded) {
        const choice = await vscode.window.showInformationMessage(
          'Local embedding model is already downloaded and configured. Would you like to re-download it?',
          'Re-download',
          'Cancel',
        );

        if (choice !== 'Re-download') {
          // Just switch to local provider if not already selected
          if (embeddingConfigManager.getEmbeddingProvider() !== 'local') {
            await embeddingConfigManager.setEmbeddingProvider('local');
            vscode.window.showInformationMessage('Switched to local embedding provider.');
          }
          return;
        }
      }

      // Download the model
      await localService.downloadModel();

      // Initialize and verify the LocalEmbeddingService works correctly
      await localService.initialize();

      // Test the service with a simple embedding to verify it works
      try {
        const testEmbedding = await localService.getEmbedding(['test assembly function']);
        if (!testEmbedding || testEmbedding.length === 0 || !Array.isArray(testEmbedding[0])) {
          throw new Error('Service verification failed: invalid embedding output');
        }
        console.log(
          `Local embedding service verified successfully. Generated embedding with ${testEmbedding[0].length} dimensions.`,
        );
      } catch (verificationError) {
        throw new Error(
          `Local embedding service verification failed: ${verificationError instanceof Error ? verificationError.message : 'unknown error'}`,
        );
      }

      // Switch to local embedding provider
      await embeddingConfigManager.setEmbeddingProvider('local');

      vscode.window.showInformationMessage(
        'Local embedding model enabled successfully! You can now use Kappa offline for semantic search.',
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      vscode.window.showErrorMessage(`Failed to enable local embedding model: ${errorMessage}`);
      console.error('Error enabling local embedding model:', error);
    }
  });

  vscode.commands.registerCommand('kappa.runDecompYamlCreation', async () => {
    const decompYaml = await loadDecompYaml();
    await createDecompYaml(decompYaml);
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

  vscode.commands.registerCommand('kappa.compareSymbolFromObjectFiles', async () => {
    await ensureDecompYamlExists();

    const objectFiles = await vscode.workspace.findFiles('**/*.o', 'tools/**');

    // Show picker for the current file
    const currentFilePath = await showFilePicker({
      title: 'Select Current Object File (the one compiled from your source)',
      files: objectFiles,
    });

    if (!currentFilePath) {
      return;
    }

    // Show picker for the target file
    const targetFilePath = await showFilePicker({
      title: 'Select Target Object File (the one you want to compare against)',
      files: objectFiles,
    });

    if (!targetFilePath) {
      return;
    }

    // Parse the object files
    const [currentParsedObject, targetParsedObject] = await Promise.all([
      objdiff.parseObjectFile(currentFilePath),
      objdiff.parseObjectFile(targetFilePath),
    ]);

    // Show symbols picker
    const [symbolsCurrentFile, symbolsTargetFile] = await Promise.all([
      objdiff.getSymbolsName(currentParsedObject),
      objdiff.getSymbolsName(targetParsedObject),
    ]);

    const items = [...symbolsCurrentFile, ...symbolsTargetFile].reduce(
      (acc, symbolName) => {
        const existing = acc.find(({ value }) => value === symbolName);
        if (existing) {
          return acc;
        }

        const hasOnCurrent = symbolsCurrentFile.includes(symbolName);
        const hasOnTarget = symbolsTargetFile.includes(symbolName);

        acc.push({
          label: `${symbolName} ${hasOnCurrent ? '●' : '○'}${hasOnTarget ? '●' : '○'}`,
          value: symbolName,
        });
        return acc;
      },
      [] as Array<{ label: string; value: string }>,
    );

    const selectedSymbol = await showPicker({
      items,
      title: 'Select Symbol to Compare',
      placeholder: 'Type to filter symbols',
    });

    if (!selectedSymbol) {
      return;
    }

    // Compare the selected symbol from the object files
    const diffResult = await objdiff.compareObjectFiles(
      currentFilePath,
      targetFilePath,
      currentParsedObject,
      targetParsedObject,
      selectedSymbol,
    );
    if (!diffResult) {
      vscode.window.showErrorMessage('Failed to compare object files.');
      return;
    }

    const doc = await vscode.workspace.openTextDocument({
      content: diffResult,
      language: 'markdown',
    });

    await vscode.window.showTextDocument(doc);
  });

  vscode.commands.registerCommand('kappa.createDecompMeScratch', async (functionId?: string) => {
    registerClangLanguage();
    await ensureDecompYamlExists({ ensureSpecificTool: 'decompme' });

    if (!functionId) {
      // TODO: Same as from `kappa.startDecompilerAgent`.
      vscode.window.showErrorMessage('No function id provided when calling createDecompMeScratch command.');
      return;
    }

    await createDecompMeScratch(functionId);
  });

  // Register Language Model Tools
  context.subscriptions.push(vscode.lm.registerTool('get_diff_between_object_files', new GetDiffBetweenObjectFiles()));

  return apiInstance;
}
