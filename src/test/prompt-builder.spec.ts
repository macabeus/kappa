import type { CodeLens } from 'vscode';
import { expect } from '@wdio/globals';
import { runOnVSCode } from './utils';
import * as fs from 'fs/promises';
import * as path from 'path';

class AsmModule {
  #functions: string[];
  filename: string;
  code: string;

  constructor(filename: string, functions: Array<{ name: string; code: string }>) {
    const modulePrefix = `.thumb
.text
`;

    const functionsCode = functions.map(
      (func) =>
        `${func.name}:\n${func.code
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n')}`,
    );

    this.filename = filename;
    this.#functions = functionsCode;
    this.code = `${modulePrefix}\n\n${functionsCode.join('\n\n')}\n`;
  }

  getFunction(name: string): string | null {
    const func = this.#functions.find((f) => f.startsWith(`${name}:`));
    return func ?? null;
  }

  async createFile(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, this.filename), this.code);
  }

  async deleteFile(dir: string): Promise<void> {
    await fs.unlink(path.join(dir, this.filename));
  }
}

class CModule {
  #functions: string[];
  #externDeclarations: string[];
  filename: string;
  code: string;
  asmModule: AsmModule;

  constructor(
    filename: string,
    options: {
      includes: string[];
      types: string[];
      externDeclarations: string[];
      functions: Array<{ name: string; signature: string; body: string }>;
      asmCode: Array<{ name: string; code: string }>;
    },
  ) {
    const includes = options.includes.map((inc) => `#include ${inc}`).join('\n');
    const types = options.types.join('\n\n');
    const externDeclarations = options.externDeclarations.map((ext) => `extern ${ext};`);

    const functionsCode = options.functions.map(
      (func) =>
        `${func.signature} {\n${func.body
          .split('\n')
          .map((line) => (line.trim() ? `    ${line}` : ''))
          .join('\n')}\n}`,
    );

    this.filename = filename;
    this.#externDeclarations = externDeclarations;
    this.#functions = functionsCode;

    const parts = [includes, types, externDeclarations.join('\n'), ...functionsCode].filter(Boolean);
    this.code = parts.join('\n\n') + '\n';

    this.asmModule = new AsmModule(filename.replace('.c', '.asm'), options.asmCode);
  }

  getFunction(name: string): string | null {
    const func = this.#functions.find((f) => f.includes(`${name}(`));
    return func ?? null;
  }

  getExternDeclaration(name: string): string | null {
    const declaration = this.#externDeclarations.find((f) => f.includes(`${name}(`));
    return declaration ?? null;
  }

  async createFile(dir: string): Promise<void> {
    await fs.mkdir(`${dir}/src`, { recursive: true });
    await fs.writeFile(path.join(`${dir}/src`, this.filename), this.code);
    await this.asmModule.createFile(`${dir}/build`);
  }

  async deleteFile(dir: string): Promise<void> {
    await fs.unlink(path.join(`${dir}/src`, this.filename));
    await this.asmModule.deleteFile(`${dir}/build`);
  }
}

