import * as vscode from 'vscode';

import { getAskIndexCodebase, setAskIndexCodebase } from '@configurations/workspace-configs';
import { database } from '@db/db';
import { isIndexingCodebase } from '@db/index-codebase';
import { extractFunctionNameFromLine } from '@utils/asm-utils';
import { handleError } from '@utils/errors';

export class AssemblyCodeLensProvider implements vscode.CodeLensProvider {
  #onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  #isDisplayingInformationMessage = false;
  readonly onDidChangeCodeLenses: vscode.Event<void> = this.#onDidChangeCodeLenses.event;

  async provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
    if (!this.#isAssemblyFile(document) || isIndexingCodebase()) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];

    try {
      const db = await database.getDatabase();

      // Check if the database is empty
      const countFunctions = await db.collections.decompFunctions.count().exec();
      if (!countFunctions) {
        const askIndexCodebase = getAskIndexCodebase();
        if (!askIndexCodebase || this.#isDisplayingInformationMessage) {
          return [];
        }

        this.#isDisplayingInformationMessage = true;
        const answer = await vscode.window.showInformationMessage(
          'Database is empty. Do you want to index the codebase?',
          'Yes',
          'No yet',
          'Do not ask again',
        );

        if (answer === 'Yes') {
          await vscode.commands.executeCommand('kappa.indexCodebase');
        }
        if (answer === 'Do not ask again') {
          await setAskIndexCodebase(false);

          vscode.window.showInformationMessage(
            'This message will not be shown again. If you want to index, run the command "Index the codebase"',
          );
        }

        this.#isDisplayingInformationMessage = false;

        return [];
      }

      // Find all functions in the database that belong to this file
      const relativePath = vscode.workspace.asRelativePath(document.uri);

      const functionsInFile = await db.collections.decompFunctions
        .find({
          selector: {
            asmModulePath: relativePath,
          },
        })
        .exec();

      if (functionsInFile.length === 0) {
        return [];
      }

      // Parse the document to find function locations
      const text = document.getText();
      const lines = text.split('\n');

      // Create a map of function names to their database entries for quick lookup
      const functionMap = new Map<string, string>(); // name -> id
      for (const func of functionsInFile) {
        functionMap.set(func.name, func.id);
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Look for function starts
        const functionName = extractFunctionNameFromLine(line);

        const functionId = functionName && functionMap.get(functionName);
        if (functionId) {
          const range = new vscode.Range(i, 0, i, line.length);

          const codeLensPromptBuilder = new vscode.CodeLens(range, {
            title: 'Build prompt',
            command: 'kappa.runPromptBuilder',
            arguments: [functionId],
          });

          const codeLensStartAgent = new vscode.CodeLens(range, {
            title: 'Start agent',
            command: 'kappa.startDecompilerAgent',
            arguments: [functionId],
          });

          const codeLensCreateDecompMeScratch = new vscode.CodeLens(range, {
            title: 'Create scratch',
            command: 'kappa.createDecompMeScratch',
            arguments: [functionId],
          });

          const codeLensM2c = new vscode.CodeLens(range, {
            title: 'Decompile with m2c',
            command: 'kappa.decompileWithM2c',
            arguments: [functionId],
          });

          codeLenses.push(codeLensPromptBuilder, codeLensStartAgent, codeLensCreateDecompMeScratch, codeLensM2c);

          functionMap.delete(functionName); // Remove to avoid duplicates
        }
      }
    } catch (error) {
      handleError({ prefixMessage: 'Failed to provide code lenses', error });
    }

    return codeLenses;
  }

  #isAssemblyFile(document: vscode.TextDocument): boolean {
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

  refresh(): void {
    this.#onDidChangeCodeLenses.fire();
  }
}
