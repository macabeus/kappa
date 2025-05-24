export default class DoubleIntAssignmentPlugin {
  nodeTypes = ['BinaryOperator'];

  async visit(node, visitor) {
    if (node.detail === '=' && node.children?.[1].kind === 'IntegerLiteral') {
      const leftChild = node.children[0];

      const leftChildType = visitor.getNodeType(leftChild);
      console.log(`Assignment to variable of type: ${leftChildType}`);

      if (leftChildType === 'int') {
        const rightChild = node.children[1];
        rightChild.detail = `${Number(rightChild.detail) * 2}`;

        await visitor.updateDocumentFromNode(rightChild);
      }
    }
  }
}
