You are decompiling an assembly function called `sub_805ECC4` in ARMv4T from a Gameboy Advance game.

# Examples

## `sub_805FCC4`

```c
void sub_805FCC4(Yadokk *enemy)
{
    void *tiles = ALLOC_TILES(ANIM_YADOKK);
    Sprite *s = &enemy->s;
    s->tiles = tiles;

    s->anim = gUnknown_080D1FD0[0].anim;
    s->variant = gUnknown_080D1FD0[0].variant;
    s->prevVariant = -1;
    s->x = TO_WORLD_POS_RAW(I(enemy->qPos.x), enemy->region[0]) - gCamera.x;
    s->y = TO_WORLD_POS_RAW(I(enemy->qPos.y), enemy->region[1]) - gCamera.y;
    s->oamFlags = SPRITE_OAM_ORDER(18);
    s->animCursor = 0;
    s->qAnimDelay = 0;
    s->animSpeed = SPRITE_ANIM_SPEED(1.0);
    s->palId = 0;
    s->frameFlags = SPRITE_FLAG(PRIORITY, 1);

    if (enemy->direction < 0) {
        s->frameFlags |= SPRITE_FLAG_MASK_X_FLIP;
    }

    s->hitboxes[0].index = HITBOX_STATE_INACTIVE;

    UpdateSpriteAnimation(s);
}
```

```asm
sub_805FCC4:
  push	{r4, r5, r6, lr}
  add	r4, r0, #0
  mov	r0, #0x10
  bl	VramMalloc
  add	r6, r4, #0
  add	r6, r6, #0x28
  str	r0, [r4, #0x28]
  ldr	r1, .L12
  ldrh	r0, [r1]
  mov	r5, #0x0
  mov	r3, #0x0
  strh	r0, [r6, #0xc]
  ldrb	r0, [r1, #0x2]
  strb	r0, [r6, #0x1a]
  mov	r0, #0xff
  strb	r0, [r6, #0x1b]
  ldr	r1, [r4, #0x18]
  asr	r1, r1, #0x8
  ldrh	r0, [r4, #0xa]
  lsl	r0, r0, #0x8
  add	r1, r1, r0
  ldr	r2, .L12+0x4
  ldr	r0, [r2]
  sub	r1, r1, r0
  strh	r1, [r6, #0x10]
  ldr	r1, [r4, #0x1c]
  asr	r1, r1, #0x8
  ldrh	r0, [r4, #0xc]
  lsl	r0, r0, #0x8
  add	r1, r1, r0
  ldr	r0, [r2, #0x4]
  sub	r1, r1, r0
  strh	r1, [r6, #0x12]
  mov	r0, #0x90
  lsl	r0, r0, #0x3
  strh	r0, [r6, #0x14]
  strh	r3, [r6, #0xe]
  strh	r3, [r6, #0x16]
  mov	r0, #0x10
  strb	r0, [r6, #0x1c]
  strb	r5, [r6, #0x1f]
  mov	r1, #0x80
  lsl	r1, r1, #0x5
  str	r1, [r6, #0x8]
  mov	r0, #0x8
  ldrsb	r0, [r4, r0]
  cmp	r0, #0
  bge	.L11	@cond_branch
  mov	r0, #0x80
  lsl	r0, r0, #0x3
  orr	r0, r0, r1
  str	r0, [r6, #0x8]
.L11:
  mov	r0, #0x1
  neg	r0, r0
  str	r0, [r6, #0x20]
  add	r0, r6, #0
  bl	UpdateSpriteAnimation
  pop	{r4, r5, r6}
  pop	{r0}
  bx	r0
.L13:
  .align	2, 0
.L12:
  .word	gUnknown_080D1FD0
  .word	gCamera
.Lfe2:
  .size	 sub_805FCC4,.Lfe2-sub_805FCC4
  .align	2, 0
  .globl	Task_Yadokk
  .type	 Task_Yadokk,function
  .thumb_func
```

## `sub_8046E20`

