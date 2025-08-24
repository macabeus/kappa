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
import { getRelativePath, showFilePicker, showPicker } from './utils/vscode-utils';
import { database } from './db/db';
import { indexCodebase } from './db/index-codebase';
import { showChart } from './db/show-chart';
import { GetDiffBetweenObjectFiles } from './language-model-tools/objdiff';
import { AssemblyCodeLensProvider } from './providers/assembly-code-lens';
import { objdiff } from './objdiff/objdiff';
import { decompileWithM2c } from './m2c/m2c';
import { createDecompYaml, ensureDecompYamlDefinesTool, loadDecompYaml } from './configurations/decomp-yaml';
import {
  getM2cPath,
  getPythonExecutablePath,
  showInputBoxForSettingM2cPath,
  showInputBoxForSettingPythonExecutablePath,
} from './configurations/workspace-configs';
import { createDecompMeScratch } from './decompme/create-scratch';
import { getContext } from './context';

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
    const ctx = await getContext({ decompYaml: true });

    await indexCodebase(ctx);

    // Refresh code lenses after indexing
    codeLensProvider.refresh();
  });

  vscode.commands.registerCommand('kappa.runPromptBuilder', async (functionId?: string) => {
    registerClangLanguage();

    const ctx = await getContext({ decompYaml: true });

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

    const prompt = await createDecompilePrompt(ctx, decompFunction, { type: 'ask' });
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

    const ctx = await getContext({ decompYaml: true });

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
    const prompt = await createDecompilePrompt(ctx, decompFunction, {
      type: 'agent',
      sourceFilePath: getRelativePath(sourceFilePath),
      currentObjectFilePath: getRelativePath(currentObjectFilePath),
      targetObjectFilePath: getRelativePath(targetObjectFilePath),
    });
    if (!prompt) {
      return;
    }

    await removeAssemblyFunction(ctx, decompFunction.asmModulePath, decompFunction.name);

    await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
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

  vscode.commands.registerCommand('kappa.changeM2cPath', async () => {
    await showInputBoxForSettingM2cPath();
  });

  vscode.commands.registerCommand('kappa.changePythonExecutable', async () => {
    await showInputBoxForSettingPythonExecutablePath();
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
    const ctx = await getContext({ decompYaml: true });

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
      objdiff.parseObjectFile(ctx, currentFilePath),
      objdiff.parseObjectFile(ctx, targetFilePath),
    ]);

    // Show symbols picker
    const [symbolsCurrentFile, symbolsTargetFile] = await Promise.all([
      objdiff.getSymbolsName(ctx, currentParsedObject),
      objdiff.getSymbolsName(ctx, targetParsedObject),
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
      ctx,
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
    const ctx = await getContext({ decompYaml: true });
    await ensureDecompYamlDefinesTool({ ctx, tool: 'decompme' });

    if (!functionId) {
      // TODO: Same as from `kappa.startDecompilerAgent`.
      vscode.window.showErrorMessage('No function id provided when calling createDecompMeScratch command.');
      return;
    }

    await createDecompMeScratch(functionId);
  });

  vscode.commands.registerCommand('kappa.decompileWithM2c', async (functionId?: string) => {
    const ctx = await getContext({ decompYaml: true, pythonExecutablePath: true });

    if (!functionId) {
      // TODO: Same as from `kappa.startDecompilerAgent`.
      vscode.window.showErrorMessage('No function id provided when calling decompileWithM2c command.');
      return;
    }

    const hasM2cPath = Boolean(getM2cPath());
    if (!hasM2cPath) {
      const answer = await vscode.window.showInformationMessage(
        'm2c path is not configured. Run decomp.yaml creation and set m2c.',
        'Run decomp.yaml creation',
        'Ignore',
      );

      if (answer === 'Run decomp.yaml creation') {
        await vscode.commands.executeCommand('kappa.runDecompYamlCreation');
      }

      return;
    }

    const result = await decompileWithM2c(ctx, functionId);
    if (!result) {
      return;
    }

    const cFiles = await vscode.workspace.findFiles('**/*.{c,cpp}', 'tools/**');
    const targetFile = await showFilePicker({
      title: 'Enter the file to output the decompiled C code. Esc to write a new file.',
      files: cFiles,
    });

    if (!targetFile) {
      const doc = await vscode.workspace.openTextDocument({
        content: result,
        language: 'c',
      });

      await vscode.window.showTextDocument(doc);
      return;
    }

    const targetUri = vscode.Uri.file(targetFile);
    const targetDocument = await vscode.workspace.openTextDocument(targetUri);
    const edit = new vscode.WorkspaceEdit();
    const lastLine = targetDocument.lineCount;
    edit.insert(targetUri, new vscode.Position(lastLine, 0), `\n${result}`);
    await vscode.workspace.applyEdit(edit);
    await vscode.window.showTextDocument(targetDocument);
  });

  // Register Language Model Tools
  context.subscriptions.push(vscode.lm.registerTool('get_diff_between_object_files', new GetDiffBetweenObjectFiles()));

  return apiInstance;
}
