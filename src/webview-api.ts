import * as vscode from 'vscode';

import { DecompPermuter } from './decomp-permuter/decomp-permuter';
import { DecompPermuterWebviewProvider } from './webview/decomp-permuter-webview';

export type { DecompPermuterLog } from './decomp-permuter/decomp-permuter';

export type DecompPermuterOutput = { type: 'base' } | { type: 'output'; score: number; index: number };

export class HostApi {
  async compareDecompPermuterOutput(left: DecompPermuterOutput, right: DecompPermuterOutput, importedPath: string) {
    const leftPath = DecompPermuter.getOutputPath({
      ...left,
      importedPath,
    });

    const rightPath = DecompPermuter.getOutputPath({
      ...right,
      importedPath,
    });

    const targetColumn =
      DecompPermuterWebviewProvider.currentViewColumn === vscode.ViewColumn.One
        ? vscode.ViewColumn.Two
        : vscode.ViewColumn.One;

    const name = `Comparing ${left.type === 'base' ? 'base' : `output-${left.score}-${left.index}`} ↔ ${
      right.type === 'base' ? 'base' : `output-${right.score}-${right.index}`
    }`;

    await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(leftPath), vscode.Uri.file(rightPath), name, {
      viewColumn: targetColumn,
    });
  }

  async openDecompPermuterOutput(output: DecompPermuterOutput, importedPath: string) {
    const filePath = DecompPermuter.getOutputPath({
      ...output,
      importedPath,
    });

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const targetColumn =
      DecompPermuterWebviewProvider.currentViewColumn === vscode.ViewColumn.One
        ? vscode.ViewColumn.Two
        : vscode.ViewColumn.One;

    await vscode.window.showTextDocument(document, targetColumn);
  }

  async stopDecompPermuter() {
    DecompPermuter.currentInstance?.stop();
  }
}
