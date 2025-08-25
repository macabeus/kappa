import * as vscode from 'vscode';

import { DecompYaml, createDecompYaml, loadDecompYaml } from '@configurations/decomp-yaml';
import {
  getM2cPythonExecutablePath,
  showInputBoxForSettingPythonExecutablePath,
} from '@configurations/workspace-configs';

export type Context<
  RequireDecompYaml extends boolean,
  RequireM2cPythonExecutablePath extends boolean,
> = (RequireDecompYaml extends true ? { decompYaml: DecompYaml } : {}) &
  (RequireM2cPythonExecutablePath extends true ? { m2cPythonExecutablePath: string } : {});

export type CtxDecompYaml = Context<true, false>;
export type CtxM2cPythonExecutablePath = Context<false, true>;

export async function getContext<
  RequireDecompYaml extends boolean = false,
  RequireM2cPythonExecutablePath extends boolean = false,
>(require: {
  decompYaml?: RequireDecompYaml;
  m2cPythonExecutablePath?: RequireM2cPythonExecutablePath;
}): Promise<Context<RequireDecompYaml, RequireM2cPythonExecutablePath>> {
  const ctx: { decompYaml?: DecompYaml; workspaceRoot?: string; m2cPythonExecutablePath?: string } = {};

  // Get decomp.yaml if requested
  if (require.decompYaml) {
    let decompYaml = await loadDecompYaml();

    if (!decompYaml) {
      const answer = await vscode.window.showInformationMessage(
        'decomp.yaml is required but was not found. Do you want to set it now?',
        'Yes',
        'No',
      );

      if (answer === 'No') {
        throw new Error('Action canceled. decomp.yaml is required.');
      }

      decompYaml = await createDecompYaml();
      if (!decompYaml) {
        throw new Error('Action canceled. decomp.yaml was not created.');
      }
    }

    ctx.decompYaml = decompYaml;
  }

  // Get Python executable path if requested
  if (require.m2cPythonExecutablePath) {
    let m2cPythonExecutablePath: string | null = getM2cPythonExecutablePath();

    if (!m2cPythonExecutablePath) {
      const answer = await vscode.window.showInformationMessage(
        'Python executable path for m2c is not defined. Do you want to set it now?',
        'Yes',
        'No',
      );

      if (answer === 'No') {
        throw new Error('Action canceled. Python executable path for m2c is required.');
      }

      m2cPythonExecutablePath = await showInputBoxForSettingPythonExecutablePath({
        settingName: 'm2cPythonExecutablePath',
      });
      if (!m2cPythonExecutablePath) {
        throw new Error('Action canceled. Python executable path is still not set');
      }
    }

    ctx.m2cPythonExecutablePath = m2cPythonExecutablePath;
  }

  // Return the assembled context
  return ctx as Context<RequireDecompYaml, RequireM2cPythonExecutablePath>;
}
