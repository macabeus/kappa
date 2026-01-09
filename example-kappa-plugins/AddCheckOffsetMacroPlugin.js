/**
 * Plugin to add `CHECK_OFFSET_X86` after a struct to ensure that the offsets of its fields are correct.
 * This plugin considers memory alignment when calculating offsets.
 *
 * For example, for the given file:
 *
 * ```c
 * #include <stdint.h>
 *
 * typedef uint8_t u8;
 * typedef uint16_t u16;
 * typedef int16_t s32;
 *
 * typedef struct {
 *   s32 x;
 *   s32 y;
 * } Vec2_32; /* size: 0x08 *\/
 *
 * typedef struct {            // <-- Let's run the plugin on this record
 *   u8 foo;
 *   Vec2_32 qValue;
 *   u16 bar;
 *   s32 baz;
 * } Example;
 * ```
 *
 * We'll add after the struct:
 *
 * ```c
 * CHECK_OFFSET_X86(Example, foo, 0x00);
 * CHECK_OFFSET_X86(Example, qValue, 0x08);
 * CHECK_OFFSET_X86(Example, bar, 0x10);
 * CHECK_OFFSET_X86(Example, baz, 0x14);
 * CHECK_OFFSET_X86(Example, size, 0x18);
 * ```
 */

const MEMORY_ALIGNMENT = 8; // 8-byte alignment by default

const mapTypeToSize = {
  u8: 1,
  u16: 2,
  u32: 4,
  u64: 8,
  u128: 16,
  s8: 1,
  s16: 2,
  s32: 4,
  s64: 8,
  s128: 16,
};

/**
 * Calculate the aligned offset based on the current offset and field size
 * @param {number} currentOffset - The current offset
 * @param {number} fieldSize - The size of the field to be placed
 * @param {number} alignment - The memory alignment (default: MEMORY_ALIGNMENT)
 * @returns {number} The aligned offset
 */
const getAlignedOffset = (currentOffset, fieldSize, alignment = MEMORY_ALIGNMENT) => {
  // For fields smaller than the alignment, align to the field size
  // For fields larger than or equal to the alignment, align to the alignment boundary
  const alignTo = Math.min(fieldSize, alignment);

  // Calculate padding needed to align to the boundary
  const remainder = currentOffset % alignTo;
  if (remainder === 0) {
    return currentOffset;
  }

  return currentOffset + (alignTo - remainder);
};

const getSize = (identifierNode, visitor) => {
  const definition = visitor.getIdentifierDeclaration(identifierNode, visitor.rootNode);
  if (!definition) {
    return null;
  }

  const traillingComment = visitor.getTrailingComment(definition);
  if (!traillingComment) {
    return null;
  }

  const sizeMatch = traillingComment.match(/size:\s*0x([0-9a-fA-F]+)/);
  if (!sizeMatch) {
    return null;
  }

  const size = parseInt(sizeMatch[1], 16);

  return size;
};

export default class AddCheckOffsetMacroPlugin {
  get testsSpec() {
    return [
      {
        name: 'Simple',
        description: 'It adds the macros to a self-contained struct',
        given: `
          #include <stdint.h>

          typedef uint8_t u8;
          typedef uint16_t u16;
          typedef int16_t s32;

          //       *
          typedef struct {
            s32 x;
            s32 y;
          } Simple;
        `,
        then: `
          #include <stdint.h>

          typedef uint8_t u8;
          typedef uint16_t u16;
          typedef int16_t s32;

          //       *
          typedef struct {
            s32 x;
            s32 y;
          } Simple; /* size: 0x08 */
          CHECK_OFFSET_X86(Simple, x, 0x00);
          CHECK_OFFSET_X86(Simple, y, 0x04);
        `,
      },

      {
        name: 'Transitive Struct',
        description: 'It adds the macros to a struct that uses another struct',
        given: `
          #include <stdint.h>

          typedef uint8_t u8;
          typedef uint16_t u16;
          typedef int16_t s32;

          typedef struct {
            s32 x;
            s32 y;
          } Vec2__32; /* size: 0x08 */

          //       *
          typedef struct {
            u8 foo;
            Vec2__32 qValue;
            u16 bar;
            s32 baz;
          } Example;
        `,
        then: `
          #include <stdint.h>

          typedef uint8_t u8;
          typedef uint16_t u16;
          typedef int16_t s32;

          typedef struct {
            s32 x;
            s32 y;
          } Vec2__32; /* size: 0x08 */

          //       *
          typedef struct {
            u8 foo;
            Vec2__32 qValue;
            u16 bar;
            s32 baz;
          } Example; /* size: 0x18 */
          CHECK_OFFSET_X86(Example, foo, 0x00);
          CHECK_OFFSET_X86(Example, qValue, 0x08);
          CHECK_OFFSET_X86(Example, bar, 0x10);
          CHECK_OFFSET_X86(Example, baz, 0x14);
        `,
      },
    ];
  }

  async visitStructSpecifier(node, visitor) {
    let lastOffset = 0;

    let structName = '';
    if (node.parent().kind() === 'type_definition') {
      structName = node.parent().children().at(-2).text();
    } else {
      structName = node.children()[1].text();
    }

    const fieldDeclarationNodes = node.findAll({
      rule: { kind: 'field_declaration' },
    });

    for (const fieldDeclarationNode of fieldDeclarationNodes) {
      const fieldTypeNode = fieldDeclarationNode.find({
        rule: { kind: 'type_identifier' },
      });

      const fieldIdentifierNode = fieldDeclarationNode.find({
        rule: { kind: 'field_identifier' },
      });

      const size = mapTypeToSize[fieldTypeNode.text()] ?? getSize(fieldTypeNode, visitor);
      const alignedOffset = getAlignedOffset(lastOffset, size);

      visitor.insertLineAfterNode(
        node,
        `CHECK_OFFSET_X86(${structName}, ${fieldIdentifierNode.text()}, 0x${alignedOffset
          .toString(16)
          .padStart(2, '0')
          .toUpperCase()});`,
      );

      lastOffset = alignedOffset + size;
    }

    // Apply final alignment to the total struct size
    const finalSize = getAlignedOffset(lastOffset, MEMORY_ALIGNMENT);
    visitor.addTrailingComment(node, `size: 0x${finalSize.toString(16).padStart(2, '0').toUpperCase()}`, true);
  }
}
