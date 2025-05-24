export default class TestPlugin {
  nodeTypes = ['*']; // Handle all node types

  async visit(node, visitor) {
    console.log(`TestPlugin visited node of type: ${node.kind}`);
  }
}
