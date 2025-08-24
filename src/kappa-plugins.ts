import dedent from 'dedent';
import { createPatch } from 'diff';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { loadKappaPlugin } from '@utils/kappa-plugin-utils';
import { getWorkspaceUri } from '@utils/vscode-utils';
import { ASTVisitor } from '~/ast-visitor';

export async function runTestsForCurrentKappaPlugin(visitor: ASTVisitor): Promise<void> {
  const workspaceUri = getWorkspaceUri();

  try {
    const activeDocummentUri = vscode.window.activeTextEditor?.document.uri;
    if (!activeDocummentUri) {
      vscode.window.showErrorMessage("No active document found. Can't run tests for kappa plugin.");
      return;
    }

    const result = await loadKappaPlugin(activeDocummentUri.fsPath);

    if (!result.success) {
      vscode.window.showWarningMessage(`Failed to load plugin: ${result.error}`);
      return;
    }

    const { plugin } = result;

    visitor.registerPlugin(plugin);

    // Write the testsSpec to a new dirty file
    const rawTestsSpec = plugin.testsSpec as Array<{
      name: string;
      description: string;
      given: string;
      then: string;
    }>;
    const testsFolder = path.join(workspaceUri.fsPath, '.kappa-plugins', 'tests-run');

    let testingReport = `# Kappa Plugin Tests Report for "${plugin.constructor.name}"\n\n`;

    for (const test of rawTestsSpec) {
      const testUri = vscode.Uri.parse(`${testsFolder}/test-${Date.now()}-${test.name}.c`);
      const encoder = new TextEncoder();
      const testContent = dedent(test.given) + '\n';
      const thenContent = dedent(test.then) + '\n';
      await vscode.workspace.fs.writeFile(testUri, encoder.encode(testContent));
      const document = await vscode.workspace.openTextDocument(testUri);
      const editor = await vscode.window.showTextDocument(document, { preview: false });

      // Find the line with the star comment and calculate position
      const lines = testContent.split('\n');
      let starLine = -1;
      let starColumn = -1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const starMatch = line.match(/^\s*\/\/(\s*)\*\s*$/);
        if (starMatch) {
          starLine = i;
          starColumn = starMatch[1].length + 2 /* +2 because of the `//` */; // Length of leading whitespace
          break;
        }
      }

      if (starLine === -1) {
        vscode.window.showWarningMessage(`No star comment found in test "${test.name}"`);
        continue;
      }

      const position = new vscode.Position(starLine + 1, starColumn);
      editor.selection = new vscode.Selection(position, position);
      await vscode.commands.executeCommand('kappa.runKappaPlugins');

      const currentCode = editor.document.getText();

      if (currentCode === thenContent) {
        testingReport += `## ✅ Test: ${test.name}\n\n`;
      } else {
        testingReport += dedent`
          ## ❌ Test: ${test.name}
          
          Description: ${test.description}

          Expected:

          \`\`\`c\n
        `;
        testingReport += thenContent;
        testingReport += dedent`
          \`\`\`

          Actual:

          \`\`\`c\n
        `;
        testingReport += dedent(currentCode);
        testingReport += dedent`
          \`\`\`

          Difference:

          \`\`\`diff\n
        `;
        const diffPatch = createPatch(test.name, thenContent, currentCode, 'expected', 'actual');
        // Remove the first two lines (file headers) from the diff to make it cleaner
        const diffLines = diffPatch.split('\n').slice(2).join('\n');
        testingReport += diffLines;
        testingReport += dedent`
          \`\`\`\n\n
        `;
      }

      // close document
      await editor.document.save();
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.workspace.fs.delete(testUri, { useTrash: false });
      await vscode.workspace.fs.delete(vscode.Uri.parse(testsFolder), { useTrash: false, recursive: true });
    }

    // Create the report document and show it
    const reportDocument = await vscode.workspace.openTextDocument({ content: testingReport, language: 'markdown' });
    await vscode.window.showTextDocument(reportDocument, { preview: false });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    vscode.window.showWarningMessage(`Failed to run the tests: ${errorMessage}`);
  }
}

/**
 * Load custom plugins from the kappa-plugins folder in the workspace
 * @param visitor The AST visitor to register plugins with
 */
export async function loadKappaPlugins(visitor: ASTVisitor): Promise<void> {
  const workspaceUri = getWorkspaceUri();

  const pluginsFolder = path.join(workspaceUri.fsPath, '.kappa-plugins');

  // Check if plugins folder exists
  if (!fs.existsSync(pluginsFolder)) {
    vscode.window.showErrorMessage(
      "No `.kappa-plugins` folder found, skipping custom plugin loading. Can't load kappa plugin.",
    );
    return;
  }

  try {
    // Read all files in the plugins folder
    const files = fs.readdirSync(pluginsFolder);
    const jsFiles = files.filter((file) => file.endsWith('.js'));

    if (jsFiles.length === 0) {
      vscode.window.showErrorMessage("No JS files found in `.kappa-plugins`. Can't load kappa plugin.");
      return;
    }

    // Load each JavaScript file as a plugin
    for (const jsFile of jsFiles) {
      try {
        const pluginPath = path.join(pluginsFolder, jsFile);
        const result = await loadKappaPlugin(pluginPath);

        if (!result.success) {
          vscode.window.showWarningMessage(`Skipping plugin \`${jsFile}\`: ${result.error}`);
          continue;
        }

        visitor.registerPlugin(result.plugin);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        vscode.window.showWarningMessage(`Failed to load plugin \`${jsFile}\`: ${errorMessage}`);
      }
    }
  } catch (error) {
    vscode.window.showErrorMessage("Failed to read `.kappa-plugins` folder. Can't load kappa plugin.");
  }
}
