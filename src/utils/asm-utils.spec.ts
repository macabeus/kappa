import { describe, expect, it } from 'vitest';

import { extractAsmFunctionBody, stripCommentaries } from './asm-utils';

describe('.extractAsmFunctionBody', () => {
  it('extracts ARM function body correctly', () => {
    const asmCode = `  thumb_func_start sub_806098C
sub_806098C: @ 0x0806098C
	push {r4, r5, r6, r7, lr}
	adds r4, r0, #0
	lsls r5, r1, #0x18
	lsrs r5, r5, #0x18
	movs r0, #0x10
	bl VramMalloc
	adds r7, r4, #0
	adds r7, #0x20
	str r0, [r4, #0x20]
	ldr r1, _08060A08 @ =gUnknown_080D2024
	ldrh r0, [r1]
	movs r6, #0
	movs r3, #0
	strh r0, [r7, #0xc]
	ldrb r0, [r1, #2]
	strb r0, [r7, #0x1a]
	movs r0, #0xff
	strb r0, [r7, #0x1b]
	ldr r1, [r4, #0x18]
	asrs r1, r1, #8
	ldrh r0, [r4, #0xa]
	lsls r0, r0, #8
	adds r1, r1, r0
	ldr r2, _08060A0C @ =gCamera
	ldr r0, [r2]
	subs r1, r1, r0
	strh r1, [r7, #0x10]
	ldr r1, [r4, #0x1c]
	asrs r1, r1, #8
	ldrh r0, [r4, #0xc]
	lsls r0, r0, #8
	adds r1, r1, r0
	ldr r0, [r2, #4]
	subs r1, r1, r0
	strh r1, [r7, #0x12]
	movs r0, #0x90
	lsls r0, r0, #3
	strh r0, [r7, #0x14]
	strh r3, [r7, #0xe]
	strh r3, [r7, #0x16]
	movs r0, #0x10
	strb r0, [r7, #0x1c]
	strb r6, [r7, #0x1f]
	movs r1, #0x80
	lsls r1, r1, #5
	str r1, [r7, #8]
	cmp r5, #2
	bne _080609F6
	movs r0, #0x80
	lsls r0, r0, #3
	orrs r0, r1
	str r0, [r7, #8]
_080609F6:
	movs r0, #1
	rsbs r0, r0, #0
	str r0, [r7, #0x20]
	adds r0, r7, #0
	bl UpdateSpriteAnimation
	pop {r4, r5, r6, r7}
	pop {r0}
	bx r0
	.align 2, 0
_08060A08: .4byte gUnknown_080D2024
_08060A0C: .4byte gCamera`;

    const expected = `push {r4, r5, r6, r7, lr}
adds r4, r0, #0
lsls r5, r1, #0x18
lsrs r5, r5, #0x18
movs r0, #0x10
bl VramMalloc
adds r7, r4, #0
adds r7, #0x20
str r0, [r4, #0x20]
ldr r1, _08060A08 @ =gUnknown_080D2024
ldrh r0, [r1]
movs r6, #0
movs r3, #0
strh r0, [r7, #0xc]
ldrb r0, [r1, #2]
strb r0, [r7, #0x1a]
movs r0, #0xff
strb r0, [r7, #0x1b]
ldr r1, [r4, #0x18]
asrs r1, r1, #8
ldrh r0, [r4, #0xa]
lsls r0, r0, #8
adds r1, r1, r0
ldr r2, _08060A0C @ =gCamera
ldr r0, [r2]
subs r1, r1, r0
strh r1, [r7, #0x10]
ldr r1, [r4, #0x1c]
asrs r1, r1, #8
ldrh r0, [r4, #0xc]
lsls r0, r0, #8
adds r1, r1, r0
ldr r0, [r2, #4]
subs r1, r1, r0
strh r1, [r7, #0x12]
movs r0, #0x90
lsls r0, r0, #3
strh r0, [r7, #0x14]
strh r3, [r7, #0xe]
strh r3, [r7, #0x16]
movs r0, #0x10
strb r0, [r7, #0x1c]
strb r6, [r7, #0x1f]
movs r1, #0x80
lsls r1, r1, #5
str r1, [r7, #8]
cmp r5, #2
bne _080609F6
movs r0, #0x80
lsls r0, r0, #3
orrs r0, r1
str r0, [r7, #8]
_080609F6:
movs r0, #1
rsbs r0, r0, #0
str r0, [r7, #0x20]
adds r0, r7, #0
bl UpdateSpriteAnimation
pop {r4, r5, r6, r7}
pop {r0}
bx r0
_08060A08: .4byte gUnknown_080D2024
_08060A0C: .4byte gCamera`;

    expect(extractAsmFunctionBody('gba', asmCode)).toBe(expected);
  });

  it('extracts MIPS function body correctly', () => {
    const asmCode = `glabel func_8001C6E4_1D2E4
    addiu      $sp, $sp, -0x18
    sw         $ra, 0x14($sp)
    jal        getCurrentAllocation
     sw        $s0, 0x10($sp)
    addu       $s0, $v0, $zero
    lhu        $v0, 0x5C0($s0)
    addiu      $v0, $v0, -0x1
    sh         $v0, 0x5C0($s0)
    andi       $v0, $v0, 0xFFFF
    bnez       $v0, .L8001C728_1D328
     addu      $a0, $zero, $zero
    addiu      $a1, $zero, 0xFF
    jal        func_8006FDA0_709A0
     addiu     $a2, $zero, 0x10
    lui        $a0, %hi(func_8001C744_1D344)
    jal        setGameStateHandler
     addiu     $a0, $a0, %lo(func_8001C744_1D344)
  .L8001C728_1D328:
    lbu        $v0, 0x5D6($s0)
    bnel       $v0, $zero, .L8001C734_1D334
     sb        $zero, 0x5D6($s0)
  .L8001C734_1D334:
    lw         $ra, 0x14($sp)
    lw         $s0, 0x10($sp)
    jr         $ra
     addiu     $sp, $sp, 0x18
endlabel func_8001C6E4_1D2E4`;

    const expected = `addiu $sp, $sp, -0x18
sw $ra, 0x14($sp)
jal getCurrentAllocation
sw $s0, 0x10($sp)
addu $s0, $v0, $zero
lhu $v0, 0x5C0($s0)
addiu $v0, $v0, -0x1
sh $v0, 0x5C0($s0)
andi $v0, $v0, 0xFFFF
bnez $v0, .L8001C728_1D328
addu $a0, $zero, $zero
addiu $a1, $zero, 0xFF
jal func_8006FDA0_709A0
addiu $a2, $zero, 0x10
lui $a0, %hi(func_8001C744_1D344)
jal setGameStateHandler
addiu $a0, $a0, %lo(func_8001C744_1D344)
.L8001C728_1D328:
lbu $v0, 0x5D6($s0)
bnel $v0, $zero, .L8001C734_1D334
sb $zero, 0x5D6($s0)
.L8001C734_1D334:
lw $ra, 0x14($sp)
lw $s0, 0x10($sp)
jr $ra
addiu $sp, $sp, 0x18`;

    expect(extractAsmFunctionBody('n64', asmCode)).toBe(expected);
  });

  it('handles empty input', () => {
    expect(extractAsmFunctionBody('gba', '')).toBe('');
    expect(extractAsmFunctionBody('n64', '')).toBe('');
  });

  it('handles function with only metadata', () => {
    const asmCode = `thumb_func_start test_func
test_func:
	.align 2, 0
_08060A08: .4byte gUnknown_080D2024`;

    expect(extractAsmFunctionBody('gba', asmCode)).toBe('');
  });

  it('throws error for unsupported platform', () => {
    expect(() => {
      extractAsmFunctionBody('win32', 'some code');
    }).toThrow('Unsupported platform: win32');
  });
});

