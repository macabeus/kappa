import * as path from 'path';
import * as vscode from 'vscode';

import { DecompYamlPlatforms } from '@configurations/decomp-yaml';
import type { CtxDecompYaml } from '~/context';

import { getWorkspaceUri } from './vscode-utils';

/**
 * Extract function name from assembly code.
 * @param asmCode Assembly function to extract its name
 * @returns The function name, or null if not found
 */
export function extractFunctionName(asmCode: string): string | null {
  const lines = asmCode.trim().split('\n');

  for (const line of lines) {
    const functionName = extractFunctionNameFromLine(line);
    if (functionName) {
      return functionName;
    }
  }

  return null;
}

export function extractFunctionNameFromLine(line: string): string | null {
  const trimmed = line.trim();

  // Look for thumb_func_start
  const thumbMatch = trimmed.match(/thumb_func_start\s+(\w+)/);
  if (thumbMatch) {
    return thumbMatch[1];
  }

  // Look for arm_func_start
  const armMatch = trimmed.match(/arm_func_start\s+(\w+)/);
  if (armMatch) {
    return armMatch[1];
  }

  // Look for function labels (more specific pattern to avoid false positives)
  const labelMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*):(\s*@.*)?$/);
  if (labelMatch) {
    const name = labelMatch[1];
    // Exclude common non-function labels
    if (
      !name.startsWith('_0') &&
      !name.startsWith('.') &&
      !name.startsWith('loc_') &&
      !name.startsWith('branch_') &&
      name !== 'main' &&
      name.length > 1
    ) {
      return name;
    }
  }

  return null;
}

/**
 * Extract function calls from assembly code
 * @param assembly Assembly function code to analyze
 * @returns Array of function names called in the assembly
 */
export function extractFunctionCallsFromAssembly(assembly: string): string[] {
  const functionCalls = new Set<string>();
  const lines = assembly.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Look for bl (branch with link) instructions
    const blMatch = trimmed.match(/bl\s+(\w+)/);
    if (blMatch) {
      functionCalls.add(blMatch[1]);
    }

    // Look for function references in comments or data
    const refMatch = trimmed.match(/@\s*=(\w+)/);
    if (refMatch) {
      functionCalls.add(refMatch[1]);
    }

    // Look for direct function calls or references
    const directMatch = trimmed.match(/(?:ldr|add|mov).*=(\w+)/);
    if (directMatch) {
      functionCalls.add(directMatch[1]);
    }
  }

  return Array.from(functionCalls);
}

/**
 * Extract a specific function from an arm assembly module source
 * @param assemblyContent The assembly file content
 * @param functionName The name of the function to extract
 * @returns The assembly function code or null if not found
 */
