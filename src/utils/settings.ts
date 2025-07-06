import * as vscode from 'vscode';

export function getVoyageApiKey(): string {
  return vscode.workspace.getConfiguration('kappa').get('voyageApiKey', '');
}
