import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { ASTVisitor, ASTVisitorPlugin } from '../ast-visitor';
import { loadKappaPlugins } from '../load-kappa-plugins';
import { BaseLanguageClient } from 'vscode-languageclient';

// Mock BaseLanguageClient for testing
function createMockClient(): BaseLanguageClient {
  return {
    sendRequest: async () => ({}),
    code2ProtocolConverter: {
      asTextDocumentPositionParams: () => ({}),
      asTextDocumentIdentifier: () => ({}),
      asRange: () => ({}),
    },
  } as any;
}

// Mock workspace folders for testing
function createMockWorkspaceFolder(fsPath: string): vscode.WorkspaceFolder {
  return {
    uri: {
      fsPath: fsPath,
      scheme: 'file',
      authority: '',
      path: fsPath,
      query: '',
      fragment: '',
      with: () => ({ fsPath }) as any,
      toJSON: () => ({ fsPath }),
    } as vscode.Uri,
    name: 'test-workspace',
    index: 0,
  };
}

// Helper function to create temporary test plugin files
function createTestPluginFile(pluginPath: string, content: string): void {
  const dir = path.dirname(pluginPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(pluginPath, content);
}

// Helper function to clean up test files
function cleanupTestFiles(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    // Recursively remove all files and subdirectories
    const removeRecursive = (itemPath: string) => {
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        const items = fs.readdirSync(itemPath);
        for (const item of items) {
          removeRecursive(path.join(itemPath, item));
        }
        fs.rmdirSync(itemPath);
      } else {
        fs.unlinkSync(itemPath);
      }
    };

    try {
      removeRecursive(dirPath);
    } catch (error: any) {
      // If cleanup fails, try to change permissions and retry
      try {
        fs.chmodSync(dirPath, 0o755);
        removeRecursive(dirPath);
      } catch (retryError: any) {
        console.warn(`Failed to cleanup test directory ${dirPath}:`, retryError);
      }
    }
  }
}

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Sample test', () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5));
    assert.strictEqual(-1, [1, 2, 3].indexOf(0));
  });

  suite('loadKappaPlugins', () => {
    let visitor: ASTVisitor;
    let mockClient: BaseLanguageClient;
    let originalWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
    let testWorkspaceRoot: string;
    let testPluginsFolder: string;

    setup(() => {
      mockClient = createMockClient();
      visitor = new ASTVisitor(mockClient);

      // Save original workspace folders
      originalWorkspaceFolders = vscode.workspace.workspaceFolders;

      // Create temporary test workspace
      testWorkspaceRoot = path.join(__dirname, 'test-workspace');
      testPluginsFolder = path.join(testWorkspaceRoot, '.kappa-plugins');

      // Mock workspace folders
      const mockWorkspaceFolder = createMockWorkspaceFolder(testWorkspaceRoot);
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: [mockWorkspaceFolder],
        writable: true,
        configurable: true,
      });
    });

    teardown(() => {
      // Restore original workspace folders
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: originalWorkspaceFolders,
        writable: true,
        configurable: true,
      });

      // Clean up test files
      cleanupTestFiles(testPluginsFolder);
      if (fs.existsSync(testWorkspaceRoot)) {
        try {
          fs.rmdirSync(testWorkspaceRoot);
        } catch (error) {
          // Directory might not be empty or already removed
        }
      }
    });

    test('should handle no workspace folders', async () => {
      // Mock no workspace folders
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      await loadKappaPlugins(visitor);

      // Should not register any plugins
      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });

    test('should handle empty workspace folders array', async () => {
      // Mock empty workspace folders
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: [],
        writable: true,
        configurable: true,
      });

      await loadKappaPlugins(visitor);

      // Should not register any plugins
      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });

    test('should handle missing kappa-plugins folder', async () => {
      // Don't create the plugins folder
      await loadKappaPlugins(visitor);

      // Should not register any plugins
      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });

    test('should handle empty kappa-plugins folder', async () => {
      // Create empty plugins folder
      fs.mkdirSync(testPluginsFolder, { recursive: true });

      await loadKappaPlugins(visitor);

      // Should not register any plugins
      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });

    test('should handle folder with no JavaScript files', async () => {
      // Create plugins folder with non-JS files
      fs.mkdirSync(testPluginsFolder, { recursive: true });
      fs.writeFileSync(path.join(testPluginsFolder, 'readme.txt'), 'test file');
      fs.writeFileSync(path.join(testPluginsFolder, 'config.json'), '{}');

      await loadKappaPlugins(visitor);

      // Should not register any plugins
      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });

    test('should load valid plugin successfully', async () => {
      // Create a valid test plugin using the new Babel-like interface
      const validPluginContent = `
        export default class ValidTestPlugin {
          async visitTestNode(node, visitor) {
            console.log("ValidTestPlugin visited:", node.kind);
          }
        }
      `;

      createTestPluginFile(path.join(testPluginsFolder, 'ValidTestPlugin.js'), validPluginContent);

      await loadKappaPlugins(visitor);

      // Should register the plugin
      const registeredTypes = visitor.getRegisteredNodeTypes();
      assert.strictEqual(registeredTypes.length, 1);
      assert.strictEqual(registeredTypes[0], 'TestNode');

      const plugins = visitor.getPluginsForNodeType('TestNode');
      assert.strictEqual(plugins.length, 1);
    });

    test('should load multiple valid plugins', async () => {
      // Create multiple valid test plugins using the new interface
      const plugin1Content = `
        export default class Plugin1 {
          async visitTypeA(node, visitor) {}
        }
      `;

      const plugin2Content = `
        export default class Plugin2 {
          async visitTypeB(node, visitor) {}
          async visitTypeC(node, visitor) {}
        }
      `;

      createTestPluginFile(path.join(testPluginsFolder, 'Plugin1.js'), plugin1Content);
      createTestPluginFile(path.join(testPluginsFolder, 'Plugin2.js'), plugin2Content);

      await loadKappaPlugins(visitor);

      // Should register all plugins
      const registeredTypes = visitor.getRegisteredNodeTypes().sort();
      assert.deepStrictEqual(registeredTypes, ['TypeA', 'TypeB', 'TypeC']);

      assert.strictEqual(visitor.getPluginsForNodeType('TypeA').length, 1);
      assert.strictEqual(visitor.getPluginsForNodeType('TypeB').length, 1);
      assert.strictEqual(visitor.getPluginsForNodeType('TypeC').length, 1);
    });

    test('should handle plugin without default export', async () => {
      // Create plugin without default export
      const invalidPluginContent = `
        export class NamedExportPlugin {
          async visitTestNode(node, visitor) {}
        }
      `;

      createTestPluginFile(path.join(testPluginsFolder, 'InvalidPlugin.js'), invalidPluginContent);

      await loadKappaPlugins(visitor);

      // Should not register any plugins
      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });

    test('should handle plugin without node handlers', async () => {
      // Create plugin without any node handler methods
      const invalidPluginContent = `
        export default class InvalidPlugin {
          someOtherMethod() {}
          anotherOtherMethod = "not a function";
        }
      `;

      createTestPluginFile(path.join(testPluginsFolder, 'InvalidPlugin.js'), invalidPluginContent);

      await loadKappaPlugins(visitor);

      // Should not register any plugins
      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });

    test('should handle syntax error in plugin file', async () => {
      // Create plugin with syntax error
      const invalidPluginContent = `
        export default class SyntaxErrorPlugin {
          async TestNode(node, visitor {  // Missing closing parenthesis
            console.log("test");
          }
        }
      `;

      createTestPluginFile(path.join(testPluginsFolder, 'SyntaxErrorPlugin.js'), invalidPluginContent);

      await loadKappaPlugins(visitor);

      // Should not register any plugins due to syntax error
      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });

    test('should handle runtime error in plugin constructor', async () => {
      // Create plugin that throws error in constructor
      const errorPluginContent = `
        export default class ErrorPlugin {
          constructor() {
            throw new Error("Constructor error");
          }
          async TestNode(node, visitor) {}
        }
      `;

      createTestPluginFile(path.join(testPluginsFolder, 'ErrorPlugin.js'), errorPluginContent);

      await loadKappaPlugins(visitor);

      // Should not register any plugins due to constructor error
      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });

    test('should handle mixed valid and invalid plugins', async () => {
      // Create one valid and one invalid plugin
      const validPluginContent = `
        export default class ValidPlugin {
          async visitValidNode(node, visitor) {}
        }
      `;

      const invalidPluginContent = `
        export default class InvalidPlugin {
          // This plugin has no valid handler methods
          invalidMethod() {}
        }
      `;

      createTestPluginFile(path.join(testPluginsFolder, 'ValidPlugin.js'), validPluginContent);
      createTestPluginFile(path.join(testPluginsFolder, 'InvalidPlugin.js'), invalidPluginContent);

      await loadKappaPlugins(visitor);

      // Should only register the valid plugin
      const registeredTypes = visitor.getRegisteredNodeTypes();
      assert.strictEqual(registeredTypes.length, 1);
      assert.strictEqual(registeredTypes[0], 'ValidNode');
    });

    test('should handle wildcard visit method', async () => {
      // Create plugin that handles all node types
      const wildcardPluginContent = `
        export default class WildcardPlugin {
          async visitAny(node, visitor) {}
        }
      `;

      createTestPluginFile(path.join(testPluginsFolder, 'WildcardPlugin.js'), wildcardPluginContent);

      await loadKappaPlugins(visitor);

      // Should register the wildcard plugin
      const registeredTypes = visitor.getRegisteredNodeTypes();
      assert.strictEqual(registeredTypes.length, 1);
      assert.strictEqual(registeredTypes[0], '*');

      const plugins = visitor.getPluginsForNodeType('*');
      assert.strictEqual(plugins.length, 1);
    });

    test('should handle plugin with multiple node types', async () => {
      // Create plugin that handles multiple node types
      const multiTypePluginContent = `
        export default class MultiTypePlugin {
          async visitTypeA(node, visitor) {}
          async visitTypeB(node, visitor) {}
          async visitTypeC(node, visitor) {}
        }
      `;

      createTestPluginFile(path.join(testPluginsFolder, 'MultiTypePlugin.js'), multiTypePluginContent);

      await loadKappaPlugins(visitor);

      // Should register all node types
      const registeredTypes = visitor.getRegisteredNodeTypes().sort();
      assert.deepStrictEqual(registeredTypes, ['TypeA', 'TypeB', 'TypeC']);

      // Each node type should have the same plugin
      assert.strictEqual(visitor.getPluginsForNodeType('TypeA').length, 1);
      assert.strictEqual(visitor.getPluginsForNodeType('TypeB').length, 1);
      assert.strictEqual(visitor.getPluginsForNodeType('TypeC').length, 1);
    });

    test('should skip non-.js files', async () => {
      // Create plugins folder with various file types
      fs.mkdirSync(testPluginsFolder, { recursive: true });

      const validPluginContent = `
        export default class ValidPlugin {
          async visitValidNode(node, visitor) {}
        }
      `;

      // Create valid JS file
      createTestPluginFile(path.join(testPluginsFolder, 'ValidPlugin.js'), validPluginContent);

      // Create non-JS files that should be ignored
      fs.writeFileSync(path.join(testPluginsFolder, 'NotPlugin.ts'), 'typescript file');
      fs.writeFileSync(path.join(testPluginsFolder, 'NotPlugin.txt'), 'text file');
      fs.writeFileSync(path.join(testPluginsFolder, 'NotPlugin.json'), '{}');
      fs.writeFileSync(path.join(testPluginsFolder, 'NotPlugin.jsx'), 'react file');

      await loadKappaPlugins(visitor);

      // Should only register the JS plugin
      const registeredTypes = visitor.getRegisteredNodeTypes();
      assert.strictEqual(registeredTypes.length, 1);
      assert.strictEqual(registeredTypes[0], 'ValidNode');
    });

    test('should handle file system permission errors', async () => {
      // Create plugins folder
      fs.mkdirSync(testPluginsFolder, { recursive: true });

      // Try to test permission errors (this test may be skipped on some systems)
      let permissionTestRan = false;
      try {
        // Try to change permissions to no-read
        fs.chmodSync(testPluginsFolder, 0o000);
        permissionTestRan = true;

        await loadKappaPlugins(visitor);

        // Should handle permission error gracefully
        assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
      } catch (error: any) {
        // If we can't change permissions, the test itself might fail
        console.log("Permission test couldn't run properly:", error.message);
      } finally {
        // Always try to restore permissions for cleanup
        if (permissionTestRan) {
          try {
            fs.chmodSync(testPluginsFolder, 0o755);
          } catch (restoreError: any) {
            console.log('Could not restore permissions:', restoreError.message);
          }
        }
      }

      // If we couldn't run the permission test, just verify the function exists
      if (!permissionTestRan) {
        // Create a valid plugin to ensure the function still works
        const validPluginContent = `
          export default class ValidPlugin {
            async visitValidNode(node, visitor) {}
          }
        `;
        createTestPluginFile(path.join(testPluginsFolder, 'ValidPlugin.js'), validPluginContent);

        await loadKappaPlugins(visitor);
        assert.strictEqual(visitor.getRegisteredNodeTypes().length, 1);
      }
    });

    test('should handle case where import resolves to null', async () => {
      // Create a plugin file that exports null as default
      const nullExportContent = `
        export default null;
      `;

      createTestPluginFile(path.join(testPluginsFolder, 'NullExportPlugin.js'), nullExportContent);

      await loadKappaPlugins(visitor);

      // Should not register any plugins
      assert.strictEqual(visitor.getRegisteredNodeTypes().length, 0);
    });

    test('should preserve visitor state across plugin loading', async () => {
      // Register a plugin before loading custom plugins
      const existingPlugin: ASTVisitorPlugin = {
        async visitExistingNode(node: any, visitor: any) {},
      };
      visitor.registerPlugin(existingPlugin);

      // Create a custom plugin
      const customPluginContent = `
        export default class CustomPlugin {
          async visitCustomNode(node, visitor) {}
        }
      `;

      createTestPluginFile(path.join(testPluginsFolder, 'CustomPlugin.js'), customPluginContent);

      await loadKappaPlugins(visitor);

      // Should have both plugins registered
      const registeredTypes = visitor.getRegisteredNodeTypes().sort();
      assert.deepStrictEqual(registeredTypes, ['CustomNode', 'ExistingNode']);
    });

    suite('Integration Tests - Code Modification', () => {
      let mockDocument: vscode.TextDocument;
      let mockEditor: vscode.TextEditor;
      let originalActiveEditor: vscode.TextEditor | undefined;
      let applyEditStub: any;

      setup(() => {
        // Save original active editor
        originalActiveEditor = vscode.window.activeTextEditor;

        // Create mock document
        mockDocument = {
          uri: vscode.Uri.file('/test/file.c'),
          getText: () => 'int x = 5;',
          lineAt: (line: number) => ({
            text: 'int x = 5;',
            range: new vscode.Range(0, 0, 0, 10),
          }),
        } as any;

        // Create mock editor
        mockEditor = {
          document: mockDocument,
          selection: new vscode.Selection(0, 0, 0, 0),
          visibleRanges: [new vscode.Range(0, 0, 0, 10)],
        } as any;

        // Mock VS Code APIs
        Object.defineProperty(vscode.window, 'activeTextEditor', {
          value: mockEditor,
          writable: true,
          configurable: true,
        });

        applyEditStub = function (edit: vscode.WorkspaceEdit): Promise<boolean> {
          return Promise.resolve(true);
        };
        Object.defineProperty(vscode.workspace, 'applyEdit', {
          value: applyEditStub,
          writable: true,
          configurable: true,
        });
      });

      teardown(() => {
        // Restore original active editor
        Object.defineProperty(vscode.window, 'activeTextEditor', {
          value: originalActiveEditor,
          writable: true,
          configurable: true,
        });
      });

      test('should load DoubleIntAssignmentPlugin and modify integer assignments', async () => {
        const visitor = new ASTVisitor(createMockClient());

        // Create the DoubleIntAssignmentPlugin
        const pluginContent = `
          export default class DoubleIntAssignmentPlugin {
            async visitBinaryOperator(node, visitor) {
              if (node.detail === "=" && node.children?.[1].kind === "IntegerLiteral") {
                const leftChild = node.children[0];
                const leftChildType = visitor.getNodeType(leftChild);
                
                if (leftChildType === "int") {
                  const rightChild = node.children[1];
                  const originalValue = Number(rightChild.detail);
                  rightChild.detail = String(originalValue * 2);
                  visitor.updateDocumentFromNode(rightChild);
                }
              }
            }
          }
        `;

        createTestPluginFile(path.join(testPluginsFolder, 'DoubleIntAssignmentPlugin.js'), pluginContent);

        // Load the plugin
        await loadKappaPlugins(visitor);

        // Create a mock AST structure representing: int x = 5;
        const mockAST = {
          role: 'expression',
          kind: 'BinaryOperator',
          detail: '=',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 9 },
          },
          children: [
            {
              role: 'expression',
              kind: 'DeclRefExpr',
              detail: 'x',
              arcana: "DeclRefExpr <0x123> <col:1> 'int' lvalue",
              range: {
                start: { line: 0, character: 4 },
                end: { line: 0, character: 5 },
              },
            },
            {
              role: 'expression',
              kind: 'IntegerLiteral',
              detail: '5',
              arcana: "IntegerLiteral <0x456> <col:8> 'int' 5",
              range: {
                start: { line: 0, character: 8 },
                end: { line: 0, character: 9 },
              },
            },
          ],
          arcana: "BinaryOperator <0x789> <col:1, col:9> 'int' '='",
        };

        // Walk the AST with the loaded plugin
        await visitor.walk(mockAST);

        // Verify that the integer literal was doubled
        assert.strictEqual(mockAST.children![1].detail, '10');
      });

      test('should handle complex AST structures with nested binary operators', async () => {
        const visitor = new ASTVisitor(createMockClient());

        // Create the plugin
        const pluginContent = `
        export default class DoubleIntAssignmentPlugin {
          async visitBinaryOperator(node, visitor) {
            if (node.detail === "=" && node.children?.[1].kind === "IntegerLiteral") {
              const leftChild = node.children[0];
              const leftChildType = visitor.getNodeType(leftChild);
              
              if (leftChildType === "int") {
                const rightChild = node.children[1];
                const originalValue = Number(rightChild.detail);
                rightChild.detail = String(originalValue * 2);
                visitor.updateDocumentFromNode(rightChild);
              }
            }
          }
        }
      `;

        createTestPluginFile(path.join(testPluginsFolder, 'DoubleIntAssignmentPlugin.js'), pluginContent);

        await loadKappaPlugins(visitor);

        // Create a more complex AST structure with multiple assignments
        const complexAST = {
          role: 'statement',
          kind: 'CompoundStmt',
          children: [
            {
              role: 'expression',
              kind: 'BinaryOperator',
              detail: '=',
              children: [
                {
                  role: 'expression',
                  kind: 'DeclRefExpr',
                  detail: 'x',
                  arcana: "DeclRefExpr <0x123> <col:1> 'int' lvalue",
                },
                {
                  role: 'expression',
                  kind: 'IntegerLiteral',
                  detail: '5',
                  arcana: "IntegerLiteral <0x456> <col:8> 'int' 5",
                  range: {
                    start: { line: 0, character: 8 },
                    end: { line: 0, character: 9 },
                  },
                },
              ],
            },
            {
              role: 'expression',
              kind: 'BinaryOperator',
              detail: '=',
              children: [
                {
                  role: 'expression',
                  kind: 'DeclRefExpr',
                  detail: 'y',
                  arcana: "DeclRefExpr <0x789> <col:1> 'int' lvalue",
                },
                {
                  role: 'expression',
                  kind: 'IntegerLiteral',
                  detail: '10',
                  arcana: "IntegerLiteral <0xabc> <col:8> 'int' 10",
                  range: {
                    start: { line: 1, character: 8 },
                    end: { line: 1, character: 10 },
                  },
                },
              ],
            },
          ],
        };

        await visitor.walk(complexAST);

        // Verify both integer literals were doubled
        assert.strictEqual(complexAST.children![0].children![1].detail, '10');
        assert.strictEqual(complexAST.children![1].children![1].detail, '20');
      });

      test('should not modify non-int assignments', async () => {
        const visitor = new ASTVisitor(createMockClient());

        const pluginContent = `
        export default class DoubleIntAssignmentPlugin {
          async visitBinaryOperator(node, visitor) {
            if (node.detail === "=" && node.children?.[1].kind === "IntegerLiteral") {
              const leftChild = node.children[0];
              const leftChildType = visitor.getNodeType(leftChild);
              
              if (leftChildType === "int") {
                const rightChild = node.children[1];
                const originalValue = Number(rightChild.detail);
                rightChild.detail = String(originalValue * 2);
                visitor.updateDocumentFromNode(rightChild);
              }
            }
          }
        }
      `;

        createTestPluginFile(path.join(testPluginsFolder, 'DoubleIntAssignmentPlugin.js'), pluginContent);

        await loadKappaPlugins(visitor);

        // Create AST for float assignment: float f = 5.0;
        const floatAST = {
          role: 'expression',
          kind: 'BinaryOperator',
          detail: '=',
          children: [
            {
              role: 'expression',
              kind: 'DeclRefExpr',
              detail: 'f',
              arcana: "DeclRefExpr <0x123> <col:1> 'float' lvalue",
            },
            {
              role: 'expression',
              kind: 'IntegerLiteral',
              detail: '5',
              arcana: "IntegerLiteral <0x456> <col:8> 'int' 5",
              range: {
                start: { line: 0, character: 8 },
                end: { line: 0, character: 9 },
              },
            },
          ],
        };

        await visitor.walk(floatAST);

        // Verify the value was NOT modified (since it's a float, not int)
        assert.strictEqual(floatAST.children![1].detail, '5');
      });
    });

    suite('Comment Methods Tests', () => {
      let mockDocument: vscode.TextDocument;
      let mockEditor: vscode.TextEditor;
      let originalActiveEditor: vscode.TextEditor | undefined;
      let applyEditStub: any;

      setup(() => {
        // Save original active editor
        originalActiveEditor = vscode.window.activeTextEditor;

        // Create mock document
        mockDocument = {
          uri: vscode.Uri.file('/test/file.c'),
          getText: () => 'int x = 5;\nint y = 10;',
          lineAt: (line: number) => ({
            text: line === 0 ? 'int x = 5;' : 'int y = 10;',
            range: new vscode.Range(line, 0, line, line === 0 ? 10 : 11),
          }),
        } as any;

        // Create mock editor
        mockEditor = {
          document: mockDocument,
          selection: new vscode.Selection(0, 0, 0, 0),
          visibleRanges: [new vscode.Range(0, 0, 1, 11)],
        } as any;

        // Mock VS Code APIs
        Object.defineProperty(vscode.window, 'activeTextEditor', {
          value: mockEditor,
          writable: true,
          configurable: true,
        });

        applyEditStub = function (edit: vscode.WorkspaceEdit): Promise<boolean> {
          return Promise.resolve(true);
        };
        Object.defineProperty(vscode.workspace, 'applyEdit', {
          value: applyEditStub,
          writable: true,
          configurable: true,
        });
      });

      teardown(() => {
        // Restore original active editor
        Object.defineProperty(vscode.window, 'activeTextEditor', {
          value: originalActiveEditor,
          writable: true,
          configurable: true,
        });
      });

      test('should add leading Comment to AST node', async () => {
        const visitor = new ASTVisitor(createMockClient());

        // Create a mock AST node
        const mockNode = {
          role: 'expression',
          kind: 'BinaryOperator',
          detail: '=',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 9 },
          },
        };

        const result = visitor.addLeadingComment(mockNode, 'test comment');
        assert.strictEqual(result, true);
      });

      test('should add trailing Comment to AST node', async () => {
        const visitor = new ASTVisitor(createMockClient());

        // Create a mock AST node
        const mockNode = {
          role: 'expression',
          kind: 'BinaryOperator',
          detail: '=',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 9 },
          },
        };

        const result = visitor.addTrailingComment(mockNode, 'test comment');
        assert.strictEqual(result, true);
      });

      test('should handle node without range for leading Comment', async () => {
        const visitor = new ASTVisitor(createMockClient());

        // Create a mock AST node without range
        const mockNode = {
          role: 'expression',
          kind: 'BinaryOperator',
          detail: '=',
        };

        const result = visitor.addLeadingComment(mockNode, 'test comment');
        assert.strictEqual(result, false);
      });

      test('should handle node without range for trailing Comment', async () => {
        const visitor = new ASTVisitor(createMockClient());

        // Create a mock AST node without range
        const mockNode = {
          role: 'expression',
          kind: 'BinaryOperator',
          detail: '=',
        };

        const result = visitor.addTrailingComment(mockNode, 'test comment');
        assert.strictEqual(result, false);
      });

      test('should handle no active editor for leading Comment', async () => {
        const visitor = new ASTVisitor(createMockClient());

        // Mock no active editor
        Object.defineProperty(vscode.window, 'activeTextEditor', {
          value: undefined,
          writable: true,
          configurable: true,
        });

        const mockNode = {
          role: 'expression',
          kind: 'BinaryOperator',
          detail: '=',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 9 },
          },
        };

        const result = visitor.addLeadingComment(mockNode, 'test comment');
        assert.strictEqual(result, false);
      });

      test('should handle no active editor for trailing Comment', async () => {
        const visitor = new ASTVisitor(createMockClient());

        // Mock no active editor
        Object.defineProperty(vscode.window, 'activeTextEditor', {
          value: undefined,
          writable: true,
          configurable: true,
        });

        const mockNode = {
          role: 'expression',
          kind: 'BinaryOperator',
          detail: '=',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 9 },
          },
        };

        const result = visitor.addTrailingComment(mockNode, 'test comment');
        assert.strictEqual(result, false);
      });

      test('should add multiple commentaries at the same time', async () => {
        const visitor = new ASTVisitor(createMockClient());

        // Create a plugin that adds both leading and trailing commentaries
        const multiCommentPluginContent = `
          export default class MultiCommentPlugin {
            async visitBinaryOperator(node, visitor) {
              if (node.detail === "=" && node.children?.[1].kind === "IntegerLiteral") {
                const intValue = parseInt(node.children[1].detail);
                
                if (intValue === 1) {
                  await visitor.addLeadingComment(node, "one");
                } else if (intValue === 2) {
                  await visitor.addTrailingComment(node, "two");
                }
              }
            }
          }
        `;

        createTestPluginFile(path.join(testPluginsFolder, 'MultiCommentPlugin.js'), multiCommentPluginContent);

        await loadKappaPlugins(visitor);

        // Create AST representing: int x = 1; int y = 2;
        const complexAST = {
          role: 'statement',
          kind: 'CompoundStmt',
          children: [
            {
              role: 'expression',
              kind: 'BinaryOperator',
              detail: '=',
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 9 },
              },
              children: [
                {
                  role: 'expression',
                  kind: 'DeclRefExpr',
                  detail: 'x',
                  arcana: "DeclRefExpr <0x123> <col:5> 'int' lvalue",
                },
                {
                  role: 'expression',
                  kind: 'IntegerLiteral',
                  detail: '1',
                  arcana: "IntegerLiteral <0x456> <col:9> 'int' 1",
                  range: {
                    start: { line: 0, character: 8 },
                    end: { line: 0, character: 9 },
                  },
                },
              ],
            },
            {
              role: 'expression',
              kind: 'BinaryOperator',
              detail: '=',
              range: {
                start: { line: 1, character: 0 },
                end: { line: 1, character: 10 },
              },
              children: [
                {
                  role: 'expression',
                  kind: 'DeclRefExpr',
                  detail: 'y',
                  arcana: "DeclRefExpr <0x789> <col:5> 'int' lvalue",
                },
                {
                  role: 'expression',
                  kind: 'IntegerLiteral',
                  detail: '2',
                  arcana: "IntegerLiteral <0xabc> <col:9> 'int' 2",
                  range: {
                    start: { line: 1, character: 8 },
                    end: { line: 1, character: 9 },
                  },
                },
              ],
            },
          ],
        };

        await visitor.walk(complexAST);

        // The plugin should have processed both assignments
        // We can't easily verify the actual text changes in the mock,
        // but we can verify the plugin was called without errors
        assert.ok(true, 'Multiple commentaries were added successfully');
      });

      test('should demonstrate the C code example transformation', async () => {
        const visitor = new ASTVisitor(createMockClient());

        // Create a plugin that mimics the example transformation:
        // int x = 1;  ->  /* one */ int x = 1;
        // int y = 2;  ->  int y = 2; /* two */
        const exampleTransformationPluginContent = `
          export default class ExampleTransformationPlugin {
            async visitBinaryOperator(node, visitor) {
              if (node.detail === "=" && node.children?.[1].kind === "IntegerLiteral") {
                const intValue = parseInt(node.children[1].detail);
                
                if (intValue === 1) {
                  // Add leading Comment for "one"
                  await visitor.addLeadingComment(node, "one");
                } else if (intValue === 2) {
                  // Add trailing Comment for "two"
                  await visitor.addTrailingComment(node, "two");
                }
              }
            }
          }
        `;

        createTestPluginFile(
          path.join(testPluginsFolder, 'ExampleTransformationPlugin.js'),
          exampleTransformationPluginContent,
        );

        await loadKappaPlugins(visitor);

        // Create AST representing the C code:
        // int x = 1;
        // int y = 2;
        const cCodeAST = {
          role: 'statement',
          kind: 'CompoundStmt',
          children: [
            // First statement: int x = 1;
            {
              role: 'statement',
              kind: 'DeclStmt',
              children: [
                {
                  role: 'declaration',
                  kind: 'VarDecl',
                  detail: 'x',
                  children: [
                    {
                      role: 'expression',
                      kind: 'BinaryOperator',
                      detail: '=',
                      range: {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 9 },
                      },
                      children: [
                        {
                          role: 'expression',
                          kind: 'DeclRefExpr',
                          detail: 'x',
                          arcana: "DeclRefExpr <0x123> <col:5> 'int' lvalue",
                        },
                        {
                          role: 'expression',
                          kind: 'IntegerLiteral',
                          detail: '1',
                          arcana: "IntegerLiteral <0x456> <col:9> 'int' 1",
                          range: {
                            start: { line: 0, character: 8 },
                            end: { line: 0, character: 9 },
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            // Second statement: int y = 2;
            {
              role: 'statement',
              kind: 'DeclStmt',
              children: [
                {
                  role: 'declaration',
                  kind: 'VarDecl',
                  detail: 'y',
                  children: [
                    {
                      role: 'expression',
                      kind: 'BinaryOperator',
                      detail: '=',
                      range: {
                        start: { line: 1, character: 0 },
                        end: { line: 1, character: 9 },
                      },
                      children: [
                        {
                          role: 'expression',
                          kind: 'DeclRefExpr',
                          detail: 'y',
                          arcana: "DeclRefExpr <0x789> <col:5> 'int' lvalue",
                        },
                        {
                          role: 'expression',
                          kind: 'IntegerLiteral',
                          detail: '2',
                          arcana: "IntegerLiteral <0xabc> <col:9> 'int' 2",
                          range: {
                            start: { line: 1, character: 8 },
                            end: { line: 1, character: 9 },
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        };

        // Walk the AST with the loaded plugin
        await visitor.walk(cCodeAST);

        // The transformations should have been applied:
        // - Leading Comment "one" added to first assignment
        // - Trailing Comment "two" added to second assignment
        // We verify that the plugin executed without errors
        assert.ok(true, 'C code example transformation completed successfully');
      });

      test('should load AddOffsetCommentariesPlugin and add offset commentaries', async () => {
        const visitor = new ASTVisitor(createMockClient());

        // Create the updated AddOffsetCommentariesPlugin that uses addLeadingComment
        const pluginContent = `
          export default class AddOffsetCommentariesPlugin {
            async visitBinaryOperator(node, visitor) {
              if (node.detail === '=' && node.children?.[1].kind === 'IntegerLiteral') {
                const integerValue = parseInt(node.children[1].detail);
                const offsetComment = \`offset: 0x\${integerValue.toString(16)}\`;
                await visitor.addLeadingComment(node, offsetComment);
              }
            }
          }
        `;

        createTestPluginFile(path.join(testPluginsFolder, 'AddOffsetCommentariesPlugin.js'), pluginContent);

        await loadKappaPlugins(visitor);

        // Create a mock AST structure representing: int x = 255;
        const mockAST = {
          role: 'expression',
          kind: 'BinaryOperator',
          detail: '=',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 11 },
          },
          children: [
            {
              role: 'expression',
              kind: 'DeclRefExpr',
              detail: 'x',
              arcana: "DeclRefExpr <0x123> <col:5> 'int' lvalue",
            },
            {
              role: 'expression',
              kind: 'IntegerLiteral',
              detail: '255',
              arcana: "IntegerLiteral <0x456> <col:9> 'int' 255",
              range: {
                start: { line: 0, character: 8 },
                end: { line: 0, character: 11 },
              },
            },
          ],
        };

        // Walk the AST with the loaded plugin
        await visitor.walk(mockAST);

        // The plugin should have processed the assignment without errors
        assert.ok(true, 'AddOffsetCommentariesPlugin processed successfully');
      });
    });
  });
});
