import { expect } from '@wdio/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { CodeLens } from 'vscode';
import YAML from 'yaml';

import type { DecompYaml } from '@configurations/decomp-yaml';
import { CCompiler } from '~/__test_utils__/c-compiler';

import kappaDbVectors from './prompt-builder-db-vectors.json';
import { runOnVSCode } from './utils';

const ctx = {
  workspaceDir: '',
  assetsDir: '',
  compiler: null as CCompiler | null,
};

/**
 * Represents a function that has been successfully decompiled and matched.
 * Contains both C and assembly code, and handles compilation to verify matching.
 */
class MatchedFunction {
  name: string;
  cCode: string;
  asmCode: string;

  constructor(name: string, cCode: string, asmCode: string) {
    this.name = name;
    this.cCode = cCode;
    this.asmCode = asmCode;
  }

  /**
   * Creates the C source file and compiles it to an object file.
   * Files are written to src/ and build/ directories relative to workspaceDir.
   */
  async createFiles(): Promise<void> {
    if (!ctx.compiler) {
      throw new Error('Compiler not initialized');
    }

    const srcDir = path.join(ctx.workspaceDir, 'src');
    const buildDir = path.join(ctx.workspaceDir, 'build');
    const cFilename = `${this.name}.c`;

    // Create directories
    await fs.mkdir(srcDir, { recursive: true });
    await fs.mkdir(buildDir, { recursive: true });

    // Write C source file to src directory
    await fs.writeFile(path.join(srcDir, cFilename), this.cCode);

    // Compile C code to object file in build directory
    await ctx.compiler.compile(buildDir, this.name, this.cCode);
  }
}

/**
 * Represents a function that has not yet been decompiled.
 * Contains only assembly code, written to the non-matching assembly folder.
 */
class NonMatchedFunction {
  name: string;
  asmCode: string;

  constructor(name: string, asmCode: string) {
    this.name = name;
    this.asmCode = asmCode;
  }

  /**
   * Creates the assembly file in the asm/ directory relative to workspaceDir.
   */
  async createFile(): Promise<void> {
    const asmDir = path.join(ctx.workspaceDir, 'asm');
    const asmFilename = `${this.name}.asm`;

    const asmPrefix = `.thumb
.text
`;

    const formattedAsm = `${this.name}:\n${this.asmCode
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n')}`;

    const fullCode = `${asmPrefix}\n\n${formattedAsm}\n`;

    await fs.mkdir(asmDir, { recursive: true });
    await fs.writeFile(path.join(asmDir, asmFilename), fullCode);
  }
}

