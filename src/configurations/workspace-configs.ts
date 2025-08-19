import path from 'path';
import fs from 'fs';
import * as vscode from 'vscode';
import { getPythonPaths } from '../utils/python';
import { checkFileExists, showPicker } from '../utils/vscode-utils';

// Configuration getters
export function getVoyageApiKey(): string {
  return vscode.workspace.getConfiguration('kappa').get('voyageApiKey', '');
}

export function getM2cPath(): string {
  return vscode.workspace.getConfiguration('kappa').get('m2cPath', '');
}

export function getPythonExecutablePath(): string {
  return vscode.workspace.getConfiguration('kappa').get('pythonExecutablePath', '');
}

// Configuration setters
export async function showInputBoxForSettingM2cPath(): Promise<string | null> {
  const m2cPath = await vscode.window.showInputBox({
    prompt: 'Enter the path for m2c on your computer. It will be stored in the VS Code settings.',
    value: getM2cPath(),
    validateInput: async (value: string) => {
      if (!value || value.trim().length === 0) {
        return 'Path cannot be empty.';
      }

      const isAbsolute = path.isAbsolute(value);
      if (!isAbsolute) {
        return 'It should be an absolute path.';
      }

      const isDirectory = fs.lstatSync(value).isDirectory();
      if (!isDirectory) {
        return 'It should be a directory.';
      }

      const m2cFilePath = path.join(value, 'm2c.py');
      const m2cExists = await checkFileExists(m2cFilePath);
      if (!m2cExists) {
        return 'm2c.py not found at the specified folder';
      }

      return null;
    },
  });

  if (!m2cPath) {
    return null;
  }

  await vscode.workspace.getConfiguration('kappa').update('m2cPath', m2cPath, vscode.ConfigurationTarget.Global);
  return m2cPath;
}

export async function showInputBoxForSettingPythonExecutablePath(): Promise<string | null> {
  const pythonExecutablePath = await showPicker({
    title: 'Select the Python executable path. It will be stored in the VS Code settings.',
    items: await getPythonPaths().then((paths) => paths.map((path) => ({ label: path, value: path }))),
    defaultValue: getPythonExecutablePath(),
    allowCustomValue: true,
  });

  if (!pythonExecutablePath) {
    return null;
  }

  await vscode.workspace
    .getConfiguration('kappa')
    .update('pythonExecutablePath', pythonExecutablePath, vscode.ConfigurationTarget.Global);

  return pythonExecutablePath;
}
