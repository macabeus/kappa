import * as vscode from 'vscode';
import z from 'zod';
import { checkFileExists, getWorkspaceRoot, showPicker } from '../utils/vscode-utils';

export const platforms = ['gba', 'n3ds', 'nds'] as const;

const kappaConfigSchema = z.object({
  platform: z.enum(platforms),
});

export type KappaConfig = z.infer<typeof kappaConfigSchema>;

export async function loadKappaConfig() {
  let kappaConfig: KappaConfig;

  const filePath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'kappa-config.json');
  const kappaConfigExists = await checkFileExists(filePath.fsPath);
  if (!kappaConfigExists) {
    return null;
  }

  const content = await vscode.workspace.fs.readFile(filePath);
  const configContent = content.toString();
  try {
    kappaConfig = kappaConfigSchema.parse(JSON.parse(configContent));
  } catch (error) {
    vscode.window.showErrorMessage(`Invalid Kappa configuration: ${error}`);
    return null;
  }

  return kappaConfig;
}

export async function ensureKappaConfigExists() {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace found. Please open a folder.');
    return;
  }

  const filePath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'kappa-config.json');
  const kappaConfigExists = await checkFileExists(filePath.fsPath);

  let hasInvalidConfig = false;
  if (kappaConfigExists) {
    const content = await vscode.workspace.fs.readFile(filePath);
    const configContent = content.toString();
    try {
      kappaConfigSchema.parse(JSON.parse(configContent));
      return;
    } catch (error) {
      hasInvalidConfig = true;
    }
  }

  const message = hasInvalidConfig
    ? 'Kappa configuration file is invalid. Do you want to fix it?'
    : 'Kappa configuration file not found. Do you want to create one?';

  const answer = await vscode.window.showInformationMessage(message, 'Yes', 'No');

  if (answer === 'Yes') {
    await createKappaConfig();
    return;
  }

  throw new Error('Kappa configuration is required');
}

async function createKappaConfig() {
  const platform = await showPicker({
    title: 'Select Platform',
    items: [
      { label: 'Gameboy Advance', value: 'gba' },
      { label: 'Nintendo 3DS', value: 'n3ds' },
      { label: 'Nintendo DS', value: 'nds' },
    ] as const,
  });

  if (!platform) {
    vscode.window.showErrorMessage('No platform selected. Kappa configuration not created.');
    return null;
  }

  const newConfig: KappaConfig = {
    platform,
  };

  const configFilePath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'kappa-config.json');
  await vscode.workspace.fs.writeFile(configFilePath, Buffer.from(JSON.stringify(newConfig, null, 2)));

  return newConfig;
}
