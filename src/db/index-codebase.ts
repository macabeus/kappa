import path from 'path';
import * as vscode from 'vscode';

import { getVoyageApiKey } from '@configurations/workspace-configs';
import { listAssemblyFunctions } from '@utils/asm-utils';
import { Searcher, registerClangLanguage, searchCodebase } from '@utils/ast-grep-utils';
import type { CtxDecompYaml } from '~/context';
import { findOriginalAssemblyInBuildFolder } from '~/get-context-from-asm-function';

import { database } from './db';

let isIndexing = false;

export function isIndexingCodebase(): boolean {
  return isIndexing;
}

export async function indexCodebase(ctx: CtxDecompYaml) {
  if (isIndexing) {
    vscode.window.showWarningMessage('Codebase is already being indexed. Please wait until it completes.');
    return;
  }

  isIndexing = true;

  registerClangLanguage();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Indexing the codebase',
    },
    async (progress) => {
      // 1. Add decompiled functions from C files
      const codebaseFiles = await vscode.workspace.findFiles('**/*.{c,h}', 'tools/**');

      const funcDefinitionMatcher = {
        rule: {
          kind: 'function_definition',
        },
      };
      const funcDefinitionSearcher: Searcher = {
        matcher: funcDefinitionMatcher,
        async handlerEach(file, definition) {
          const name = definition
            .find({
              rule: {
                kind: 'identifier',
                inside: {
                  kind: 'function_declarator',
                },
              },
            })
            ?.text();

          if (!name) {
            console.warn(`Skipping a function from "${file.fsPath}" because its name was not found`);
            return;
          }

          const findResult = await findOriginalAssemblyInBuildFolder({
            ctx,
            name,
            filePath: file.fsPath,
          });

          if (!findResult) {
            return;
          }

          const content = definition.text();

          await database.addFunction({
            name: name,
            cCode: content,
            cModulePath: file.fsPath,
            asmCode: findResult.asmCode,
            asmModulePath: findResult.asmModulePath,
          });

          progress.report({
            increment: 0,
            message: `C function "${name}" indexed...`,
          });
        },
      };

      await searchCodebase(codebaseFiles, [funcDefinitionSearcher]);

      // 2. Add assembly functions from .s files
      progress.report({ increment: 25 });

      const asmFiles = await vscode.workspace.findFiles('asm/**/*.{s,S,asm}', 'tools/**');
      for (const asmFile of asmFiles) {
        const document = await vscode.workspace.openTextDocument(asmFile);
        const content = document.getText();
        const functions = listAssemblyFunctions(content);

        for (const func of functions) {
          await database.addFunction({
            name: func.name,
            asmCode: func.code,
            asmModulePath: asmFile.fsPath,
          });
        }

        const asmModuleName = path.basename(asmFile.fsPath, path.extname(asmFile.fsPath));
        progress.report({
          increment: 0,
          message: `Assembly module "${asmModuleName}" indexed...`,
        });
      }

      // 3. Embed assembly functions
      progress.report({ increment: 25 });

      if (getVoyageApiKey()) {
        await database.embedAsm((currentBatch, totalBatches) => {
          progress.report({
            increment: 0,
            message: `Embedding assembly functions... (${currentBatch}/${totalBatches})`,
          });
        });
      }

      // 4. Dump the database to a file
      progress.report({ increment: 25, message: `Dumping database...` });

      await database.dumpDatabase();
    },
  );

  // 5. Show stats
  const { totalFunctions, totalDecompiledFunctions, totalNotDecompiledFunctions, totalVectors } =
    await database.getStats();

  vscode.commands.executeCommand('setContext', 'walkthroughVoyageApiKeySet', true);

  vscode.window.showInformationMessage(`
    Codebase indexing completed successfully.\n
    Total functions indexed: ${totalFunctions}\n
    Total decompiled: ${totalDecompiledFunctions}\n
    Total not decompiled: ${totalNotDecompiledFunctions}\n
    Total vectors: ${totalVectors}
  `);

  isIndexing = false;
  vscode.commands.executeCommand('setContext', 'walkthroughIndexingComplete', true);
}
