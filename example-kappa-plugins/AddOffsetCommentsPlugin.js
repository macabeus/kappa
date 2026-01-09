/**
 * Plugin to add offset comments to record fields and a size comment to the record.
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
 *   /* 0x00 *\/ s32 x;
 *   /* 0x04 *\/ s32 y;
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
 * The struct will be transformed to (with 8-byte alignment):
 *
 * ```c
 * typedef struct {
 * /* 0x00 *\/ u8 foo;         // 1 byte
 * /* 0x08 *\/ Vec2_32 qValue; // aligned to 8-byte boundary
 * /* 0x10 *\/ u16 bar;        // aligned to 2-byte boundary
 * /* 0x14 *\/ s32 baz;        // aligned to 4-byte boundary
 * } Example; /* size: 0x18 *\/ // final size aligned to 8-byte boundary
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

export default class AddOffsetCommentsPlugin {
  get testsSpec() {
    return [
      {
        name: 'Simple',
        description: 'It adds offset comments to a self-contained struct',
        given: `
          #include <stdint.h>

          typedef uint8_t u8;
          typedef uint16_t u16;
          typedef int16_t s32;

          //       *
          typedef struct {
            u8 foo;
            u16 bar;
            s32 baz;
          } Example;
        `,
        then: `
          #include <stdint.h>

          typedef uint8_t u8;
          typedef uint16_t u16;
          typedef int16_t s32;

          //       *
          typedef struct {
            /* 0x00 */ u8 foo;
            /* 0x02 */ u16 bar;
            /* 0x04 */ s32 baz;
          } Example; /* size: 0x08 */
        `,
      },

      {
        name: 'Transitive Struct',
        description: 'It adds offset comments to a struct that uses another struct',
        given: `
          #include <stdint.h>

          typedef uint8_t u8;
          typedef uint16_t u16;
          typedef int16_t s32;
          typedef int16_t u32;

          typedef struct {
            /* 0x00 */ s32 x;
            /* 0x04 */ s32 y;
          } Vec2_32; /* size: 0x08 */

          //       *
          typedef struct {
            u8 foo;
            Vec2_32 qValue;
            u16 bar;
            s32 baz;
            u32 qux;
          } Example;
        `,
        then: `
          #include <stdint.h>

          typedef uint8_t u8;
          typedef uint16_t u16;
          typedef int16_t s32;
          typedef int16_t u32;

          typedef struct {
            /* 0x00 */ s32 x;
            /* 0x04 */ s32 y;
          } Vec2_32; /* size: 0x08 */

          //       *
          typedef struct {
            /* 0x00 */ u8 foo;
            /* 0x08 */ Vec2_32 qValue;
            /* 0x10 */ u16 bar;
            /* 0x14 */ s32 baz;
            /* 0x18 */ u32 qux;
          } Example; /* size: 0x20 */
        `,
      },
    ];
  }

  async visitStructSpecifier(node, visitor) {
    let lastOffset = 0;

    const fieldDeclarationNodes = node.findAll({
      rule: { kind: 'field_declaration' },
    });

    for (const fieldDeclarationNode of fieldDeclarationNodes) {
      const fieldTypeNode = fieldDeclarationNode.find({
        rule: { kind: 'type_identifier' },
      });

      const size = mapTypeToSize[fieldTypeNode.text()] ?? getSize(fieldTypeNode, visitor);
      const alignedOffset = getAlignedOffset(lastOffset, size);

      visitor.addLeadingComment(fieldDeclarationNode, `0x${alignedOffset.toString(16).padStart(2, '0').toUpperCase()}`);

      lastOffset = alignedOffset + size;
    }

    // Apply final alignment to the total struct size
    const finalSize = getAlignedOffset(lastOffset, MEMORY_ALIGNMENT);
    visitor.addTrailingComment(node, `size: 0x${finalSize.toString(16).padStart(2, '0').toUpperCase()}`, true);
  }
}