```c
END_NONMATCH

void sub_8046E20(FerrisWheel *wheel)
{
    Sprite *s, *s2;

    wheel->tiles = VramMalloc(MAX_TILES_VARIANT(ANIM_FERRIS_WHEEL, 0) + MAX_TILES_VARIANT(ANIM_FERRIS_WHEEL, 1));

    s = &wheel->s;
    s->tiles = wheel->tiles;
    s->anim = ANIM_FERRIS_WHEEL;
    s->variant = 1;
    s->oamFlags = SPRITE_OAM_ORDER(24);
    s->animCursor = 0;
    s->qAnimDelay = Q(0);
    s->prevVariant = -1;
    s->animSpeed = SPRITE_ANIM_SPEED(1.0);
    s->palId = 0;
    s->hitboxes[0].index = HITBOX_STATE_INACTIVE;
    s->frameFlags = SPRITE_FLAG(PRIORITY, 1);
    UpdateSpriteAnimation(s);

    s2 = &wheel->s2;
    s2->tiles = wheel->tiles + MAX_TILES_VARIANT(ANIM_FERRIS_WHEEL, 0) * TILE_SIZE_4BPP;
    s2->anim = ANIM_FERRIS_WHEEL;
    s2->variant = 0;
    s2->oamFlags = SPRITE_OAM_ORDER(24);
    s2->animCursor = 0;
    s2->qAnimDelay = Q(0);
    s2->prevVariant = -1;
    s2->animSpeed = SPRITE_ANIM_SPEED(1.0);
    s2->palId = 0;
    s2->hitboxes[0].index = HITBOX_STATE_INACTIVE;
    s2->frameFlags = SPRITE_FLAG(PRIORITY, 1);
    UpdateSpriteAnimation(s2);
}
```

```asm
sub_8046E20:
  push	{r4, r5, r6, r7, lr}
  mov	r7, sl
  mov	r6, r9
  mov	r5, r8
  push	{r5, r6, r7}
  add	r7, r0, #0
  mov	r0, #0x2
  bl	VramMalloc
  add	r1, r0, #0
  add	r6, r7, #0
  add	r6, r6, #0xcc
  str	r1, [r6]
  add	r0, r7, #0
  add	r0, r0, #0xc
  str	r1, [r7, #0xc]
  mov	r4, #0x0
  mov	r1, #0xe5
  lsl	r1, r1, #0x2
  strh	r1, [r0, #0xc]
  mov	r1, #0x1
  strb	r1, [r0, #0x1a]
  mov	r1, #0xc0
  lsl	r1, r1, #0x3
  mov	sl, r1
  mov	r1, sl
  strh	r1, [r0, #0x14]
  strh	r4, [r0, #0xe]
  strh	r4, [r0, #0x16]
  mov	r1, #0xff
  strb	r1, [r0, #0x1b]
  mov	r1, #0x10
  mov	r9, r1
  mov	r1, r9
  strb	r1, [r0, #0x1c]
  mov	r1, #0x0
  strb	r1, [r0, #0x1f]
  mov	r1, #0x1
  neg	r1, r1
  mov	r8, r1
  str	r1, [r0, #0x20]
  mov	r5, #0x80
  lsl	r5, r5, #0x5
  str	r5, [r0, #0x8]
  bl	UpdateSpriteAnimation
  add	r0, r7, #0
  add	r0, r0, #0x34
  ldr	r1, [r6]
  add	r1, r1, #0x20
  str	r1, [r7, #0x34]
  mov	r1, #0xe5
  lsl	r1, r1, #0x2
  strh	r1, [r0, #0xc]
  mov	r1, #0x0
  strb	r1, [r0, #0x1a]
  mov	r1, sl
  strh	r1, [r0, #0x14]
  strh	r4, [r0, #0xe]
  strh	r4, [r0, #0x16]
  mov	r1, #0x1
  neg	r1, r1
  strb	r1, [r0, #0x1b]
  mov	r1, r9
  strb	r1, [r0, #0x1c]
  mov	r1, #0x0
  strb	r1, [r0, #0x1f]
  mov	r1, r8
  str	r1, [r0, #0x20]
  str	r5, [r0, #0x8]
  bl	UpdateSpriteAnimation
  pop	{r3, r4, r5}
  mov	r8, r3
  mov	r9, r4
  mov	sl, r5
  pop	{r4, r5, r6, r7}
  pop	{r0}
  bx	r0
.Lfe3:
  .size	 sub_8046E20,.Lfe3-sub_8046E20
  .align	2, 0
  .globl	sub_8046EC0
  .type	 sub_8046EC0,function
  .thumb_func
```