describe('Prompt Builder', () => {
  before(async () => {
    const testWorkspaceDir = await runOnVSCode(async function fn({ workspaceUri }) {
      return workspaceUri.fsPath;
    });

    ctx.workspaceDir = testWorkspaceDir;
    ctx.assetsDir = path.resolve(testWorkspaceDir, '..', 'test-assets');

    // Initialize the compiler
    const compilerDir = path.join(ctx.assetsDir, 'arm-compiler');
    ctx.compiler = new CCompiler(compilerDir);
  });

  afterEach(async () => {
    // Sanity check to not delete files outside the test workspace
    if (!ctx.workspaceDir.includes('test-workspace')) {
      return;
    }

    const entries = await fs.readdir(ctx.workspaceDir, { withFileTypes: true });

    await Promise.allSettled(
      entries
        .filter((entry) => entry.name !== '.keep')
        .map((entry) => fs.rm(path.join(ctx.workspaceDir, entry.name), { recursive: true, force: true })),
    );
  });

  it('builds a simple prompt', async () => {
    const productPair = new NonMatchedFunction(
      'product_pair',
      `push {lr}
bl create_pair-0x4
cmp r0, #0x0
bne .Le
mov r0, #0x0
b .L12
.Le:
bl free-0x4
.L12:
pop {r1}
bx r1`,
    );

    const sumProductPair = new NonMatchedFunction(
      'sum_product_pair',
      `push {r7, lr}
sub sp, sp, #0x10
mov r7, sp
str r0, [r7, #0x0]
str r1, [r7, #0x4]
ldr r1, [r7, #0x4]
ldr r0, [r7, #0x0]
bl create_pair-0x4
str r0, [r7, #0xc]
ldr r0, [r7, #0xc]
cmp r0, #0x0
bne .L1e
mov r0, #0x0
b .L38
.L1e:
ldr r0, [r7, #0xc]
ldr r1, [r7, #0xc]
ldr r0, [r0, #0x0]
ldr r1, [r1, #0x4]
add r0, r0, r1
str r0, [r7, #0x8]
ldr r1, [r7, #0xc]
mov r0, r1
bl free-0x4
ldr r1, [r7, #0x8]
mov r0, r1
b .L38
.L38:
add sp, #0x10
pop {r7, pc}`,
    );

    const createPair = new MatchedFunction(
      'create_pair',
      `typedef struct {
    int first;
    int second;
} Pair;

extern void* malloc(unsigned int size);

Pair* create_pair(int first, int second) {
    Pair* pair = (Pair*)malloc(sizeof(Pair));
    if (pair != 0) {
        pair->first = first;
        pair->second = second;
    }
    return pair;
}
`,
      `push {r7, lr}
sub sp, sp, #0xc
mov r7, sp
str r0, [r7, #0x0]
str r1, [r7, #0x4]
mov r0, #0x8
bl malloc-0x4
str r0, [r7, #0x8]
ldr r0, [r7, #0x8]
cmp r0, #0x0
beq .L24
ldr r0, [r7, #0x8]
ldr r1, [r7, #0x0]
str r1, [r0, #0x0]
ldr r0, [r7, #0x8]
ldr r1, [r7, #0x4]
str r1, [r0, #0x4]
.L24:
ldr r1, [r7, #0x8]
mov r0, r1
b .L2a
.L2a:
add sp, #0xc
pop {r7, pc}`,
    );

    const sumPair = new MatchedFunction(
      'sum_pair',
      `typedef struct {
    int first;
    int second;
} Pair;

extern Pair* create_pair(int first, int second);
extern void free(void* ptr);

int sum_pair(int first, int second) {
    int result;
    Pair* pair = create_pair(first, second);
    if (pair == 0) {
        return 0;
    }

    result = pair->first + pair->second;
    free(pair);
    return result;
}
`,
      `push {r7, lr}
sub sp, sp, #0x10
mov r7, sp
str r0, [r7, #0x0]
str r1, [r7, #0x4]
ldr r1, [r7, #0x4]
ldr r0, [r7, #0x0]
bl create_pair-0x4
str r0, [r7, #0xc]
ldr r0, [r7, #0xc]
cmp r0, #0x0
bne .L1e
mov r0, #0x0
b .L38
.L1e:
ldr r0, [r7, #0xc]
ldr r1, [r7, #0xc]
ldr r0, [r0, #0x0]
ldr r1, [r1, #0x4]
add r0, r0, r1
str r0, [r7, #0x8]
ldr r1, [r7, #0xc]
mov r0, r1
bl free-0x4
ldr r1, [r7, #0x8]
mov r0, r1
b .L38
.L38:
add sp, #0x10
pop {r7, pc}`,
    );

    await Promise.all([
      productPair.createFile(),
      sumProductPair.createFile(),
      createPair.createFiles(),
      sumPair.createFiles(),
    ]);

    await fs.writeFile(
      path.join(ctx.workspaceDir, 'decomp.yaml'),
      YAML.stringify({
        platform: 'gba',
        versions: [
          {
            name: 'usa',
            paths: {
              build_dir: 'build',
              nonmatchings: 'asm',
            },
          },
        ],
      } as DecompYaml),
    );

    await runOnVSCode(async function fn({ runIndexCodebase }) {
      await runIndexCodebase();
    });

    // Hard set the vectors in the database
    const kappaDb = await fs.readFile(path.join(ctx.workspaceDir, 'kappa-db.json'), 'utf-8');
    const kappaDbJson = JSON.parse(kappaDb);
    kappaDbJson.vectors = kappaDbVectors;
    await fs.writeFile(path.join(ctx.workspaceDir, 'kappa-db.json'), JSON.stringify(kappaDbJson, null, 2));

    // Reload the database to pick up the hard-set vectors
    await runOnVSCode(async function fn({ reloadDatabase }) {
      await reloadDatabase();
    });

    // Run the prompt builder on `product_pair.asm`
    const prompt = await runOnVSCode(async function fn(
      { vscode, workspaceUri, openFile, runCodeLenPromptBuilder },
      productPairAsmFilename,
    ) {
      const productPairAsmUri = vscode.Uri.joinPath(workspaceUri, 'asm', productPairAsmFilename);

      await openFile(productPairAsmUri);

      const codeLenses: CodeLens[] = await vscode.commands.executeCommand(
        'vscode.executeCodeLensProvider',
        productPairAsmUri,
      );

      const buildPromptCodeLens = codeLenses.find((lens) => lens.command?.command === 'kappa.runPromptBuilder');

      if (!buildPromptCodeLens) {
        throw new Error('Could not find the code lens to build prompt');
      }

      const prompt = await runCodeLenPromptBuilder(buildPromptCodeLens);

      return prompt;
    }, `${productPair.name}.asm`);

    // Assert the prompt content
    expect(prompt)
      .toBe(`You are decompiling an assembly function called \`product_pair\` in ARMv4T from a Game Boy Advance game.

# Examples

## \`sum_pair\`

\`\`\`c
int sum_pair(int first, int second) {
    int result;
    Pair* pair = create_pair(first, second);
    if (pair == 0) {
        return 0;
    }

    result = pair->first + pair->second;
    free(pair);
    return result;
}
\`\`\`

\`\`\`asm
${sumProductPair.asmCode}
\`\`\`

## \`create_pair\`

\`\`\`c
Pair* create_pair(int first, int second) {
    Pair* pair = (Pair*)malloc(sizeof(Pair));
    if (pair != 0) {
        pair->first = first;
        pair->second = second;
    }
    return pair;
}
\`\`\`

\`\`\`asm
${createPair.asmCode}
\`\`\`





# Declarations for the functions called from the target assembly

- \`extern Pair* create_pair(int first, int second);\`

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

# Primary Objective

Decompile the following target assembly function from \`asm/product_pair.asm\` into clean, readable C code that compiles to an assembly matching EXACTLY the original one.

\`\`\`asm
${productPair.name}:
${productPair.asmCode
  .split('\n')
  .map((line) => `    ${line}`)
  .join('\n')}

\`\`\`

# Rules

- In order to decompile this function, you may need to create new types. Include them on the result.

- SHOW THE ENTIRE CODE WITHOUT CROPPING.
`);
  });
});
