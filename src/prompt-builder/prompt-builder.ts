import * as vscode from 'vscode';
import type { DecompFunction } from '../db/db';
import { getFuncContext } from './get-context-from-asm-function';
import { craftPrompt, PromptMode } from './craft-prompt';

/**
 * Return a decompilation prompt for the given function.
 */
export async function createDecompilePrompt(
  decompFunction: DecompFunction,
  promptMode: PromptMode,
): Promise<string | undefined> {
  try {
    const rootWorkspace = vscode.workspace.workspaceFolders?.[0];
    if (!rootWorkspace) {
      vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
      return;
    }

    // Get the function from the database
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
      promptMode,
    });

    return promptContent;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to create decompilation prompt: ${errorMessage}`);
  }
}
