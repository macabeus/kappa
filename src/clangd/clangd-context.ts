// This file is simplified copy from https://github.com/clangd/vscode-clangd/blob/d3938b6266f4355797f1f27c4dbebda4c149fe89/src/clangd-context.ts

import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient/node';

import * as config from './config';
import * as install from './install';

export const clangdDocumentSelector = [
  { scheme: 'file', language: 'c' },
  { scheme: 'file', language: 'cpp' },
  { scheme: 'file', language: 'cuda-cpp' },
  { scheme: 'file', language: 'objective-c' },
  { scheme: 'file', language: 'objective-cpp' },
];

export function isClangdDocument(document: vscode.TextDocument) {
  return vscode.languages.match(clangdDocumentSelector, document);
}

class ClangdLanguageClient extends vscodelc.LanguageClient {
  // Override the default implementation for failed requests. The default
  // behavior is just to log failures in the output panel, however output panel
  // is designed for extension debugging purpose, normal users will not open it,
  // thus when the failure occurs, normal users doesn't know that.
  //
  // For user-interactive operations (e.g. applyFixIt, applyTweaks), we will
  // prompt up the failure to users.

  handleFailedRequest<T>(
    type: vscodelc.MessageSignature,
    error: any,
    token: vscode.CancellationToken | undefined,
    defaultValue: T,
  ): T {
    if (error instanceof vscodelc.ResponseError && type.method === 'workspace/executeCommand') {
      vscode.window.showErrorMessage(error.message);
    }

    return super.handleFailedRequest(type, token, error, defaultValue);
  }
}

class EnableEditsNearCursorFeature implements vscodelc.StaticFeature {
  initialize() {}
  fillClientCapabilities(capabilities: vscodelc.ClientCapabilities): void {
    const extendedCompletionCapabilities: any = capabilities.textDocument?.completion;
    extendedCompletionCapabilities.editsNearCursor = true;
  }
  getState(): vscodelc.FeatureState {
    return { kind: 'static' };
  }
  clear() {}
}

export class ClangdContext implements vscode.Disposable {
  subscriptions: vscode.Disposable[];
  client: ClangdLanguageClient;

  static async create(globalStoragePath: string, outputChannel: vscode.OutputChannel): Promise<ClangdContext | null> {
    const subscriptions: vscode.Disposable[] = [];
    const clangdPath = await install.activate(subscriptions, globalStoragePath);
    if (!clangdPath) {
      subscriptions.forEach((d) => {
        d.dispose();
      });
      return null;
    }

    return new ClangdContext(subscriptions, clangdPath, outputChannel);
  }