describe('Prompt Builder', () => {
  it('builds a simple prompt', async () => {
    const testWorkspaceDir = await runOnVSCode(async function fn({ workspaceUri }) {
      return workspaceUri.fsPath;
    });

    const productPairAsm = new AsmModule('product_pair.asm', [
      {
        name: 'product_pair',
        code: `push {r4, r5, lr}
mov r4, r0
mov r5, r1
bl create_pair
ldr r1, [r0, #0]
ldr r2, [r0, #4]
mul r0, r1, r2
pop {r4, r5, pc}`,
      },
    ]);

    const sumProductPairAsm = new AsmModule('sum_product_pair.asm', [
      {
        name: 'sum_product_pair',
        code: `push {r4, r5, r6, lr}
mov r4, r0
mov r5, r1
bl create_pair
mov r6, r0
mov r0, r4
mov r1, r5
bl sum_pair
mov r4, r0
mov r0, r4
mov r1, r5
bl product_pair
pop {r4, r5, r6, pc}`,
      },
    ]);

    const allAsmModules = [productPairAsm, sumProductPairAsm];

    await Promise.all(allAsmModules.map((asm) => asm.createFile(`${testWorkspaceDir}/asm`)));

    const createPairC = new CModule('create_pair.c', {
      includes: ['<stdlib.h>'],
      types: [
        `typedef struct {
    int first;
    int second;
} Pair;`,
      ],
      externDeclarations: [],
      functions: [
        {
          name: 'create_pair',
          signature: 'Pair* create_pair(int first, int second)',
          body: `Pair* pair = (Pair*)malloc(sizeof(Pair));
if (pair != NULL) {
    pair->first = first;
    pair->second = second;
}
return pair;`,
        },
      ],
      asmCode: [
        {
          name: 'create_pair',
          code: `push {r4, lr}
mov r0, #8
bl malloc
str r4, [r0, #0]
str r1, [r0, #4]
pop {r4, pc}`,
        },
      ],
    });

    await createPairC.createFile(testWorkspaceDir);

    const sumPairC = new CModule('sum_pair.c', {
      includes: ['<stdlib.h>'],
      types: [
        `typedef struct {
    int first;
    int second;
} Pair;`,
      ],
      externDeclarations: ['Pair* create_pair(int first, int second)'],
      functions: [
        {
          name: 'sum_pair',
          signature: 'int sum_pair(int first, int second)',
          body: `Pair* pair = create_pair(first, second);
if (pair == NULL) {
    return 0;
}

int result = pair->first + pair->second;
free(pair);
return result;`,
        },
      ],
      asmCode: [
        {
          name: 'sum_pair',
          code: `push {r4, r5, lr}
mov r4, r0
mov r5, r1
bl create_pair
ldr r1, [r0, #0]
ldr r2, [r0, #4]
add r0, r1, r2
pop {r4, r5, pc}`,
        },
      ],
    });

    await sumPairC.createFile(testWorkspaceDir);

    // Run the prompt builder on `product_pair.asm`
    const prompt = await runOnVSCode(async function fn(
      { vscode, workspaceUri, openFile, runIndexCodebase, runCodeLenPromptBuilder },
      productPairAsmFilename,
    ) {
      await runIndexCodebase();

      const productPairAsmUri = vscode.Uri.joinPath(workspaceUri, 'asm', productPairAsmFilename);

      await openFile(productPairAsmUri);

      const codeLenses: CodeLens[] = await vscode.commands.executeCommand(
        'vscode.executeCodeLensProvider',
        productPairAsmUri,
      );

      if (codeLenses.length !== 1) {
        throw new Error('Expected exactly one code lens for this assembly file');
      }

      const prompt = await runCodeLenPromptBuilder(codeLenses[0]);

      return prompt;
    }, productPairAsm.filename);

    // Clean up the test workspace
    const allCModules = [createPairC, sumPairC];

    await Promise.allSettled(allCModules.map((c) => c.deleteFile(testWorkspaceDir)));
    await Promise.allSettled(allAsmModules.map((asm) => asm.deleteFile(`${testWorkspaceDir}/asm`)));

    // Assert the prompt content
    expect(prompt)
      .toBe(`You are decompiling an assembly function called \`product_pair\` in ARMv4T from a Gameboy Advance game.







# Declarations for the functions called from the target assembly

- \`${sumPairC.getExternDeclaration('create_pair')}\`

# Types definitions used in the declarations

\`\`\`c
typedef struct {
    int first;
    int second;
} Pair;
\`\`\`

\`\`\`c
typedef struct {
    int first;
    int second;
} Pair;
\`\`\`

# Task

Given the above context, translate this assembly from \`asm/product_pair.asm\` to an equivalent C code:

\`\`\`asm
${productPairAsm.getFunction('product_pair')}

\`\`\`

# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.
`);
  });
});
