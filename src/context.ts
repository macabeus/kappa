import * as vscode from 'vscode';

import { DecompYaml, createDecompYaml, loadDecompYaml } from '@configurations/decomp-yaml';
import { getPythonExecutablePath, showInputBoxForSettingPythonExecutablePath } from '@configurations/workspace-configs';

export type Context<
  RequireDecompYaml extends boolean,
  RequirePythonExecutablePath extends boolean,
> = (RequireDecompYaml extends true ? { decompYaml: DecompYaml } : {}) &
  (RequirePythonExecutablePath extends true ? { pythonExecutablePath: string } : {});

export type CtxDecompYaml = Context<true, false>;
export type CtxPythonExecutablePath = Context<false, true>;

export async function getContext<
  RequireDecompYaml extends boolean = false,
  RequirePythonExecutablePath extends boolean = false,
>(require: {
  decompYaml?: RequireDecompYaml;
  pythonExecutablePath?: RequirePythonExecutablePath;
}): Promise<Context<RequireDecompYaml, RequirePythonExecutablePath>> {
  const ctx: { decompYaml?: DecompYaml; workspaceRoot?: string; pythonExecutablePath?: string } = {};

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
  if (require.pythonExecutablePath) {
    let pythonExecutablePath: string | null = getPythonExecutablePath();

    if (!pythonExecutablePath) {
      const answer = await vscode.window.showInformationMessage(
        'Python executable path not found. Do you want to set it now?',
        'Yes',
        'No',
      );

      if (answer === 'No') {
        throw new Error('Action canceled. Python executable path is required.');
      }

      pythonExecutablePath = await showInputBoxForSettingPythonExecutablePath();
      if (!pythonExecutablePath) {
        throw new Error('Action canceled. Python executable path is still not set');
      }
    }

    ctx.pythonExecutablePath = pythonExecutablePath;
  }

  // Return the assembled context
  return ctx as Context<RequireDecompYaml, RequirePythonExecutablePath>;
}
