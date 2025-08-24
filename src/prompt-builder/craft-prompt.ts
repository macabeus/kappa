import type { DecompYamlPlatforms } from '@configurations/decomp-yaml';
import type { CtxDecompYaml } from '~/context';
import type { SamplingCFunction } from '~/get-context-from-asm-function';

export type PromptMode =
  | { type: 'ask' }
  | { type: 'agent'; sourceFilePath: string; currentObjectFilePath: string; targetObjectFilePath: string };

const templateExample = `# Examples

`;

const templateFunctionsCallingTarget = `# Functions that call the target assembly

`;

const templateTargetAssemblyDeclaration = `# Function declaration for the target assmebly

\`{targetAssemblyDeclaration}\``;

const templateDeclarationsForFunctionsCalledFromTarget = `# Declarations for the functions called from the target assembly

`;

const templateTypeDefinitions = `# Types definitions used in the declarations

`;

const getRules = (mode: PromptMode) => {
  if (mode.type === 'ask') {
    return `# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.`;
  }

  return `# Implementation Process

1. Code Analysis

- Carefully analyze the original assembly function
- Identify function parameters, return values, and local variables
- Map register usage and memory access patterns
- Understand the control flow and logic structure

2. C Code Generation

- Add your decompiled function AT THE END of \`${mode.sourceFilePath}\`

- Write clean, readable C code following these guidelines:

  - Use meaningful variable names
  - Avoid unnecessary goto statements - prefer structured control flow (if/else, loops)
  - Minimize pointer arithmetic where possible
  - Avoid unnecessary type casts
  - Use appropriate data types that match the assembly operations
  - Maintain the code styleguide
  - Before adding a new type definition, search in the codebase if this struct already exists and reuse them whenever possible

- You might need to update the structs defined from \`${mode.sourceFilePath}\` if you identify that a struct might be wrong.
- IMPORTANT: If you update a struct, check how it affects the other functions and update them according the changes, preserving the same original assembly when compiling them.

3. Compilation and Verification Loop

- Build the project always calling \`make\` with no aditional parameters
- Check if the compilation succeeds
- Verify that the checksum matches the original
- If checksum fails, examine the differences by running the tool \`objdiff\`. This tool is available only on VS Code Copilot.
  - For the parameter \`functionName\`, use \`${mode.sourceFilePath}\`
  - For the parameter \`currentObjectFilePath\`, use \`${mode.currentObjectFilePath}\`
  - For the parameter \`targetObjectFilePath\`, use \`${mode.targetObjectFilePath}\`
- Compare your generated assembly with the original assembly function
- Identify discrepancies and adjust your C code accordingly

4. Iterative Refinement

- Repeat the build-check-modify cycle until perfect match is achieved
- Make incremental changes to preserve working parts
- Document any challenging sections or assumptions made
- If your target function is fully matched and you still have checksum error when building, you should check the other functions that may have been affected by your changes. You can use the tool \`objdiff\` to compare the original assembly with the generated one and identify which functions are not matching anymore.

# Success Criteria

- CRITICAL: Your C code MUST compile to assembly that matches the original exactly
- No checksum errors when building with make
- Code is readable and maintainable
- All functionality is preserved

# Termination Condition

- STOP ONLY WHEN:

  - The decompilation is complete only when the generated assembly is byte-for-byte identical to the original.
  - AND there are no checksum errors when building. If you get a checksum error because of another function isn't matching anymore, you should fix it too.

# Additional Guidelines

- Test after each significant change
- If stuck, try different approaches (different variable types, control structures, etc.)
- Pay attention to compiler optimizations that might affect output
- Consider alignment, padding, and memory layout effects
- Ignore the file \`kappa-db.json\``;
};

const templateDecompile = `You are decompiling an assembly function called \`{assemblyFunctionName}\` in {assemblyLanguage} from a {platformName} game.

{examplePrompts}

{functionsCallingTargetPrompt}

{targetAssemblyDeclarationPrompt}

{functionDeclarationsPrompt}

{typeDefinitionsPrompt}

# Primary Objective

Decompile the following target assembly function from \`{modulePath}\` into clean, readable C code that compiles to an assembly matching EXACTLY the original one.

\`\`\`asm
{assemblyCode}
\`\`\`

{rules}
`;

