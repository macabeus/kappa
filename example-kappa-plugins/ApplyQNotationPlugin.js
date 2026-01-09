/**
 * Plugin to add the Q notation to assignments for fields named `x` or `y` in a record.
 *
 * For example, for the given file:
 *
 * ```c
 * #include <stdio.h>
 *
 * #define Q_24_8(n) ((s32)((n) * 256))
 * #define Q(n) Q_24_8(n)
 *
 * typedef int32_t s32;
 *
 * typedef struct {
 *   s32 x;
 *   s32 y;
 * } Vec2_32;
 *
 * struct Example {
 *   Vec2_32 qValue;
 * };
 *
 * int main() {               // <-- Let's run the plugin on this function
 *   struct Example example;
 *   example.qValue.x = 0x100;
 *   example.qValue.y = 0x80;
 *
 *   return 0;
 * }
 * ```
 *
 * The function will be transformed to:
 *
 * ```c
 * int main() {
 *   struct Example example;
 *   example.qValue.x = Q(1);
 *   example.qValue.y = Q(0.5);
 *
 *   return 0;
 * }
 * ```
 */

export default class ApplyQNotationPlugin {
  get testsSpec() {
    return [
      {
        name: 'Convert hex to Q notation',
        description: 'Replaces integer assignments with Q notation for Vec2_32 fields',
        given: `
          #include <stdio.h>

          #define Q_24_8(n) ((s32)((n) * 256))
          #define Q(n) Q_24_8(n)

          typedef int32_t s32;

          typedef struct {
            s32 x;
            s32 y;
          } Vec2_32;

          struct Example {
            Vec2_32 qValue;
          };

          //   *
          int main() {
            struct Example example;
            example.qValue.x = 0x100;
            example.qValue.y = 0x80;
            return 0;
          }
        `,
        then: `
          #include <stdio.h>

          #define Q_24_8(n) ((s32)((n) * 256))
          #define Q(n) Q_24_8(n)

          typedef int32_t s32;

          typedef struct {
            s32 x;
            s32 y;
          } Vec2_32;

          struct Example {
            Vec2_32 qValue;
          };

          //   *
          int main() {
            struct Example example;
            example.qValue.x = Q(1);
            example.qValue.y = Q(0.5);
            return 0;
          }
        `,
      },
    ];
  }

  async visitAssignmentExpression(node, visitor) {
    const children = node.children();
    if (children.length === 3 && children[1].text() === '=' && children[2].kind() === 'number_literal') {
      const leftChild = children[0];
      const rightChild = children[2];

      // Check if the left side is a field access like example.qValue.x
      if (leftChild.kind() === 'field_expression') {
        const leftChildText = leftChild.text();
        if (leftChildText.endsWith('.x') || leftChildText.endsWith('.y')) {
          const rawValue = Number(rightChild.text());
          const qNotationValue = rawValue / 256;

          visitor.updateDocumentNodeWithRawCode(rightChild, `Q(${qNotationValue})`);
        }
      }
    }
  }
}
