import type { ExampleFunction } from './get-context-from-asm-function';

const templateExamplePrompt = `# Example

You know that this assembly:

\`\`\`asm
{assemblyCode}
\`\`\`

Translates to this C code:

\`\`\`c
{cCode}
\`\`\``;

const templateDeclarationsPrompt = `# Functions used in the target assembly

`;

const templateDecompilePrompt = `You are decompiling an assembly function in ARMv4T from a Gameboy Advance game.

{examplePrompts}

{declarationsPrompt}

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
  assemblyCode,
  declarations,
  examples,
}: {
  modulePath: string;
  assemblyCode: string;
  declarations: { [functionName: string]: string };
  examples: ExampleFunction[];
}): Promise<string> {
  const examplePrompts = examples
    .map((example) =>
      templateExamplePrompt.replace('{assemblyCode}', example.assemblyCode).replace('{cCode}', example.cCode),
    )
    .join('\n\n');

  const declarationsPrompt = `${templateDeclarationsPrompt}${Object.values(declarations)
    .map((decl) => `- \`${decl}\``)
    .join('\n')}`;

  const finalPrompt = templateDecompilePrompt
    .replace('{modulePath}', modulePath)
    .replace('{examplePrompts}', examplePrompts)
    .replace('{declarationsPrompt}', declarationsPrompt)
    .replace('{assemblyCode}', assemblyCode);

  return finalPrompt;
}
