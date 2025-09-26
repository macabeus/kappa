import { spawn } from 'child_process';
import { glob } from 'glob';
import * as path from 'path';

import { checkFileExists } from './vscode-utils';

/**
 * Get different Python executable paths based on the platform
 */
export async function getPythonPaths({ listPoetry = true }: { listPoetry?: boolean } = {}): Promise<string[]> {
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
      '/usr/bin/python3',
      '/usr/local/bin/python3',
      '/opt/homebrew/bin/python3',
      '/usr/bin/python',
      '/usr/local/bin/python',
      '/opt/homebrew/bin/python',
    ];

    if (listPoetry) {
      possiblePythonPaths.push(
        '/usr/local/bin/poetry',
        '/opt/homebrew/bin/poetry',
        `${process.env.HOME}/.local/bin/poetry`,
        `${process.env.HOME}/.poetry/bin/poetry`,
      );
    }

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

export async function spawnPythonScript(
  pythonExecutablePath: string,
  cwd: string,
  pythonFilename: string,
  args: ReadonlyArray<string> = [],
) {
  const runCommand = pythonExecutablePath.includes('poetry') ? ['run', 'python'] : [];

  // Check for virtual environment
  const venvPath = path.join(cwd, '.venv');
  const hasVenv = await checkFileExists(venvPath);

  let spawnCommand: string;
  let spawnArgs: string[];

  if (hasVenv && !pythonExecutablePath.includes('poetry')) {
    const venvPythonPath =
      process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python');

    spawnCommand = venvPythonPath;
    spawnArgs = [pythonFilename, ...args];
  } else {
    spawnCommand = pythonExecutablePath;
    spawnArgs = [...runCommand, pythonFilename, ...args];
  }

  const childProcess = spawn(spawnCommand, spawnArgs, {
    cwd,
    shell: false,
  });

  return childProcess;
}
