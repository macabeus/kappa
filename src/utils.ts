import * as vscode from 'vscode';
import { ASTVisitorPlugin } from './ast-visitor';

export function getWorkspaceRoot(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  return workspaceFolders[0].uri.fsPath;
}

export async function loadKappaPlugin(pluginPath: string): Promise<
  | {
      success: true;
      plugin: ASTVisitorPlugin;
    }
  | { success: false; error: string }
> {
  // Use dynamic import to load the ES module
  const pluginModule = await import(`${pluginPath}?t=${Date.now()}`);

  // Get the default export (should be a class implementing ASTVisitorPlugin)
  const PluginClass = pluginModule.default;

  if (!PluginClass) {
    return { success: false, error: 'No default export found' };
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
    return { success: false, error: 'No valid node handler methods found' };
  }

  // Validate that plugin has the testsSpec getter method
  if (!Array.isArray(pluginInstance.testsSpec)) {
    return { success: false, error: 'Plugin must have a testsSpec getter method that returns an array' };
  }

  // If it's a valid plugin, return the instance
  return { success: true, plugin: pluginInstance };
}
