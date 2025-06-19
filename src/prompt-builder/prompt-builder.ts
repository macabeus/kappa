import * as vscode from 'vscode';
import * as path from 'path';
import { getAsmContext } from './get-context-from-asm-function';
import { craftPrompt } from './craft-prompt';
import { attachedCodeStorage } from './attached-code-storage';

/**
 * Open a new markdown file with a decompilation prompt tailored for the given assembly function.
 */
export async function createDecompilePromptFile(assemblyCode: string): Promise<void> {
  try {
    const rootWorkspace = vscode.workspace.workspaceFolders?.[0];
    if (!rootWorkspace) {
      vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
      return;
    }

    const editor = vscode.window.activeTextEditor!;
    const modulePath = path.relative(rootWorkspace.uri.fsPath, editor.document.fileName);

    const { declarations, examples } = await getAsmContext(assemblyCode);

    // Show info if there's attached code and consume it
    const hasAttachedCode = attachedCodeStorage.hasAttached();
    if (hasAttachedCode) {
      vscode.window.showInformationMessage('Including attached code in the decompilation prompt.');
    }

    const promptContent = await craftPrompt({
      modulePath,
      assemblyCode,
      declarations,
      examples,
    });

    // Trigger status bar update after consuming attached code (if any was consumed)
    if (hasAttachedCode) {
      vscode.commands.executeCommand('kappa.updateStatusBar');
    }

    const document = await vscode.workspace.openTextDocument({
      content: promptContent,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(document);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to create decompilation prompt: ${errorMessage}`);
  }
}

/**
 * Code Action Provider for assembly decompilation prompts
 */
export class DecompilePromptCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    _context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    if (!this.isAssemblyFile(document) || range.isEmpty) {
      return [];
    }

    const selectedText = document.getText(range);
    if (!this.isAssemblyFunction(selectedText)) {
      return [];
    }

    const action = new vscode.CodeAction('Build a prompt to decompile it', vscode.CodeActionKind.Refactor);

    action.command = {
      command: 'kappa.buildDecompilePrompt',
      title: 'Build a prompt to decompile it',
      arguments: [selectedText],
    };

    return [action];
  }

  private isAssemblyFile(document: vscode.TextDocument): boolean {
    const language = document.languageId;
    const fileName = document.fileName.toLowerCase();

    return (
      language === 'arm' ||
      language === 'asm' ||
      language === 'assembly' ||
      fileName.endsWith('.s') ||
      fileName.endsWith('.S') ||
      fileName.endsWith('.asm')
    );
  }

  private isAssemblyFunction(text: string): boolean {
    const lines = text.trim().split('\n');

    const hasThumbFunc = lines.some(
      (line) => line.trim().includes('thumb_func_start') || line.trim().includes('arm_func_start'),
    );

    const hasLabel = lines.some((line) => /^[a-zA-Z_][a-zA-Z0-9_]*:\s*(@|\/\/)?/.test(line.trim()));

    const hasInstructions = lines.some((line) => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !trimmed.startsWith('@') &&
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('.') &&
        (trimmed.includes(' ') || trimmed.endsWith(':'))
      );
    });

    return hasThumbFunc || (hasLabel && hasInstructions);
  }
}