  private constructor(subscriptions: vscode.Disposable[], clangdPath: string, outputChannel: vscode.OutputChannel) {
    this.subscriptions = subscriptions;
    const useScriptAsExecutable = config.get<boolean>('useScriptAsExecutable');
    let clangdArguments = config.get<string[]>('arguments');
    if (useScriptAsExecutable) {
      let quote = (str: string) => {
        return `"${str}"`;
      };
      clangdPath = quote(clangdPath);
      for (var i = 0; i < clangdArguments.length; i++) {
        clangdArguments[i] = quote(clangdArguments[i]);
      }
    }
    const clangd: vscodelc.Executable = {
      command: clangdPath,
      args: clangdArguments,
      options: {
        cwd: vscode.workspace.rootPath || process.cwd(),
        shell: useScriptAsExecutable,
      },
    };
    const traceFile = config.get<string>('trace');
    if (!!traceFile) {
      const trace = { CLANGD_TRACE: traceFile };
      clangd.options = { env: { ...process.env, ...trace } };
    }
    const serverOptions: vscodelc.ServerOptions = clangd;

    const clientOptions: vscodelc.LanguageClientOptions = {
      // Register the server for c-family and cuda files.
      documentSelector: clangdDocumentSelector,
      initializationOptions: {
        clangdFileStatus: true,
        fallbackFlags: config.get<string[]>('fallbackFlags'),
      },
      outputChannel: outputChannel,
      // Do not switch to output window when clangd returns output.
      revealOutputChannelOn: vscodelc.RevealOutputChannelOn.Never,

      // We hack up the completion items a bit to prevent VSCode from re-ranking
      // and throwing away all our delicious signals like type information.
      //
      // VSCode sorts by (fuzzymatch(prefix, item.filterText), item.sortText)
      // By adding the prefix to the beginning of the filterText, we get a
      // perfect
      // fuzzymatch score for every item.
      // The sortText (which reflects clangd ranking) breaks the tie.
      // This also prevents VSCode from filtering out any results due to the
      // differences in how fuzzy filtering is applies, e.g. enable dot-to-arrow
      // fixes in completion.
      //
      // We also mark the list as incomplete to force retrieving new rankings.
      // See https://github.com/microsoft/language-server-protocol/issues/898
      middleware: {
        handleDiagnostics: () => {
          return;
        },
        provideCompletionItem: async (document, position, context, token, next) => {
          if (!config.get<boolean>('enableCodeCompletion')) {
            return new vscode.CompletionList([], /*isIncomplete=*/ false);
          }
          let list = await next(document, position, context, token);
          if (!config.get<boolean>('serverCompletionRanking')) {
            return list;
          }
          let items = !list ? [] : Array.isArray(list) ? list : list.items;
          items = items.map((item) => {
            // Gets the prefix used by VSCode when doing fuzzymatch.
            let prefix = document.getText(new vscode.Range((item.range as vscode.Range).start, position));
            if (prefix) {
              item.filterText = prefix + '_' + item.filterText;
            }
            // Workaround for https://github.com/clangd/vscode-clangd/issues/357
            // clangd's used of commit-characters was well-intentioned, but
            // overall UX is poor. Due to vscode-languageclient bugs, we didn't
            // notice until the behavior was in several releases, so we need
            // to override it on the client.
            item.commitCharacters = [];
            // VSCode won't automatically trigger signature help when entering
            // a placeholder, e.g. if the completion inserted brackets and
            // placed the cursor inside them.
            // https://github.com/microsoft/vscode/issues/164310
            // They say a plugin should trigger this, but LSP has no mechanism.
            // https://github.com/microsoft/language-server-protocol/issues/274
            // (This workaround is incomplete, and only helps the first param).
            if (
              item.insertText instanceof vscode.SnippetString &&
              !item.command &&
              item.insertText.value.match(/[([{<,] ?\$\{?[01]\D/)
            ) {
              item.command = {
                title: 'Signature help',
                command: 'editor.action.triggerParameterHints',
              };
            }
            return item;
          });
          return new vscode.CompletionList(items, /*isIncomplete=*/ true);
        },
        provideHover: async (document, position, token, next) => {
          if (!config.get<boolean>('enableHover')) {
            return null;
          }
          return next(document, position, token);
        },
        // VSCode applies fuzzy match only on the symbol name, thus it throws
        // away all results if query token is a prefix qualified name.
        // By adding the containerName to the symbol name, it prevents VSCode
        // from filtering out any results, e.g. enable workspaceSymbols for
        // qualified symbols.
        provideWorkspaceSymbols: async (query, token, next) => {
          let symbols = await next(query, token);
          return symbols?.map((symbol) => {
            // Only make this adjustment if the query is in fact qualified.
            // Otherwise, we get a suboptimal ordering of results because
            // including the name's qualifier (if it has one) in symbol.name
            // means vscode can no longer tell apart exact matches from
            // partial matches.
            if (query.includes('::')) {
              if (symbol.containerName) {
                symbol.name = `${symbol.containerName}::${symbol.name}`;
              }
              // results from clangd strip the leading '::', so vscode fuzzy
              // match will filter out all results unless we add prefix back in
              if (query.startsWith('::')) {
                symbol.name = `::${symbol.name}`;
              }
              // Clean the containerName to avoid displaying it twice.
              symbol.containerName = '';
            }
            return symbol;
          });
        },
      },
    };

    this.client = new ClangdLanguageClient('Clang Language Server', serverOptions, clientOptions);
    this.client.clientOptions.errorHandler = this.client.createDefaultErrorHandler(
      config.get<boolean>('restartAfterCrash') ? /*default*/ 4 : 0,
    );
    this.client.registerFeature(new EnableEditsNearCursorFeature());
    this.client.start();
    console.log('Clang Language Server is now active!');
  }

  get visibleClangdEditors(): vscode.TextEditor[] {
    return vscode.window.visibleTextEditors.filter((e) => isClangdDocument(e.document));
  }

  clientIsStarting() {
    return this.client && this.client.state === vscodelc.State.Starting;
  }

  dispose() {
    this.subscriptions.forEach((d) => {
      d.dispose();
    });
    if (this.client) {
      this.client.stop();
    }
    this.subscriptions = [];
  }
}
