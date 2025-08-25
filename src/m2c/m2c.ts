import path from 'path';
import * as vscode from 'vscode';

import { DecompYamlPlatforms, updateDecompYaml } from '@configurations/decomp-yaml';
import {
  getM2cPath,
  showInputBoxForSettingM2cPath,
  showInputBoxForSettingPythonExecutablePath,
} from '@configurations/workspace-configs';
import { database } from '@db/db';
import { runPythonScript } from '@utils/python';
import { getWorkspaceUri } from '@utils/vscode-utils';
import type { CtxDecompYaml, CtxM2cPythonExecutablePath } from '~/context';

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
export async function decompileWithM2c(
  ctx: CtxDecompYaml & CtxM2cPythonExecutablePath,
  functionId: string,
): Promise<string | null> {
  try {
    const workspaceUri = getWorkspaceUri();

    // Map platform to m2c target
    const m2cTarget = platformMapping[ctx.decompYaml.platform];
    if (!m2cTarget) {
      vscode.window.showErrorMessage(`Platform "${ctx.decompYaml.platform}" is not supported by m2c.`);
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

    const asmPath = path.join(workspaceUri.fsPath, decompFunction.asmModulePath);

    const args = [
      asmPath,
      '--target',
      m2cTarget,
      '--function',
      decompFunction.name,
      ...(ctx.decompYaml.tools.m2c?.otherFlags ? ctx.decompYaml.tools.m2c.otherFlags.split(' ') : []),
    ];

    if (ctx.decompYaml.tools.m2c?.contextPath) {
      const contextFullPath = path.join(workspaceUri.fsPath, ctx.decompYaml.tools.m2c.contextPath);
      args.push('--context', contextFullPath);
    }

    const result = await runPythonScript(ctx, m2cPath, 'm2c.py', args);
    if (!result.success) {
      return handleM2cError(ctx, functionId, result.stderr || result.stdout);
    }

    return result.stdout;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to decompile with m2c: ${errorMessage}`);

    return null;
  }
}

async function handleM2cError(
  ctx: CtxDecompYaml & CtxM2cPythonExecutablePath,
  functionId: string,
  stderr: string,
): Promise<string | null> {
  if (stderr.includes('error when parsing C context')) {
    const answer = await vscode.window.showInformationMessage(
      'Error on the context file. Do you want to unset the context file and retry?',
      'Yes',
      'No',
    );

    if (answer === 'Yes') {
      ctx.decompYaml.tools.m2c = {
        ...ctx.decompYaml.tools.m2c,
        contextPath: null,
      };

      await updateDecompYaml(ctx.decompYaml);

      return decompileWithM2c(ctx, functionId);
    }

    return null;
  }

  if (stderr.includes('No module named')) {
    const answer = await vscode.window.showErrorMessage(
      'It is missing to install the dependencies for m2c. Please follow the m2c installation guide.',
      'Try again',
      'Use another Python executable path',
    );

    if (answer === 'Try again') {
      return decompileWithM2c(ctx, functionId);
    } else if (answer === 'Use another Python executable path') {
      const pythonExecutablePath = await showInputBoxForSettingPythonExecutablePath({
        settingName: 'm2cPythonExecutablePath',
      });

      if (!pythonExecutablePath) {
        vscode.window.showErrorMessage('No Python executable path provided.');
        return null;
      }

      ctx.m2cPythonExecutablePath = pythonExecutablePath;

      return decompileWithM2c(ctx, functionId);
    }

    return null;
  }

  vscode.window.showErrorMessage(`m2c failed: ${stderr}`);

  return null;
}