## `sub_803B23C`

```c
void sub_803B23C(Sprite *s)
{
    s->tiles = VramMalloc(gUnknown_080CF770[0].numTiles);
    s->anim = gUnknown_080CF770[6].anim;
    s->variant = gUnknown_080CF770[6].variant;
    s->oamFlags = 0;
    s->animCursor = 0;
    s->qAnimDelay = Q(0);
    s->prevVariant = -1;
    s->animSpeed = SPRITE_ANIM_SPEED(1.0);
    s->palId = 0;
    s->hitboxes[0].index = HITBOX_STATE_INACTIVE;
    s->x = (DISPLAY_WIDTH / 2);
    s->y = (DISPLAY_HEIGHT / 2);
    s->frameFlags = SPRITE_FLAG(PRIORITY, 0);
    UpdateSpriteAnimation(s);
}
```

```asm
sub_803B23C:
  push	{r4, r5, lr}
  add	r4, r0, #0
  ldr	r5, .L361
  ldr	r0, [r5]
  bl	VramMalloc
  str	r0, [r4]
  ldrh	r0, [r5, #0x34]
  mov	r2, #0x0
  mov	r1, #0x0
  strh	r0, [r4, #0xc]
  add	r5, r5, #0x36
  ldrb	r0, [r5]
  strb	r0, [r4, #0x1a]
  strh	r1, [r4, #0x14]
  strh	r1, [r4, #0xe]
  strh	r1, [r4, #0x16]
  mov	r0, #0xff
  strb	r0, [r4, #0x1b]
  mov	r0, #0x10
  strb	r0, [r4, #0x1c]
  strb	r2, [r4, #0x1f]
  sub	r0, r0, #0x11
  str	r0, [r4, #0x20]
  mov	r0, #0x78
  strh	r0, [r4, #0x10]
  mov	r0, #0x50
  strh	r0, [r4, #0x12]
  str	r1, [r4, #0x8]
  add	r0, r4, #0
  bl	UpdateSpriteAnimation
  pop	{r4, r5}
  pop	{r0}
  bx	r0
.L362:
  .align	2, 0
.L361:
  .word	gUnknown_080CF770
.Lfe18:
  .size	 sub_803B23C,.Lfe18-sub_803B23C
  .align	2, 0
  .globl	sub_803B288
  .type	 sub_803B288,function
  .thumb_func
```

## `sub_8060384`

```c
void sub_8060384(Ginpe *enemy)
{
    void *tiles = ALLOC_TILES(ANIM_GINPE);
    Sprite *s = &enemy->s;
    s->tiles = tiles;

    s->anim = gUnknown_080D2004[0].anim;
    s->variant = gUnknown_080D2004[0].variant;
    s->prevVariant = -1;
    s->x = TO_WORLD_POS_RAW(I(enemy->qPos.x), enemy->region[0]) - gCamera.x;
    s->y = TO_WORLD_POS_RAW(I(enemy->qPos.y), enemy->region[1]) - gCamera.y;
    s->oamFlags = SPRITE_OAM_ORDER(18);
    s->animCursor = 0;
    s->qAnimDelay = 0;
    s->animSpeed = SPRITE_ANIM_SPEED(1.0);
    s->palId = 0;
    s->frameFlags = SPRITE_FLAG(PRIORITY, 1);

    if (enemy->direction < 0) {
        s->frameFlags |= SPRITE_FLAG_MASK_X_FLIP;
    }

    s->hitboxes[0].index = HITBOX_STATE_INACTIVE;

    UpdateSpriteAnimation(s);
}
```

