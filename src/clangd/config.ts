// This file is mostly a copy from https://github.com/clangd/vscode-clangd/blob/d3938b6266f4355797f1f27c4dbebda4c149fe89/src/config.ts

import { homedir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

// Gets the config value `clangd.<key>`. Applies ${variable} substitutions.
export function get<T>(key: string): T {
  return substitute(vscode.workspace.getConfiguration('clangd').get<T>(key)!);
}

// Sets the config value `clangd.<key>`. Does not apply substitutions.
export function update<T>(key: string, value: T, target?: vscode.ConfigurationTarget) {
  return vscode.workspace.getConfiguration('clangd').update(key, value, target);
}

// Traverse a JSON value, replacing placeholders in all strings.
function substitute<T>(val: T): T {
  if (typeof val === 'string') {
    val = val.replace(/\$\{(.*?)\}/g, (match, name) => {
      // If there's no replacement available, keep the placeholder.
      return replacement(name) ?? match;
    }) as unknown as T;
  } else if (Array.isArray(val)) {
    val = val.map((x) => substitute(x)) as unknown as T;
  } else if (typeof val === 'object') {
    // Substitute values but not keys, so we don't deal with collisions.
    const result = {} as { [k: string]: any };
    for (const key in val) {
      result[key] = substitute(val[key]);
    }
    val = result as T;
  }
  return val;
}

// Subset of substitution variables that are most likely to be useful.
// https://code.visualstudio.com/docs/editor/variables-reference
function replacement(name: string): string | undefined {
  if (name === 'userHome') {
    return homedir();
  }
  if (name === 'workspaceRoot' || name === 'workspaceFolder' || name === 'cwd') {
    if (vscode.workspace.rootPath !== undefined) {
      return vscode.workspace.rootPath;
    }
    if (vscode.window.activeTextEditor !== undefined) {
      return path.dirname(vscode.window.activeTextEditor.document.uri.fsPath);
    }
    return process.cwd();
  }
  if (name === 'workspaceFolderBasename' && vscode.workspace.rootPath !== undefined) {
    return path.basename(vscode.workspace.rootPath);
  }
  const envPrefix = 'env:';
  if (name.startsWith(envPrefix)) {
    return process.env[name.substr(envPrefix.length)] ?? '';
  }
  const configPrefix = 'config:';
  if (name.startsWith(configPrefix)) {
    const config = vscode.workspace.getConfiguration().get(name.substr(configPrefix.length));
    return typeof config === 'string' ? config : undefined;
  }

  return undefined;
}