const mappingPlatforms: Record<DecompYamlPlatforms, { name: string; assembly: string }> = {
  gba: { name: 'Game Boy Advance', assembly: 'ARMv4T' },
  nds: { name: 'Nintendo DS', assembly: 'ARMv5TE' },
  n3ds: { name: 'Nintendo 3DS', assembly: 'ARMv6K' },
  n64: { name: 'Nintendo 64', assembly: 'MIPS' },
  gc: { name: 'GameCube', assembly: 'PowerPC' },
  wii: { name: 'Wii', assembly: 'PowerPC' },
  ps1: { name: 'PlayStation', assembly: 'MIPS' },
  ps2: { name: 'PlayStation 2', assembly: 'MIPS' },
  psp: { name: 'PlayStation Portable', assembly: 'MIPS' },
  win32: { name: 'Windows (32-bit)', assembly: 'x86' },
};

export async function craftPrompt({
  ctx,
  modulePath,
  asmName,
  asmDeclaration,
  asmCode,
  calledFunctionsDeclarations,
  sampling,
  typeDefinitions,
  promptMode,
}: {
  ctx: CtxDecompYaml;
  modulePath: string;
  asmName: string;
  asmDeclaration?: string;
  asmCode: string;
  calledFunctionsDeclarations: { [functionName: string]: string };
  sampling: SamplingCFunction[];
  typeDefinitions: string[];
  promptMode: PromptMode;
}): Promise<string> {
  // TODO: Instead of slicing, we should use a sampling strategy to select examples
  const examples = sampling.filter((sample) => !sample.callsTarget).slice(0, 5);
  const examplePrompts = examples.length
    ? `${templateExample}${examples
        .map(
          (sample) =>
            `## \`${sample.name}\`\n\n\`\`\`c\n${sample.cCode}\n\`\`\`\n\n\`\`\`asm\n${sample.asmCode}\n\`\`\``,
        )
        .join('\n\n')}`
    : '';

  const cFunctionsCallingTarget = sampling.filter((sample) => sample.callsTarget);
  const functionsCallingTargetPrompt = cFunctionsCallingTarget.length
    ? `${templateFunctionsCallingTarget}${cFunctionsCallingTarget
        .map(
          (sample) =>
            `## \`${sample.name}\`\n\n\`\`\`c\n${sample.cCode}\n\`\`\`\n\n\`\`\`asm\n${sample.asmCode}\n\`\`\``,
        )
        .join('\n\n')}`
    : '';

  const targetAssemblyDeclarationPrompt = asmDeclaration
    ? templateTargetAssemblyDeclaration.replace('{targetAssemblyDeclaration}', asmDeclaration)
    : '';

  const declarationsValues = Object.values(calledFunctionsDeclarations);
  const functionDeclarationsPrompt = declarationsValues.length
    ? `${templateDeclarationsForFunctionsCalledFromTarget}${Object.values(calledFunctionsDeclarations)
        .map((decl) => `- \`${decl}\``)
        .join('\n')}`
    : '';

  const typeDefinitionsPrompt = typeDefinitions.length
    ? `${templateTypeDefinitions}${typeDefinitions.map((typeDef) => `\`\`\`c\n${typeDef}\n\`\`\``).join('\n\n')}`
    : '';

  const platform = mappingPlatforms[ctx.decompYaml.platform];

  const finalPrompt = templateDecompile
    .replace('{assemblyLanguage}', platform.assembly)
    .replace('{platformName}', platform.name)
    .replace('{assemblyFunctionName}', asmName)
    .replace('{modulePath}', modulePath)
    .replace('{examplePrompts}', examplePrompts)
    .replace('{functionsCallingTargetPrompt}', functionsCallingTargetPrompt)
    .replace('{targetAssemblyDeclarationPrompt}', targetAssemblyDeclarationPrompt)
    .replace('{functionDeclarationsPrompt}', functionDeclarationsPrompt)
    .replace('{typeDefinitionsPrompt}', typeDefinitionsPrompt)
    .replace('{assemblyCode}', asmCode)
    .replace('{rules}', getRules(promptMode));

  return finalPrompt;
}
