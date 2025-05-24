export default class DoubleIntAssignmentPlugin {
  async visitBinaryOperator(node, visitor) {
    if (node.detail === '=' && node.children?.[1].kind === 'IntegerLiteral') {
      const leftChild = node.children[0];

      const leftChildType = visitor.getNodeType(leftChild);

      if (leftChildType === 'int') {
        const rightChild = node.children[1];
        rightChild.detail = `${Number(rightChild.detail) * 2}`;

        await visitor.updateDocumentFromNode(rightChild);
      }
    }
  }
}
