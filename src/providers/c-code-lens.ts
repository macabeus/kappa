import * as vscode from 'vscode';

import { Searcher, registerClangLanguage, searchCodebase } from '~/utils/ast-grep-utils';

export class CCodeLensProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
    registerClangLanguage();

    const codeLenses: vscode.CodeLens[] = [];

    // Searcher for relevant function declarations (e.g., the target assembly function and functions called in the assembly)
    const functionDefinitionMatcher = {
      rule: {
        kind: 'function_definition',
      },
    };
    const functionDefinitionSearcher: Searcher = {
      matcher: functionDefinitionMatcher,
      handlerEach(file, declaration) {
        const range = new vscode.Range(
          declaration.range().start.line,
          declaration.range().start.column,
          declaration.range().end.line,
          declaration.range().end.column,
        );

        const functionIdentifier = declaration.find({
          rule: {
            kind: 'identifier',
            inside: {
              kind: 'function_declarator',
            },
          },
        });
        if (!functionIdentifier) {
          return;
        }

        codeLenses.push(
          new vscode.CodeLens(range, {
            title: 'Permute it',
            command: 'kappa.runDecompPermuter',
            arguments: [functionIdentifier.text(), file.fsPath],
          }),
        );
      },
    };

    await searchCodebase([document.uri], [functionDefinitionSearcher]);

    return codeLenses;
  }
}
