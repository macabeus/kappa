import path from 'path';
import * as vscode from 'vscode';
import { loadDecompYaml, DecompYamlPlatforms, updateDecompYaml, createDecompYaml } from '../configurations/decomp-yaml';
import { database } from '../db/db';
import { getWorkspaceRoot } from '../utils/vscode-utils';
import { getM2cPath, showInputBoxForSettingM2cPath } from '../configurations/workspace-configs';
import { runPythonScript } from '../utils/python';

// Map platform from decomp.yaml to m2c target architecture
const platformMapping: Record<DecompYamlPlatforms, string | null> = {
  gba: 'arm',
  nds: 'arm',
  n3ds: 'arm',
  n64: 'mips',
  gc: 'ppc',
  wii: 'ppc',
  ps1: 'mips',
  ps2: 'mipsel',
  psp: 'mipsel',
  win32: null,
};

/**
 * Decompile a function using m2c and open the result in a new VS Code document
 */
export async function decompileWithM2c(functionId: string): Promise<string | null> {
  try {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('No workspace found.');
      return null;
    }

    // Load decomp.yaml
    const decompYaml = await loadDecompYaml();
    if (!decompYaml) {
      const answer = await vscode.window.showInformationMessage(
        'decomp.yaml configuration not found. Do you want to configure it now?',
        'Yes',
        'No',
      );

      if (answer === 'Yes') {
        await createDecompYaml();
      }

      return null;
    }

    // Map platform to m2c target
    const m2cTarget = platformMapping[decompYaml.platform];
    if (!m2cTarget) {
      vscode.window.showErrorMessage(`Platform "${decompYaml.platform}" is not supported by m2c.`);
      return null;
    }

    // Get m2c path from configuration
    const m2cPath = getM2cPath();
    if (!m2cPath) {
      const answer = await vscode.window.showInformationMessage(
        'm2c path is not configured. Do you want to confiure it now?',
        'Yes',
        'No',
      );

      if (answer === 'Yes') {
        await showInputBoxForSettingM2cPath();
      }

      return null;
    }

    // Get function from database
    const decompFunction = await database.getFunctionById(functionId);
    if (!decompFunction) {
      vscode.window.showErrorMessage(`Function with ID "${functionId}" not found in database.`);
      return null;
    }

    const asmPath = path.join(workspaceRoot, decompFunction.asmModulePath);

    const args = [
      asmPath,
      '--target',
      m2cTarget,
      '--function',
      decompFunction.name,
      ...(decompYaml.tools.m2c?.otherFlags ? decompYaml.tools.m2c.otherFlags.split(' ') : []),
    ];

    if (decompYaml.tools.m2c?.contextPath) {
      const contextFullPath = path.join(workspaceRoot, decompYaml.tools.m2c.contextPath);
      args.push('--context', contextFullPath);
    }

    const result = await runPythonScript(m2cPath, 'm2c.py', args);
    if (!result.success) {
      await handleM2cError(functionId, result.stderr || result.stdout);
      return null;
    }

    return result.stdout;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to decompile with m2c: ${errorMessage}`);

    return null;
  }
}

async function handleM2cError(functionId: string, stderr: string): Promise<void> {
  if (stderr.includes('error when parsing C context')) {
    const answer = await vscode.window.showInformationMessage(
      'Error on the context file. Do you want to unset the context file and retry?',
      'Yes',
      'No',
    );
    if (answer === 'Yes') {
      const decompYaml = await loadDecompYaml();
      if (!decompYaml) {
        vscode.window.showErrorMessage('decomp.yaml configuration not found. Please create it first.');
        return;
      }

      decompYaml.tools.m2c = {
        ...decompYaml.tools.m2c,
        contextPath: null,
      };

      await updateDecompYaml(decompYaml);

      await decompileWithM2c(functionId);
    }

    return;
  }

  if (stderr.includes('No module named')) {
    vscode.window.showErrorMessage(
      'It is missing to install the dependencies for m2c. Please follow the m2c installation guide.',
    );
    return;
  }

  vscode.window.showErrorMessage(`m2c failed: ${stderr}`);
}
