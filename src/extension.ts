import * as vscode from 'vscode';
import { activateClangd } from './clangd/activate-clangd';
import { ClangdExtension } from './clangd/vscode-clangd';
import { ASTVisitor } from './ast-visitor';
import { ASTRequestType } from './clangd/ast';
import { loadKappaPlugins } from './load-kappa-plugins';

export async function activate(context: vscode.ExtensionContext): Promise<ClangdExtension> {
  const apiInstance = await activateClangd(context);

  vscode.commands.registerCommand('kappa.runKappaPlugins', async () => {
    const client = apiInstance.client;
    if (!client) {
      vscode.window.showErrorMessage('Clangd client is not available.');
      return;
    }

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

  return apiInstance;
}
