import type { ChildProcessWithoutNullStreams } from 'child_process';

export async function* streamOutput(process: ChildProcessWithoutNullStreams): AsyncGenerator<string> {
  let buffer = '';
  let processEnded = false;
  let processError: Error | null = null;

  const lines: string[] = [];
  let resolveNext: ((value: IteratorResult<string>) => void) | null = null;

  const processLine = (data: string) => {
    buffer += data;
    const newLines = buffer.split('\n');
    buffer = newLines.pop() || '';

    for (const line of newLines) {
      lines.push(line);

      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve({ value: line, done: false });
      }
    }
  };

  process.stdout.on('data', (data: Buffer) => {
    processLine(data.toString());
  });

  process.stderr.on('data', (data: Buffer) => {
    processLine(data.toString());
  });

  process.on('close', () => {
    processEnded = true;

    // Process any remaining buffer content
    if (buffer.trim()) {
      lines.push(buffer);
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve({ value: buffer, done: false });
      }
    }

    // Signal completion
    if (resolveNext) {
      const resolve = resolveNext;
      resolveNext = null;
      resolve({ value: undefined, done: true });
    }
  });

  process.on('error', (error: Error) => {
    processError = error;
    processEnded = true;
    if (resolveNext) {
      const resolve = resolveNext;
      resolveNext = null;
      resolve({ value: undefined, done: true });
    }
  });

  while (!processEnded || lines.length > 0) {
    if (processError) {
      throw processError;
    }

    if (lines.length > 0) {
      yield lines.shift()!;
    } else if (!processEnded) {
      await new Promise<IteratorResult<string>>((resolve) => {
        resolveNext = resolve;
      });
    }
  }
}

export async function getOutput(process: ChildProcessWithoutNullStreams) {
  return new Promise<{ stdout: string; stderr: string; success: boolean }>((resolve) => {
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
