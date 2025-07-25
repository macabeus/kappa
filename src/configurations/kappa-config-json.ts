import * as vscode from 'vscode';
import z from 'zod';
import { checkFileExists, getRelativePath, getWorkspaceRoot, showFilePicker, showPicker } from '../utils/vscode-utils';
import { fetchPlatform } from '../decompme/platform';

export const kappaConfigPlatforms = ['gba', 'n3ds', 'nds'] as const;
export type KappaConfigPlatforms = (typeof kappaConfigPlatforms)[number];

const kappaConfigSchema = z.object({
  kappaConfigVersion: z.literal(1),
  platform: z.enum(kappaConfigPlatforms),
  decompme: z
    .object({
      contextPath: z.string(),
      compiler: z.string(),
      preset: z.number().nullable(),
    })
    .optional(),
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

export async function ensureKappaConfigExists({ ensureSpecificConfig }: { ensureSpecificConfig?: 'decompme' } = {}) {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace found. Please open a folder.');
    return;
  }

  const filePath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'kappa-config.json');
  const kappaConfigExists = await checkFileExists(filePath.fsPath);

  let needsCreate = 'Kappa configuration file not found. Do you want to create one?';
  let kappaConfig: KappaConfig | null = null;
  if (kappaConfigExists) {
    try {
      const content = await vscode.workspace.fs.readFile(filePath);
      const configContent = content.toString();
      kappaConfig = kappaConfigSchema.parse(JSON.parse(configContent));

      if (kappaConfig.kappaConfigVersion !== 1) {
        needsCreate = 'Kappa configuration needs an update. Do you want to update it?';
      } else if (ensureSpecificConfig === 'decompme' && !kappaConfig.decompme) {
        needsCreate = 'Missing "decompme" configuration. Do you want to fix it?';
      } else {
        return; // Configuration is valid, no need to create
      }
    } catch (error) {
      needsCreate = 'Kappa configuration file is invalid. Do you want to fix it?';
    }
  }

  const answer = await vscode.window.showInformationMessage(needsCreate, 'Yes', 'No');

  if (answer === 'Yes') {
    const newConfig = await createKappaConfig(kappaConfig);
    if (!newConfig) {
      throw new Error('Kappa configuration aborted');
    }

    if (ensureSpecificConfig === 'decompme' && !newConfig.decompme) {
      throw new Error('It is still missing the "decompme" configuration. Please run Kappa setup again.');
    }

    return;
  }

  throw new Error('Kappa configuration is required');
}

export async function createKappaConfig(currentConfig: KappaConfig | null = null): Promise<KappaConfig | null> {
  const platform = await showPicker({
    title: 'Select Platform',
    items: [
      { label: 'Gameboy Advance', value: 'gba' },
      { label: 'Nintendo 3DS', value: 'n3ds' },
      { label: 'Nintendo DS', value: 'nds' },
    ] as const,
    defaultValue: currentConfig?.platform,
  });

  if (!platform) {
    vscode.window.showErrorMessage('No platform selected. Kappa configuration not created.');
    return null;
  }

  // Ask if user wants to configure decomp.me settings
  const configureDecompMe = await showPicker({
    title: 'Do you want to configure decomp.me settings?',
    items: [
      { label: 'Yes, configure decomp.me settings', value: 'yes' },
      { label: 'Not yet', value: 'no' },
    ] as const,
  });

  let decompmeConfig: KappaConfig['decompme'] = undefined;
  if (configureDecompMe === 'yes') {
    const cFiles = await vscode.workspace.findFiles('**/*.{c,cpp}', 'tools/**');
    const contextPath = await showFilePicker({
      title: 'Enter the path to your context file',
      files: cFiles,
      defaultValue: currentConfig?.decompme?.contextPath,
    });

    if (!contextPath) {
      vscode.window.showErrorMessage('No context file selected. Kappa configuration not created.');
      return null;
    }

    const presets = await fetchPlatform(platform);

    const compiler = await showPicker({
      title: 'Select the compiler',
      items: presets.compilers.map((compiler) => ({ value: compiler })),
      defaultValue: currentConfig?.decompme?.compiler,
    });

    if (!compiler) {
      vscode.window.showErrorMessage('No compiler selected. Kappa configuration not created.');
      return null;
    }

    const defaultPreset = await showPicker({
      title: 'Select the preset. Esc to use custom.',
      items: presets.presets.map((preset) => ({ label: preset.name, value: `${preset.id}` })),
      defaultValue: currentConfig?.decompme?.preset?.toString(),
    });

    decompmeConfig = {
      contextPath: getRelativePath(contextPath),
      compiler: compiler,
      preset: defaultPreset ? parseInt(defaultPreset, 10) : null,
    };
  }

  const newConfig: KappaConfig = {
    kappaConfigVersion: 1,
    platform,
    decompme: decompmeConfig,
  };

  const configFilePath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'kappa-config.json');
  await vscode.workspace.fs.writeFile(configFilePath, Buffer.from(JSON.stringify(newConfig, null, 2)));

  return newConfig;
}
