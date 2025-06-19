import * as vscode from 'vscode';
import { attachedCodeStorage } from './attached-code-storage';

/**
 * Code Action Provider for attaching selected code to the next prompt builder call
 */
export class AttachCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    _context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    // Only show action if there's a selection
    if (range.isEmpty) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    // Action to attach selected code
    const attachAction = new vscode.CodeAction(
      'Attach code for next decompilation prompt',
      vscode.CodeActionKind.RefactorRewrite,
    );

    attachAction.command = {
      command: 'kappa.attachCodeForPrompt',
      title: 'Attach code for next decompilation prompt',
      arguments: [document.getText(range)],
    };

    actions.push(attachAction);

    // If there's already attached code, show action to clear it
    if (attachedCodeStorage.hasAttached()) {
      const clearAction = new vscode.CodeAction('Clear attached code', vscode.CodeActionKind.RefactorRewrite);

      clearAction.command = {
        command: 'kappa.clearAttachedCode',
        title: 'Clear attached code',
      };

      actions.push(clearAction);
    }

    return actions;
  }
}