describe('.stripCommentaries', () => {
  it('strips ARM-style comments (@)', () => {
    const asmCode = `	.text

thumb_func_start ExampleFunction  @ This is a comment
ExampleFunction:  @ function label comment
	push {r4, lr}     @ Save registers to stack
	ldr r0, =0x12345  @ Load immediate value
	bl SomeFunction   @ Call another function
	pop {r4, lr}      @ Restore registers
	bx lr             @ Return
thumb_func_end ExampleFunction

	.align 2
data_value:
	.4byte 0x08000000  @ Data with comment`;

    const expected = `	.text

thumb_func_start ExampleFunction
ExampleFunction:
	push {r4, lr}
	ldr r0, =0x12345
	bl SomeFunction
	pop {r4, lr}
	bx lr
thumb_func_end ExampleFunction

	.align 2
data_value:
	.4byte 0x08000000`;

    expect(stripCommentaries(asmCode)).toBe(expected);
  });

  it('strips MIPS-style comments (;)', () => {
    const asmCode = `	.text

glabel example_function  ; This is a MIPS comment
example_function:        ; function label comment
	addiu $sp, $sp, -0x20  ; Adjust stack pointer
	sw $ra, 0x1C($sp)      ; Save return address
	jal some_function      ; Call another function
	nop                    ; Branch delay slot
	lw $ra, 0x1C($sp)      ; Restore return address
	addiu $sp, $sp, 0x20   ; Restore stack pointer
	jr $ra                 ; Return to caller
	nop                    ; Branch delay slot

	.size example_function, . - example_function

data_table:
	.word 0x12345678  ; Data with comment`;

    const expected = `	.text

glabel example_function
example_function:
	addiu $sp, $sp, -0x20
	sw $ra, 0x1C($sp)
	jal some_function
	nop
	lw $ra, 0x1C($sp)
	addiu $sp, $sp, 0x20
	jr $ra
	nop

	.size example_function, . - example_function

data_table:
	.word 0x12345678`;

    expect(stripCommentaries(asmCode)).toBe(expected);
  });

  it('strips C-style comments (//)', () => {
    const asmCode = `	.text
function_start:  // C-style comment
	mov r0, #1   // Another comment
	ret          // Return comment`;

    const expected = `	.text
function_start:
	mov r0, #1
	ret`;

    expect(stripCommentaries(asmCode)).toBe(expected);
  });

  it('handles lines without comments', () => {
    const asmCode = `	.text
function_start:
	mov r0, #1
	ret`;

    expect(stripCommentaries(asmCode)).toBe(asmCode);
  });

  it('handles empty lines and preserves structure', () => {
    const asmCode = `	.text

function_start:  @ comment
	mov r0, #1   @ another comment

	ret`;

    const expected = `	.text

function_start:
	mov r0, #1

	ret`;

    expect(stripCommentaries(asmCode)).toBe(expected);
  });

  it('removes both ARM and MIPS comments', () => {
    const asmCode = `	mov r0, #1 @ ARM comment ; MIPS comment`;
    const expected = `	mov r0, #1`;

    expect(stripCommentaries(asmCode)).toBe(expected);
  });
});
