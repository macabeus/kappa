import * as vscode from 'vscode';
import { Messenger } from 'vscode-messenger';
import { type NotificationType, type RequestType } from 'vscode-messenger-common';

// Message type definitions for type-safe communication
export interface PermuterCommand {
  command: string;
  args?: any;
}

// Notification types (from webview to extension)
export const ReadyNotification: NotificationType<void> = { method: 'ready' };
export const CancelPermuterNotification: NotificationType<void> = { method: 'cancel-permuter' };

// Notification types (from extension to webview)
export const InitNotification: NotificationType<any> = { method: 'init' };
export const UpdateStatusNotification: NotificationType<any> = { method: 'update-status' };
export const PermuterOutputNotification: NotificationType<any> = { method: 'permuter-output' };
export const BestMatchNotification: NotificationType<any> = { method: 'best-match' };
export const ErrorNotification: NotificationType<string> = { method: 'error' };

// Request types (request-response messages)
export const GetWorkspaceFilesRequest: RequestType<void, string[]> = { method: 'get-workspace-files' };
export const GenericCommandRequest: RequestType<PermuterCommand, any> = { method: 'generic-command' };

export class DecompPermuterWebviewProvider {
  static readonly viewType = 'decompPermuter';

  static #currentPanel: DecompPermuterWebviewProvider | undefined;
  readonly #extensionUri: vscode.Uri;
  #panel: vscode.WebviewPanel | undefined;
  #disposables: vscode.Disposable[] = [];
  #messenger: Messenger | undefined;

  constructor(extensionUri: vscode.Uri) {
    this.#extensionUri = extensionUri;
  }

  static createOrShow() {
    // If we already have a panel, show it
    if (DecompPermuterWebviewProvider.#currentPanel) {
      DecompPermuterWebviewProvider.#currentPanel.#panel?.reveal(
        DecompPermuterWebviewProvider.#currentPanel.#panel.viewColumn,
      );

      return DecompPermuterWebviewProvider.#currentPanel;
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

    return DecompPermuterWebviewProvider.#currentPanel;
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

    // Set up vscode-messenger
    this.#messenger = new Messenger();
    const webviewParticipant = this.#messenger.registerWebviewPanel(this.#panel);

    // Register request handlers
    this.#messenger.onRequest(GetWorkspaceFilesRequest, async () => {
      return this.#getWorkspaceFiles();
    });

    this.#messenger.onRequest(GenericCommandRequest, async (params) => {
      const { command } = params;
      switch (command) {
        case 'get-workspace-files':
          return this.#getWorkspaceFiles();
        default:
          throw new Error(`Unknown command: ${command}`);
      }
    });

    // Register notification handlers from webview
    this.#messenger.onNotification(ReadyNotification, () => {
      console.log('Webview is ready');
      // Send initial state to webview
      this.#messenger?.sendNotification(InitNotification, webviewParticipant);
    });

    this.#messenger.onNotification(CancelPermuterNotification, () => {
      console.log('Permuter cancellation requested');
      // TODO: Implement permuter cancellation
    });

    // Listen for when the panel is disposed
    this.#panel.onDidDispose(() => this.dispose(), null, this.#disposables);
  }

  postDecompOutput(output: string) {
    if (this.#messenger && this.#panel) {
      const webviewParticipant = this.#messenger.registerWebviewPanel(this.#panel);
      this.#messenger.sendNotification(PermuterOutputNotification, webviewParticipant, { output });
    }
  }

  postBestMatch(bestMatch: string) {
    if (this.#messenger && this.#panel) {
      const webviewParticipant = this.#messenger.registerWebviewPanel(this.#panel);
      this.#messenger.sendNotification(BestMatchNotification, webviewParticipant, { bestMatch });
    }
  }

  postError(error: string) {
    if (this.#messenger && this.#panel) {
      const webviewParticipant = this.#messenger.registerWebviewPanel(this.#panel);
      this.#messenger.sendNotification(ErrorNotification, webviewParticipant, error);
    }
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

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${stylesUri}" rel="stylesheet">
        <title>Decomp Permuter</title>
      </head>
      <body>
        <div id="root"></div>
        <script src="${scriptUri}"></script>
      </body>
      </html>`;
  }

  async #getWorkspaceFiles(): Promise<string[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return [];
    }

    try {
      const files: string[] = [];
      for (const folder of workspaceFolders) {
        const found = await vscode.workspace.findFiles(
          new vscode.RelativePattern(folder, '**/*.{c,h,cpp,hpp,s,asm}'),
          '**/node_modules/**',
          200, // Limit results
        );
        files.push(...found.map((uri) => uri.fsPath));
      }
      return files;
    } catch (error) {
      console.error('Error finding workspace files:', error);
      return [];
    }
  }

  public dispose() {
    DecompPermuterWebviewProvider.#currentPanel = undefined;

    // Clean up our resources
    if (this.#panel) {
      this.#panel.dispose();
    }

    while (this.#disposables.length) {
      const x = this.#disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
