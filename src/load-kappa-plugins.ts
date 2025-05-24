import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ASTVisitor, ASTVisitorPlugin } from './ast-visitor';

/**
 * Load custom plugins from the kappa-plugins folder in the workspace
 * @param visitor The AST visitor to register plugins with
 */
export async function loadKappaPlugins(visitor: ASTVisitor): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder found. Can't load kappa plugin.");
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const pluginsFolder = path.join(workspaceRoot, '.kappa-plugins');

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

        // Use dynamic import to load the ES module
        const pluginModule = await import(`${pluginPath}?t=${Date.now()}`);

        // Get the default export (should be a class implementing ASTVisitorPlugin)
        const PluginClass = pluginModule.default;

        if (!PluginClass) {
          vscode.window.showWarningMessage(`Skipping plugin \`${jsFile}\`: No default export found`);
          continue;
        }

        // Create an instance of the plugin
        const pluginInstance: ASTVisitorPlugin = new PluginClass();

        // Validate that plugin has at least one visit method
        const foundVisitMethod = Boolean(
          Object.getOwnPropertyNames(Object.getPrototypeOf(pluginInstance))
            .concat(Object.getOwnPropertyNames(pluginInstance))
            .find((name) => name.startsWith('visit')),
        );

        if (!foundVisitMethod) {
          vscode.window.showWarningMessage(`Skipping plugin \`${jsFile}\`: No valid node handler methods found`);
          continue;
        }

        // Register the plugin with the visitor
        visitor.registerPlugin(pluginInstance);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        vscode.window.showWarningMessage(`Failed to load plugin \`${jsFile}\`: ${errorMessage}`);
      }
    }
  } catch (error) {
    vscode.window.showErrorMessage("Failed to read `.kappa-plugins` folder. Can't load kappa plugin.");
  }
}
