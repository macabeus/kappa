import type { SamplingCFunction } from './get-context-from-asm-function';

const templateExample = `# Examples

`;

const templateFunctionsCallingTarget = `# Functions that call the target assembly

`;

const templateTargetAssemblyDeclaration = `# Function declaration for the target assmebly

\`{targetAssemblyDeclaration}\``;

const templateDeclarationsForFunctionsCalledFromTarget = `# Declarations for the functions called from the target assembly

`;

const templateDecompile = `You are decompiling an assembly function called \`{assemblyFunctionName}\` in ARMv4T from a Gameboy Advance game.

{examplePrompts}

{functionsCallingTargetPrompt}

{targetAssemblyDeclarationPrompt}

{functionDeclarationsPrompt}

# Task

Given the above context, translate this assembly from \`{modulePath}\` to an equivalent C code:

\`\`\`asm
{assemblyCode}
\`\`\`

# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.
`;

export async function craftPrompt({
  modulePath,
  asmName,
  asmDeclaration,
  asmCode,
  calledFunctionsDeclarations,
  sampling,
}: {
  modulePath: string;
  asmName: string;
  asmDeclaration?: string;
  asmCode: string;
  calledFunctionsDeclarations: { [functionName: string]: string };
  sampling: SamplingCFunction[];
}): Promise<string> {
  // TODO: Instead of slicing, we should use a sampling strategy to select examples
  const examples = sampling.filter((sample) => !sample.callsTarget).slice(0, 5);
  const examplePrompts = examples.length
    ? `${templateExample}${examples
        .map(
          (sample) =>
            `## \`${sample.name}\`\n\n\`\`\`c\n${sample.cCode}\n\`\`\`\n\n\`\`\`asm\n${sample.assemblyCode}\n\`\`\``,
        )
        .join('\n\n')}`
    : '';

  const cFunctionsCallingTarget = sampling.filter((sample) => sample.callsTarget);
  const functionsCallingTargetPrompt = cFunctionsCallingTarget.length
    ? `${templateFunctionsCallingTarget}${cFunctionsCallingTarget
        .map(
          (sample) =>
            `## \`${sample.name}\`\n\n\`\`\`c\n${sample.cCode}\n\`\`\`\n\n\`\`\`asm\n${sample.assemblyCode}\n\`\`\``,
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

  const finalPrompt = templateDecompile
    .replace('{assemblyFunctionName}', asmName)
    .replace('{modulePath}', modulePath)
    .replace('{examplePrompts}', examplePrompts)
    .replace('{functionsCallingTargetPrompt}', functionsCallingTargetPrompt)
    .replace('{targetAssemblyDeclarationPrompt}', targetAssemblyDeclarationPrompt)
    .replace('{functionDeclarationsPrompt}', functionDeclarationsPrompt)
    .replace('{assemblyCode}', asmCode);

  return finalPrompt;
}
