import * as vscode from 'vscode';
import type * as ObjdiffWasm from 'objdiff-wasm';
import fs from 'fs/promises';
import path from 'path';
import { loadKappaConfig } from '../configurations/kappa-config-json';

type ObjdiffWasm = typeof ObjdiffWasm;
type ParsedObject = ObjdiffWasm.diff.Object;
type ObjectDiff = ObjdiffWasm.diff.ObjectDiff;
type DiffConfig = ObjdiffWasm.diff.DiffConfig;
type SymbolInfo = ObjdiffWasm.diff.SymbolInfo;

class Objdiff {
  #objdiff: Promise<ObjdiffWasm>;

  constructor() {
    this.#objdiff = this.#initializeObjdiff();
  }

  async #initializeObjdiff(): Promise<ObjdiffWasm> {
    // TODO: The following code is a workaround to load objdiff Wasm from the host environment on VS Code

    const extensionPath = vscode.extensions.getExtension('macabeus.kappa')?.extensionPath;
    if (!extensionPath) {
      throw new Error('Failed to initialize objdiff. Extension path not found');
    }

    // Load objdiff WASM manually to avoid fetch issues
    const wasmPath = path.join(extensionPath, 'node_modules/objdiff-wasm/dist/objdiff.core.wasm');
    const wasmBuffer = await fs.readFile(wasmPath);

    // Create a polyfill for fetch before importing objdiff
    const originalFetch = (global as any).fetch;

