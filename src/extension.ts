import * as vscode from 'vscode';
import type { BaseLanguageClient } from 'vscode-languageclient';
import type * as objdifwasm from 'objdiff-wasm';
import { activateClangd } from './clangd/activate-clangd';
import { ClangdExtension } from './clangd/vscode-clangd';
import { ASTVisitor } from './ast-visitor';
import { ASTRequestType } from './clangd/ast';
import { runTestsForCurrentKappaPlugin, loadKappaPlugins } from './kappa-plugins';
import { ClangdExtensionImpl } from './clangd/api';
import { createDecompilePromptFile } from './prompt-builder/prompt-builder';
import { registerClangLanguage } from './utils/ast-grep-utils';
import { getWorkspaceRoot } from './utils/vscode-utils';
import { indexCodebase } from './db/index-codebase';
import { showChart } from './db/show-chart';
import { AssemblyCodeLensProvider } from './providers/assembly-code-lens';

type objdifwasm = typeof objdifwasm;

// Constants for configuration
const CLANGD_CHECK_INTERVAL = 100;
const CLANGD_CHECK_TIMEOUT = 30_000;

/**
 * Extracts assembly instructions for a given symbol from an object diff
 */
function extractAssemblyForSymbol(
  objDiff: any,
  symbolName: string,
  diffConfig: any,
  objdiffModule: any,
  maxInstructions: number = 100,
): string {
  try {
    const symbol = objDiff.findSymbol(symbolName, undefined);
    if (!symbol) {
      return `Symbol '${symbolName}' not found`;
    }

    const displaySymbol = objdiffModule.display.displaySymbol(objDiff, symbol.id);
    const instructions: string[] = [];

    // Extract instructions up to the symbol's row count or maxInstructions
    const instructionCount = Math.min(displaySymbol.rowCount || 0, maxInstructions);

    for (let row = 0; row < instructionCount; row++) {
      try {
        const instructionRow = objdiffModule.display.displayInstructionRow(objDiff, symbol.id, row, diffConfig);
        let lineText = '';

        // Build the assembly line from segments
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
              lineText += text.val || '';
              break;
          }

          // Add padding if specified
          if (segment.padTo > lineText.length) {
            const currentLength = lineText.length;
            const segmentText = lineText.slice(lineText.lastIndexOf('\n') + 1);
            if (segment.padTo > segmentText.length) {
              lineText += ' '.repeat(segment.padTo - segmentText.length);
            }
          }
        }

        if (lineText.trim()) {
          instructions.push(lineText);
        }
      } catch (rowError) {
        console.warn(`Error processing row ${row} for symbol ${symbolName}:`, rowError);
        break;
      }
    }

    return instructions.join('\n');
  } catch (error) {
    console.warn(`Error extracting assembly for symbol ${symbolName}:`, error);
    return `Error extracting assembly: ${error}`;
  }
}

/**
 * Formats the diff result for display in a text document
 */
function formatDiffResult(diffResult: any, leftFilePath: string, rightFilePath: string): string {
  const lines: string[] = [];

  lines.push('='.repeat(80));
  lines.push('Object File Comparison Results');
  lines.push('='.repeat(80));
  lines.push('');
  lines.push(`Left file:  ${leftFilePath}`);
  lines.push(`Right file: ${rightFilePath}`);
  lines.push('');

  if (!diffResult.left && !diffResult.right) {
    lines.push('No objects could be parsed from the files.');
    return lines.join('\n');
  }

  if (!diffResult.left) {
    lines.push('Left object could not be parsed.');
    return lines.join('\n');
  }

  if (!diffResult.right) {
    lines.push('Right object could not be parsed.');
    return lines.join('\n');
  }

  // Display basic comparison results
  lines.push('Comparison Results:');
  lines.push('-'.repeat(40));
  lines.push('✓ Both objects parsed successfully');
  lines.push('');

  // Try to access basic information about the diff result
  try {
    lines.push('Diff Summary:');
    lines.push(`- Left object: ${typeof diffResult.left === 'object' ? 'Valid' : 'Invalid'}`);
    lines.push(`- Right object: ${typeof diffResult.right === 'object' ? 'Valid' : 'Invalid'}`);
    lines.push('');

    // If there are any obvious differences in the objects themselves
    const leftStr = JSON.stringify(diffResult.left, null, 2);
    const rightStr = JSON.stringify(diffResult.right, null, 2);

    if (leftStr === rightStr) {
      lines.push('✓ Objects appear to be identical');
    } else {
      lines.push('✗ Objects have differences');
      lines.push(`  Left object size: ${leftStr.length} characters`);
      lines.push(`  Right object size: ${rightStr.length} characters`);
    }
  } catch (error) {
    lines.push('Unable to analyze diff details.');
    lines.push(`Error: ${error}`);
  }

  lines.push('');
  lines.push('Note: This is a basic comparison result. The objdiff library');
  lines.push('provides detailed symbol-by-symbol comparison data that could');
  lines.push('be used to build a more comprehensive diff viewer.');
  lines.push('');
  lines.push('='.repeat(80));

  return lines.join('\n');
}