```asm
sub_8060384:
  push	{r4, r5, r6, lr}
  add	r4, r0, #0
  mov	r0, #0xc
  bl	VramMalloc
  add	r6, r4, #0
  add	r6, r6, #0x28
  str	r0, [r4, #0x28]
  ldr	r1, .L12
  ldrh	r0, [r1]
  mov	r5, #0x0
  mov	r3, #0x0
  strh	r0, [r6, #0xc]
  ldrb	r0, [r1, #0x2]
  strb	r0, [r6, #0x1a]
  mov	r0, #0xff
  strb	r0, [r6, #0x1b]
  ldr	r1, [r4, #0x18]
  asr	r1, r1, #0x8
  ldrh	r0, [r4, #0xa]
  lsl	r0, r0, #0x8
  add	r1, r1, r0
  ldr	r2, .L12+0x4
  ldr	r0, [r2]
  sub	r1, r1, r0
  strh	r1, [r6, #0x10]
  ldr	r1, [r4, #0x1c]
  asr	r1, r1, #0x8
  ldrh	r0, [r4, #0xc]
  lsl	r0, r0, #0x8
  add	r1, r1, r0
  ldr	r0, [r2, #0x4]
  sub	r1, r1, r0
  strh	r1, [r6, #0x12]
  mov	r0, #0x90
  lsl	r0, r0, #0x3
  strh	r0, [r6, #0x14]
  strh	r3, [r6, #0xe]
  strh	r3, [r6, #0x16]
  mov	r0, #0x10
  strb	r0, [r6, #0x1c]
  strb	r5, [r6, #0x1f]
  mov	r1, #0x80
  lsl	r1, r1, #0x5
  str	r1, [r6, #0x8]
  mov	r0, #0x8
  ldrsb	r0, [r4, r0]
  cmp	r0, #0
  bge	.L11	@cond_branch
  mov	r0, #0x80
  lsl	r0, r0, #0x3
  orr	r0, r0, r1
  str	r0, [r6, #0x8]
.L11:
  mov	r0, #0x1
  neg	r0, r0
  str	r0, [r6, #0x20]
  add	r0, r6, #0
  bl	UpdateSpriteAnimation
  pop	{r4, r5, r6}
  pop	{r0}
  bx	r0
.L13:
  .align	2, 0
.L12:
  .word	gUnknown_080D2004
  .word	gCamera
.Lfe2:
  .size	 sub_8060384,.Lfe2-sub_8060384
  .align	2, 0
  .globl	Task_Ginpe
  .type	 Task_Ginpe,function
  .thumb_func
```

## `sub_803F188`

```c
void sub_803F188(WaterCannon *cannon)
{
    Sprite *s;
    void *tiles;

    tiles = VramMalloc(MAX_TILES(ANIM_WATER_CANNON) + MAX_TILES(ANIM_WATER_CANNON_SPLASH));
    cannon->tiles = tiles;

    s = &cannon->s;
    s->tiles = tiles;
    s->anim = ANIM_WATER_CANNON;
    s->variant = 0;
    s->oamFlags = SPRITE_OAM_ORDER(12);
    s->animCursor = 0;
    s->animCursor = 0;
    s->qAnimDelay = 0;
    s->prevVariant = -1;
    s->animSpeed = SPRITE_ANIM_SPEED(1.0);
    s->palId = 0;
    s->hitboxes[0].index = HITBOX_STATE_INACTIVE;
    s->hitboxes[1].index = HITBOX_STATE_INACTIVE;
    s->hitboxes[2].index = HITBOX_STATE_INACTIVE;
    s->frameFlags = SPRITE_FLAG(PRIORITY, 1);
    UpdateSpriteAnimation(s);
}
```

