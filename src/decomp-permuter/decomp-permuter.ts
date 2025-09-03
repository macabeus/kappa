import { readFile } from 'fs/promises';
import path from 'path';
import * as vscode from 'vscode';

import { spawnPythonScript } from '@utils/python';
import { getWorkspaceUri } from '@utils/vscode-utils';
import type { CtxDecompYaml, CtxPermuterPythonExecutablePath } from '~/context';
import { getOutput } from '~/utils/process-utils';

export async function spawnDecompPermuter(ctx: CtxDecompYaml & CtxPermuterPythonExecutablePath) {
  try {
    const workspaceUri = getWorkspaceUri();

    // Get m2c path from configuration
    const decompPath = '/Users/macabeus/ApenasMeu/decompiler/decomp-permuter'; // getM2cPath();
    if (!decompPath) {
      const answer = await vscode.window.showInformationMessage(
        'decomp-permuter path is not configured. Do you want to confiure it now?',
        'Yes',
        'No',
      );

      if (answer === 'Yes') {
        // TODO
        // await showInputBoxForSettingM2cPath();
      }

      return null;
    }

    // Get function from database
    const args = [
      '/Users/macabeus/ApenasMeu/decompiler/af/src/code/c.c',
      '/Users/macabeus/ApenasMeu/decompiler/af/asm/jp/nonmatchings/code/audio_dcache.s',
    ];

    const importPythonProcess = await spawnPythonScript(ctx.decompPythonExecutablePath, decompPath, 'import.py', args);
    const result = await getOutput(importPythonProcess);
    if (!result.success) {
      return handleDecompPermuterError(ctx, result.stderr || result.stdout);
    }

    const importedPath = result.stdout
      .match(/Done. Imported into (?<importedPath>[\s\S]+)/)
      ?.groups?.importedPath.trim();
    if (!importedPath) {
      vscode.window.showErrorMessage(`decomp-permuter did not return the imported path.`);
      return null;
    }

    const permutePythonProcess = await spawnPythonScript(ctx.decompPythonExecutablePath, decompPath, 'permuter.py', [
      path.join(decompPath, importedPath),
      '--stop-on-zero',
    ]);

    const getBestMatch = async (): Promise<string | null> => {
      const fileContent = await readFile(path.join(decompPath, importedPath, 'output-0-1', 'source.c'), 'utf-8');
      return fileContent;
    };

    return { permutePythonProcess, getBestMatch };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to run decomp-permuter: ${errorMessage}`);

    return null;
  }
}

async function handleDecompPermuterError(ctx: CtxDecompYaml & CtxPermuterPythonExecutablePath, stderr: string) {
  vscode.window.showErrorMessage(`decomp-permuter failed: ${stderr}`);

  return null;
}
