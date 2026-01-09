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

  async visitAssignmentExpression(node, visitor) {
    const children = node.children();
    if (children.length === 3 && children[1].text() === '=' && children[2].kind() === 'number_literal') {
      const leftChild = children[0];
      const rightChild = children[2];

      const leftChildKind = leftChild.kind();
      if (leftChildKind === 'identifier') {
        const newValue = `${Number(rightChild.text()) * 2}`;
        visitor.updateDocumentNodeWithRawCode(rightChild, newValue);
      }
    }
  }
}
