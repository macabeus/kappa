import * as vscode from 'vscode';

export function getWorkspaceRoot(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  return workspaceFolders[0].uri.fsPath;
}

export function getRelativePath(filePath: string): string {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    throw new Error('No workspace root found');
  }

  return vscode.workspace.asRelativePath(filePath, false);
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
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    throw new Error('No workspace root found');
  }

  // Check if path is already absolute
  if (vscode.Uri.file(path).scheme === 'file' && vscode.Uri.file(path).fsPath === path) {
    return path;
  }

  // Get workspace folder name
  const workspaceFolderName = vscode.Uri.file(workspaceRoot).path.split('/').pop();

  // Check if relative path starts with workspace folder name to avoid duplication
  let relativePath = path;
  if (workspaceFolderName && path.startsWith(workspaceFolderName + '/')) {
    relativePath = path.substring(workspaceFolderName.length + 1);
  }

  // Convert relative path to absolute
  return vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), relativePath).fsPath;
}

export async function showPicker<
  Items extends Array<{ label?: string; value: string }>,
  AllowCustomValue extends boolean = false,
>({
  items,
  title,
  placeholder,
  allowCustomValue,
}: {
  items: Items;
  title?: string;
  placeholder?: string;
  allowCustomValue?: AllowCustomValue;
}): Promise<AllowCustomValue extends true ? string | null : Items[number]['value'] | null> {
  const quickPickItems: vscode.QuickPickItem[] = items.map((item) => ({
    label: item.label ?? item.value,
  }));

  const quickPick = vscode.window.createQuickPick();
  quickPick.title = title;
  quickPick.placeholder = placeholder;
  quickPick.items = quickPickItems;

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
  allowCustomPath = false,
}: {
  files: vscode.Uri[];
  title?: string;
  placeholder?: string;
  allowCustomPath?: boolean;
}): Promise<string | null> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    throw new Error('No workspace root found');
  }

  const relativeFiles = files.map((file) => ({
    label: getRelativePath(file.fsPath),
    value: file.fsPath,
  }));

  const result = await showPicker({
    items: relativeFiles,
    title,
    placeholder,
    allowCustomValue: allowCustomPath,
  });

  if (!result) {
    return null;
  }

  return result;
}