```asm
sub_803F188:
  push	{r4, lr}
  add	r4, r0, #0
  mov	r0, #0x36
  bl	VramMalloc
  add	r1, r0, #0
  str	r1, [r4, #0x6c]
  add	r0, r4, #0
  add	r0, r0, #0xc
  str	r1, [r4, #0xc]
  mov	r3, #0x0
  mov	r2, #0x0
  ldr	r1, .L40
  strh	r1, [r0, #0xc]
  strb	r3, [r0, #0x1a]
  sub	r1, r1, #0x8e
  strh	r1, [r0, #0x14]
  strh	r2, [r0, #0xe]
  strh	r2, [r0, #0x16]
  mov	r1, #0xff
  strb	r1, [r0, #0x1b]
  mov	r1, #0x10
  strb	r1, [r0, #0x1c]
  strb	r3, [r0, #0x1f]
  sub	r1, r1, #0x11
  str	r1, [r0, #0x20]
  str	r1, [r0, #0x28]
  str	r1, [r0, #0x30]
  mov	r1, #0x80
  lsl	r1, r1, #0x5
  str	r1, [r0, #0x8]
  bl	UpdateSpriteAnimation
  pop	{r4}
  pop	{r0}
  bx	r0
.L41:
  .align	2, 0
.L40:
  .word	0x38e
.Lfe3:
  .size	 sub_803F188,.Lfe3-sub_803F188
  .align	2, 0
  .globl	sub_803F1D4
  .type	 sub_803F1D4,function
  .thumb_func
```

# Functions that call the target assembly

## `CreateEntity_BuBu`

```c
void CreateEntity_BuBu(MapEntity *me, u16 regionX, u16 regionY, u8 id)
{
    struct Task *t = TaskCreate(sub_805ED48, sizeof(BuBu), 0x2100, 0, sub_805F2AC);

    BuBu *enemy = TASK_DATA(t);
    s32 qX, qY, offsetX, offsetY;

    enemy->unkE = 0;
    enemy->unk10 = 0;
    enemy->unk6 = 0;
    enemy->me = me;
    enemy->spriteX = me->x;
    enemy->id = id;
    enemy->region[0] = regionX;
    enemy->region[1] = regionY;

    qX = Q(me->x * TILE_WIDTH);
    enemy->qPos.x = qX;
    qY = Q(me->y * TILE_WIDTH);
    enemy->qPos.y = qY;

    enemy->qUnk14.x = qX;
    enemy->qUnk14.y = qY;

    enemy->unkE = 0x5A;

    offsetX = Q(me->d.sData[0] * TILE_WIDTH);
    enemy->qUnk24.x = qX + offsetX;

    offsetY = Q(me->d.uData[2] * TILE_WIDTH);
    enemy->qUnk24.y = enemy->qUnk24.x + offsetY;

    enemy->unk8 = 0;

    if (me->d.uData[4] & 0x8) {
        enemy->direction = -1;
    } else {
        enemy->direction = +1;
    }

    CpuFill16(0, &enemy->s.hitboxes[0].b.left, sizeof(enemy->s.hitboxes[1].b));

    sub_805ECC4(enemy);

    SET_MAP_ENTITY_INITIALIZED(me);
}
```