    // Mock fetch for objdiff WASM loading
    (global as any).fetch = async (url: string | URL): Promise<Response> => {
      const urlString = url.toString();

      // Check if this is a request for the objdiff.core.wasm file
      if (urlString.includes('objdiff.core.wasm')) {
        // Return a Response-like object that supports compileStreaming
        return {
          async arrayBuffer() {
            return wasmBuffer.buffer.slice(wasmBuffer.byteOffset, wasmBuffer.byteOffset + wasmBuffer.byteLength);
          },
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(wasmBuffer);
              controller.close();
            },
          }),
        } as Response;
      }

      // For other URLs, throw an error
      throw new Error(`fetch not available for: ${url}`);
    };

    // Also override WebAssembly.compileStreaming to handle our fake response
    const originalCompileStreaming = (globalThis as any).WebAssembly.compileStreaming;
    (globalThis as any).WebAssembly.compileStreaming = async (source: Response | Promise<Response>): Promise<any> => {
      const response = await source;
      const arrayBuffer = await response.arrayBuffer();
      return (globalThis as any).WebAssembly.compile(arrayBuffer);
    };

    // Import objdiff module with dynamic import to access the classes and functions
    const objdiff = await import('objdiff-wasm');

    // Restore original fetch and WebAssembly.compileStreaming
    (global as any).fetch = originalFetch;
    (globalThis as any).WebAssembly.compileStreaming = originalCompileStreaming;

    // Initialize objdiff
    objdiff.init('debug');

    return objdiff;
  }

  async #getDiffConfig(): Promise<DiffConfig> {
    const objdiff = await this.#objdiff;
    const diffConfig = new objdiff.diff.DiffConfig();

    const kappaConfig = await loadKappaConfig();
    if (!kappaConfig) {
      return diffConfig;
    }

    switch (kappaConfig.platform) {
      case 'gba': {
        diffConfig.setProperty('functionRelocDiffs', 'none');
        diffConfig.setProperty('arm.archVersion', 'v4t');
        break;
      }
      case 'nds': {
        diffConfig.setProperty('functionRelocDiffs', 'none');
        diffConfig.setProperty('arm.archVersion', 'v5te');
        break;
      }
      case 'n3ds': {
        diffConfig.setProperty('functionRelocDiffs', 'none');
        diffConfig.setProperty('arm.archVersion', 'v6k');
        break;
      }
      default: {
        const platform: never = kappaConfig.platform;
        vscode.window.showErrorMessage(`Unsupported platform: ${platform}`);
      }
    }

    return diffConfig;
  }

  async parseObjectFile(filePath: string): Promise<ParsedObject> {
    const objdiff = await this.#objdiff;
    const diffConfig = await this.#getDiffConfig();

    // Read the object file as a buffer
    const fileBuffer = await fs.readFile(filePath);

    // Parse the object file
    const parsedObject = objdiff.diff.Object.parse(new Uint8Array(fileBuffer), diffConfig);

    return parsedObject;
  }

  async getSymbolsName(obj: ParsedObject): Promise<string[]> {
    const objdiff = await this.#objdiff;
    const diffConfig = await this.#getDiffConfig();

    // Run diff to get ObjectDiff
    const diffResult = objdiff.diff.runDiff(obj, undefined, diffConfig, {
      mappings: [],
      selectingLeft: undefined,
      selectingRight: undefined,
    });

    if (!diffResult.left) {
      return [];
    }

    // Get sections
    const sections = objdiff.display.displaySections(
      diffResult.left,
      {},
      {
        showHiddenSymbols: false,
        showMappedSymbols: false,
        reverseFnOrder: false,
      },
    );

    // Extract symbol names from all sections
    const symbolNames: string[] = [];
    for (const section of sections) {
      for (const symbolRef of section.symbols) {
        const symbol = objdiff.display.displaySymbol(diffResult.left, symbolRef);
        symbolNames.push(symbol.info.name);
      }
    }

    return symbolNames;
  }

  async compareObjectFiles(
    currentObjectPath: string,
    targetObjectPath: string,
    currentObject: ParsedObject,
    targetObject: ParsedObject,
    functionName: string,
  ): Promise<string> {
    const objdiff = await this.#objdiff;
    const diffConfig = await this.#getDiffConfig();

    // Create mapping configuration
    const mappingConfig = {
      mappings: [],
      selectingLeft: undefined,
      selectingRight: undefined,
    };

    // Run the diff
    const diffResult = objdiff.diff.runDiff(currentObject, targetObject, diffConfig, mappingConfig);

    if (!diffResult.left) {
      return 'Failed to compare object files. No data for the current object file.';
    }

    if (!diffResult.right) {
      return 'Failed to compare object files. No data for the target object file.';
    }

    // Format the diff result for display
    let content = '# Diff Results\n\n';

    content += `**Current Object (Object file with the current assembly from your C source):** \`${currentObjectPath}\`\n`;
    content += `**Target Object (Object file with the target assembly that you want to match):** \`${targetObjectPath}\`\n`;
    content += `**Function Name:** \`${functionName}\`\n\n`;

    // Try to find and display some symbols for comparison
    const leftSymbol = diffResult.left.findSymbol(functionName, undefined);
    const rightSymbol = diffResult.right.findSymbol(functionName, undefined);

    if (!leftSymbol || !rightSymbol) {
      const [currentSymbols, targetSymbols] = await Promise.all([
        this.getSymbolsName(currentObject),
        this.getSymbolsName(targetObject),
      ]);

      content += `## Error: Symbol Not Found\n\n`;
      content += `Could not find symbol "${functionName}" in one or both object files.\n\n`;
      content += `Valid symbols in the current object file:\n`;
      for (const s of currentSymbols) {
        content += `- ${s}\n`;
      }
      content += `\nValid symbols in the target object file:\n`;
      for (const s of targetSymbols) {
        content += `- ${s}\n`;
      }

      return content;
    }

    const [leftAssembly, rightAssembly] = await Promise.all([
      this.#getAssemblyFromSymbol(diffResult.left, functionName, diffConfig),
      this.#getAssemblyFromSymbol(diffResult.right, functionName, diffConfig),
    ]);

    content += `## Current Object Assembly\n\n`;
    content += `\`\`\`asm\n`;
    content += leftAssembly;
    content += `\n\`\`\`\n\n`;

    content += `## Target Object Assembly\n\n`;
    content += `\`\`\`asm\n`;
    content += rightAssembly;
    content += `\n\`\`\`\n\n`;

    // Show detailed differences
    content += `## Detailed Differences\n\n`;

    let differenceCount = 0;
    let matchingCount = 0;
    const differences: string[] = [];
    for await (const [leftInstructionRow, rightInstructionRow] of this.#iterateSymbolRows(
      [diffResult.left, diffResult.right],
      functionName,
      diffConfig,
    )) {
      let leftInstruction = '';
      let rightInstruction = '';
      let leftDiffKind = 'none';
      let rightDiffKind = 'none';

      // Get left instruction
      if (leftInstructionRow) {
        leftDiffKind = leftInstructionRow.diffKind;
        leftInstruction = this.#intructionDiffRowToString(leftInstructionRow);
      }

      // Get right instruction
      if (rightInstructionRow) {
        rightDiffKind = rightInstructionRow.diffKind;
        rightInstruction = this.#intructionDiffRowToString(rightInstructionRow);
      }

      // Determine if this row has differences
      // Only consider it a real difference if:
      // 1. The diffKind indicates a mismatch (not 'none')
      // 2. AND the instructions are actually different (not just display formatting)
      const hasRealDifference = (leftDiffKind !== 'none' || rightDiffKind !== 'none') && leftDiffKind !== rightDiffKind;

      // For content comparison, ignore minor formatting differences and empty lines
      const leftClean = leftInstruction.replace(/\s+/g, ' ').trim();
      const rightClean = rightInstruction.replace(/\s+/g, ' ').trim();
      const contentDiffers = leftClean !== rightClean && leftClean !== '' && rightClean !== '';

      if (hasRealDifference || (contentDiffers && (leftDiffKind !== 'none' || rightDiffKind !== 'none'))) {
        differenceCount++;

        let diffType = '';
        // Use the actual diffKind from objdiff for more accurate categorization
        if (leftDiffKind === 'insert' || rightDiffKind === 'insert') {
          diffType = 'INSERTION';
        } else if (leftDiffKind === 'delete' || rightDiffKind === 'delete') {
          diffType = 'DELETION';
        } else if (leftDiffKind === 'replace' || rightDiffKind === 'replace') {
          diffType = 'REPLACEMENT';
        } else if (leftDiffKind === 'op-mismatch' || rightDiffKind === 'op-mismatch') {
          diffType = 'OPCODE_MISMATCH';
        } else if (leftDiffKind === 'arg-mismatch' || rightDiffKind === 'arg-mismatch') {
          diffType = 'ARGUMENT_MISMATCH';
        } else {
          diffType = 'INSTRUCTION_DIFFERENCE';
        }

        differences.push(`Difference ${differenceCount} (${diffType}):`);
        differences.push(`- Current: \`${leftInstruction.trim() || '(empty)'}\` [${leftDiffKind}]`);
        differences.push(`- Target:  \`${rightInstruction.trim() || '(empty)'}\` [${rightDiffKind}]`);
        differences.push('');
      } else if (leftInstruction.trim() !== '' || rightInstruction.trim() !== '') {
        matchingCount++;
      }
    }

    // Add summary
    content += `### Comparison Summary:\n\n`;
    content += `- Matching instructions: ${matchingCount}\n`;
    content += `- Different instructions: ${differenceCount}\n\n`;

    content += `### Instruction Differences:\n\n`;
    if (differences.length > 0) {
      content += differences.join('\n');
    } else {
      content += `No differences found! The assembly code for this function is identical.\n\n`;

      // If there are no differences, we should check for mismatched functions on this module.
      // This is useful to guide AI on follow up actions.
      const [symbolsCurrentFile, symbolsTargetFile] = await Promise.all([
        this.getSymbolsName(currentObject),
        this.getSymbolsName(targetObject),
      ]);

      const mismatchedFunctionsOnThisModule = [];
      for (const symbol of symbolsCurrentFile) {
        if (!symbolsTargetFile.includes(symbol) && symbol !== functionName) {
          continue;
        }

        const [leftAssembly, rightAssembly] = await Promise.all([
          this.#getAssemblyFromSymbol(diffResult.left, symbol, diffConfig),
          this.#getAssemblyFromSymbol(diffResult.right, symbol, diffConfig),
        ]);

        if (leftAssembly !== rightAssembly) {
          mismatchedFunctionsOnThisModule.push(symbol);
        }
      }

      if (mismatchedFunctionsOnThisModule.length > 0) {
        content += `#### Mismatched Functions on this Module:\n\n`;
        content += `The following functions from this module have mismatched assembly code:\n\n`;
        for (const func of mismatchedFunctionsOnThisModule) {
          content += `- \`${func}\`\n`;
        }
        content += `\nYou can compare them individually using the same command.\n`;
      }
    }

    // Return
    return content;
  }

  async *#iterateSymbolRows(objDiffs: ObjectDiff[], symbolName: string, diffConfig: DiffConfig) {
    const objdiff = await this.#objdiff;

    const symbols = objDiffs.map((objDiff) => objDiff.findSymbol(symbolName, undefined)!);
    const displaySymbols = objDiffs.map((objDiff, index) => objdiff.display.displaySymbol(objDiff, symbols[index].id));
    const instructionsCount = Math.max(...displaySymbols.map((displaySymbol) => displaySymbol.rowCount));

    for (let row = 0; row < instructionsCount; row++) {
      try {
        const instructionsRow = objDiffs.map((objDiff, index) =>
          objdiff.display.displayInstructionRow(objDiff, symbols[index].id, row, diffConfig),
        );
        yield instructionsRow;
      } catch (error) {
        console.warn(`Error processing row ${row} for symbol name "${symbolName}":`, error);
      }
    }
  }

  /**
   * Get assembly instructions for a given symbol from an object diff
   */
  async #getAssemblyFromSymbol(objDiff: ObjectDiff, symbolName: string, diffConfig: DiffConfig): Promise<string> {
    const instructions: string[] = [];
    for await (const [instructionRow] of this.#iterateSymbolRows([objDiff], symbolName, diffConfig)) {
      const lineText = this.#intructionDiffRowToString(instructionRow);
      if (lineText.trim()) {
        instructions.push(lineText);
      }
    }

    return instructions.join('\n');
  }

  #intructionDiffRowToString(instructionRow: ObjdiffWasm.display.InstructionDiffRow): string {
    let lineText = '';

    for (const segment of instructionRow.segments) {
      const text = segment.text;

      switch (text.tag) {
        case 'basic':
          lineText += text.val;
          break;

        case 'line':
          lineText += text.val.toString(10);
          break;

        case 'address':
          lineText += text.val.toString(16) + ':';
          break;

        case 'opcode':
          lineText += text.val.mnemonic;
          break;

        case 'signed':
          if (text.val < 0) {
            lineText += `-0x${(-text.val).toString(16)}`;
          } else {
            lineText += `0x${text.val.toString(16)}`;
          }
          break;

        case 'unsigned':
          lineText += `0x${text.val.toString(16)}`;
          break;

        case 'opaque':
          lineText += text.val;
          break;

        case 'branch-dest':
          lineText += text.val.toString(16);
          break;

        case 'symbol':
          lineText += text.val.demangledName || text.val.name;
          break;

        case 'addend':
          if (text.val < 0) {
            lineText += `-0x${(-text.val).toString(16)}`;
          } else {
            lineText += `+0x${text.val.toString(16)}`;
          }
          break;

        case 'spacing':
          lineText += ' '.repeat(text.val);
          break;

        case 'eol':
          // End of line, skip
          break;

        default:
          // Unknown text type, include as-is
          lineText += (text as any)?.val || '';
          break;
      }

      // Add padding if specified
      if (segment.padTo > lineText.length) {
        const segmentText = lineText.slice(lineText.lastIndexOf('\n') + 1);
        if (segment.padTo > segmentText.length) {
          lineText += ' '.repeat(segment.padTo - segmentText.length);
        }
      }
    }

    return lineText;
  }
}

export const objdiff = new Objdiff();
