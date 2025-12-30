import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

/**
 * Utility class for compiling C code to object files for testing purposes.
 */
export class CCompiler {
  private compilerDir: string;

  /**
   * Creates a new CCompiler instance.
   * @param compilerDir - Path to the directory containing the compiler and compile.sh script
   */
  constructor(compilerDir: string) {
    this.compilerDir = compilerDir;
  }

  /**
   * Compiles C code to an object file.
   *
   * @param outputDir - Directory where the object file will be output
   * @param functionName - Name of the function (used for file naming)
   * @param cCode - C source code to compile
   * @returns Path to the compiled object file
   *
   * @example
   * ```typescript
   * const compiler = new CCompiler('/compiler/path');
   * const objPath = await compiler.compile('/path/to/output', 'myFunc', 'int myFunc() { return 1; }');
   * ```
   */
  async compile(outputDir: string, functionName: string, cCode: string): Promise<string> {
    const srcPath = path.join(this.compilerDir, `${functionName}.c`);
    const objPath = path.join(outputDir, `${functionName}.o`);

    // Write C source file in compiler directory
    await fs.writeFile(srcPath, cCode);

    try {
      // Run the compile script
      const compileScript = path.join(this.compilerDir, 'compile.sh');
      execSync(`bash "${compileScript}" "${functionName}"`, { cwd: this.compilerDir });

      // Copy the compiled object file to output directory
      const tempOFile = path.join(this.compilerDir, `${functionName}.o`);
      await fs.copyFile(tempOFile, objPath);

      return objPath;
    } finally {
      // Clean up temporary files in compiler directory
      await Promise.allSettled([
        fs.unlink(srcPath),
        fs.unlink(path.join(this.compilerDir, `${functionName}.o`)),
        fs.unlink(path.join(this.compilerDir, `${functionName}.s`)),
      ]);
    }
  }
}
