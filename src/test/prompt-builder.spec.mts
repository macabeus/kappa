import { simpleGit } from 'simple-git';
import { expect } from '@wdio/globals';
import { runOnVSCode } from './utils.mjs';
import * as fs from 'fs/promises';
import * as path from 'path';

class AsmModule {
  private functions: string[];
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
    this.functions = functionsCode;
    this.code = `${modulePrefix}\n\n${functionsCode.join('\n\n')}\n`;
  }

  getFunction(name: string): string | null {
    const func = this.functions.find((f) => f.startsWith(`${name}:`));
    return func ?? null;
  }

  async createFile(dir: string): Promise<void> {
    await fs.writeFile(path.join(dir, this.filename), this.code);
  }

  async deleteFile(dir: string): Promise<void> {
    await fs.unlink(path.join(dir, this.filename));
  }
}

class CModule {
  private functions: string[];
  private externDeclarations: string[];
  filename: string;
  code: string;

  constructor(
    filename: string,
    options: {
      includes: string[];
      types: string[];
      externDeclarations: string[];
      functions: Array<{ name: string; signature: string; body: string }>;
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
    this.externDeclarations = externDeclarations;
    this.functions = functionsCode;

    const parts = [includes, types, externDeclarations.join('\n'), ...functionsCode].filter(Boolean);
    this.code = parts.join('\n\n') + '\n';
  }

  getFunction(name: string): string | null {
    const func = this.functions.find((f) => f.includes(`${name}(`));
    return func ?? null;
  }

  getExternDeclaration(name: string): string | null {
    const declaration = this.externDeclarations.find((f) => f.includes(`${name}(`));
    return declaration ?? null;
  }

  async createFile(dir: string): Promise<void> {
    await fs.writeFile(path.join(dir, this.filename), this.code);
  }

  async deleteFile(dir: string): Promise<void> {
    await fs.unlink(path.join(dir, this.filename));
  }
}

describe('Prompt Builder', () => {
  it('builds a simple prompt', async () => {
    const testWorkspaceDir = await runOnVSCode(async function fn({ workspaceUri }) {
      return workspaceUri.fsPath;
    });

    const git = simpleGit();

    await git.cwd(testWorkspaceDir);

    await git.init();

    await git.addConfig('user.name', 'Test User', false, 'local');
    await git.addConfig('user.email', 'test@example.com', false, 'local');

    // Commit the project setup
    const createPairAsm = new AsmModule('create_pair.asm', [
      {
        name: 'create_pair',
        code: `push {r4, lr}
mov r0, #8
bl malloc
str r4, [r0, #0]
str r1, [r0, #4]
pop {r4, pc}`,
      },
    ]);

    const sumPairAsm = new AsmModule('sum_pair.asm', [
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
    ]);

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

    const allAsmModules = [createPairAsm, sumPairAsm, productPairAsm, sumProductPairAsm];

    await Promise.all(allAsmModules.map((asm) => asm.createFile(testWorkspaceDir)));
    await git.add(allAsmModules.map((asm) => asm.filename));
    await git.commit('Add initial assembly functions');

    // Commit the decompiltion for `create_pair.asm`
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
    });

    await createPairC.createFile(testWorkspaceDir);
    await createPairAsm.deleteFile(testWorkspaceDir);
    await git.add([createPairAsm.filename, createPairC.filename]);
    await git.commit('Replace create_pair.asm with decompiled C version');

    // Commit the decompiled `sum_pair.asm`
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
    });

    await sumPairC.createFile(testWorkspaceDir);
    await sumPairAsm.deleteFile(testWorkspaceDir);
    await git.add([sumPairAsm.filename, sumPairC.filename]);
    await git.commit('Replace sum_pair.asm with decompiled C version');

    // Run the prompt builder on `product_pair.asm`
    const prompt = await runOnVSCode(async function fn(
      { vscode, workspaceUri, openFile, runPromptBuilder },
      productPairAsmFilename,
    ) {
      const productPairAsmUri = vscode.Uri.joinPath(workspaceUri, productPairAsmFilename);

      await openFile(productPairAsmUri);

      const editor = vscode.window.activeTextEditor!;
      const startPosition = new vscode.Position(4, 0);
      const endPosition = new vscode.Position(12, editor.document.lineAt(12).text.length);
      editor.selection = new vscode.Selection(startPosition, endPosition);

      const prompt = await runPromptBuilder();

      return prompt;
    }, productPairAsm.filename);

    // Clean up the test workspace
    const allCModules = [createPairC, sumPairC];

    await fs.rm(path.join(testWorkspaceDir, '.git'), { recursive: true });
    await Promise.allSettled(allCModules.map((c) => c.deleteFile(testWorkspaceDir)));
    await Promise.allSettled(allAsmModules.map((asm) => asm.deleteFile(testWorkspaceDir)));

    // Assert the prompt content
    expect(prompt).toBe(`You are decompiling an assembly function in ARMv4T from a Gameboy Advance game.

# Example

You know that this assembly:

\`\`\`asm
${sumPairAsm.getFunction('sum_pair')}
\`\`\`

Translates to this C code:

\`\`\`c
${sumPairC.getFunction('sum_pair')}
\`\`\`

# Functions used in the target assembly

- \`${sumPairC.getExternDeclaration('create_pair')}\`

# Task

Given the above context, translate this assembly from \`product_pair.asm\` to an equivalent C code:

\`\`\`asm
${productPairAsm.getFunction('product_pair')}
\`\`\`

# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.
`);
  });
});
