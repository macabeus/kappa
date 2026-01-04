import path from 'path';
import * as vscode from 'vscode';

import { getVoyageApiKey } from '@configurations/workspace-configs';
import {
  countBodyLinesFromAsmFunction,
  extractFunctionCallsFromAssembly,
  listFunctionsFromAsmModule,
} from '@utils/asm-utils';
import { Searcher, registerClangLanguage, searchCodebase } from '@utils/ast-grep-utils';
import { ensureDecompYamlDefinesTool } from '~/configurations/decomp-yaml';
import type { CtxDecompYaml } from '~/context';
import { getAsmFunctionFromBuildFolder } from '~/get-context-from-asm-function';

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

  await ensureDecompYamlDefinesTool({ ctx, tool: 'kappa' });

  isIndexing = true;

  registerClangLanguage();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Indexing the codebase',
    },
    async (progress) => {
      // 1. Add matched functions
      const codebaseFiles = await vscode.workspace.findFiles('**/*.{c,h}', 'tools/**');

      const funcDefinitionMatcher = {
        rule: {
          kind: 'function_definition',
        },
      };
      const funcDefinitionSearcher: Searcher = {
        matcher: funcDefinitionMatcher,
        async handlerEach(file, definition) {
          const functionName = definition
            .find({
              rule: {
                kind: 'identifier',
                inside: {
                  kind: 'function_declarator',
                },
              },
            })
            ?.text();

          if (!functionName) {
            console.warn(`Skipping a function from "${file.fsPath}" because its name was not found`);
            return;
          }

          const findResult = await getAsmFunctionFromBuildFolder({
            ctx,
            functionName,
            moduleName: path.basename(file.fsPath, path.extname(file.fsPath)),
          });

          if (!findResult) {
            return;
          }

          const content = definition.text();

          const callsFunctions = extractFunctionCallsFromAssembly(ctx.decompYaml.platform, findResult.asmCode);

          await database.addFunction({
            name: functionName,
            cCode: content,
            cModulePath: file.fsPath,
            asmCode: findResult.asmCode,
            asmModulePath: findResult.asmModulePath,
            callsFunctions,
          });

          progress.report({
            increment: 0,
            message: `C function "${functionName}" indexed...`,
          });
        },
      };

      await searchCodebase(codebaseFiles, [funcDefinitionSearcher]);

      // 2. Add non-matched functions
      progress.report({ increment: 25 });

      const asmFiles = await vscode.workspace.findFiles(
        `${ctx.decompYaml.tools.kappa!.nonMatchingAsmFolder}/**/*.{s,S,asm}`,
      );
      for (const asmFile of asmFiles) {
        const asmDocument = await vscode.workspace.openTextDocument(asmFile);
        const asmModule = asmDocument.getText();
        const functions = listFunctionsFromAsmModule(ctx.decompYaml.platform, asmModule);

        for (const func of functions) {
          const asmCode = func.code;

          const countLines = countBodyLinesFromAsmFunction(ctx.decompYaml.platform, asmCode);
          if (countLines === 0) {
            continue;
          }

          const callsFunctions = extractFunctionCallsFromAssembly(ctx.decompYaml.platform, asmCode);

          await database.addFunction({
            name: func.name,
            asmCode,
            asmModulePath: asmFile.fsPath,
            callsFunctions,
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
        await database.embedAsm(ctx.decompYaml.platform, (currentBatch, totalBatches) => {
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
