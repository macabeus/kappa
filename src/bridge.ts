import * as vscode from 'vscode';
import type * as t from 'webview-decomp-permuter';

export const buildWebViewApi = (webview: vscode.Webview) =>
  new Proxy({} as t.DecompPermuterWebviewApi, {
    get(_target, prop: string) {
      return (...args: unknown[]) => {
        webview.postMessage({ type: 'request', name: prop, payload: args });
      };
    },
  });