```asm
CreateEntity_BuBu:
  push	{r4, r5, r6, r7, lr}
  mov	r7, r8
  push	{r7}
  add	sp, sp, #-0x8
  mov	r8, r0
  add	r5, r1, #0
  add	r6, r2, #0
  add	r4, r3, #0
  lsl	r5, r5, #0x10
  lsr	r5, r5, #0x10
  lsl	r6, r6, #0x10
  lsr	r6, r6, #0x10
  lsl	r4, r4, #0x18
  lsr	r4, r4, #0x18
  ldr	r0, .L6
  mov	r2, #0x84
  lsl	r2, r2, #0x6
  ldr	r1, .L6+0x4
  str	r1, [sp]
  mov	r1, #0x5c
  mov	r3, #0x0
  bl	TaskCreate
  ldrh	r1, [r0, #0x6]
  mov	r0, #0xc0
  lsl	r0, r0, #0x12
  add	r7, r1, r0
  mov	r2, #0x0
  mov	r0, #0x0
  strh	r0, [r7, #0xe]
  strh	r0, [r7, #0x10]
  strb	r2, [r7, #0x6]
  mov	r0, r8
  str	r0, [r7]
  ldrb	r0, [r0]
  strb	r0, [r7, #0x5]
  strb	r4, [r7, #0x4]
  strh	r5, [r7, #0xa]
  strh	r6, [r7, #0xc]
  mov	r3, r8
  ldrb	r1, [r3]
  lsl	r1, r1, #0xb
  str	r1, [r7, #0x1c]
  ldrb	r0, [r3, #0x1]
  lsl	r0, r0, #0xb
  str	r0, [r7, #0x20]
  str	r1, [r7, #0x14]
  str	r0, [r7, #0x18]
  mov	r0, #0x5a
  strh	r0, [r7, #0xe]
  mov	r0, #0x3
  ldrsb	r0, [r3, r0]
  lsl	r0, r0, #0xb
  add	r1, r1, r0
  str	r1, [r7, #0x24]
  ldrb	r0, [r3, #0x5]
  lsl	r0, r0, #0xb
  add	r1, r1, r0
  str	r1, [r7, #0x28]
  strb	r2, [r7, #0x8]
  ldrb	r1, [r3, #0x7]
  mov	r0, #0x8
  and	r0, r0, r1
  cmp	r0, #0
  beq	.L3	@cond_branch
  mov	r0, #0xff
  b	.L5
.L7:
  .align	2, 0
.L6:
  .word	sub_805ED48
  .word	sub_805F2AC
.L3:
  mov	r0, #0x1
.L5:
  strb	r0, [r7, #0x9]
  add	r1, sp, #0x4
  mov	r0, #0x0
  strh	r0, [r1]
  add	r1, r7, #0
  add	r1, r1, #0x58
  ldr	r2, .L8
  add	r0, sp, #0x4
  bl	CpuSet
  add	r0, r7, #0
  bl	sub_805ECC4
  mov	r1, #0x2
  neg	r1, r1
  add	r0, r1, #0
  mov	r3, r8
  strb	r0, [r3]
  add	sp, sp, #0x8
  pop	{r3}
  mov	r8, r3
  pop	{r4, r5, r6, r7}
  pop	{r0}
  bx	r0
.L9:
  .align	2, 0
.L8:
  .word	0x1000002
.Lfe1:
  .size	 CreateEntity_BuBu,.Lfe1-CreateEntity_BuBu
.text
  .align	2, 0

```

# Function declaration for the target assmebly

`void sub_805ECC4(BuBu *enemy);`

# Declarations for the functions called from the target assembly

- `void *VramMalloc(u32);`
- `AnimCmdResult UpdateSpriteAnimation(Sprite *);`

# Types definitions used in the declarations

```c
typedef struct {
    /* 0x00 */ MapEntity *me;
    /* 0x04 */ u8 id;
    /* 0x05 */ u8 spriteX;
    /* 0x06 */ u8 unk6;
    /* 0x07 */ u8 unk7;
    /* 0x08 */ u8 unk8;
    /* 0x09 */ s8 direction;
    /* 0x0A */ u16 region[2];
    /* 0x0E */ u16 unkE;
    /* 0x10 */ u16 unk10;
    /* 0x12 */ u16 unk12;
    /* 0x14 */ Vec2_32 qUnk14;
    /* 0x1C */ Vec2_32 qPos;
    /* 0x24 */ Vec2_32 qUnk24;
    /* 0x2C */ s32 unk33;
    /* 0x30 */ s32 unk35;
    /* 0x34 */ Sprite s;
} BuBu /* size: 0x5C */;
```

