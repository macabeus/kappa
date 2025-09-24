import path from 'path';
import * as vscode from 'vscode';

import { getPythonPaths } from '@utils/python';
import { checkFileExists, checkIsDirectory, showPicker } from '@utils/vscode-utils';

// Configuration getters
export function getVoyageApiKey(): string {
  return vscode.workspace.getConfiguration('kappa').get('voyageApiKey', '');
}

export function getM2cPath(): string {
  return vscode.workspace.getConfiguration('kappa').get('m2cPath', '');
}

export function getM2cPythonExecutablePath(): string {
  return vscode.workspace.getConfiguration('kappa').get('m2cPythonExecutablePath', '');
}

export function getDecompPermuterPath(): string {
  return vscode.workspace.getConfiguration('kappa').get('decompPermuterPath', '');
}

export function getDecompPermuterPythonExecutablePath(): string {
  return vscode.workspace.getConfiguration('kappa').get('decompPermuterPythonExecutablePath', '');
}

export function getAskIndexCodebase(): boolean {
  return vscode.workspace.getConfiguration('kappa').get('askIndexCodebase', true);
}

// Configuration setterts
export async function setAskIndexCodebase(value: boolean) {
  await vscode.workspace
    .getConfiguration('kappa')
    .update('askIndexCodebase', value, vscode.ConfigurationTarget.Workspace);
}

// Dialog setters
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

      const isDirectory = checkIsDirectory(value);
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

export async function showInputBoxForSettingDecompPermuterPath(): Promise<string | null> {
  const decompPermuterPath = await vscode.window.showInputBox({
    prompt: 'Enter the path for decomp-permuter on your computer. It will be stored in the VS Code settings.',
    value: getDecompPermuterPath(),
    validateInput: async (value: string) => {
      if (!value || value.trim().length === 0) {
        return 'Path cannot be empty.';
      }

      const isAbsolute = path.isAbsolute(value);
      if (!isAbsolute) {
        return 'It should be an absolute path.';
      }

      const isDirectory = checkIsDirectory(value);
      if (!isDirectory) {
        return 'It should be a directory.';
      }

      const importFilePath = path.join(value, 'import.py');
      const importExists = await checkFileExists(importFilePath);
      if (!importExists) {
        return 'import.py not found at the specified folder';
      }

      const permuterFilePath = path.join(value, 'permuter.py');
      const permuterExists = await checkFileExists(permuterFilePath);
      if (!permuterExists) {
        return 'permuter.py not found at the specified folder';
      }

      return null;
    },
  });

  if (!decompPermuterPath) {
    return null;
  }

  await vscode.workspace
    .getConfiguration('kappa')
    .update('decompPermuterPath', decompPermuterPath, vscode.ConfigurationTarget.Global);

  return decompPermuterPath;
}

export async function showInputBoxForSettingPythonExecutablePath({
  settingName,
}: {
  settingName: 'm2cPythonExecutablePath' | 'decompPermuterPythonExecutablePath';
}): Promise<string | null> {
  const defaultValue = vscode.workspace.getConfiguration('kappa').get(settingName, '');

  const listPoetry = settingName === 'm2cPythonExecutablePath';

  const pythonExecutablePath = await showPicker({
    title: 'Select the Python executable path. It will be stored in the VS Code settings.',
    items: await getPythonPaths({ listPoetry }).then((paths) => paths.map((path) => ({ label: path, value: path }))),
    defaultValue,
    allowCustomValue: true,
  });

  if (!pythonExecutablePath) {
    return null;
  }

  await vscode.workspace
    .getConfiguration('kappa')
    .update(settingName, pythonExecutablePath, vscode.ConfigurationTarget.Global);

  return pythonExecutablePath;
}
