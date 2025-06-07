/**
 * Plugin to add the Q notation to assignments for a `Vec2_32` field in a record.
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

  async visitBinaryOperator(node, visitor) {
    if (node.detail === '=' && node.children?.[1].kind === 'IntegerLiteral') {
      const leftChild = node.children[0];

      if (leftChild.children?.[0] && visitor.getNodeType(leftChild.children[0]) === 'Vec2_32') {
        const leftChildType = visitor.getNodeType(leftChild);

        if (leftChildType === 's32') {
          const rightChild = node.children[1];
          const rawValue = Number(rightChild.detail);
          const qNotationValue = rawValue / 256;

          visitor.updateDocumentNodeWithRawCode(rightChild, `Q(${qNotationValue})`);
        }
      }
    }
  }
}
