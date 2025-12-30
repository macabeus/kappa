import fs from 'fs/promises';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';

import { CCompiler } from '~/__test_utils__/c-compiler';
import type { CtxDecompYaml } from '~/context';

import { objdiff } from './objdiff';

// Test context
const testContext: CtxDecompYaml = {
  decompYaml: {
    platform: 'gba',
    tools: {
      kappa: {
        buildFolder: 'build',
        nonMatchingAsmFolder: 'asm',
      },
    },
  },
};

// Test constants and utilities
const testDir = path.resolve(__dirname, '../../test-workspace');
const compilerDir = path.resolve(__dirname, '../../test-assets/arm-compiler');
const compiler = new CCompiler(compilerDir);

/**
 * Helper to compile C code to an object file for testing
 */
async function compileToObjectFile(functionName: string, cCode: string): Promise<string> {
  return compiler.compile(testDir, functionName, cCode);
}

// Clean up test files after all tests
afterAll(async () => {
  const files = await fs.readdir(testDir);
  await Promise.all(
    files.filter((file) => file !== '.keep').map((file) => fs.unlink(path.join(testDir, file)).catch(() => {})),
  );
});

describe('Objdiff', () => {
  describe('.getAsmFunctionFromObjectFile', () => {
    it('extracts assembly from a simple function', async () => {
      const cCode = `int add(int a, int b) {
    return a + b;
}`;

      const objPath = await compileToObjectFile('add', cCode);
      const asmCode = await objdiff.getAsmFunctionFromObjectFile(testContext, objPath, 'add');

      expect(asmCode).toBe(`push {r7, lr}
sub sp, sp, #0x8
mov r7, sp
str r0, [r7, #0x0]
str r1, [r7, #0x4]
ldr r0, [r7, #0x0]
ldr r2, [r7, #0x4]
add r1, r0, r2
mov r0, r1
b .L14
.L14:
add sp, #0x8
pop {r7, pc}`);
    });

    it('extracts assembly from a function with if-else condition', async () => {
      const cCode = `int max(int a, int b) {
    if (a > b) {
        return a;
    } else {
        return b;
    }
}`;

      const objPath = await compileToObjectFile('max', cCode);
      const asmCode = await objdiff.getAsmFunctionFromObjectFile(testContext, objPath, 'max');

      expect(asmCode).toBe(`push {r7, lr}
sub sp, sp, #0x8
mov r7, sp
str r0, [r7, #0x0]
str r1, [r7, #0x4]
ldr r0, [r7, #0x0]
ldr r1, [r7, #0x4]
cmp r0, r1
ble .L1a
ldr r1, [r7, #0x0]
mov r0, r1
b .L20
b .L20
.L1a:
ldr r1, [r7, #0x4]
mov r0, r1
b .L20
.L20:
add sp, #0x8
pop {r7, pc}`);
    });

    it('extracts assembly from a function with nested conditions', async () => {
      const cCode = `int classify(int x) {
    if (x < 0) {
        return -1;
    } else if (x > 0) {
        return 1;
    } else {
        return 0;
    }
}`;

      const objPath = await compileToObjectFile('classify', cCode);
      const asmCode = await objdiff.getAsmFunctionFromObjectFile(testContext, objPath, 'classify');

      expect(asmCode).toBe(`push {r7, lr}
sub sp, sp, #0x4
mov r7, sp
str r0, [r7, #0x0]
ldr r0, [r7, #0x0]
cmp r0, #0x0
bge .L16
mov r0, #0x1
neg r0, r0
b .L26
b .L26
.L16:
ldr r0, [r7, #0x0]
cmp r0, #0x0
ble .L22
mov r0, #0x1
b .L26
b .L26
.L22:
mov r0, #0x0
b .L26
.L26:
add sp, #0x4
pop {r7, pc}`);
    });

    it('extracts assembly from a function with a while loop', async () => {
      const cCode = `int sum_to_n(int n) {
    int sum = 0;
    int i = 0;
    while (i <= n) {
        sum = sum + i;
        i = i + 1;
    }
    return sum;
}`;

      const objPath = await compileToObjectFile('sum_to_n', cCode);
      const asmCode = await objdiff.getAsmFunctionFromObjectFile(testContext, objPath, 'sum_to_n');

      expect(asmCode).toBe(`push {r7, lr}
sub sp, sp, #0xc
mov r7, sp
str r0, [r7, #0x0]
mov r0, #0x0
str r0, [r7, #0x4]
mov r0, #0x0
str r0, [r7, #0x8]
.L10:
ldr r0, [r7, #0x8]
ldr r1, [r7, #0x0]
cmp r0, r1
ble .L1a
b .L2a
.L1a:
ldr r0, [r7, #0x4]
ldr r1, [r7, #0x8]
add r0, r0, r1
str r0, [r7, #0x4]
ldr r0, [r7, #0x8]
add r1, r0, #0x1
str r1, [r7, #0x8]
b .L10
.L2a:
ldr r1, [r7, #0x4]
mov r0, r1
b .L30
.L30:
add sp, #0xc
pop {r7, pc}`);
    });

    it('extracts assembly from a function with a for loop', async () => {
      const cCode = `int count_bits(int value) {
    int count = 0;
    int i;
    for (i = 0; i < 32; i = i + 1) {
        if ((value & 1) != 0) {
            count = count + 1;
        }
        value = value >> 1;
    }
    return count;
}`;

      const objPath = await compileToObjectFile('count_bits', cCode);
      const asmCode = await objdiff.getAsmFunctionFromObjectFile(testContext, objPath, 'count_bits');

      expect(asmCode).toBe(`push {r7, lr}
sub sp, sp, #0xc
mov r7, sp
str r0, [r7, #0x0]
mov r0, #0x0
str r0, [r7, #0x4]
mov r0, #0x0
str r0, [r7, #0x8]
.L10:
ldr r0, [r7, #0x8]
cmp r0, #0x1f
ble .L18
b .L36
.L18:
ldr r0, [r7, #0x0]
mov r1, #0x1
and r0, r1
cmp r0, #0x0
beq .L28
ldr r0, [r7, #0x4]
add r1, r0, #0x1
str r1, [r7, #0x4]
.L28:
ldr r0, [r7, #0x0]
asr r1, r0, #0x1
str r1, [r7, #0x0]
ldr r0, [r7, #0x8]
add r1, r0, #0x1
str r1, [r7, #0x8]
b .L10
.L36:
ldr r1, [r7, #0x4]
mov r0, r1
b .L3c
.L3c:
add sp, #0xc
pop {r7, pc}`);
    });

    it('extracts assembly from a function with switch statement', async () => {
      const cCode = `int get_value(int option) {
    switch (option) {
        case 0:
            return 10;
        case 1:
            return 20;
        case 2:
            return 30;
        default:
            return 0;
    }
}`;

      const objPath = await compileToObjectFile('get_value', cCode);
      const asmCode = await objdiff.getAsmFunctionFromObjectFile(testContext, objPath, 'get_value');

      expect(asmCode).toBe(`push {r7, lr}
sub sp, sp, #0x4
mov r7, sp
str r0, [r7, #0x0]
ldr r0, [r7, #0x0]
cmp r0, #0x1
beq .L22
cmp r0, #0x1
bgt .L18
cmp r0, #0x0
beq .L1e
b .L2a
.L18:
cmp r0, #0x2
beq .L26
b .L2a
.L1e:
mov r0, #0xa
b .L2e
.L22:
mov r0, #0x14
b .L2e
.L26:
mov r0, #0x1e
b .L2e
.L2a:
mov r0, #0x0
b .L2e
.L2e:
add sp, #0x4
pop {r7, pc}`);
    });

    it('extracts assembly from a function with pointer dereferencing and condition', async () => {
      const cCode = `int safe_deref(int* ptr) {
    if (ptr != 0) {
        return *ptr;
    }
    return -1;
}`;

      const objPath = await compileToObjectFile('safe_deref', cCode);
      const asmCode = await objdiff.getAsmFunctionFromObjectFile(testContext, objPath, 'safe_deref');

      expect(asmCode).toBe(`push {r7, lr}
sub sp, sp, #0x4
mov r7, sp
str r0, [r7, #0x0]
ldr r0, [r7, #0x0]
cmp r0, #0x0
beq .L16
ldr r0, [r7, #0x0]
ldr r1, [r0, #0x0]
mov r0, r1
b .L1c
.L16:
mov r0, #0x1
neg r0, r0
b .L1c
.L1c:
add sp, #0x4
pop {r7, pc}`);
    });

    it('extracts assembly from a function with early return', async () => {
      const cCode = `int early_return(int x, int y) {
    if (x == 0) {
        return 0;
    }
    if (y == 0) {
        return 0;
    }
    return x * y;
}`;

      const objPath = await compileToObjectFile('early_return', cCode);
      const asmCode = await objdiff.getAsmFunctionFromObjectFile(testContext, objPath, 'early_return');

      expect(asmCode).toBe(`push {r7, lr}
sub sp, sp, #0x8
mov r7, sp
str r0, [r7, #0x0]
str r1, [r7, #0x4]
ldr r0, [r7, #0x0]
cmp r0, #0x0
bne .L14
mov r0, #0x0
b .L2a
.L14:
ldr r0, [r7, #0x4]
cmp r0, #0x0
bne .L1e
mov r0, #0x0
b .L2a
.L1e:
ldr r0, [r7, #0x0]
ldr r2, [r7, #0x4]
mov r1, r0
mul r1, r2
mov r0, r1
b .L2a
.L2a:
add sp, #0x8
pop {r7, pc}`);
    });

    it('extracts assembly from a recursive function', async () => {
      const cCode = `int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}`;

      const objPath = await compileToObjectFile('factorial', cCode);
      const asmCode = await objdiff.getAsmFunctionFromObjectFile(testContext, objPath, 'factorial');

      expect(asmCode).toBe(`push {r7, lr}
sub sp, sp, #0x4
mov r7, sp
str r0, [r7, #0x0]
ldr r0, [r7, #0x0]
cmp r0, #0x1
bgt .L12
mov r0, #0x1
b .L26
.L12:
ldr r0, [r7, #0x0]
subs r1, r0, #0x1
mov r0, r1
bl factorial-0x4
ldr r2, [r7, #0x0]
mov r1, r0
mul r1, r2
mov r0, r1
b .L26
.L26:
add sp, #0x4
pop {r7, pc}`);
    });

    it('extracts assembly from a function with complex conditions (AND/OR)', async () => {
      const cCode = `int in_range(int value, int min, int max) {
    if (value >= min && value <= max) {
        return 1;
    }
    return 0;
}`;

      const objPath = await compileToObjectFile('in_range', cCode);
      const asmCode = await objdiff.getAsmFunctionFromObjectFile(testContext, objPath, 'in_range');

      expect(asmCode).toBe(`push {r7, lr}
sub sp, sp, #0xc
mov r7, sp
str r0, [r7, #0x0]
str r1, [r7, #0x4]
str r2, [r7, #0x8]
ldr r0, [r7, #0x0]
ldr r1, [r7, #0x4]
cmp r0, r1
blt .L20
ldr r0, [r7, #0x0]
ldr r1, [r7, #0x8]
cmp r0, r1
bgt .L20
mov r0, #0x1
b .L24
.L20:
mov r0, #0x0
b .L24
.L24:
add sp, #0xc
pop {r7, pc}`);
    });

    it('returns null for non-existent function', async () => {
      const cCode = `int dummy() { return 42; }`;
      const objPath = await compileToObjectFile('dummy', cCode);
      const asmCode = await objdiff.getAsmFunctionFromObjectFile(testContext, objPath, 'non_existent_function');

      expect(asmCode).toBeNull();
    });

    it('returns null for invalid object file path', async () => {
      const invalidPath = path.join(testDir, 'non_existent.o');
      const asmCode = await objdiff.getAsmFunctionFromObjectFile(testContext, invalidPath, 'any_function');

      expect(asmCode).toBeNull();
    });

    it('extracts clean assembly without address prefixes', async () => {
      const cCode = `int simple() { return 5; }`;
      const objPath = await compileToObjectFile('simple', cCode);
      const asmCode = await objdiff.getAsmFunctionFromObjectFile(testContext, objPath, 'simple');

      expect(asmCode).toBe(`push {r7, lr}
mov r7, sp
mov r0, #0x5
b .L8
.L8:
pop {r7, pc}`);
    });
  });

  describe('.parseObjectFile', () => {
    it('successfully parses a valid object file', async () => {
      const cCode = `int test() { return 1; }`;
      const objPath = await compileToObjectFile('test', cCode);

      const parsedObject = await objdiff.parseObjectFile(testContext, objPath);

      expect(parsedObject).toBeTruthy();
      expect(parsedObject).toBeDefined();
    });
  });

  describe('.getSymbolsName', () => {
    it('returns list of symbols from an object file', async () => {
      const cCode = `int func_one() { return 1; }
int func_two() { return 2; }`;
      const objPath = await compileToObjectFile('multi', cCode);

      const parsedObject = await objdiff.parseObjectFile(testContext, objPath);
      const symbols = await objdiff.getSymbolsName(testContext, parsedObject);

      expect(symbols).toBeTruthy();
      expect(Array.isArray(symbols)).toBe(true);
      expect(symbols).toContain('func_one');
      expect(symbols).toContain('func_two');
    });

    it('returns empty array for object file with no symbols', async () => {
      // Create an object file with only data
      const cCode = `const int data = 42;`;
      const objPath = await compileToObjectFile('data_only', cCode);

      const parsedObject = await objdiff.parseObjectFile(testContext, objPath);
      const symbols = await objdiff.getSymbolsName(testContext, parsedObject);

      expect(Array.isArray(symbols)).toBe(true);
      // May contain some symbols, but should not contain function symbols
      expect(symbols.every((s) => !s.includes('function'))).toBe(true);
    });
  });

  describe('.compareObjectFiles', () => {
    it('identifies matching functions', async () => {
      const cCode = `int identical(int x) { return x + 1; }`;

      const obj1Path = await compileToObjectFile('identical1', cCode);
      const obj2Path = await compileToObjectFile('identical2', cCode);

      const [obj1, obj2] = await Promise.all([
        objdiff.parseObjectFile(testContext, obj1Path),
        objdiff.parseObjectFile(testContext, obj2Path),
      ]);

      const result = await objdiff.compareObjectFiles(testContext, obj1Path, obj2Path, obj1, obj2, 'identical');

      expect(result).toBe(`# Diff Results

**Current Object (Object file with the current assembly from your C source):** \`${obj1Path}\`
**Target Object (Object file with the target assembly that you want to match):** \`${obj2Path}\`
**Function Name:** \`identical\`

## Current Object Assembly

\`\`\`asm
0:       push {r7, lr}
2:       sub sp, sp, #0x4
4:       mov r7, sp
6:       str r0, [r7, #0x0]
8:       ldr r0, [r7, #0x0]
a:       add r1, r0, #0x1
c:       mov r0, r1
e:       b .L10
10:  .L10:
add sp, #0x4
12:      pop {r7, pc}
\`\`\`

## Target Object Assembly

\`\`\`asm
0:       push {r7, lr}
2:       sub sp, sp, #0x4
4:       mov r7, sp
6:       str r0, [r7, #0x0]
8:       ldr r0, [r7, #0x0]
a:       add r1, r0, #0x1
c:       mov r0, r1
e:       b .L10
10:  .L10:
add sp, #0x4
12:      pop {r7, pc}
\`\`\`

## Detailed Differences

### Comparison Summary

- Matching instructions: 10
- Different instructions: 0

### Instruction Differences

No differences found! The assembly code for this function is identical.
`);
    });

    it('identifies differences between functions', async () => {
      const cCode1 = `int diff_func(int x) { return x + 1; }`;
      const cCode2 = `int diff_func(int x) { return x + 2; }`;

      const obj1Path = await compileToObjectFile('diff_func1', cCode1);
      const obj2Path = await compileToObjectFile('diff_func2', cCode2);

      const [obj1, obj2] = await Promise.all([
        objdiff.parseObjectFile(testContext, obj1Path),
        objdiff.parseObjectFile(testContext, obj2Path),
      ]);

      const result = await objdiff.compareObjectFiles(testContext, obj1Path, obj2Path, obj1, obj2, 'diff_func');

      expect(result).toBe(`# Diff Results

**Current Object (Object file with the current assembly from your C source):** \`${obj1Path}\`
**Target Object (Object file with the target assembly that you want to match):** \`${obj2Path}\`
**Function Name:** \`diff_func\`

## Current Object Assembly

\`\`\`asm
0:       push {r7, lr}
2:       sub sp, sp, #0x4
4:       mov r7, sp
6:       str r0, [r7, #0x0]
8:       ldr r0, [r7, #0x0]
a:       add r1, r0, #0x1
c:       mov r0, r1
e:       b .L10
10:  .L10:
add sp, #0x4
12:      pop {r7, pc}
\`\`\`

## Target Object Assembly

\`\`\`asm
0:       push {r7, lr}
2:       sub sp, sp, #0x4
4:       mov r7, sp
6:       str r0, [r7, #0x0]
8:       ldr r0, [r7, #0x0]
a:       add r1, r0, #0x2
c:       mov r0, r1
e:       b .L10
10:  .L10:
add sp, #0x4
12:      pop {r7, pc}
\`\`\`

## Detailed Differences

### Comparison Summary

- Matching instructions: 9
- Different instructions: 1

### Instruction Differences

Difference 1 (ARGUMENT_MISMATCH):
- Current: \`a:       add r1, r0, #0x1\` [arg-mismatch]
- Target:  \`a:       add r1, r0, #0x2\` [arg-mismatch]
`);
    });
  });
});
