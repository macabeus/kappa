import { spawn } from 'child_process';
import { glob } from 'glob';
import * as path from 'path';

import type { CtxM2cPythonExecutablePath } from '~/context';

import { checkFileExists } from './vscode-utils';

/**
 * Get different Python executable paths based on the platform
 */
export async function getPythonPaths(): Promise<string[]> {
  const paths: string[] = [];

  if (process.platform === 'win32') {
    const userProfile = process.env.USERPROFILE;
    if (userProfile) {
      const windowsAppsPath = path.join(userProfile, 'AppData', 'Local', 'Microsoft', 'WindowsApps');
      const localPythonPath = path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python');

      const [windowsAppPythonPaths, localPythonPaths] = await Promise.all([
        glob('python*.exe', { cwd: windowsAppsPath, absolute: true, ignore: '**/pythonw*.exe' }),
        glob('*/python.exe', { cwd: localPythonPath, absolute: true }),
      ]);

      paths.push(...windowsAppPythonPaths, ...localPythonPaths);
    }

    const programFiles = process.env.ProgramFiles;
    if (programFiles) {
      paths.push(...(await glob('*/python.exe', { cwd: programFiles, absolute: true })));
    }
  } else {
    // Unix-like systems (macOS, Linux)
    const possiblePythonPaths = [
      '/usr/local/bin/poetry',
      '/opt/homebrew/bin/poetry',
      `${process.env.HOME}/.local/bin/poetry`,
      `${process.env.HOME}/.poetry/bin/poetry`,
      '/usr/bin/python3',
      '/usr/local/bin/python3',
      '/opt/homebrew/bin/python3',
      '/usr/bin/python',
      '/usr/local/bin/python',
      '/opt/homebrew/bin/python',
    ];

    const promises = possiblePythonPaths.map(async (pythonPath) => {
      const exists = await checkFileExists(pythonPath);
      if (exists) {
        if (pythonPath.includes('poetry')) {
          paths.unshift(pythonPath); // prioritize poetry paths
        } else {
          paths.push(pythonPath);
        }
      }
    });

    await Promise.all(promises);
  }

  return paths;
}

export async function runPythonScript(
  ctx: CtxM2cPythonExecutablePath,
  cwd: string,
  pythonFilename: string,
  args: ReadonlyArray<string> = [],
) {
  const runCommand = ctx.m2cPythonExecutablePath.includes('poetry') ? ['run', 'python'] : [];

  return new Promise<{ stdout: string; stderr: string; success: boolean }>((resolve) => {
    const process = spawn(ctx.m2cPythonExecutablePath, [...runCommand, pythonFilename, ...args], {
      cwd,
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    process.on('close', (code: number) => {
      resolve({
        stdout,
        stderr,
        success: code === 0,
      });
    });

    process.on('error', (error: Error) => {
      resolve({
        stdout,
        stderr: error.message,
        success: false,
      });
    });
  });
}
