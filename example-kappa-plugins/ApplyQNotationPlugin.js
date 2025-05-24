export default class ApplyQNotationPlugin {
  async visitBinaryOperator(node, visitor) {
    if (node.detail === '=' && node.children?.[1].kind === 'IntegerLiteral') {
      const leftChild = node.children[0];

      if (leftChild.children?.[0] && visitor.getNodeType(leftChild.children[0]) === 'Vec2_32') {
        const leftChildType = visitor.getNodeType(leftChild);

        if (leftChildType === 's32') {
          const rightChild = node.children[1];
          const rawValue = Number(rightChild.detail);
          const qNotationValue = rawValue / 256;

          await visitor.updateDocumentNodeWithRawCode(rightChild, `Q(${qNotationValue})`);
        }
      }
    }
  }
}
