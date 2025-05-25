/**
 * Plugin to add offset comments to record fields and a size comment to the record.
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
 * typedef struct {       // <-- Let's run the plugin on this record
 *   u8 foo;
 *   Vec2_32 qValue;
 *   u16 bar;
 *   s32 baz;
 * } Example;
 * ```
 *
 * The struct will be transformed to:
 *
 * ```c
 * typedef struct {
 * /* 0x00 *\/ u8 foo;
 * /* 0x01 *\/ Vec2_32 qValue;
 * /* 0x09 *\/ u16 bar;
 * /* 0x0B *\/ s32 baz;
 * } Aotento; /* size: 0x0F *\/
 * ```
 */

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

const getSize = async (node, visitor) => {
  const definition = await visitor.getDefinition(node);
  if (!definition) {
    return null;
  }

  const traillingComment = await visitor.getTrailingComment(definition);
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
  async visitRecord(node, visitor) {
    let lastOffset = 0;

    for (const child of node.children) {
      if (child.kind === 'Field') {
        await visitor.addLeadingComment(child, `0x${lastOffset.toString(16).padStart(2, '0').toUpperCase()}`);

        const type = visitor.getNodeType(child);
        const size = mapTypeToSize[type] ?? (await getSize(child, visitor));

        lastOffset += size;
      }
    }

    await visitor.addTrailingComment(node, `size: 0x${lastOffset.toString(16).padStart(2, '0').toUpperCase()}`, true);
  }
}
