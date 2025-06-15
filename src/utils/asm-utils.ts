/**
 * Extract function name from assembly code
 * @param assembly Assembly function to extract its name
 * @returns The function name or null if not found
 */
export function extractFunctionName(assembly: string): string | null {
  const lines = assembly.trim().split('\n');

  // Look for thumb_func_start or arm_func_start
  for (const line of lines) {
    const trimmed = line.trim();
    const thumbMatch = trimmed.match(/thumb_func_start\s+(\w+)/);
    if (thumbMatch) {
      return thumbMatch[1];
    }

    const armMatch = trimmed.match(/arm_func_start\s+(\w+)/);
    if (armMatch) {
      return armMatch[1];
    }
  }

  // Look for function labels
  for (const line of lines) {
    const trimmed = line.trim();
    const labelMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*):(\s*@.*)?$/);
    if (labelMatch) {
      return labelMatch[1];
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
 * Extract a specific function from assembly code
 * @param assemblyContent The assembly file content
 * @param functionName The name of the function to extract
 * @returns The assembly function code or null if not found
 */
export function extractAssemblyFunction(assemblyContent: string, functionName: string): string | null {
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
        // Go back to find the end of current function (usually before .pool directive)
        for (let j = i - 1; j >= functionStart; j--) {
          const prevLine = lines[j].trim();
          if (prevLine === '.pool' || prevLine.startsWith('pop {')) {
            functionEnd = j;
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
          // Go back to find the end of current function
          for (let j = i - 1; j >= functionStart; j--) {
            const prevLine = lines[j].trim();
            if (prevLine === '.pool' || prevLine.startsWith('pop {')) {
              functionEnd = j;
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
    // Look for the last instruction or .pool directive
    for (let i = lines.length - 1; i > functionStart; i--) {
      const line = lines[i].trim();
      if (line === '.pool' || line.startsWith('pop {') || line.includes('pc')) {
        functionEnd = i;
        break;
      }
    }

    if (functionEnd === -1) {
      functionEnd = lines.length - 1;
    }
  }

  // Extract the function
  if (functionStart !== -1 && functionEnd !== -1 && functionEnd >= functionStart) {
    return lines.slice(functionStart, functionEnd + 1).join('\n');
  }

  return null;
}
