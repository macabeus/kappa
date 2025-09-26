import langC from '@ast-grep/lang-c';
import { NapiConfig, SgNode, parse, registerDynamicLanguage } from '@ast-grep/napi';
import * as vscode from 'vscode';

let registered = false;
export function registerClangLanguage() {
  if (!registered) {
    registerDynamicLanguage({ c: langC });
    registered = true;
  }
}

export function getFirstParentWithKind(node: SgNode, kind: string) {
  let currentNode: SgNode | null = node;

  while (currentNode) {
    if (currentNode.kindToRefine === kind) {
      return currentNode;
    }

    currentNode = currentNode.parent();
  }

  return null;
}

export type Searcher = {
  matcher: NapiConfig;
  handlerEach: (file: vscode.Uri, node: SgNode) => Promise<void> | void;
};
export async function searchCodebase(files: vscode.Uri[], searchers: Searcher[]) {
  const promises = files.map(async (file) => {
    const document = await vscode.workspace.openTextDocument(file);
    const content = document.getText();
    const source = parse('c', content);

    for (const searcher of searchers) {
      const nodes = source.root().findAll(searcher.matcher);
      for (const node of nodes) {
        await searcher.handlerEach(file, node);
      }
    }
  });

  const promisesResult = await Promise.allSettled(promises);
  for (const promise of promisesResult) {
    if (promise.status === 'rejected') {
      console.error('Error processing file:', promise.reason);
    }
  }
}

/**
 * Extract only the target function from C source code, removing all other function definitions
 * @param sourceCode The original C source code
 * @param targetFunctionName The name of the function to extract
 * @returns The C source code containing only the target function and any non-function code
 */
export function extractTargetFunction(sourceCode: string, targetFunctionName: string): string {
  registerClangLanguage();

  const source = parse('c', sourceCode);
  const root = source.root();

  // Find all function definitions
  const functionDefinitions = root.findAll({
    rule: {
      kind: 'function_definition',
    },
  });

  // Find the target function definition
  let targetFunction: SgNode | null = null;
  const functionsToRemove: SgNode[] = [];

  for (const funcDef of functionDefinitions) {
    // Look for the function name in the function declarator
    const functionDeclarator = funcDef.find({
      rule: {
        kind: 'function_declarator',
      },
    });

    if (functionDeclarator) {
      const identifier = functionDeclarator.find({
        rule: {
          kind: 'identifier',
        },
      });

      if (identifier && identifier.text() === targetFunctionName) {
        targetFunction = funcDef;
      } else {
        functionsToRemove.push(funcDef);
      }
    }
  }

  if (!targetFunction) {
    throw new Error(`Function "${targetFunctionName}" not found in source code`);
  }

  // Start with the original source code
  let result = sourceCode;

  // Remove unwanted functions in reverse order (by position) to avoid offset issues
  functionsToRemove
    .sort((a, b) => {
      const aRange = a.range();
      const bRange = b.range();
      return bRange.start.index - aRange.start.index;
    })
    .forEach((funcNode) => {
      const range = funcNode.range();
      const before = result.substring(0, range.start.index);
      const after = result.substring(range.end.index);
      result = before + after;
    });

  return result;
}