```c
typedef struct {
    /* 0x00 */ u8 *tiles; // in VRAM
    /* 0x04 */ u32 frameNum;

    // Bitfield description from KATAM decomp
    /* 0x08 */ u32 frameFlags; // bit 0-4: affine-index / rotscale param selection
                               // bit 5: rotscale enable
                               // bit 6: rotscale double-size
                               // bit 7-8: obj mode -- different (1 bit) in SA3?
                               // bit 9
                               // bit 10 X-Flip
                               // bit 11 Y-Flip
                               // bit 12-13: priority
                               // bit 14: Animation finished
                               // bit 15-16: Background ID
                               // bit 17
                               // bit 18
                               // bit 19-25(?)
                               // bit 26
                               // bit 27-29(?)
                               // bit 30
                               // bit 31
    /* 0x0C */ u16 anim;
    /* 0x0E */ u16 animCursor;
    /* 0x10 */ s16 x;
    /* 0x12 */ s16 y;
    /* 0x14 */ s16 oamFlags; // bit 6-10: OAM order index
    /* 0x16 */ s16 qAnimDelay; // Q_8_8, in frames
    /* 0x18 */ u16 prevAnim;
    /* 0x1A */ u8 variant;
    /* 0x1B */ u8 prevVariant;

    // 0x08 = 0.5x, 0x10 = 1.0x, 0x20 = 2.0x ...
    /* 0x1C */ u8 animSpeed;

    /* 0x1D */ u8 oamBaseIndex;
    /* 0x1E */ u8 numSubFrames;
    /* 0x1F */ u8 palId; // (0 - 15)
    /* 0x20 */ Hitbox hitboxes[1];
} Sprite;
```

```c
typedef AnimCmdResult (*AnimationCommandFunc)(void *cursor, Sprite *sprite);
```

```c
typedef enum {
    ACMD_RESULT__ANIM_CHANGED = -1,
    ACMD_RESULT__ENDED = 0,
    ACMD_RESULT__RUNNING = +1,
} AnimCmdResult;
```

```c
typedef struct {
    /* 0x00 */ u8 *tiles; // in VRAM
    /* 0x04 */ u32 frameNum;

    // Bitfield description from KATAM decomp
    /* 0x08 */ u32 frameFlags; // bit 0-4: affine-index / rotscale param selection
                               // bit 5: rotscale enable
                               // bit 6: rotscale double-size
                               // bit 7-8: obj mode -- different (1 bit) in SA3?
                               // bit 9
                               // bit 10 X-Flip
                               // bit 11 Y-Flip
                               // bit 12-13: priority
                               // bit 14: Animation finished
                               // bit 15-16: Background ID
                               // bit 17
                               // bit 18
                               // bit 19-25(?)
                               // bit 26
                               // bit 27-29(?)
                               // bit 30
                               // bit 31
    /* 0x0C */ u16 anim;
    /* 0x0E */ u16 animCursor;
    /* 0x10 */ s16 x;
    /* 0x12 */ s16 y;
    /* 0x14 */ s16 oamFlags; // bit 6-10: OAM order index
    /* 0x16 */ s16 qAnimDelay; // Q_8_8, in frames
    /* 0x18 */ u16 prevAnim;
    /* 0x1A */ u8 variant;
    /* 0x1B */ u8 prevVariant;

    // 0x08 = 0.5x, 0x10 = 1.0x, 0x20 = 2.0x ...
    /* 0x1C */ u8 animSpeed;

    /* 0x1D */ u8 oamBaseIndex;
    /* 0x1E */ u8 numSubFrames;
    /* 0x1F */ u8 palId; // (0 - 15)
    /* 0x20 */ Hitbox hitboxes[1];
} Sprite;
```

```c
typedef enum {
    ACMD_RESULT__ANIM_CHANGED = -1,
    ACMD_RESULT__ENDED = 0,
    ACMD_RESULT__RUNNING = +1,
} AnimCmdResult;
```

```c
typedef AnimCmdResult (*AnimationCommandFunc)(void *cursor, Sprite *sprite);
```

# Primary Objective

Decompile the following target assembly function into clean, readable C code that compiles to an assembly matching EXACTLY the original one.

