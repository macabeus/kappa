import { ChildProcessWithoutNullStreams } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';
import * as vscode from 'vscode';

import { extractTargetFunction } from '@utils/ast-grep-utils';
import { spawnPythonScript } from '@utils/python';
import { getWorkspaceUri, showFilePicker } from '@utils/vscode-utils';
import { getDecompPermuterPath, showInputBoxForSettingDecompPermuterPath } from '~/configurations/workspace-configs';
import type { CtxDecompPermuterPythonExecutablePath, CtxDecompYaml } from '~/context';
import { getOutput, streamOutput } from '~/utils/process-utils';

export type SpawnDecompPermuterParams = {
  targetFunctionName: string;
  cFilePath: string;
  asmFilePath: string;
};

export type DecompPermuterLog =
  | { type: 'base-score'; value: number }
  | { type: 'better-score'; value: number }
  | { type: 'same-score'; value: number }
  | { type: 'new-best'; value: number };

export class DecompPermuter {
  static currentInstance: DecompPermuter | null = null;

  #process: ChildProcessWithoutNullStreams;
  readonly importedPath: string;

  constructor(permutePythonProcess: ChildProcessWithoutNullStreams, importedPath: string) {
    this.#process = permutePythonProcess;
    this.importedPath = importedPath;

    DecompPermuter.currentInstance = this;
  }

  static async spawn(ctx: CtxDecompYaml & CtxDecompPermuterPythonExecutablePath, params: SpawnDecompPermuterParams) {
    try {
      const workspaceUri = getWorkspaceUri();

      // Get decomp-permuter path from configuration
      let decompPermuterPath: string | null = getDecompPermuterPath();
      if (!decompPermuterPath) {
        const answer = await vscode.window.showInformationMessage(
          'decomp-permuter path is not configured. Do you want to confiure it now?',
          'Yes',
          'No',
        );

        if (answer !== 'Yes') {
          return null;
        }

        decompPermuterPath = await showInputBoxForSettingDecompPermuterPath();
      }
      if (!decompPermuterPath) {
        vscode.window.showErrorMessage('No decomp-permuter path provided.');
        return null;
      }

      // Isolate the function from a new temporary source file
      const cFileUri = vscode.Uri.file(params.cFilePath);
      const targetFileBuffer = await vscode.workspace.fs.readFile(cFileUri);

      const tempFileName = `decomp_permuter_temp_${Date.now()}.c`;
      const temporaryFileSource = new TextDecoder().decode(targetFileBuffer);

      const filteredSource = extractTargetFunction(temporaryFileSource, params.targetFunctionName);

      const fullTempSource = `// Temporary file created by Kappa extension for decomp-permuter\n\n${filteredSource}`;

      const temporaryFilePath = path.join(workspaceUri.fsPath, 'src', 'code', tempFileName);
      await vscode.workspace.fs.writeFile(vscode.Uri.file(temporaryFilePath), new TextEncoder().encode(fullTempSource));

      const args = [temporaryFilePath, params.asmFilePath];

      const importPythonProcess = await spawnPythonScript(
        ctx.decompPythonExecutablePath,
        decompPermuterPath,
        'import.py',
        args,
      );
      const result = await getOutput(importPythonProcess);
      if (!result.success) {
        return handleDecompPermuterError(ctx, result.stderr || result.stdout, params);
      }

      const importedPath = result.stdout
        .match(/Done. Imported into (?<importedPath>[\s\S]+)/)
        ?.groups?.importedPath.trim();
      if (!importedPath) {
        vscode.window.showErrorMessage(`decomp-permuter did not return the imported path.`);
        return null;
      }

      const permutePythonProcess = await spawnPythonScript(
        ctx.decompPythonExecutablePath,
        decompPermuterPath,
        'permuter.py',
        [path.join(decompPermuterPath, importedPath), '--stop-on-zero'],
      );

      return new DecompPermuter(permutePythonProcess, importedPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to run decomp-permuter: ${errorMessage}`);

      return null;
    }
  }

  static getOutputPath(
    output:
      | { type: 'base'; importedPath: string }
      | { type: 'output'; importedPath: string; score: number; index: number },
  ): string {
    const decompPath = getDecompPermuterPath();

    const outputName =
      output.type === 'base' ? 'base.c' : path.join(`output-${output.score}-${output.index}`, 'source.c');

    const fullPath = path.join(decompPath, output.importedPath, outputName);

    return fullPath;
  }

  static async getOutputCode(
    output:
      | { type: 'base'; importedPath: string }
      | { type: 'output'; importedPath: string; score: number; index: number },
  ): Promise<string | null> {
    const path = this.getOutputPath(output);

    const fileContent = await readFile(path, 'utf-8');

    return fileContent;
  }

  async *streamDecompPermuterOutput(): AsyncGenerator<DecompPermuterLog> {
    for await (const line of streamOutput(this.#process)) {
      const match = line.match(/base score = (?<value>\d+)/);
      if (match?.groups?.value) {
        yield { type: 'base-score', value: Number(match.groups.value) };
      }

      const betterMatch = line.match(/found a better score! \((?<value>\d+)/);
      if (betterMatch?.groups?.value) {
        yield { type: 'better-score', value: Number(betterMatch.groups.value) };
      }

      const sameMatch = line.match(/asm with same score \((?<value>\d+)/);
      if (sameMatch?.groups?.value) {
        yield { type: 'same-score', value: Number(sameMatch.groups.value) };
      }

      const newBestMatch = line.match(/new best score! \((?<value>\d+)/);
      if (newBestMatch?.groups?.value) {
        yield { type: 'new-best', value: Number(newBestMatch.groups.value) };
      }
    }
  }

  stop() {
    this.#process.kill();
  }
}

async function handleDecompPermuterError(
  ctx: CtxDecompYaml & CtxDecompPermuterPythonExecutablePath,
  stderr: string,
  params: SpawnDecompPermuterParams,
): Promise<DecompPermuter | null> {
  if (stderr.includes('Missing function name in assembly file!')) {
    const answer = await vscode.window.showErrorMessage(
      `decomp-permuter failed: Missing function name "${params.targetFunctionName}" in assembly file! The file should start with 'glabel ${params.targetFunctionName}'.`,
      'Try new file',
      'Open the assembly file',
    );

    if (answer === 'Try new file') {
      const asmFiles = await vscode.workspace.findFiles('**/*.{s,S,asm}', 'tools/**');
      const asmFilePath = await showFilePicker({
        title: 'Select The Target Assembly File',
        files: asmFiles,
      });

      if (!asmFilePath) {
        return null;
      }

      return DecompPermuter.spawn(ctx, {
        ...params,
        asmFilePath,
      });
    } else if (answer === 'Open the assembly file') {
      const asmFileUri = vscode.Uri.file(params.asmFilePath);
      const document = await vscode.workspace.openTextDocument(asmFileUri);
      await vscode.window.showTextDocument(document);
    }
  } else {
    vscode.window.showErrorMessage(`decomp-permuter failed: ${stderr}`);
  }

  return null;
}
