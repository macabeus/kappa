import * as vscode from 'vscode';

export function getWorkspaceRoot(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  return workspaceFolders[0].uri.fsPath;
}

export function getRelativePath(filePath: string): string {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    throw new Error('No workspace root found');
  }

  return vscode.workspace.asRelativePath(filePath, false);
}

export async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}