```asm
  thumb_func_start sub_805ECC4
sub_805ECC4: @ 0x0805ECC4
  push {r4, r5, r6, lr}
  adds r4, r0, #0
  movs r0, #0xc
  bl VramMalloc
  adds r6, r4, #0
  adds r6, #0x2c
  str r0, [r4, #0x2c]
  ldr r1, _0805ED40 @ =gUnknown_080D1F8C
  ldrh r0, [r1]
  movs r5, #0
  movs r3, #0
  strh r0, [r6, #0xc]
  ldrb r0, [r1, #2]
  strb r0, [r6, #0x1a]
  movs r0, #0xff
  strb r0, [r6, #0x1b]
  ldr r1, [r4, #0x1c]
  asrs r1, r1, #8
  ldrh r0, [r4, #0xa]
  lsls r0, r0, #8
  adds r1, r1, r0
  ldr r2, _0805ED44 @ =gCamera
  ldr r0, [r2]
  subs r1, r1, r0
  strh r1, [r6, #0x10]
  ldr r1, [r4, #0x20]
  asrs r1, r1, #8
  ldrh r0, [r4, #0xc]
  lsls r0, r0, #8
  adds r1, r1, r0
  ldr r0, [r2, #4]
  subs r1, r1, r0
  strh r1, [r6, #0x12]
  movs r0, #0x90
  lsls r0, r0, #3
  strh r0, [r6, #0x14]
  strh r3, [r6, #0xe]
  strh r3, [r6, #0x16]
  movs r0, #0x10
  strb r0, [r6, #0x1c]
  strb r5, [r6, #0x1f]
  movs r1, #0x80
  lsls r1, r1, #5
  str r1, [r6, #8]
  movs r0, #9
  ldrsb r0, [r4, r0]
  cmp r0, #0
  bge _0805ED2E
  movs r0, #0x80
  lsls r0, r0, #3
  orrs r0, r1
  str r0, [r6, #8]
_0805ED2E:
  movs r0, #1
  rsbs r0, r0, #0
  str r0, [r6, #0x20]
  adds r0, r6, #0
  bl UpdateSpriteAnimation
  pop {r4, r5, r6}
  pop {r0}
  bx r0
  .align 2, 0
_0805ED40: .4byte gUnknown_080D1F8C
_0805ED44: .4byte gCamera

```

# Implementation Process

1. Code Analysis

- Carefully analyze the original assembly function
- Identify function parameters, return values, and local variables
- Map register usage and memory access patterns
- Understand the control flow and logic structure

2. C Code Generation

- Add your decompiled function to `bu_bu.c`

- Write clean, readable C code following these guidelines:

  - Use meaningful variable names
  - Avoid unnecessary goto statements - prefer structured control flow (if/else, loops)
  - Minimize pointer arithmetic where possible
  - Avoid unnecessary type casts
  - Use appropriate data types that match the assembly operations
  - Maintain the code styleguide
  - Before adding a new type definition, search in the codebase if this struct already exists and reuse them whenever possible

- You might need to update the `BuBu` struct defined from `bu_bu.c` if you identify that the struct might be wrong.
- If you update the `BuBu` struct, check how it affects the other functions and update them according the changes, preserving the same original assembly when compiling them.

3. Compilation and Verification Loop

- Build the project calling `make`
- Check if the compilation succeeds
- Verify that the checksum matches the original
- If checksum fails, examine the differences by running `sh get_diff.sh`
- Compare your generated assembly with the original assembly function
- Identify discrepancies and adjust your C code accordingly

4. Iterative Refinement

- Repeat the build-check-modify cycle until perfect match is achieved
- Make incremental changes to preserve working parts
- Document any challenging sections or assumptions made

# Success Criteria

- CRITICAL: Your C code MUST compile to assembly that matches the original exactly
- No checksum errors when building with make
- Code is readable and maintainable
- All functionality is preserved

# Termination Condition

- STOP ONLY WHEN: There are no more checksum errors when building. The decompilation is complete only when the generated assembly is byte-for-byte identical to the original.

# Additional Guidelines

- Test after each significant change
- Keep backup copies of working versions
- If stuck, try different approaches (different variable types, control structures, etc.)
- Pay attention to compiler optimizations that might affect output
- Consider alignment, padding, and memory layout effects
- Ignore the file `kappa-db.json`
