import type * as VSCode from 'vscode';

export type RunOnVSCodeFn<T, D> = (
  arg: {
    vscode: typeof VSCode;
    openFile: (uri: VSCode.Uri) => Promise<void>;
    copyFile: (sourceUri: VSCode.Uri, targetUri: VSCode.Uri) => Promise<void>;
    runTestsForCurrentKappaPlugin: () => Promise<string>;
    runPromptBuilder: () => Promise<string>;
    workspaceUri: VSCode.Uri;
  },
  ...args: T[]
) => Promise<D>;

export async function runOnVSCode<T, D>(fn: RunOnVSCodeFn<T, D>, ...args: T[]): Promise<D> {
  return browser.executeWorkbench(
    async (vscode: typeof VSCode, fn, ...args: T[]) => {
      // Because of some limitations on webdriver.io, we need to use globalThis and Function constructor

      // @ts-expect-error
      globalThis.vscode = vscode;

      // Copy file helper
      const copyFile = new Function(
        'sourceUri',
        'targetUri',
        `async function copyFile(sourceUri, targetUri) {
          try {
            // Ensure target directory exists
            const targetDir = vscode.Uri.file(targetUri.fsPath.substring(0, targetUri.fsPath.lastIndexOf('/')));

            const targetPathUri = vscode.Uri.parse(targetDir);
            await vscode.workspace.fs.createDirectory(targetPathUri);

            // Read source file and copy to target
            const sourceContent = await vscode.workspace.fs.readFile(sourceUri);

            // Write to target file
            await vscode.workspace.fs.writeFile(targetUri, sourceContent);
          } catch (error) {
            console.error('Error copying file:', error);
            throw error;
          }
        };
        return copyFile;`,
      )();

      // Copy file helper
      const openFile = new Function(
        'uri',
        `async function openFile(uri) {
          try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
            console.log('Opened plugin file:', uri.fsPath);
          } catch (error) {
            console.error('Error opening file:', error);
            throw error;
          }
        };
        return openFile;`,
      )();

      // Run tests for the current Kappa Plugin file
      const runTestsForCurrentKappaPlugin = new Function(
        `async function runTestsForCurrentKappaPlugin() {
          const activeEditor = vscode.window.activeTextEditor;
          const pluginName = activeEditor.document.fileName.split('/').pop().replace('.js', '');

          await vscode.commands.executeCommand('kappa.runTestsForCurrentKappaPlugin');

          // Wait for the tests to complete
          return new Promise((resolve, reject) => {
            let attempts = 0;
            const checkTestsCompleted = () => {
              const activeEditor = vscode.window.activeTextEditor;
              if (activeEditor && activeEditor.document.languageId === 'markdown') {
                const text = activeEditor.document.getText();
                if (text.includes(pluginName)) {
                  resolve(text);
                  return;
                }
              }

              attempts += 1;
              if (attempts > 50) {
                console.error('Tests did not complete in time');
                reject(new Error('Tests did not complete in time'));
                return;
              }

              setTimeout(checkTestsCompleted, 100);
            };

            checkTestsCompleted();
          });
        };
        return runTestsForCurrentKappaPlugin;`,
      )();

      // Run prompt builder
      const runPromptBuilder = new Function(
        `async function runPromptBuilder() {
          await vscode.commands.executeCommand('kappa.buildDecompilePrompt');

          // Wait for the prompt be built
          return new Promise((resolve, reject) => {
            let attempts = 0;
            const checkTestsCompleted = () => {
              const activeEditor = vscode.window.activeTextEditor;
              if (activeEditor && activeEditor.document.languageId === 'markdown') {
                const text = activeEditor.document.getText();
                resolve(text);
              }

              attempts += 1;
              if (attempts > 50) {
                console.error('Tests did not complete in time');
                reject(new Error('Tests did not complete in time'));
                return;
              }

              setTimeout(checkTestsCompleted, 100);
            };

            checkTestsCompleted();
          });
        };
        return runPromptBuilder;`,
      )();

      // Workspace Uri
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder found');
      }

      const workspaceUri = workspaceFolders[0].uri;

      // Run callback
      const func: RunOnVSCodeFn<T, D> = new Function('arg', '...rest', `${fn}; return fn;`)();

      return func(
        { vscode, copyFile, openFile, runTestsForCurrentKappaPlugin, runPromptBuilder, workspaceUri },
        ...args,
      );
    },
    `${fn}`,
    ...args,
  );
}
