/**
 * Plugin to duplicate the interger from any assignment.
 *
 * For example, for the given file:
 *
 * ```c
 * int main() {   // <-- Let's run the plugin on this function
 *   int x;
 *   x = 42;
 *   return 0;
 * }
 * ```
 *
 * The function will be transformed to:
 *
 * ```c
 * int main() {
 *   int x;
 *   x = 84;
 *   return 0;
 * }
 * ```
 */

export default class DoubleIntAssignmentPlugin {
  get testsSpec() {
    return [
      {
        name: 'Double integer assignment',
        description: 'Replaces integer assignments with its double value',
        given: `
          //   *
          int main() {
            int x;
            x = 42;
            return 0;
          }
        `,
        then: `
          //   *
          int main() {
            int x;
            x = 84;
            return 0;
          }
        `,
      },
    ];
  }

  async visitBinaryOperator(node, visitor) {
    if (node.detail === '=' && node.children?.[1].kind === 'IntegerLiteral') {
      const leftChild = node.children[0];

      const leftChildType = visitor.getNodeType(leftChild);

      if (leftChildType === 'int') {
        const rightChild = node.children[1];
        rightChild.detail = `${Number(rightChild.detail) * 2}`;

        visitor.updateDocumentFromNode(rightChild);
      }
    }
  }
}
