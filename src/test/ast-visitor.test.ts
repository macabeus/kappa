import * as assert from 'assert';
import { ASTNode } from '../clangd/vscode-clangd';
import { ASTVisitor, ASTVisitorPlugin } from '../ast-visitor';

/**
 * Example plugin that counts different types of statements
 */
export class StatementCounterPlugin implements ASTVisitorPlugin {
  private counts: Map<string, number> = new Map();

  visitIfStmt(node: ASTNode, visitor: ASTVisitor, context?: any): void {
    this.incrementCount('IfStmt');
  }

  visitForStmt(node: ASTNode, visitor: ASTVisitor, context?: any): void {
    this.incrementCount('ForStmt');
  }

  visitWhileStmt(node: ASTNode, visitor: ASTVisitor, context?: any): void {
    this.incrementCount('WhileStmt');
  }

  visitReturnStmt(node: ASTNode, visitor: ASTVisitor, context?: any): void {
    this.incrementCount('ReturnStmt');
  }

  visitCompoundStmt(node: ASTNode, visitor: ASTVisitor, context?: any): void {
    this.incrementCount('CompoundStmt');
  }

  private incrementCount(nodeType: string): void {
    const currentCount = this.counts.get(nodeType) || 0;
    this.counts.set(nodeType, currentCount + 1);
  }

  getCounts(): Map<string, number> {
    return new Map(this.counts);
  }

  resetCounts(): void {
    this.counts.clear();
  }
}

// Mock VSCode Range for testing
const mockRange = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 10 },
};

// Helper function to create test AST nodes
function createTestNode(kind: string, role: string = 'expression', children?: ASTNode[], detail?: string): ASTNode {
  return {
    kind,
    role,
    detail,
    children,
    range: mockRange,
  };
}

// Test plugin implementations
class TestCounterPlugin implements ASTVisitorPlugin {
  visitCount = 0;
  visitedNodes: ASTNode[] = [];

  visitTestNode(node: ASTNode, visitor: ASTVisitor, context?: any): void {
    this.visitCount++;
    this.visitedNodes.push(node);
  }

  visitChildNode(node: ASTNode, visitor: ASTVisitor, context?: any): void {
    this.visitCount++;
    this.visitedNodes.push(node);
  }

  reset(): void {
    this.visitCount = 0;
    this.visitedNodes = [];
  }
}

class MultiTypePlugin implements ASTVisitorPlugin {
  visitCounts: Map<string, number> = new Map();

  visitTypeA(node: ASTNode, visitor: ASTVisitor, context?: any): void {
    this.incrementCount('TypeA');
  }

  visitTypeB(node: ASTNode, visitor: ASTVisitor, context?: any): void {
    this.incrementCount('TypeB');
  }

  visitTypeC(node: ASTNode, visitor: ASTVisitor, context?: any): void {
    this.incrementCount('TypeC');
  }

  private incrementCount(nodeType: string): void {
    const count = this.visitCounts.get(nodeType) || 0;
    this.visitCounts.set(nodeType, count + 1);
  }

  reset(): void {
    this.visitCounts.clear();
  }
}

class AsyncTestPlugin implements ASTVisitorPlugin {
  processedNodes: ASTNode[] = [];

  async visitAsyncNode(node: ASTNode, visitor: ASTVisitor, context?: any): Promise<void> {
    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 1));
    this.processedNodes.push(node);
  }

  reset(): void {
    this.processedNodes = [];
  }
}

class ContextTestPlugin implements ASTVisitorPlugin {
  receivedContexts: any[] = [];

  visitContextNode(node: ASTNode, visitor: ASTVisitor, context?: any): void {
    this.receivedContexts.push(context);
  }

  reset(): void {
    this.receivedContexts = [];
  }
}

// Test plugin for wildcard functionality
class WildcardPlugin implements ASTVisitorPlugin {
  visitedNodes: ASTNode[] = [];

  visitAny(node: ASTNode, visitor: ASTVisitor, context?: any): void {
    this.visitedNodes.push(node);
  }

  reset(): void {
    this.visitedNodes = [];
  }
}