function armExtractAssemblyFunction(assemblyContent: string, functionName: string): string | null {
  const lines = assemblyContent.split('\n');
  let functionStart = -1;
  let functionEnd = -1;
  let inFunction = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // If we haven't found the function start yet, look for it
    if (!inFunction) {
      // Look for thumb_func_start or arm_func_start with the function name
      if (line.includes(`thumb_func_start ${functionName}`) || line.includes(`arm_func_start ${functionName}`)) {
        functionStart = i;
        inFunction = true;
        continue;
      }

      // Look for function label
      if (line.startsWith(`${functionName}:`) && functionStart === -1) {
        functionStart = i;
        inFunction = true;
      }
    } else {
      // If we're in a function, look for the end

      // Look for thumb_func_end or arm_func_end
      if (line.includes(`thumb_func_end ${functionName}`) || line.includes(`arm_func_end ${functionName}`)) {
        functionEnd = i;
        break;
      }

      // Look for the next function start (indicating this function has ended)
      if (line.includes('thumb_func_start') || line.includes('arm_func_start')) {
        // Find the actual end of the current function by looking backwards for function data
        for (let j = i - 1; j >= functionStart; j--) {
          const prevLine = lines[j].trim();
          // Look for the last piece of function data (constants, labels)
          if (
            prevLine.startsWith('.4byte') ||
            prevLine.startsWith('.2byte') ||
            prevLine.startsWith('.byte') ||
            prevLine.startsWith('_') ||
            prevLine === '.align 2, 0'
          ) {
            functionEnd = j;
            break;
          }
          // If we find a return instruction, include everything after it until we hit function data
          if (prevLine.startsWith('bx ') || (prevLine.startsWith('pop {') && prevLine.includes('pc'))) {
            // Continue scanning for function data after the return
            for (let k = j + 1; k < i; k++) {
              const nextLine = lines[k].trim();
              if (
                nextLine.startsWith('.4byte') ||
                nextLine.startsWith('.2byte') ||
                nextLine.startsWith('.byte') ||
                nextLine.startsWith('_') ||
                nextLine === '.align 2, 0'
              ) {
                functionEnd = k;
              } else if (nextLine !== '' && !nextLine.startsWith('.align')) {
                break;
              }
            }
            if (functionEnd === -1) {
              functionEnd = j;
            }
            break;
          }
        }
        if (functionEnd === -1) {
          functionEnd = i - 1;
        }
        break;
      }

      // Look for another function label (indicating this function has ended)
      if (line.endsWith(':') && !line.startsWith('.') && !line.startsWith('_0') && line !== `${functionName}:`) {
        // Make sure it's not a local label (starts with _ and hex) or directive
        const labelName = line.substring(0, line.length - 1);
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(labelName) && !labelName.startsWith('_08')) {
          // Find the actual end of the current function by looking backwards for function data
          for (let j = i - 1; j >= functionStart; j--) {
            const prevLine = lines[j].trim();
            // Look for the last piece of function data (constants, labels)
            if (
              prevLine.startsWith('.4byte') ||
              prevLine.startsWith('.2byte') ||
              prevLine.startsWith('.byte') ||
              prevLine.startsWith('_') ||
              prevLine === '.align 2, 0'
            ) {
              functionEnd = j;
              break;
            }
            // If we find a return instruction, include everything after it until we hit function data
            if (prevLine.startsWith('bx ') || (prevLine.startsWith('pop {') && prevLine.includes('pc'))) {
              // Continue scanning for function data after the return
              for (let k = j + 1; k < i; k++) {
                const nextLine = lines[k].trim();
                if (
                  nextLine.startsWith('.4byte') ||
                  nextLine.startsWith('.2byte') ||
                  nextLine.startsWith('.byte') ||
                  nextLine.startsWith('_') ||
                  nextLine === '.align 2, 0'
                ) {
                  functionEnd = k;
                } else if (nextLine !== '' && !nextLine.startsWith('.align')) {
                  break;
                }
              }
              if (functionEnd === -1) {
                functionEnd = j;
              }
              break;
            }
          }
          if (functionEnd === -1) {
            functionEnd = i - 1;
          }
          break;
        }
      }
    }
  }

  // If we found a function start but no explicit end, find the logical end
  if (functionStart !== -1 && functionEnd === -1) {
    // Look for the last instruction and any function data that follows
    let lastInstruction = -1;
    for (let i = functionStart; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('bx ') || (line.startsWith('pop {') && line.includes('pc'))) {
        lastInstruction = i;
        break;
      }
    }

    if (lastInstruction !== -1) {
      // Look for function data after the return instruction
      for (let i = lastInstruction + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (
          line.startsWith('.4byte') ||
          line.startsWith('.2byte') ||
          line.startsWith('.byte') ||
          line.startsWith('_') ||
          line === '.align 2, 0'
        ) {
          functionEnd = i;
        } else if (line !== '' && !line.startsWith('.align')) {
          break;
        }
      }

      if (functionEnd === -1) {
        functionEnd = lastInstruction;
      }
    } else {
      functionEnd = lines.length - 1;
    }
  }

  // Extract the function
  if (functionStart !== -1 && functionEnd !== -1 && functionEnd >= functionStart) {
    return lines.slice(functionStart, functionEnd + 1).join('\n');
  }

  return null;
}

/**
 * Extract a specific function from a mips assembly module source
 * @param assemblyContent The assembly file content
 * @param functionName The name of the function to extract
 * @returns The assembly function code or null if not found
 */
