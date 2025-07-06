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