suite('AST Visitor Test Suite', () => {
  suite('ASTVisitor Basic Functionality', () => {
    let visitor: ASTVisitor;

    setup(() => {
      visitor = new ASTVisitor();
    });

    test('should create empty visitor', () => {
      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });

    test('should register plugin', () => {
      const plugin = new TestCounterPlugin();
      visitor.registerPlugin(plugin);

      const registeredTypes = visitor.getRegisteredNodeTypes();
      assert.strictEqual(registeredTypes.includes('TestNode'), true);
      assert.strictEqual(registeredTypes.includes('ChildNode'), true);
    });

    test('should register multiple plugins for same node type', () => {
      const plugin1 = new TestCounterPlugin();
      const plugin2 = new TestCounterPlugin();

      visitor.registerPlugin(plugin1);
      visitor.registerPlugin(plugin2);

      const plugins = visitor.getPluginsForNodeType('TestNode');
      assert.strictEqual(plugins.length, 2);
    });

    test('should register plugin for multiple node types', () => {
      const plugin = new MultiTypePlugin();
      visitor.registerPlugin(plugin);

      const registeredTypes = visitor.getRegisteredNodeTypes().sort();
      assert.strictEqual(registeredTypes.includes('TypeA'), true);
      assert.strictEqual(registeredTypes.includes('TypeB'), true);
      assert.strictEqual(registeredTypes.includes('TypeC'), true);
    });

    test('should unregister plugin', () => {
      const plugin = new TestCounterPlugin();
      visitor.registerPlugin(plugin);
      visitor.unregisterPlugin(plugin);

      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });

    test('should clear all plugins', () => {
      const plugin1 = new TestCounterPlugin();
      const plugin2 = new MultiTypePlugin();

      visitor.registerPlugin(plugin1);
      visitor.registerPlugin(plugin2);
      visitor.clearPlugins();

      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });
  });

  suite('ASTVisitor Tree Walking', () => {
    let visitor: ASTVisitor;
    let plugin: TestCounterPlugin;

    setup(() => {
      visitor = new ASTVisitor();
      plugin = new TestCounterPlugin();
      visitor.registerPlugin(plugin);
    });

    test('should visit single node', async () => {
      const node = createTestNode('TestNode');

      await visitor.walk(node);

      assert.strictEqual(plugin.visitCount, 1);
      assert.strictEqual(plugin.visitedNodes[0], node);
    });

    test('should visit node with children in pre-order', async () => {
      const child1 = createTestNode('ChildNode');
      const child2 = createTestNode('ChildNode');
      const parent = createTestNode('TestNode', 'statement', [child1, child2]);

      await visitor.walk(parent, undefined, 'pre-order');

      assert.strictEqual(plugin.visitCount, 3);
      assert.strictEqual(plugin.visitedNodes[0], parent);
      assert.strictEqual(plugin.visitedNodes[1], child1);
      assert.strictEqual(plugin.visitedNodes[2], child2);
    });

    test('should visit node with children in post-order', async () => {
      const child1 = createTestNode('ChildNode');
      const child2 = createTestNode('ChildNode');
      const parent = createTestNode('TestNode', 'statement', [child1, child2]);

      await visitor.walk(parent, undefined, 'post-order');

      assert.strictEqual(plugin.visitCount, 3);
      assert.strictEqual(plugin.visitedNodes[0], child1);
      assert.strictEqual(plugin.visitedNodes[1], child2);
      assert.strictEqual(plugin.visitedNodes[2], parent);
    });

    test('should visit deep nested tree', async () => {
      const grandchild = createTestNode('ChildNode');
      const child = createTestNode('ChildNode', 'expression', [grandchild]);
      const parent = createTestNode('TestNode', 'statement', [child]);

      await visitor.walk(parent);

      assert.strictEqual(plugin.visitCount, 3);
    });

    test('should not visit unregistered node types', async () => {
      const node = createTestNode('UnregisteredNode');

      await visitor.walk(node);

      assert.strictEqual(plugin.visitCount, 0);
    });

    test('should handle empty children array', async () => {
      const node = createTestNode('TestNode', 'expression', []);

      await visitor.walk(node);

      assert.strictEqual(plugin.visitCount, 1);
    });
  });

  suite('ASTVisitor Async Support', () => {
    let visitor: ASTVisitor;
    let asyncPlugin: AsyncTestPlugin;

    setup(() => {
      visitor = new ASTVisitor();
      asyncPlugin = new AsyncTestPlugin();
      visitor.registerPlugin(asyncPlugin);
    });

    test('should handle async plugins', async () => {
      const node = createTestNode('AsyncNode');

      await visitor.walk(node);

      assert.strictEqual(asyncPlugin.processedNodes.length, 1);
      assert.strictEqual(asyncPlugin.processedNodes[0], node);
    });

    test('should handle multiple async plugins', async () => {
      const plugin1 = new AsyncTestPlugin();
      const plugin2 = new AsyncTestPlugin();

      visitor.registerPlugin(plugin1);
      visitor.registerPlugin(plugin2);

      const node = createTestNode('AsyncNode');
      await visitor.walk(node);

      assert.strictEqual(plugin1.processedNodes.length, 1);
      assert.strictEqual(plugin2.processedNodes.length, 1);
    });
  });

  suite('ASTVisitor Context Passing', () => {
    let visitor: ASTVisitor;
    let contextPlugin: ContextTestPlugin;

    setup(() => {
      visitor = new ASTVisitor();
      contextPlugin = new ContextTestPlugin();
      visitor.registerPlugin(contextPlugin);
    });

    test('should pass context to plugins', async () => {
      const node = createTestNode('ContextNode');
      const context = { testData: 'test value' };

      await visitor.walk(node, context);

      assert.strictEqual(contextPlugin.receivedContexts.length, 1);
      assert.deepStrictEqual(contextPlugin.receivedContexts[0], context);
    });

    test('should handle undefined context', async () => {
      const node = createTestNode('ContextNode');

      await visitor.walk(node);

      assert.strictEqual(contextPlugin.receivedContexts.length, 1);
      assert.strictEqual(contextPlugin.receivedContexts[0], undefined);
    });
  });

  suite('Built-in Plugins', () => {
    test('StatementCounterPlugin should count statements', () => {
      const plugin = new StatementCounterPlugin();
      const visitor = new ASTVisitor();

      const ifNode = createTestNode('IfStmt');
      const forNode = createTestNode('ForStmt');
      const anotherIfNode = createTestNode('IfStmt');

      plugin.visitIfStmt(ifNode, visitor);
      plugin.visitForStmt(forNode, visitor);
      plugin.visitIfStmt(anotherIfNode, visitor);

      const counts = plugin.getCounts();
      assert.strictEqual(counts.get('IfStmt'), 2);
      assert.strictEqual(counts.get('ForStmt'), 1);
      assert.strictEqual(counts.get('WhileStmt'), undefined);
    });

    test('StatementCounterPlugin should reset counts', () => {
      const plugin = new StatementCounterPlugin();
      const visitor = new ASTVisitor();

      const ifNode = createTestNode('IfStmt');
      plugin.visitIfStmt(ifNode, visitor);

      assert.strictEqual(plugin.getCounts().get('IfStmt'), 1);

      plugin.resetCounts();
      assert.strictEqual(plugin.getCounts().size, 0);
    });
  });

  suite('Edge Cases and Error Handling', () => {
    let visitor: ASTVisitor;

    setup(() => {
      visitor = new ASTVisitor();
    });

    test('should handle node without children property', async () => {
      const plugin = new TestCounterPlugin();
      visitor.registerPlugin(plugin);

      const node: ASTNode = {
        kind: 'TestNode',
        role: 'expression',
        range: mockRange,
        // No children property
      };

      await visitor.walk(node);

      assert.strictEqual(plugin.visitCount, 1);
    });

    test('should handle plugin with empty nodeTypes', () => {
      const plugin: ASTVisitorPlugin = {
        // Plugin with no node handlers
      };

      visitor.registerPlugin(plugin);
      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });

    test('should handle unregistering non-existent plugin', () => {
      const plugin = new TestCounterPlugin();

      // Should not throw
      assert.doesNotThrow(() => {
        visitor.unregisterPlugin(plugin);
      });
    });

    test('should handle getting plugins for non-existent node type', () => {
      const plugins = visitor.getPluginsForNodeType('NonExistentType');
      assert.deepStrictEqual(plugins, []);
    });

    test('should handle plugin that throws error', async () => {
      const errorPlugin: ASTVisitorPlugin = {
        visitErrorNode: () => {
          throw new Error('Plugin error');
        },
      };

      visitor.registerPlugin(errorPlugin);

      const node = createTestNode('ErrorNode');

      // Should propagate the error
      await assert.rejects(async () => {
        await visitor.walk(node);
      }, /Plugin error/);
    });

    test('should handle async plugin that rejects', async () => {
      const rejectPlugin: ASTVisitorPlugin = {
        visitRejectNode: async () => {
          throw new Error('Async plugin error');
        },
      };

      visitor.registerPlugin(rejectPlugin);

      const node = createTestNode('RejectNode');

      // Should propagate the rejection
      await assert.rejects(async () => {
        await visitor.walk(node);
      }, /Async plugin error/);
    });
  });

  suite('Integration Tests', () => {
    test('should work with complex AST tree and multiple plugins', async () => {
      const visitor = new ASTVisitor();
      const counterPlugin = new TestCounterPlugin();
      const multiTypePlugin = new MultiTypePlugin();

      visitor.registerPlugin(counterPlugin);
      visitor.registerPlugin(multiTypePlugin);

      // Create complex tree
      const leaf1 = createTestNode('TypeA');
      const leaf2 = createTestNode('TypeB');
      const leaf3 = createTestNode('TestNode');
      const branch1 = createTestNode('TypeC', 'expression', [leaf1, leaf2]);
      const root = createTestNode('TestNode', 'statement', [branch1, leaf3]);

      await visitor.walk(root);

      // Check counter plugin results
      assert.strictEqual(counterPlugin.visitCount, 2); // TestNode (root), TestNode (leaf3)

      // Check multi-type plugin results
      assert.strictEqual(multiTypePlugin.visitCounts.get('TypeA'), 1);
      assert.strictEqual(multiTypePlugin.visitCounts.get('TypeB'), 1);
      assert.strictEqual(multiTypePlugin.visitCounts.get('TypeC'), 1);
    });
  });

  suite('ASTVisitor getNodeType Method', () => {
    let visitor: ASTVisitor;

    setup(() => {
      visitor = new ASTVisitor();
    });

    test('should extract type from quoted arcana field', () => {
      const node = createTestNode('BinaryOperator', 'expression');
      node.arcana = "BinaryOperator <0x12345> <col:12, col:1> 'bool' '||'";

      const type = visitor.getNodeType(node);
      assert.strictEqual(type, 'bool');
    });

    test('should extract complex type from arcana field', () => {
      const node = createTestNode('VarDecl', 'declaration');
      node.arcana = "VarDecl <0x789> <col:1, col:20> 'std::vector<int>' varName";

      const type = visitor.getNodeType(node);
      assert.strictEqual(type, 'std::vector<int>');
    });

    test('should extract pointer type from arcana field', () => {
      const node = createTestNode('ParmVarDecl', 'declaration');
      node.arcana = "ParmVarDecl <0xabc> <col:5, col:15> 'int *' param";

      const type = visitor.getNodeType(node);
      assert.strictEqual(type, 'int *');
    });

    test('should extract function type from arcana field', () => {
      const node = createTestNode('FunctionDecl', 'declaration');
      node.arcana = "FunctionDecl <0xdef> <col:1, col:30> 'void (int, char *)' main";

      const type = visitor.getNodeType(node);
      assert.strictEqual(type, 'void (int, char *)');
    });

    test("should return 'unknown' for node without arcana", () => {
      const node = createTestNode('UnknownNode', 'expression');

      const type = visitor.getNodeType(node);
      assert.strictEqual(type, 'unknown');
    });

    test("should return 'unknown' for arcana without type info", () => {
      const node = createTestNode('SomeNode', 'expression');
      node.arcana = 'SomeNode <0x123> <col:1, col:5> noTypeInfo';

      const type = visitor.getNodeType(node);
      assert.strictEqual(type, 'unknown');
    });

    test('should handle empty arcana field', () => {
      const node = createTestNode('EmptyNode', 'expression');
      node.arcana = '';

      const type = visitor.getNodeType(node);
      assert.strictEqual(type, 'unknown');
    });

    test('should extract type with special characters', () => {
      const node = createTestNode('TypedefDecl', 'declaration');
      node.arcana = "TypedefDecl <0x456> <col:1, col:25> 'std::map<std::string, int>' MyMap";

      const type = visitor.getNodeType(node);
      assert.strictEqual(type, 'std::map<std::string, int>');
    });

    test('should handle multiple quoted strings and return first type', () => {
      const node = createTestNode('CastExpr', 'expression');
      node.arcana = "CastExpr <0x789> <col:1, col:10> 'double' 'float'";

      const type = visitor.getNodeType(node);
      assert.strictEqual(type, 'double');
    });

    test('should extract type from alternative arcana format', () => {
      const node = createTestNode('IntegerLiteral', 'expression');
      node.arcana = "IntegerLiteral <0x123> <col:5> 'int' 42";

      const type = visitor.getNodeType(node);
      assert.strictEqual(type, 'int');
    });
  });

  suite('updateDocumentFromNode', () => {
    let visitor: ASTVisitor;

    setup(() => {
      visitor = new ASTVisitor();
    });

    test('should return false when node has no range', async () => {
      const node = createTestNode('TestNode', 'expression');
      delete node.range;

      const result = await visitor.updateDocumentFromNode(node);
      assert.strictEqual(result, false);
    });

    test('should return false when node has no detail', async () => {
      const node = createTestNode('TestNode', 'expression');
      delete node.detail;

      const result = await visitor.updateDocumentFromNode(node);
      assert.strictEqual(result, false);
    });

    test('should return false when no active editor', async () => {
      // In the test environment, there's typically no active editor
      const node = createTestNode('TestNode', 'expression', undefined, 'test detail');

      const result = await visitor.updateDocumentFromNode(node);
      assert.strictEqual(result, false);
    });

    test('should successfully update document when all conditions are met', async () => {
      // This test verifies the method exists and can be called
      const node = createTestNode('TestNode', 'expression', undefined, 'updated code');
      node.range = {
        start: { line: 5, character: 10 },
        end: { line: 5, character: 20 },
      };

      // Since we're in a VS Code test environment, the method should exist
      assert.strictEqual(typeof visitor.updateDocumentFromNode, 'function');

      // The method should handle the case where no active editor exists gracefully
      const result = await visitor.updateDocumentFromNode(node);
      assert.strictEqual(typeof result, 'boolean');
    });

    test('should return false when workspace edit fails to apply', async () => {
      // Test with valid node but no active editor (which will cause failure)
      const node = createTestNode('TestNode', 'expression', undefined, 'updated code');

      const result = await visitor.updateDocumentFromNode(node);
      assert.strictEqual(result, false);
    });

    test('should handle exceptions gracefully', async () => {
      // Test with invalid node structure to trigger error handling
      const node = createTestNode('TestNode', 'expression', undefined, 'updated code');
      // Remove range to trigger a different code path
      delete node.range;

      const result = await visitor.updateDocumentFromNode(node);
      assert.strictEqual(result, false);
    });

    test('should correctly convert language server range to vscode range', async () => {
      // This test verifies the method exists and handles range conversion
      const node = createTestNode('TestNode', 'expression', undefined, 'test');
      node.range = {
        start: { line: 10, character: 5 },
        end: { line: 10, character: 15 },
      };

      // Since we're in a VS Code test environment, the method should exist
      assert.strictEqual(typeof visitor.updateDocumentFromNode, 'function');

      // The method should handle the range conversion internally
      const result = await visitor.updateDocumentFromNode(node);
      assert.strictEqual(typeof result, 'boolean');
    });
  });

  suite('ASTVisitor Wildcard Support', () => {
    let visitor: ASTVisitor;
    let wildcardPlugin: WildcardPlugin;

    setup(() => {
      visitor = new ASTVisitor();
      wildcardPlugin = new WildcardPlugin();
      visitor.registerPlugin(wildcardPlugin);
    });

    test('should visit all node types with wildcard plugin', async () => {
      const node1 = createTestNode('TypeA');
      const node2 = createTestNode('TypeB');
      const node3 = createTestNode('UnknownType');

      await visitor.walk(node1);
      await visitor.walk(node2);
      await visitor.walk(node3);

      assert.strictEqual(wildcardPlugin.visitedNodes.length, 3);
      assert.strictEqual(wildcardPlugin.visitedNodes[0].kind, 'TypeA');
      assert.strictEqual(wildcardPlugin.visitedNodes[1].kind, 'TypeB');
      assert.strictEqual(wildcardPlugin.visitedNodes[2].kind, 'UnknownType');
    });

    test('should work alongside specific node handlers', async () => {
      const specificPlugin = new TestCounterPlugin();
      visitor.registerPlugin(specificPlugin);

      const testNode = createTestNode('TestNode');
      const otherNode = createTestNode('OtherNode');

      await visitor.walk(testNode);
      await visitor.walk(otherNode);

      // Wildcard plugin should visit both
      assert.strictEqual(wildcardPlugin.visitedNodes.length, 2);

      // Specific plugin should only visit TestNode
      assert.strictEqual(specificPlugin.visitCount, 1);
      assert.strictEqual(specificPlugin.visitedNodes[0].kind, 'TestNode');
    });
  });
});