function mipsExtractAssemblyFunction(assemblyContent: string, functionName: string): string | null {
  const lines = assemblyContent.split('\n');
  let functionStart = -1;
  let functionEnd = -1;
  let inFunction = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // If we haven't found the function start yet, look for it
    if (!inFunction) {
      // Look for thumb_func_start or arm_func_start with the function name
      if (line.includes(`glabel ${functionName}`)) {
        functionStart = i;
        inFunction = true;
        continue;
      }

      // Look for function label
      if (line.startsWith(`${functionName}:`) && functionStart === -1) {
        functionStart = i;
        inFunction = true;
      }
    } else {
      // If we're in a function, look for the end

      // Look for thumb_func_end or arm_func_end
      if (line.includes(`.size ${functionName}`)) {
        functionEnd = i;
        break;
      }

      // Look for the next function start (indicating this function has ended)
      if (line.includes('glabel')) {
        // Find the actual end of the current function by looking backwards for function data
        for (let j = i - 1; j >= functionStart; j--) {
          const prevLine = lines[j].trim();
          // Look for the last piece of function data (constants, labels)
          if (prevLine.startsWith('.size') || prevLine === '.align 3') {
            functionEnd = j;
            break;
          }
          // If we find a return instruction, include everything after it until we hit function data
          if (prevLine.startsWith('jr ')) {
            // Continue scanning for function data after the return
            for (let k = j + 1; k < i; k++) {
              const nextLine = lines[k].trim();
              if (prevLine.startsWith('.size') || prevLine === '.align 3') {
                functionEnd = k;
              } else if (nextLine !== '' && !nextLine.startsWith('.align')) {
                break;
              }
            }
            if (functionEnd === -1) {
              functionEnd = j;
            }
            break;
          }
        }
        if (functionEnd === -1) {
          functionEnd = i - 1;
        }
        break;
      }
    }
  }

  // Extract the function
  if (functionStart !== -1 && functionEnd !== -1 && functionEnd >= functionStart) {
    return lines.slice(functionStart, functionEnd + 1).join('\n');
  }

  return null;
}

