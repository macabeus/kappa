import * as vscode from 'vscode';

export class GetWorkspaceUriError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GetWorkspaceUriError';
  }
}

export function handleError({ prefixMessage, error }: { prefixMessage?: string; error: unknown }): void {
  if (error instanceof GetWorkspaceUriError) {
    console.error('The Kappa extension only supports single-root workspaces. Open a folder or workspace first.');
    return;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const fullMessage = prefixMessage ? `${prefixMessage}: ${errorMessage}` : errorMessage;
  vscode.window.showErrorMessage(fullMessage);
}
