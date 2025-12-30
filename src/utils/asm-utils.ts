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

  // ARM: Look for thumb_func_start
  const thumbMatch = trimmed.match(/thumb_func_start\s+(\w+)/);
  if (thumbMatch) {
    return thumbMatch[1];
  }

  // ARM: Look for arm_func_start
  const armMatch = trimmed.match(/arm_func_start\s+(\w+)/);
  if (armMatch) {
    return armMatch[1];
  }

  // MIPS: Look for glabel
  const glabelMatch = trimmed.match(/glabel\s+(\w+)/);
  if (glabelMatch) {
    return glabelMatch[1];
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
 * @param platform The target platform for the assembly code
 * @param assembly Assembly function code to analyze
 * @returns Array of function names called in the assembly
 */
export function extractFunctionCallsFromAssembly(platform: DecompYamlPlatforms, assembly: string): string[] {
  switch (platform) {
    case 'gba':
    case 'nds':
    case 'n3ds': {
      return armExtractFunctionCalls(assembly);
    }

    case 'n64':
    case 'ps1':
    case 'ps2':
    case 'psp': {
      return mipsExtractFunctionCalls(assembly);
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
 * Extract function calls from ARM assembly code
 * @param assembly ARM assembly function code to analyze
 * @returns Array of function names called in the assembly
 */
function armExtractFunctionCalls(assembly: string): string[] {
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
 * Extract function calls from MIPS assembly code
 * @param assembly MIPS assembly function code to analyze
 * @returns Array of function names called in the assembly
 */
function mipsExtractFunctionCalls(assembly: string): string[] {
  const functionCalls = new Set<string>();
  const lines = assembly.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (line.startsWith('glabel') || line.startsWith('endlabel')) {
      continue;
    }

    // Look for jal (jump and link) instructions
    const jalMatch = trimmed.match(/jal\s+(\w+)/);
    if (jalMatch) {
      functionCalls.add(jalMatch[1]);
    }

    // Look for function references in comments or data
    const refMatch = trimmed.match(/;\s*=(\w+)/);
    if (refMatch) {
      functionCalls.add(refMatch[1]);
    }

    // Look for direct function calls or references in load instructions
    const directMatch = trimmed.match(/(?:la|lw|lui).*\b(\w+)(?:\s*\+|$)/);
    if (directMatch) {
      const functionName = directMatch[1];
      // Filter out register names and obvious non-function references
      if (!functionName.match(/^\$\w+$/) && !functionName.match(/^0x[0-9a-fA-F]+$/)) {
        functionCalls.add(functionName);
      }
    }
  }

  return Array.from(functionCalls);
}

export function extractAsmFunction(
  platform: DecompYamlPlatforms,
  assemblyContent: string,
  functionName: string,
): string | null {
  switch (platform) {
    case 'gba':
    case 'nds':
    case 'n3ds': {
      return armExtractAsmFunction(assemblyContent, functionName);
    }

    case 'n64':
    case 'ps1':
    case 'ps2':
    case 'psp': {
      return mipsExtractAsmFunction(assemblyContent, functionName);
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
 * Extract a specific function from an arm assembly module source
 * @param assemblyContent The assembly file content
 * @param functionName The name of the function to extract
 * @returns The assembly function code or null if not found
 */
function armExtractAsmFunction(assemblyContent: string, functionName: string): string | null {
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
function mipsExtractAsmFunction(assemblyContent: string, functionName: string): string | null {
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

/**
 * List all functions from an assembly module source
 * @param assemblyContent The assembly module souce
 * @returns Array of objects containing function name and code
 */
export function listFunctionsFromAsmModule(
  platform: DecompYamlPlatforms,
  assemblyContent: string,
): Array<{ name: string; code: string }> {
  switch (platform) {
    case 'gba':
    case 'nds':
    case 'n3ds': {
      return armListFunctionsFromAsmModule(assemblyContent);
    }

    case 'n64':
    case 'ps1':
    case 'ps2':
    case 'psp': {
      return mipsListFunctionsFromAsmModule(assemblyContent);
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

export function armListFunctionsFromAsmModule(assemblyContent: string): Array<{ name: string; code: string }> {
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

export function mipsListFunctionsFromAsmModule(assemblyContent: string): Array<{ name: string; code: string }> {
  const functions: Array<{ name: string; code: string }> = [];
  const lines = assemblyContent.split('\n');

  let currentFunction: { name: string; startIndex: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for function start markers
    const glabelMatch = line.match(/glabel\s+(\w+)/);

    if (glabelMatch) {
      // If we were tracking a previous function, close it
      if (currentFunction) {
        const functionCode = lines.slice(currentFunction.startIndex, i).join('\n');
        functions.push({
          name: currentFunction.name,
          code: functionCode,
        });
      }

      // Start tracking new function
      const functionName = glabelMatch[1];
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
          !functionName.startsWith('_') &&
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
      const sizeMatch = line.match(/\.size\s+(\w+)/);

      if (sizeMatch && sizeMatch[1] === currentFunction.name) {
        // Include the size marker in the function code
        const functionCode = lines.slice(currentFunction.startIndex, i + 1).join('\n');
        functions.push({
          name: currentFunction.name,
          code: functionCode,
        });
        currentFunction = null;
      }
      // Check for start of next function (indicating current function ended)
      else if (line.includes('glabel')) {
        // End current function before the new function starts
        const functionCode = lines.slice(currentFunction.startIndex, i).join('\n');
        functions.push({
          name: currentFunction.name,
          code: functionCode,
        });

        // Start new function
        const newGlabelMatch = line.match(/glabel\s+(\w+)/);
        const functionName = newGlabelMatch![1];
        currentFunction = {
          name: functionName,
          startIndex: i,
        };
      }
      // Check for another function label (indicating current function ended)
      else if (line.endsWith(':') && !line.startsWith('.')) {
        const labelName = line.substring(0, line.length - 1);
        if (
          /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(labelName) &&
          labelName !== currentFunction.name &&
          !labelName.includes('Unknown') &&
          !labelName.startsWith('_')
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
  const functionCode = extractAsmFunction(ctx.decompYaml.platform, assemblyFileContent, functionName);
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

/**
 * Extract only the body instructions from assembly function code
 * @param platform The target platform for the assembly code
 * @param asmCode Assembly function code to extract body from
 * @returns Assembly function body without headers, footers, and metadata
 */
export function extractAsmFunctionBody(platform: DecompYamlPlatforms, asmCode: string): string {
  switch (platform) {
    case 'gba':
    case 'nds':
    case 'n3ds': {
      return armExtractFunctionBody(asmCode);
    }

    case 'n64':
    case 'ps1':
    case 'ps2':
    case 'psp': {
      return mipsExtractFunctionBody(asmCode);
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
 * Extract function body from ARM assembly code
 * @param asmCode ARM assembly function code
 * @returns Function body without headers and metadata
 */
function armExtractFunctionBody(asmCode: string): string {
  const lines = asmCode.split('\n');
  const bodyLines: string[] = [];
  let sawFunctionStart = false;
  let skippedFunctionLabel = false;
  let hasInstructions = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === '') {
      continue;
    }

    // Skip function start/end markers
    if (trimmed.includes('thumb_func_start') || trimmed.includes('arm_func_start')) {
      sawFunctionStart = true;
      continue;
    }
    if (trimmed.includes('thumb_func_end') || trimmed.includes('arm_func_end')) {
      break;
    }

    // Skip the main function name label that appears right after thumb_func_start
    // This label may have a comment after it (e.g., "sub_806098C: @ 0x0806098C")
    if (sawFunctionStart && !skippedFunctionLabel) {
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex !== -1) {
        const labelName = trimmed.substring(0, colonIndex);
        // Skip if it's not a local label (local labels start with _ or .)
        if (!labelName.startsWith('_') && !labelName.startsWith('.')) {
          skippedFunctionLabel = true;
          continue;
        }
      }
    }

    // Skip assembly directives like .align
    if (trimmed.startsWith('.align')) {
      continue;
    }

    // Check if this is an actual instruction (not a label or constant definition)
    const isLabel = trimmed.includes(':');
    const isConstantDef = isLabel && trimmed.includes('.4byte');
    if (!isLabel || isConstantDef) {
      // It's either an instruction or a constant definition
      // If it's not a constant definition, it's an instruction
      if (!isConstantDef) {
        hasInstructions = true;
      }
    } else if (isLabel && !isConstantDef) {
      // It's a local label (like _080609F6:), which indicates instructions nearby
      hasInstructions = true;
    }

    // Add all other lines including local labels, instructions, and constant definitions
    bodyLines.push(trimmed);
  }

  // Only return content if we found actual instructions
  return hasInstructions ? bodyLines.join('\n') : '';
}

/**
 * Extract function body from MIPS assembly code
 * @param asmCode MIPS assembly function code
 * @returns Function body without headers and metadata
 */
function mipsExtractFunctionBody(asmCode: string): string {
  const lines = asmCode.split('\n');
  const bodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === '') {
      continue;
    }

    // Skip glabel and endlabel
    if (trimmed.startsWith('glabel') || trimmed.startsWith('endlabel')) {
      continue;
    }

    // Skip .size directives
    if (trimmed.startsWith('.size')) {
      continue;
    }

    // Process instruction lines and local labels
    let processedLine = trimmed;

    // Remove comments from instruction lines
    const mipsCommentIndex = processedLine.indexOf(';');
    if (mipsCommentIndex !== -1) {
      processedLine = processedLine.substring(0, mipsCommentIndex).trim();
    }

    // Normalize spacing - remove extra whitespace but preserve structure for branch delay slots
    processedLine = processedLine.replace(/\s+/g, ' ').trim();

    // Add the processed line if it's not empty
    if (processedLine) {
      bodyLines.push(processedLine);
    }
  }

  return bodyLines.join('\n');
}

/**
 * Strip commentaries from assembly code
 * @param asmCode Assembly code to strip comments from
 * @returns Assembly code without comments
 */
export function stripCommentaries(asmCode: string): string {
  const lines = asmCode.split('\n');
  const strippedLines: string[] = [];

  for (const line of lines) {
    let strippedLine = line;

    // C-style block comments (/* ... */) - handle first as they can contain other comment characters
    let blockCommentStart = strippedLine.indexOf('/*');
    while (blockCommentStart !== -1) {
      const blockCommentEnd = strippedLine.indexOf('*/', blockCommentStart + 2);
      if (blockCommentEnd !== -1) {
        // Remove the block comment including the /* and */ markers
        strippedLine = strippedLine.substring(0, blockCommentStart) + strippedLine.substring(blockCommentEnd + 2);
        // Look for more block comments on the same line
        blockCommentStart = strippedLine.indexOf('/*');
      } else {
        // If no closing */, remove everything from /* onwards
        strippedLine = strippedLine.substring(0, blockCommentStart);
        break;
      }
    }

    // ARM-style comments (start with @)
    const armCommentIndex = strippedLine.indexOf('@');
    if (armCommentIndex !== -1) {
      strippedLine = strippedLine.substring(0, armCommentIndex);
    }

    // MIPS-style comments (start with ;) - only if no ARM comment was found
    if (armCommentIndex === -1) {
      const mipsCommentIndex = strippedLine.indexOf(';');
      if (mipsCommentIndex !== -1) {
        strippedLine = strippedLine.substring(0, mipsCommentIndex);
      }
    }

    // C-style line comments (start with //) - only if no ARM comment was found
    if (armCommentIndex === -1) {
      const cStyleCommentIndex = strippedLine.indexOf('//');
      if (cStyleCommentIndex !== -1) {
        strippedLine = strippedLine.substring(0, cStyleCommentIndex);
      }
    }

    // Remove trailing whitespace but preserve the original line structure
    strippedLine = strippedLine.trimEnd();
    strippedLines.push(strippedLine);
  }

  return strippedLines.join('\n');
}

export function countBodyLinesFromAsmFunction(platform: DecompYamlPlatforms, asmCode: string): number {
  const bodyCode = extractAsmFunctionBody(platform, asmCode);
  const bodyLines = bodyCode.split('\n').filter((line) => line.trim() !== '');
  return bodyLines.length;
}

export function getInlineCommentPrefix(platform: DecompYamlPlatforms): string {
  switch (platform) {
    case 'gba':
    case 'nds':
    case 'n3ds': {
      return '@';
    }

    case 'n64':
    case 'ps1':
    case 'ps2':
    case 'psp': {
      return ';';
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