export function extractAssemblyFunction(
  platform: DecompYamlPlatforms,
  assemblyContent: string,
  functionName: string,
): string | null {
  switch (platform) {
    case 'gba':
    case 'nds':
    case 'n3ds': {
      return armExtractAssemblyFunction(assemblyContent, functionName);
    }

    case 'n64':
    case 'ps1':
    case 'ps2':
    case 'psp': {
      return mipsExtractAssemblyFunction(assemblyContent, functionName);
    }

    default: {
      vscode.window
        .showErrorMessage(
          `Unsupported platform: ${platform}. Please, send a message on our discord requesting support for this platform.`,
          'Open discord',
          'Ignore',
        )
        .then(async (answer) => {
          if (answer === 'Open discord') {
            await vscode.env.openExternal(vscode.Uri.parse('https://discord.gg/sutqNShRRs'));
          }
        });

      throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}

/**
 * List all functions from a assembly module source
 * @param assemblyContent The assembly module souce
 * @returns Array of objects containing function name and code
 */
export function listAssemblyFunctions(assemblyContent: string): Array<{ name: string; code: string }> {
  const functions: Array<{ name: string; code: string }> = [];
  const lines = assemblyContent.split('\n');

  let currentFunction: { name: string; startIndex: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for function start markers
    const thumbStartMatch = line.match(/thumb_func_start\s+(\w+)/);
    const armStartMatch = line.match(/arm_func_start\s+(\w+)/);

    if (thumbStartMatch || armStartMatch) {
      // If we were tracking a previous function, close it
      if (currentFunction) {
        const functionCode = lines.slice(currentFunction.startIndex, i).join('\n');
        functions.push({
          name: currentFunction.name,
          code: functionCode,
        });
      }

      // Start tracking new function
      const functionName = thumbStartMatch ? thumbStartMatch[1] : armStartMatch![1];
      currentFunction = {
        name: functionName,
        startIndex: i,
      };
    }
    // Check for function labels as alternative function markers
    else if (!currentFunction) {
      const labelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):(\s*@.*)?$/);
      if (labelMatch) {
        const functionName = labelMatch[1];
        // Skip some common non-function labels
        if (
          !functionName.startsWith('_08') &&
          !functionName.startsWith('.') &&
          functionName !== 'gUnknown' &&
          !functionName.includes('Unknown')
        ) {
          currentFunction = {
            name: functionName,
            startIndex: i,
          };
        }
      }
    }
    // Check for function end markers
    else if (currentFunction) {
      const thumbEndMatch = line.match(/thumb_func_end\s+(\w+)/);
      const armEndMatch = line.match(/arm_func_end\s+(\w+)/);

      if (
        (thumbEndMatch && thumbEndMatch[1] === currentFunction.name) ||
        (armEndMatch && armEndMatch[1] === currentFunction.name)
      ) {
        // Include the end marker in the function code
        const functionCode = lines.slice(currentFunction.startIndex, i + 1).join('\n');
        functions.push({
          name: currentFunction.name,
          code: functionCode,
        });
        currentFunction = null;
      }
      // Check for start of next function (indicating current function ended)
      else if (line.includes('thumb_func_start') || line.includes('arm_func_start')) {
        // End current function before the new function starts
        const functionCode = lines.slice(currentFunction.startIndex, i).join('\n');
        functions.push({
          name: currentFunction.name,
          code: functionCode,
        });

        // Start new function
        const newThumbMatch = line.match(/thumb_func_start\s+(\w+)/);
        const newArmMatch = line.match(/arm_func_start\s+(\w+)/);
        const functionName = newThumbMatch ? newThumbMatch[1] : newArmMatch![1];
        currentFunction = {
          name: functionName,
          startIndex: i,
        };
      }
      // Check for another function label (indicating current function ended)
      else if (line.endsWith(':') && !line.startsWith('.') && !line.startsWith('_08')) {
        const labelName = line.substring(0, line.length - 1);
        if (
          /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(labelName) &&
          labelName !== currentFunction.name &&
          !labelName.includes('Unknown')
        ) {
          // End current function
          const functionCode = lines.slice(currentFunction.startIndex, i).join('\n');
          functions.push({
            name: currentFunction.name,
            code: functionCode,
          });

          // Start new function
          currentFunction = {
            name: labelName,
            startIndex: i,
          };
        }
      }
    }
  }

  // Handle last function if we reached end of file
  if (currentFunction) {
    const functionCode = lines.slice(currentFunction.startIndex).join('\n');
    functions.push({
      name: currentFunction.name,
      code: functionCode,
    });
  }

  return functions;
}

/**
 * Remove a specific assembly function from a module file
 * @param modulePath The relative path from workspace root to the assembly module file
 * @param functionName The name of the function to remove
 */
export async function removeAssemblyFunction(
  ctx: CtxDecompYaml,
  modulePath: string,
  functionName: string,
): Promise<void> {
  // Get workspace root
  const workspaceUri = getWorkspaceUri();

  // Convert relative path to absolute path
  const absolutePath = path.join(workspaceUri.fsPath, modulePath);

  // Read the assembly file
  const fileUri = vscode.Uri.file(absolutePath);
  const assemblyFileBuffer = await vscode.workspace.fs.readFile(fileUri);
  const assemblyFileContent = new TextDecoder().decode(assemblyFileBuffer);

  // Find the function to remove
  const functionCode = extractAssemblyFunction(ctx.decompYaml.platform, assemblyFileContent, functionName);
  if (!functionCode) {
    throw new Error(`Function "${functionName}" not found in assembly file "${modulePath}"`);
  }

  // Remove the function from the content
  const updatedContent = assemblyFileContent.replace(functionCode, '');

  // Clean up any extra blank lines that might have been left behind
  const cleanedContent = updatedContent.replace(/\n{3,}/g, '\n\n');

  // Write the modified content back to the file
  const updatedBuffer = new TextEncoder().encode(cleanedContent);
  await vscode.workspace.fs.writeFile(fileUri, updatedBuffer);

  // Save the file in VS Code editor if it's open
  const openDocument = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === absolutePath);
  if (openDocument && openDocument.isDirty) {
    await openDocument.save();
  }
}
