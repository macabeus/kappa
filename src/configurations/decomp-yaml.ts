import * as vscode from 'vscode';
import YAML from 'yaml';
import z from 'zod';

import { fetchPlatform } from '@decompme/platform';
import {
  checkFileExists,
  getRelativePath,
  getWorkspaceUri,
  showFilePicker,
  showFolderPicker,
  showPicker,
} from '@utils/vscode-utils';
import type { CtxDecompYaml } from '~/context';

import {
  getM2cPath,
  getM2cPythonExecutablePath,
  showInputBoxForSettingM2cPath,
  showInputBoxForSettingPythonExecutablePath,
} from './workspace-configs';

export const decompYamlPlatforms = ['gba', 'nds', 'n3ds', 'n64', 'gc', 'wii', 'ps1', 'ps2', 'psp', 'win32'] as const;
export type DecompYamlPlatforms = (typeof decompYamlPlatforms)[number];

const decompYamlSchema = z.object({
  platform: z.enum(decompYamlPlatforms),
  tools: z.object({
    kappa: z.object({
      buildFolder: z.string(),
      nonMatchingAsmFolder: z.string(),
    }),
    decompme: z
      .object({
        contextPath: z.string(),
        compiler: z.string(),
        preset: z.number().nullable(),
      })
      .optional(),
    m2c: z
      .object({
        contextPath: z.string().nullable().optional(),
        otherFlags: z.string().optional(),
      })
      .optional(),
  }),
});

export type DecompYaml = z.infer<typeof decompYamlSchema>;

export async function loadDecompYaml() {
  const workspaceUri = getWorkspaceUri();

  let decompYamlPath: vscode.Uri;
  const ymlExtension = vscode.Uri.joinPath(workspaceUri, 'decomp.yml');
  const yamlExtension = vscode.Uri.joinPath(workspaceUri, 'decomp.yaml');
  if (await checkFileExists(ymlExtension.fsPath)) {
    decompYamlPath = ymlExtension;
  } else if (await checkFileExists(yamlExtension.fsPath)) {
    decompYamlPath = yamlExtension;
  } else {
    return null;
  }

  const bufferContent = await vscode.workspace.fs.readFile(decompYamlPath);
  const rawContent = bufferContent.toString();
  try {
    const decompYaml = decompYamlSchema.parse(YAML.parse(rawContent));
    return decompYaml;
  } catch {
    const answer = await vscode.window.showInformationMessage(
      'decomp.yaml configuration file is invalid. Do you want to fix it?',
      'Yes',
      'No',
    );
    if (answer === 'Yes') {
      const newConfig = await createDecompYaml();
      return newConfig;
    }
  }

  return null;
}

export async function ensureDecompYamlDefinesTool({
  ctx,
  tool,
}: {
  ctx: CtxDecompYaml;
  tool: keyof DecompYaml['tools'];
}) {
  if (ctx.decompYaml.tools?.[tool]) {
    return; // Configuration includes the specific tool
  }

  const answer = await vscode.window.showInformationMessage(
    `Missing "${tool}" tool on decomp.yaml. Do you want to configure it?`,
    'Yes',
    'No',
  );

  if (answer === 'Yes') {
    const newConfig = await createDecompYaml(ctx.decompYaml);
    if (!newConfig) {
      throw new Error('decomp.yaml configuration update aborted');
    }

    if (!newConfig.tools?.[tool]) {
      throw new Error(`It is still missing the configurtion for the tool "${tool}". Run decomp.yaml setup again.`);
    }

    ctx.decompYaml = newConfig;

    return;
  }

  throw new Error(`Action canceled. The configuration for the tool "${tool}" is required`);
}

