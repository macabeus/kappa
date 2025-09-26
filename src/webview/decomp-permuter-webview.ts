import * as vscode from 'vscode';

import { buildWebViewApi } from '~/bridge';
import { DecompPermuter } from '~/decomp-permuter/decomp-permuter';
import { HostApi } from '~/webview-api';

export interface WebviewMessage {
  type: string;
  payload?: any;
  requestId?: string;
}

export interface MessageFromWebview extends WebviewMessage {
  type: 'ready' | 'cancel-permuter' | 'request';
}

export interface MessageToWebview extends WebviewMessage {
  type: 'init' | 'update-status' | 'permuter-output' | 'best-match' | 'error' | 'response';
}

export interface RequestMessage extends MessageFromWebview {
  type: 'request';
  payload: {
    command: string;
    args?: any;
  };
}

export interface ResponseMessage extends MessageToWebview {
  type: 'response';
  payload: {
    success: boolean;
    data?: any;
    error?: string;
  };
}

export class DecompPermuterWebviewProvider {
  static readonly viewType = 'decompPermuter';

  static #currentPanel: DecompPermuterWebviewProvider | undefined;
  readonly #extensionUri: vscode.Uri;
  #panel: vscode.WebviewPanel | undefined;
  #disposables: vscode.Disposable[] = [];

  constructor(extensionUri: vscode.Uri) {
    this.#extensionUri = extensionUri;
  }

  static createOrShow() {
    // If we already have a panel, show it
    if (DecompPermuterWebviewProvider.#currentPanel) {
      DecompPermuterWebviewProvider.#currentPanel.#panel?.reveal(
        DecompPermuterWebviewProvider.#currentPanel.#panel.viewColumn,
      );

      return {
        api: buildWebViewApi(DecompPermuterWebviewProvider.#currentPanel.#panel!.webview),
        dispose: () => panel.dispose(),
      };
    }

    // Otherwise, create a new panel
    const extensionUri = vscode.extensions.getExtension('macabeus.kappa')!.extensionUri;
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    const panel = vscode.window.createWebviewPanel(
      DecompPermuterWebviewProvider.viewType,
      'Decomp Permuter',
      column + 1,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
      },
    );

    DecompPermuterWebviewProvider.#currentPanel = new DecompPermuterWebviewProvider(extensionUri);
    DecompPermuterWebviewProvider.#currentPanel.#panel = panel;
    DecompPermuterWebviewProvider.#currentPanel.#update();
    DecompPermuterWebviewProvider.#currentPanel.#setupEventListeners();

    return { api: buildWebViewApi(panel.webview), dispose: () => panel.dispose() };
  }

  static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    DecompPermuterWebviewProvider.#currentPanel = new DecompPermuterWebviewProvider(extensionUri);
    DecompPermuterWebviewProvider.#currentPanel.#panel = panel;
    DecompPermuterWebviewProvider.#currentPanel.#setupEventListeners();
    DecompPermuterWebviewProvider.#currentPanel.#update();
  }

  static kill() {
    DecompPermuterWebviewProvider.#currentPanel?.dispose();
    DecompPermuterWebviewProvider.#currentPanel = undefined;
  }

  #setupEventListeners() {
    if (!this.#panel) {
      return;
    }

    // Handle messages from the webview
    this.#panel.webview.onDidReceiveMessage(
      (message: MessageFromWebview) => this.#handleMessage(message),
      null,
      this.#disposables,
    );

    // Listen for when the panel is disposed
    this.#panel.onDidDispose(() => this.dispose(), null, this.#disposables);
  }

  async #handleMessage(message: MessageFromWebview) {
    // Ignore messages that are not requests. It might be messages sent by other extensions or by VS Code itself
    if (message.type !== 'request' || !message.requestId) {
      return;
    }

    await this.#handleRequest(message as RequestMessage);
  }

  async #handleRequest(message: RequestMessage) {
    const { command, args } = message.payload;
    const requestId = message.requestId!;

    const hostApi = new HostApi();

    try {
      // @ts-ignore - Dynamic method call with spread args
      const result = await hostApi[command as keyof HostApi](...args);

      // Send success response
      await this.#postMessage({
        type: 'response',
        requestId,
        payload: {
          success: true,
          data: result,
        },
      });
    } catch (error) {
      // Send error response
      await this.#postMessage({
        type: 'response',
        requestId,
        payload: {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  async #postMessage(message: MessageToWebview): Promise<void> {
    this.#panel?.webview.postMessage(message);
  }

  #update() {
    if (!this.#panel) {
      return;
    }

    this.#panel.webview.html = this.#getHtmlForWebview(this.#panel.webview);
  }

  #getHtmlForWebview(webview: vscode.Webview) {
    // Get path to the built webview files
    const webviewPath = vscode.Uri.joinPath(this.#extensionUri, 'dist', 'webview');

    // Get URIs for the webview resources
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewPath, 'decomp-permuter.js'));
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewPath, 'index.css'));
    const codiconUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewPath, 'codicon.css'));

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${stylesUri}" rel="stylesheet">
        <link href="${codiconUri}" rel="stylesheet" id="vscode-codicon-stylesheet" />
        <title>Decomp Permuter</title>
      </head>
      <body>
        <div id="root"></div>
        <script src="${scriptUri}"></script>
      </body>
      </html>`;
  }

  public dispose() {
    DecompPermuterWebviewProvider.#currentPanel = undefined;

    if (this.#panel) {
      this.#panel.dispose();
    }

    while (this.#disposables.length) {
      const x = this.#disposables.pop();
      if (x) {
        x.dispose();
      }
    }

    DecompPermuter.currentInstance?.stop();
  }

  static get currentViewColumn() {
    if (!this.#currentPanel) {
      return undefined;
    }

    return this.#currentPanel.#panel?.viewColumn;
  }
}
