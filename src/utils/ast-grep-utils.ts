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
 * Parse C source code and return the root AST node
 * @param sourceCode The C source code to parse
 * @returns The root node of the AST, or null if parsing failed
 */
export function parseSourceCode(sourceCode: string): SgNode {
  registerClangLanguage();

  const source = parse('c', sourceCode);
  return source.root();
}

/**
 * Extract only the target function from C source code, removing all other function definitions
 * @param sourceCode The original C source code
 * @param targetFunctionName The name of the function to extract
 * @returns The C source code containing only the target function and any non-function code
 */
export function extractTargetFunction(sourceCode: string, targetFunctionName: string): string {
  const root = parseSourceCode(sourceCode);

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

/**
 * Helper function to find the deepest AST node that contains a given range
 */
function findNodeInRange(
  rootNode: SgNode,
  startPos: { line: number; column: number },
  endPos: { line: number; column: number },
): SgNode | null {
  const findNode = (node: SgNode): SgNode | null => {
    const range = node.range();

    // Check if node's start is at or before startPos
    const startsBeforeOrAt =
      range.start.line < startPos.line || (range.start.line === startPos.line && range.start.column <= startPos.column);

    // Check if node's end is at or after endPos
    const endsAtOrAfter =
      range.end.line > endPos.line || (range.end.line === endPos.line && range.end.column >= endPos.column);

    // Check if this node contains the range
    if (startsBeforeOrAt && endsAtOrAfter) {
      // This node contains the range, check children for more specific match
      const children = node.children();
      for (const child of children) {
        const childMatch = findNode(child);
        if (childMatch) {
          return childMatch;
        }
      }
      // No child matched more specifically, return this node
      return node;
    }

    return null;
  };

  return findNode(rootNode);
}

/**
 * Find the deepest AST node that contains the given position
 * @param rootNode The root AST node to search from
 * @param position The position
 * @returns The deepest node containing the position, or null if not found
 */
export function findNodeAtPosition(rootNode: SgNode, position: vscode.Position): SgNode | null {
  const pos = { line: position.line, column: position.character };
  return findNodeInRange(rootNode, pos, pos);
}

/**
 * Find the deepest AST node that contains the given selection range
 * @param rootNode The root AST node to search from
 * @param selection The VS Code selection range
 * @returns The deepest node containing the selection, or null if not found
 */
export function findNodeAtSelection(rootNode: SgNode, selection: vscode.Selection): SgNode | null {
  if (selection.isEmpty) {
    return null;
  }

  const startPos = { line: selection.start.line, column: selection.start.character };
  const endPos = { line: selection.end.line, column: selection.end.character };
  return findNodeInRange(rootNode, startPos, endPos);
}