export async function createDecompYaml(currentConfig: DecompYaml | null = null): Promise<DecompYaml | null> {
  const buildFolder = await showFolderPicker({
    title: 'Select the build folder (where the object files are outputted)',
    defaultValue: currentConfig?.tools?.kappa?.buildFolder,
  });

  if (!buildFolder) {
    vscode.window.showErrorMessage('No build folder selected. Config file not created.');
    return null;
  }

  const nonMatchingAsmFolder = await showFolderPicker({
    title: 'Select the folder which the non-matching assembly files (.s) are kept',
    defaultValue: currentConfig?.tools?.kappa?.nonMatchingAsmFolder,
  });

  if (!nonMatchingAsmFolder) {
    vscode.window.showErrorMessage('No non-matching assembly folder selected. Config file not created.');
    return null;
  }

  const platform = await showPicker({
    title: 'Select Platform',
    items: [
      { label: 'Gameboy Advance', value: 'gba' },
      { label: 'Nintendo DS', value: 'nds' },
      { label: 'Nintendo 3DS', value: 'n3ds' },
      { label: 'Nintendo 64', value: 'n64' },
      { label: 'GameCube', value: 'gc' },
      { label: 'Wii', value: 'wii' },
      { label: 'PlayStation', value: 'ps1' },
      { label: 'PlayStation 2', value: 'ps2' },
      { label: 'PlayStation Portable', value: 'psp' },
      { label: 'Windows (32-bit)', value: 'win32' },
    ] as const,
    defaultValue: currentConfig?.platform,
  });

  if (!platform) {
    vscode.window.showErrorMessage('No platform selected. Config file not created.');
    return null;
  }

  // Configure decomp.me
  const configureDecompMe = await showPicker({
    title: 'Do you want to configure the decomp.me tool?',
    items: [
      { label: 'Yes, configure the decomp.me tool', value: 'yes' },
      { label: 'Not yet', value: 'no' },
    ] as const,
  });

  let decompmeTool: NonNullable<DecompYaml['tools']>['decompme'] | undefined = undefined;
  if (configureDecompMe === 'yes') {
    const cFiles = await vscode.workspace.findFiles('**/*.{c,cpp}', 'tools/**');
    const contextPath = await showFilePicker({
      title: 'Enter the path to your context file for decomp.me.',
      files: cFiles,
      defaultValue: currentConfig?.tools?.decompme?.contextPath,
    });

    if (!contextPath) {
      vscode.window.showErrorMessage('No context file selected. Config file not created.');
      return null;
    }

    const presets = await fetchPlatform(platform);

    const compiler = await showPicker({
      title: 'Select the compiler',
      items: presets.compilers.map((compiler) => ({ value: compiler })),
      defaultValue: currentConfig?.tools?.decompme?.compiler,
    });

    if (!compiler) {
      vscode.window.showErrorMessage('No compiler selected. Config file not created.');
      return null;
    }

    const defaultPreset = await showPicker({
      title: 'Select the preset. Esc to use custom.',
      items: presets.presets.map((preset) => ({ label: preset.name, value: `${preset.id}` })),
      defaultValue: currentConfig?.tools?.decompme?.preset?.toString(),
    });

    decompmeTool = {
      contextPath: getRelativePath(contextPath),
      compiler: compiler,
      preset: defaultPreset ? parseInt(defaultPreset, 10) : null,
    };
  }

  // Configure m2c if it's supported by the platform
  let m2cTool: NonNullable<DecompYaml['tools']>['m2c'] | undefined = undefined;

  if (platform !== 'win32') {
    const configureM2c = await showPicker({
      title: 'Do you want to configure the m2c tool?',
      items: [
        { label: 'Yes, configure the m2c tool', value: 'yes' },
        { label: 'Not yet', value: 'no' },
      ] as const,
    });

    if (configureM2c === 'yes') {
      const hasM2cPath = Boolean(getM2cPath());
      if (!hasM2cPath) {
        const m2cPathUpdated = await showInputBoxForSettingM2cPath();

        if (!m2cPathUpdated) {
          vscode.window.showErrorMessage('No m2c path provided. Config file not created.');
          return null;
        }
      }

      const hasPythonExecutablePath = Boolean(getM2cPythonExecutablePath());
      if (!hasPythonExecutablePath) {
        const pythonExecutablePathUpdated = await showInputBoxForSettingPythonExecutablePath({
          settingName: 'm2cPythonExecutablePath',
        });

        if (!pythonExecutablePathUpdated) {
          vscode.window.showErrorMessage('No Python executable path provided. Config file not created.');
          return null;
        }
      }

      const cFiles = await vscode.workspace.findFiles('**/*.{c,cpp}', 'tools/**');
      const contextPath = await showFilePicker({
        title: 'Enter the path to your context file for m2c. Esc to not use it.',
        files: cFiles,
        defaultValue: currentConfig?.tools?.m2c?.contextPath || decompmeTool?.contextPath,
      });

      const otherFlags = await vscode.window.showInputBox({
        prompt: 'Write any additional flag to use on m2c. Esc to not use it.',
        value: currentConfig?.tools?.m2c?.otherFlags,
        validateInput: (value: string) => {
          const flags = value.split(' ');

          const invalidFlags = flags.filter(
            (flag) =>
              flag === '-t' || flag === '--target' || flag === '-f' || flag === '--function' || flag === '--context',
          );

          if (invalidFlags.length > 0) {
            return `Invalid flags: ${invalidFlags}. These flags are reserved for Kappa.`;
          }

          return null;
        },
      });

      m2cTool = {
        contextPath: contextPath ? getRelativePath(contextPath) : null,
        otherFlags,
      };
    }
  }

  // Create the final config object
  const newConfig: DecompYaml = {
    platform,
    tools: {
      kappa: {
        buildFolder: getRelativePath(buildFolder),
        nonMatchingAsmFolder: getRelativePath(nonMatchingAsmFolder),
      },
      ...(decompmeTool ? { decompme: decompmeTool } : {}),
      ...(m2cTool ? { m2c: m2cTool } : {}),
    },
  };

  const workspaceUri = getWorkspaceUri();
  const ymlExtension = vscode.Uri.joinPath(workspaceUri, 'decomp.yml');
  const yamlExtension = vscode.Uri.joinPath(workspaceUri, 'decomp.yaml');

  // Delete existing `decomp.yml`, since we are creating a new one named as `decomp.yaml`
  if (await checkFileExists(ymlExtension.fsPath)) {
    await vscode.workspace.fs.delete(ymlExtension);
  }

  // Write the new configuration to `decomp.yaml`
  await vscode.workspace.fs.writeFile(yamlExtension, Buffer.from(YAML.stringify(newConfig)));

  return newConfig;
}

export async function updateDecompYaml(newSettings: DecompYaml): Promise<void> {
  const workspaceUri = getWorkspaceUri();
  const decompYamlPath = vscode.Uri.joinPath(workspaceUri, 'decomp.yaml');
  await vscode.workspace.fs.writeFile(decompYamlPath, Buffer.from(YAML.stringify(newSettings)));
}
