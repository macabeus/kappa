import * as vscode from 'vscode';

import { DecompYaml, createDecompYaml, loadDecompYaml } from '@configurations/decomp-yaml';
import {
  getDecompPermuterPythonExecutablePath,
  getM2cPythonExecutablePath,
  showInputBoxForSettingPythonExecutablePath,
} from '@configurations/workspace-configs';

export type Context<
  RequireDecompYaml extends boolean,
  RequireM2cPythonExecutablePath extends boolean,
  RequireDecompPermuterPythonExecutablePath extends boolean,
> = (RequireDecompYaml extends true ? { decompYaml: DecompYaml } : {}) &
  (RequireM2cPythonExecutablePath extends true ? { m2cPythonExecutablePath: string } : {}) &
  (RequireDecompPermuterPythonExecutablePath extends true ? { decompPythonExecutablePath: string } : {});

export type CtxDecompYaml = Context<true, false, false>;
export type CtxM2cPythonExecutablePath = Context<false, true, false>;
export type CtxDecompPermuterPythonExecutablePath = Context<false, false, true>;

export async function getContext<
  RequireDecompYaml extends boolean = false,
  RequireM2cPythonExecutablePath extends boolean = false,
  RequireDecompPermuterPythonExecutablePath extends boolean = false,
>(require: {
  decompYaml?: RequireDecompYaml;
  m2cPythonExecutablePath?: RequireM2cPythonExecutablePath;
  decompPermuterPythonExecutablePath?: RequireDecompPermuterPythonExecutablePath;
}): Promise<Context<RequireDecompYaml, RequireM2cPythonExecutablePath, RequireDecompPermuterPythonExecutablePath>> {
  const ctx: {
    decompYaml?: DecompYaml;
    m2cPythonExecutablePath?: string;
    decompPythonExecutablePath?: string;
  } = {};

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

  // Get Python executable path for m2c if requested
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

  // Get Python executable path for permuter if requested
  if (require.decompPermuterPythonExecutablePath) {
    let decompPermuterPythonExecutablePath: string | null = getDecompPermuterPythonExecutablePath();

    if (!decompPermuterPythonExecutablePath) {
      const answer = await vscode.window.showInformationMessage(
        'Python executable path for permuter is not defined. Do you want to set it now?',
        'Yes',
        'No',
      );

      if (answer === 'No') {
        throw new Error('Action canceled. Python executable path for permuter is required.');
      }

      decompPermuterPythonExecutablePath = await showInputBoxForSettingPythonExecutablePath({
        settingName: 'decompPermuterPythonExecutablePath',
      });
      if (!decompPermuterPythonExecutablePath) {
        throw new Error('Action canceled. Python executable path is still not set');
      }
    }

    ctx.decompPythonExecutablePath = decompPermuterPythonExecutablePath;
  }

  // Return the assembled context
  return ctx as Context<RequireDecompYaml, RequireM2cPythonExecutablePath, RequireDecompPermuterPythonExecutablePath>;
}
