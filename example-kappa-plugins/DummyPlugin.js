/**
 * Dummy plugin to print all node kind.
 */

export default class TestPlugin {
  async visitAny(node, visitor) {
    console.log(`TestPlugin visited node of type: ${node.kind}`);
  }
}
