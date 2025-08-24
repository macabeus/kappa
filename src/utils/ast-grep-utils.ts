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
