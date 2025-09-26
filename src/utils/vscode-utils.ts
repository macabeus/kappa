import fs from 'fs';
import { readFile } from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import * as vscode from 'vscode';

import { GetWorkspaceUriError } from './errors';

export function getWorkspaceUri(): vscode.Uri {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length !== 1) {
    throw new GetWorkspaceUriError(
      'The Kappa extension only supports single-root workspaces. Open a folder or workspace first.',
    );
  }

  return workspaceFolders[0].uri;
}

export function getRelativePath(filePath: string): string {
  return vscode.workspace.asRelativePath(filePath, false);
}

export function checkIsDirectory(path: string): boolean {
  try {
    const isDirectory = fs.lstatSync(path).isDirectory();
    return isDirectory;
  } catch {
    return false;
  }
}

export async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}

export function resolveAbsolutePath(path: string): string {
  const workspaceUri = getWorkspaceUri();

  // Check if path is already absolute
  if (vscode.Uri.file(path).scheme === 'file' && vscode.Uri.file(path).fsPath === path) {
    return path;
  }

  // Get workspace folder name
  const workspaceFolderName = workspaceUri.path.split('/').pop();

  // Check if relative path starts with workspace folder name to avoid duplication
  let relativePath = path;
  if (workspaceFolderName && path.startsWith(workspaceFolderName + '/')) {
    relativePath = path.substring(workspaceFolderName.length + 1);
  }

  // Convert relative path to absolute
  return vscode.Uri.joinPath(workspaceUri, relativePath).fsPath;
}

/**
 * Find files containing a specific search term from a given path.
 */
export async function findWorkspaceFilesContainingText(
  searchTerm: string,
  { filePattern = '*' } = {},
): Promise<string[]> {
  const workspaceRoot = getWorkspaceUri().fsPath;

  const asmPattern = path.join(workspaceRoot, filePattern);
  const files = await glob(asmPattern, {
    ignore: path.join(workspaceRoot, 'tools/**'),
    absolute: true,
  });

  const batchSize = 100;
  const matchingFiles: string[] = [];

  // Process files in batches to avoid overwhelming the system
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    // Process each batch concurrently
    const batchPromises = batch.map(async (filePath) => {
      try {
        const content = await readFile(filePath, 'utf8');
        if (content.includes(searchTerm)) {
          return filePath;
        }
      } catch (error) {
        // Silently skip files that can't be read (permissions, etc.)
        console.warn(`Could not read file ${filePath}:`, error);
      }
      return null;
    });

    const batchResults = await Promise.all(batchPromises);
    const validResults = batchResults.filter((result): result is string => result !== null);
    matchingFiles.push(...validResults);
  }

  return matchingFiles;
}

export async function showPicker<
  Items extends Array<{ label?: string; value: string }>,
  AllowCustomValue extends boolean = false,
>({
  items,
  title,
  placeholder,
  defaultValue,
  allowCustomValue,
}: {
  items: Items;
  title?: string;
  placeholder?: string;
  defaultValue?: Items[number]['value'];
  allowCustomValue?: AllowCustomValue;
}): Promise<AllowCustomValue extends true ? string | null : Items[number]['value'] | null> {
  const quickPickItems: vscode.QuickPickItem[] = items.map((item) => ({
    label: item.label ?? item.value,
  }));

  let defaultItemLabel: string | undefined;
  if (defaultValue) {
    const matchedItem = items.find((item) => item.label === defaultValue || item.value === defaultValue);
    if (matchedItem) {
      defaultItemLabel = matchedItem.label ?? matchedItem.value;
    }
  }

  const quickPick = vscode.window.createQuickPick();
  quickPick.title = title;
  quickPick.placeholder = placeholder;
  quickPick.items = quickPickItems;
  quickPick.value = defaultItemLabel ?? '';

  const result = await new Promise<string | null>((resolve) => {
    quickPick.onDidChangeValue((value) => {
      // Allow user to type custom paths
      if (allowCustomValue && value && !quickPickItems.some((item) => item.label === value)) {
        quickPick.items = [{ label: value, description: 'Custom value' }, ...quickPickItems];
      } else {
        quickPick.items = quickPickItems;
      }
    });

    quickPick.onDidAccept(() => {
      const selection = quickPick.selectedItems[0];
      const matchedItem = items.find((item) => item.label === selection.label);
      const respectiveValue = matchedItem?.value ?? selection?.label ?? null;
      resolve(respectiveValue);
      quickPick.dispose();
    });

    quickPick.onDidHide(() => {
      resolve(null);
      quickPick.dispose();
    });

    quickPick.show();
  });

  return result;
}

export async function showFilePicker({
  files,
  title,
  placeholder,
  defaultValue,
  allowCustomPath = false,
}: {
  files: vscode.Uri[];
  title?: string;
  placeholder?: string;
  defaultValue?: string;
  allowCustomPath?: boolean;
}): Promise<string | null> {
  const relativeFiles = files.map((file) => ({
    label: getRelativePath(file.fsPath),
    value: file.fsPath,
  }));

  const result = await showPicker({
    items: relativeFiles,
    title,
    placeholder,
    defaultValue,
    allowCustomValue: allowCustomPath,
  });

  if (!result) {
    return null;
  }

  return result;
}

export async function showFolderPicker({
  basePath,
  title,
  placeholder,
  defaultValue,
  allowCustomPath = false,
}: {
  basePath?: string;
  title?: string;
  placeholder?: string;
  defaultValue?: string;
  allowCustomPath?: boolean;
} = {}): Promise<string | null> {
  const workspaceRoot = getWorkspaceUri().fsPath;
  const searchPath = basePath ? resolveAbsolutePath(basePath) : workspaceRoot;

  // Get all folders in the specified path
  const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(searchPath));
  const folders = entries
    .filter(([name, type]) => type === vscode.FileType.Directory && !name.startsWith('.'))
    .map(([name]) => {
      const folderPath = vscode.Uri.joinPath(vscode.Uri.file(searchPath), name).fsPath;
      return {
        label: getRelativePath(folderPath),
        value: folderPath,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const result = await showPicker({
    items: folders,
    title,
    placeholder,
    defaultValue,
    allowCustomValue: allowCustomPath,
  });

  if (!result) {
    return null;
  }

  return result;
}
