import * as vscode from 'vscode';
import { database } from '../db/db';
import { getFuncContext } from './get-context-from-asm-function';
import { craftPrompt } from './craft-prompt';

/**
 * Open a new markdown file with a decompilation prompt for a function from the database.
 */
export async function createDecompilePromptFile(funcId: string): Promise<void> {
  try {
    const rootWorkspace = vscode.workspace.workspaceFolders?.[0];
    if (!rootWorkspace) {
      vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
      return;
    }

    // Get the function from the database
    const decompFunction = await database.getFunctionById(funcId);
    if (!decompFunction) {
      vscode.window.showErrorMessage(`Function with ID ${funcId} not found in database.`);
      return;
    }

    const { asmDeclaration, calledFunctionsDeclarations, sampling, typeDefinitions } =
      await getFuncContext(decompFunction);

    const promptContent = await craftPrompt({
      modulePath: decompFunction.asmModulePath,
      asmName: decompFunction.name,
      asmDeclaration,
      asmCode: decompFunction.asmCode,
      calledFunctionsDeclarations,
      sampling,
      typeDefinitions,
    });

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