/**
 * Waits for the clangd client to be running with timeout
 */
async function waitForClangdClient(clangd: ClangdExtensionImpl): Promise<ClangdExtensionImpl> {
  const startTime = Date.now();

  return new Promise<ClangdExtensionImpl>((resolve, reject) => {
    const check = () => {
      if (clangd.client?.isRunning()) {
        resolve(clangd);
        return;
      }

      if (Date.now() - startTime > CLANGD_CHECK_TIMEOUT) {
        reject(new Error('Timeout waiting for clangd client to start'));
        return;
      }

      setTimeout(check, CLANGD_CHECK_INTERVAL);
    };

    check();
  });
}

/**
 * Gets the clangd client instance, throwing an error if not available
 */
async function getClangdClient(apiInstance: Promise<ClangdExtensionImpl>): Promise<BaseLanguageClient> {
  const api = await apiInstance;
  const client = api.client;

  if (!client) {
    throw new Error('Clangd client is not available');
  }

  return client;
}

export async function activate(context: vscode.ExtensionContext): Promise<ClangdExtension> {
  let apiInstance: Promise<ClangdExtensionImpl>;

  try {
    const clangd = await activateClangd(context);
    apiInstance = waitForClangdClient(clangd);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to activate clangd: ${error}`);
    throw error;
  }

  // Register providers
  const codeLensProvider = new AssemblyCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider([{ language: 'arm' }, { pattern: '**/*.{s,S,asm}' }], codeLensProvider),
  );

  // Register commands
  vscode.commands.registerCommand('kappa.indexCodebase', async () => {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('No workspace found, cannot index codebase. Please open a folder instead.');
      return;
    }

    await indexCodebase();

    // Refresh code lenses after indexing
    codeLensProvider.refresh();
  });

  vscode.commands.registerCommand('kappa.runPromptBuilder', async (functionId?: string) => {
    registerClangLanguage();

    if (!functionId) {
      vscode.window.showErrorMessage('No function id provided when calling runPromptBuilder command.');
      return;
    }

    await createDecompilePromptFile(functionId);
  });

  vscode.commands.registerCommand('kappa.showChart', async () => {
    showChart();
  });

  vscode.commands.registerCommand('kappa.changeVoyageApiKey', async () => {
    const currentApiKey = vscode.workspace.getConfiguration('kappa').get('voyageApiKey', '');

    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your Voyage AI API Key',
      value: currentApiKey,
      password: true,
      placeHolder: 'pa-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      validateInput: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'API key cannot be empty';
        }
        if (!value.startsWith('pa-')) {
          return 'Voyage AI API key should start with "pa-"';
        }
        return null;
      },
    });

    if (apiKey !== undefined) {
      await vscode.workspace
        .getConfiguration('kappa')
        .update('voyageApiKey', apiKey, vscode.ConfigurationTarget.Global);

      vscode.commands.executeCommand('setContext', 'walkthroughVoyageApiKeySet', true);
    }
  });

  vscode.commands.registerCommand('kappa.runKappaPlugins', async () => {
    const client = await getClangdClient(apiInstance);
    const converter = client.code2ProtocolConverter;
    const editor = vscode.window.activeTextEditor;

    const item = await client.sendRequest(ASTRequestType, {
      textDocument: converter.asTextDocumentIdentifier(editor!.document),
      range: converter.asRange(editor!.selection),
    });

    if (!item) {
      vscode.window.showErrorMessage('No AST found for the current selection.');
      return;
    }

    const visitor = new ASTVisitor(client);

    // Load custom plugins from kappa-plugins folder
    await loadKappaPlugins(visitor);

    await visitor.walk(item);

    await visitor.applyPendingEdits();
  });

  vscode.commands.registerCommand('kappa.runTestsForCurrentKappaPlugin', async () => {
    const client = await getClangdClient(apiInstance);
    const visitor = new ASTVisitor(client);
    await runTestsForCurrentKappaPlugin(visitor);

    vscode.window.showInformationMessage('Tests for current Kappa plugin completed.');
  });

  vscode.commands.registerCommand('kappa.compareObjectFiles', async () => {
    try {
      // Read object files from specific paths
      const fs = await import('fs');
      const path = await import('path');

      const leftFilePath = '/Users/macabeus/ApenasMeu/decompiler/sa3/build/gba/sa3/src/game/enemies/bu_bu.o';
      const rightFilePath =
        '/Users/macabeus/ApenasMeu/decompiler/sa3/expected/build/gba/sa3/src/game/enemies/enemy_bu_bu.o';

      // Check if files exist
      if (!fs.existsSync(leftFilePath)) {
        vscode.window.showErrorMessage(`Left file not found: ${leftFilePath}`);
        return;
      }
      if (!fs.existsSync(rightFilePath)) {
        vscode.window.showErrorMessage(`Right file not found: ${rightFilePath}`);
        return;
      }

      // Read the object files as buffers
      const leftBuffer = fs.readFileSync(leftFilePath);
      const rightBuffer = fs.readFileSync(rightFilePath);

      console.log('Left file size:', leftBuffer.length, 'bytes');
      console.log('Right file size:', rightBuffer.length, 'bytes');

      // Load objdiff WASM manually to avoid fetch issues
      const extensionPath = context.extensionPath;
      const wasmPath = path.join(extensionPath, 'media/objdiff-wasm/objdiff.core.wasm');
      const wasmBuffer = fs.readFileSync(wasmPath);

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
      const objdiff: objdifwasm = await import(path.join(extensionPath, 'media/objdiff-wasm/objdiff.js'));

      // Restore original fetch and WebAssembly.compileStreaming (if they existed)
      if (originalFetch) {
        (global as any).fetch = originalFetch;
      } else {
        delete (global as any).fetch;
      }

      if (originalCompileStreaming) {
        (globalThis as any).WebAssembly.compileStreaming = originalCompileStreaming;
      }

      // Initialize objdiff
      objdiff.init('debug');
      console.log('Initialized objdiff-wasm', objdiff.version());

      // Create diff configuration
      const diffConfig = new objdiff.diff.DiffConfig();

      // Create mapping configuration
      const mappingConfig = {
        mappings: [],
        selectingLeft: undefined,
        selectingRight: undefined,
      };

      // Parse the object files
      let leftObject: any;
      let rightObject: any;

      try {
        leftObject = objdiff.diff.Object.parse(new Uint8Array(leftBuffer), diffConfig);
        console.log('Left object parsed successfully');
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to parse left object file: ${e}`);
        return;
      }

      try {
        rightObject = objdiff.diff.Object.parse(new Uint8Array(rightBuffer), diffConfig);
        console.log('Right object parsed successfully');
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to parse right object file: ${e}`);
        return;
      }

      // Run the diff
      const start = performance.now();
      const diffResult = objdiff.diff.runDiff(leftObject, rightObject, diffConfig, mappingConfig);
      const end = performance.now();

      console.log('Diff completed in', end - start, 'ms');
      console.log('Diff result:', diffResult);

      // Format the diff result for display
      let content = `# Object File Comparison Results\n\n`;
      content += `**Left File:** \`${leftFilePath}\`\n`;
      content += `**Right File:** \`${rightFilePath}\`\n\n`;
      content += `**Comparison Time:** ${(end - start).toFixed(2)}ms\n\n`;

      // Display basic information about the parsed objects
      content += `## Object Information\n\n`;
      content += `- **Left Object:** ${leftObject ? 'Successfully parsed' : 'Failed to parse'}\n`;
      content += `- **Right Object:** ${rightObject ? 'Successfully parsed' : 'Failed to parse'}\n`;
      content += `- **Left Object Hash:** ${leftObject ? leftObject.hash() : 'N/A'}\n`;
      content += `- **Right Object Hash:** ${rightObject ? rightObject.hash() : 'N/A'}\n\n`;

      // Display diff result information
      content += `## Diff Result\n\n`;
      if (diffResult) {
        content += `- **Left Diff Object:** ${diffResult.left ? 'Available' : 'Not available'}\n`;
        content += `- **Right Diff Object:** ${diffResult.right ? 'Available' : 'Not available'}\n\n`;

        if (diffResult.left && diffResult.right) {
          content += `### Symbol Analysis\n\n`;
          // Try to find and display some symbols for comparison
          try {
            const targetFunctionName = 'CreateEntity_BuBu';
            const leftSymbol = diffResult.left.findSymbol(targetFunctionName, undefined);
            const rightSymbol = diffResult.right.findSymbol(targetFunctionName, undefined);

            if (leftSymbol || rightSymbol) {
              content += `**Target Function: ${targetFunctionName}**\n\n`;
              if (leftSymbol) {
                content += `- Left: ${leftSymbol.name} (${leftSymbol.kind}) at 0x${leftSymbol.address.toString(16)}\n`;
              }
              if (rightSymbol) {
                content += `- Right: ${rightSymbol.name} (${rightSymbol.kind}) at 0x${rightSymbol.address.toString(16)}\n`;
              }
              content += `\n`;

              // Extract and display assembly for both sides
              if (leftSymbol) {
                content += `#### Left Object Assembly (${targetFunctionName})\n\n`;
                content += `\`\`\`assembly\n`;
                const leftAssembly = extractAssemblyForSymbol(diffResult.left, targetFunctionName, diffConfig, objdiff);
                content += leftAssembly;
                content += `\n\`\`\`\n\n`;
              }

              if (rightSymbol) {
                content += `#### Right Object Assembly (${targetFunctionName})\n\n`;
                content += `\`\`\`assembly\n`;
                const rightAssembly = extractAssemblyForSymbol(
                  diffResult.right,
                  targetFunctionName,
                  diffConfig,
                  objdiff,
                );
                content += rightAssembly;
                content += `\n\`\`\`\n\n`;
              }
            } else {
              content += `Target function '${targetFunctionName}' not found in symbols.\n\n`;

              // Try to find any function symbols for demonstration
              try {
                const leftSections = objdiff.display.displaySections(
                  diffResult.left,
                  { mapping: undefined, regex: undefined },
                  { showHiddenSymbols: false, showMappedSymbols: false, reverseFnOrder: false },
                );
                const rightSections = objdiff.display.displaySections(
                  diffResult.right,
                  { mapping: undefined, regex: undefined },
                  { showHiddenSymbols: false, showMappedSymbols: false, reverseFnOrder: false },
                );

                content += `#### Available Symbols\n\n`;
                content += `**Left Object Sections:**\n`;
                for (const section of leftSections.slice(0, 3)) {
                  // Show first 3 sections
                  content += `- ${section.name} (${section.symbols.length} symbols)\n`;
                  for (const symbolRef of section.symbols.slice(0, 5)) {
                    // Show first 5 symbols per section
                    const symbolDisplay = objdiff.display.displaySymbol(diffResult.left, symbolRef);
                    content += `  - ${symbolDisplay.info.name}\n`;
                  }
                }

                content += `\n**Right Object Sections:**\n`;
                for (const section of rightSections.slice(0, 3)) {
                  // Show first 3 sections
                  content += `- ${section.name} (${section.symbols.length} symbols)\n`;
                  for (const symbolRef of section.symbols.slice(0, 5)) {
                    // Show first 5 symbols per section
                    const symbolDisplay = objdiff.display.displaySymbol(diffResult.right, symbolRef);
                    content += `  - ${symbolDisplay.info.name}\n`;
                  }
                }
                content += `\n`;
              } catch (sectionsError) {
                content += `Error listing symbols: ${sectionsError}\n\n`;
              }
            }
          } catch (e) {
            content += `Symbol analysis error: ${e}\n`;
          }
        }

        content += `\n### Raw Diff Data\n\n`;
        content += `\`\`\`json\n${JSON.stringify(
          diffResult,
          (key, value) => {
            // Convert BigInt values to strings for JSON serialization
            if (typeof value === 'bigint') {
              return '0x' + value.toString(16);
            }
            return value;
          },
          2,
        )}\`\`\`\n`;
      } else {
        content += `No diff result available.\n`;
      }

      // Create a new document to display the result
      const doc = await vscode.workspace.openTextDocument({
        content,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc);

      console.log('Object file comparison completed successfully');
    } catch (error) {
      vscode.window.showErrorMessage(`Error comparing object files: ${error}`);
      console.error('Object diff error:', error);
    }
  });

  return apiInstance;
}
