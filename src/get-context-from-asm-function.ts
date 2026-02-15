import { SgNode } from '@ast-grep/napi';
import * as vscode from 'vscode';

import { getDecompYamlPaths } from '@configurations/decomp-yaml';
import { DecompFunction, database } from '@db/db';
import { objdiff } from '@objdiff/objdiff';
import { Searcher, getFirstParentWithKind, searchCodebase } from '@utils/ast-grep-utils';
import type { CtxDecompYaml } from '~/context';

export type DecompFuncContext = {
  asmDeclaration?: string; // Declaration of the target assembly function
  calledFunctionsDeclarations: { [functionName: string]: string };
  sampling: SamplingCFunction[];
  typeDefinitions: string[]; // Type definitions used by the declarations
};

export type SamplingCFunction = {
  name: string;
  cCode: string;
  asmCode: string;
  callsTarget: boolean;
  filePath?: string;
};

/**
 * Get context from a given `DecompFunction`.
 * @param targetAssembly The target assembly code to get context
 * @returns An object containing declarations and C functions that call similar functions
 */
export async function getFuncContext(func: DecompFunction): Promise<DecompFuncContext> {
  const context = await getCodebaseContext(func);

  const result: DecompFuncContext = {
    asmDeclaration: context.asmDeclaration,
    calledFunctionsDeclarations: context.calledFunctionsDeclarations,
    sampling: [],
    typeDefinitions: context.typeDefinitions,
  };

  const similarAsmFunctions = await database.searchSimilarFunctions(func);
  for (const similarAsmFunction of similarAsmFunctions) {
    result.sampling.push({
      name: similarAsmFunction.decompFunction.name,
      cCode: similarAsmFunction.decompFunction.cCode!,
      asmCode: similarAsmFunction.decompFunction.asmCode,
      callsTarget: similarAsmFunction.decompFunction.callsFunctions.some((f) => f.name === func.name),
    });
  }

  const db = await database.getDatabase();
  const functionsThatCallsTarget = await db.collections.decompFunctions
    .find({
      selector: {
        cCode: {
          $exists: true,
        },
        callsFunctions: {
          $elemMatch: {
            $eq: func.id,
          },
        },
      },
    })
    .exec();

  for (const functionThatCallsTarget of functionsThatCallsTarget) {
    result.sampling.push({
      name: functionThatCallsTarget.name,
      cCode: functionThatCallsTarget.cCode!,
      asmCode: functionThatCallsTarget.asmCode,
      callsTarget: true,
    });
  }

  return result;
}

export async function getAsmFunctionFromBuildFolder({
  ctx,
  functionName,
  moduleName,
}: {
  ctx: CtxDecompYaml;
  functionName: string;
  moduleName: string;
}): Promise<{ asmCode: string; asmModulePath: string } | null> {
  const { buildFolders } = getDecompYamlPaths(ctx);

  const objectPromises = buildFolders.map((folder) => vscode.workspace.findFiles(`${folder}/**/${moduleName}.{o,obj}`));
  const objectArrays = await Promise.all(objectPromises);
  const object = objectArrays.flat();

  if (object.length === 0) {
    console.warn(`Object file not found for C module "${moduleName}" in the build folder`);
    return null;
  }

  if (object.length > 1) {
    console.warn(`Multiple object files found for C module "${moduleName}" in the build folder`);
    return null;
  }

  const objectPath = object[0].fsPath;

  try {
    const asmCode = await objdiff.getAsmFunctionFromObjectFile(ctx, objectPath, functionName);

    if (!asmCode) {
      console.warn(`Function "${functionName}" not found in object file "${objectPath}"`);
      return null;
    }

    return { asmCode, asmModulePath: objectPath };
  } catch (error) {
    console.error(`Error extracting assembly from object file "${objectPath}":`, error);
    return null;
  }
}

type CodebaseContext = {
  asmDeclaration?: string;
  calledFunctionsDeclarations: { [functionName: string]: string }; // Declarations of functions called from the assembly
  typeDefinitions: string[]; // Type definitions used by the declarations
};

/**
 * Walk through the codebase to get relevant information from the given assembly function.
 */
async function getCodebaseContext(decompFunction: DecompFunction): Promise<CodebaseContext> {
  const allFunctionsName = [decompFunction.name, ...decompFunction.callsFunctions.map((func) => func.name)];

  const result: CodebaseContext = {
    calledFunctionsDeclarations: {},
    typeDefinitions: [],
  };

  const codebaseFiles = await vscode.workspace.findFiles('**/*.{c,h}', 'tools/**');

  let declarationsNode: SgNode[] = [];

  // Searcher for relevant function declarations (e.g., the target assembly function and functions called in the assembly)
  const declarationsMatcher = {
    rule: {
      kind: 'identifier',
      regex: allFunctionsName.map((funcName) => `^(${funcName})$`).join('|'),
      inside: {
        kind: 'function_declarator',
      },
    },
  };
  const declarationsSearcher: Searcher = {
    matcher: declarationsMatcher,
    handlerEach(file, declaration) {
      const declarationNode = getFirstParentWithKind(declaration, 'declaration');
      if (!declarationNode) {
        console.warn(`Skipping declaration in "${file.fsPath}" due to missing declaration node`);
        return;
      }

      declarationsNode.push(declarationNode);

      if (declaration.text() === decompFunction.name) {
        result.asmDeclaration = declarationNode.text();
      } else {
        result.calledFunctionsDeclarations[declaration.text()] = declarationNode.text();
      }
    },
  };

  // TODO: It can be optimized by not searching from the codebase, but grepping the code from `DecompFunction`
  await searchCodebase(codebaseFiles, [declarationsSearcher]);

  if (declarationsNode.length) {
    // TODO: Allow to configure which types to ignore
    const ignoreTypes = new Set(['u8', 'u16', 'u32', 'u64', 's8', 's16', 's32', 's64']);

    const typesFromDeclarations = new Set<string>();
    for (const declaration of declarationsNode) {
      declaration.findAll({ rule: { kind: 'type_identifier' } }).forEach((typeNode) => {
        const typeName = typeNode.text();

        if (ignoreTypes.has(typeName)) {
          return;
        }

        typesFromDeclarations.add(typeName);
      });
    }

    if (typesFromDeclarations.size > 0) {
      // Searcher for the type definitions used by the declarations
      const typeIdentifierMatcher = {
        rule: {
          kind: 'type_identifier',
          regex: [...typesFromDeclarations].map((funcName) => `^(${funcName})$`).join('|'),
          inside: {
            kind: 'type_definition',
          },
        },
      };

      const typeIdentifierSearcher: Searcher = {
        matcher: typeIdentifierMatcher,
        handlerEach(file, typeIdentifier) {
          const typeDefinitionNode = getFirstParentWithKind(typeIdentifier, 'type_definition');
          if (!typeDefinitionNode) {
            console.warn(`Skipping type identifier in "${file.fsPath}" due to missing type definition`);
            return;
          }

          result.typeDefinitions.push(typeDefinitionNode.text());
        },
      };

      await searchCodebase(codebaseFiles, [typeIdentifierSearcher]);
    }
  }

  return result;
}
