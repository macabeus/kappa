import * as assert from "assert";
import * as vscode from "vscode";
import { ASTNode } from "../clangd/vscode-clangd";
import { ASTVisitor } from "../ast-visitor";
import {
  FunctionDeclarationCollectorPlugin,
  VariableDeclarationPlugin,
  ASTValidationPlugin,
  demonstrateASTVisitor,
} from "../ast-visitor-examples";

// Mock VSCode Range for testing
const mockRange = {
  start: { line: 1, character: 5 },
  end: { line: 1, character: 15 },
};

// Helper function to create test AST nodes
function createTestNode(
  kind: string,
  role: string = "expression",
  children?: ASTNode[],
  detail?: string,
  arcana?: string
): ASTNode {
  return {
    kind,
    role,
    detail,
    arcana,
    children,
    range: mockRange,
  };
}

suite("AST Visitor Examples Test Suite", () => {
  suite("FunctionDeclarationCollectorPlugin", () => {
    let plugin: FunctionDeclarationCollectorPlugin;

    setup(() => {
      plugin = new FunctionDeclarationCollectorPlugin();
    });

    test("should have correct node types", () => {
      assert.deepStrictEqual(plugin.nodeTypes, ["FunctionDecl"]);
    });

    test("should collect function declarations", () => {
      const func1 = createTestNode(
        "FunctionDecl",
        "declaration",
        undefined,
        "myFunction"
      );
      const func2 = createTestNode(
        "FunctionDecl",
        "declaration",
        undefined,
        "anotherFunction"
      );
      const visitor = new ASTVisitor();

      plugin.visit(func1, visitor);
      plugin.visit(func2, visitor);

      const functions = plugin.getFunctions();
      assert.strictEqual(functions.length, 2);
      assert.strictEqual(functions[0], func1);
      assert.strictEqual(functions[1], func2);
    });

    test("should handle function without detail", () => {
      const func = createTestNode("FunctionDecl", "declaration");
      const visitor = new ASTVisitor();

      plugin.visit(func, visitor);

      const functions = plugin.getFunctions();
      assert.strictEqual(functions.length, 1);
      assert.strictEqual(functions[0], func);
    });

    test("should clear functions", () => {
      const func = createTestNode(
        "FunctionDecl",
        "declaration",
        undefined,
        "testFunc"
      );
      const visitor = new ASTVisitor();

      plugin.visit(func, visitor);
      assert.strictEqual(plugin.getFunctions().length, 1);

      plugin.clearFunctions();
      assert.strictEqual(plugin.getFunctions().length, 0);
    });

    test("should return copy of functions array", () => {
      const func = createTestNode(
        "FunctionDecl",
        "declaration",
        undefined,
        "testFunc"
      );

      const visitor = new ASTVisitor();
      plugin.visit(func, visitor);

      const functions1 = plugin.getFunctions();
      const functions2 = plugin.getFunctions();

      assert.notStrictEqual(functions1, functions2); // Different array instances
      assert.deepStrictEqual(functions1, functions2); // Same content
    });
  });

  suite("VariableDeclarationPlugin", () => {
    let plugin: VariableDeclarationPlugin;

    setup(() => {
      plugin = new VariableDeclarationPlugin();
    });

    test("should have correct node types", () => {
      assert.deepStrictEqual(plugin.nodeTypes, ["VarDecl", "ParmVarDecl"]);
    });

    test("should collect variable declarations", () => {
      const var1 = createTestNode(
        "VarDecl",
        "declaration",
        undefined,
        "myVar",
        "VarDecl <0x123> <col:5, col:10> 'int' myVar"
      );
      const var2 = createTestNode(
        "ParmVarDecl",
        "declaration",
        undefined,
        "param",
        "ParmVarDecl <0x456> <col:15, col:20> 'float' param"
      );

      const visitor = new ASTVisitor();
      plugin.visit(var1, visitor);
      plugin.visit(var2, visitor);

      const variables = plugin.getVariables();
      assert.strictEqual(variables.length, 2);

      assert.strictEqual(variables[0].name, "myVar");
      assert.strictEqual(variables[0].type, "int");
      assert.strictEqual(variables[0].node, var1);

      assert.strictEqual(variables[1].name, "param");
      assert.strictEqual(variables[1].type, "float");
      assert.strictEqual(variables[1].node, var2);
    });

    test("should handle variable without arcana", () => {
      const varNode = createTestNode(
        "VarDecl",
        "declaration",
        undefined,
        "testVar"
      );

      const visitor = new ASTVisitor();
      plugin.visit(varNode, visitor);

      const variables = plugin.getVariables();
      assert.strictEqual(variables.length, 1);
      assert.strictEqual(variables[0].name, "testVar");
      assert.strictEqual(variables[0].type, "unknown");
    });

    test("should handle variable without detail", () => {
      const varNode = createTestNode("VarDecl", "declaration");

      const visitor = new ASTVisitor();
      plugin.visit(varNode, visitor);

      const variables = plugin.getVariables();
      assert.strictEqual(variables.length, 1);
      assert.strictEqual(variables[0].name, "unknown");
      assert.strictEqual(variables[0].type, "unknown");
    });

    test("should extract type from arcana correctly", () => {
      const varNode = createTestNode(
        "VarDecl",
        "declaration",
        undefined,
        "complexVar",
        "VarDecl <0x789> <col:1, col:20> 'std::vector<int>' complexVar"
      );

      const visitor = new ASTVisitor();
      plugin.visit(varNode, visitor);

      const variables = plugin.getVariables();
      assert.strictEqual(variables[0].type, "std::vector<int>");
    });

    test("should clear variables", () => {
      const varNode = createTestNode(
        "VarDecl",
        "declaration",
        undefined,
        "testVar"
      );

      const visitor = new ASTVisitor();
      plugin.visit(varNode, visitor);
      assert.strictEqual(plugin.getVariables().length, 1);

      plugin.clearVariables();
      assert.strictEqual(plugin.getVariables().length, 0);
    });

    test("should return copy of variables array", () => {
      const varNode = createTestNode(
        "VarDecl",
        "declaration",
        undefined,
        "testVar"
      );

      const visitor = new ASTVisitor();
      plugin.visit(varNode, visitor);

      const vars1 = plugin.getVariables();
      const vars2 = plugin.getVariables();

      assert.notStrictEqual(vars1, vars2); // Different array instances
      assert.deepStrictEqual(vars1, vars2); // Same content
    });
  });

  suite("ASTValidationPlugin", () => {
    let plugin: ASTValidationPlugin;

    setup(() => {
      plugin = new ASTValidationPlugin();
    });

    test("should have wildcard node type", () => {
      assert.deepStrictEqual(plugin.nodeTypes, ["*"]);
    });

    test("should validate correct node", () => {
      const validNode = createTestNode("TestNode", "expression");

      const visitor = new ASTVisitor();
      plugin.visit(validNode, visitor);

      assert.strictEqual(plugin.getIssues().length, 0);
      assert.strictEqual(plugin.hasIssues(), false);
    });

    test("should detect missing role", () => {
      const invalidNode: Partial<ASTNode> = {
        kind: "TestNode",
        // role is missing
        range: mockRange,
      };

      const visitor = new ASTVisitor();
      plugin.visit(invalidNode as ASTNode, visitor);

      const issues = plugin.getIssues();
      assert.strictEqual(issues.length, 1);
      assert.ok(issues[0].includes("Node missing role"));
      assert.strictEqual(plugin.hasIssues(), true);
    });

    test("should detect missing kind", () => {
      const invalidNode: Partial<ASTNode> = {
        role: "expression",
        // kind is missing
        range: mockRange,
      };

      const visitor = new ASTVisitor();
      plugin.visit(invalidNode as ASTNode, visitor);

      const issues = plugin.getIssues();
      assert.strictEqual(issues.length, 1);
      assert.ok(issues[0].includes("Node missing kind"));
    });

    test("should detect invalid children", () => {
      const invalidNode: ASTNode = {
        kind: "TestNode",
        role: "expression",
        children: [null as any, undefined as any, "invalid" as any],
        range: mockRange,
      };

      const visitor = new ASTVisitor();
      plugin.visit(invalidNode, visitor);

      const issues = plugin.getIssues();
      assert.strictEqual(issues.length, 3); // 3 invalid children
      assert.ok(issues.every((issue) => issue.includes("Invalid child")));
    });

    test("should handle valid children", () => {
      const child1 = createTestNode("ChildNode");
      const child2 = createTestNode("AnotherChild");
      const parentNode = createTestNode("ParentNode", "statement", [
        child1,
        child2,
      ]);

      const visitor = new ASTVisitor();
      plugin.visit(parentNode, visitor);

      assert.strictEqual(plugin.getIssues().length, 0);
    });

    test("should clear issues", () => {
      const invalidNode: Partial<ASTNode> = {
        kind: "TestNode",
        // role is missing
        range: mockRange,
      };

      const visitor = new ASTVisitor();
      plugin.visit(invalidNode as ASTNode, visitor);
      assert.strictEqual(plugin.getIssues().length, 1);

      plugin.clearIssues();
      assert.strictEqual(plugin.getIssues().length, 0);
      assert.strictEqual(plugin.hasIssues(), false);
    });

    test("should return copy of issues array", () => {
      const invalidNode: Partial<ASTNode> = {
        kind: "TestNode",
        // role is missing
        range: mockRange,
      };

      const visitor = new ASTVisitor();
      plugin.visit(invalidNode as ASTNode, visitor);

      const issues1 = plugin.getIssues();
      const issues2 = plugin.getIssues();

      assert.notStrictEqual(issues1, issues2); // Different array instances
      assert.deepStrictEqual(issues1, issues2); // Same content
    });
  });

  suite("Integration Tests", () => {
    test("should work together in visitor", async () => {
      const visitor = new ASTVisitor();
      const funcCollector = new FunctionDeclarationCollectorPlugin();
      const varCollector = new VariableDeclarationPlugin();
      const validator = new ASTValidationPlugin();

      visitor.registerPlugin(funcCollector);
      visitor.registerPlugin(varCollector);
      visitor.registerPlugin(validator);

      // Create a complex AST tree
      const param = createTestNode(
        "ParmVarDecl",
        "declaration",
        undefined,
        "x",
        "ParmVarDecl <0x1> <col:1, col:5> 'int' x"
      );
      const localVar = createTestNode(
        "VarDecl",
        "declaration",
        undefined,
        "y",
        "VarDecl <0x2> <col:10, col:15> 'float' y"
      );
      const funcBody = createTestNode("CompoundStmt", "statement", [localVar]);
      const func = createTestNode(
        "FunctionDecl",
        "declaration",
        [param, funcBody],
        "testFunc"
      );

      await visitor.walk(func);

      // Check function collector
      const functions = funcCollector.getFunctions();
      assert.strictEqual(functions.length, 1);
      assert.strictEqual(functions[0].detail, "testFunc");

      // Check variable collector
      const variables = varCollector.getVariables();
      assert.strictEqual(variables.length, 2);
      assert.ok(variables.some((v) => v.name === "x" && v.type === "int"));
      assert.ok(variables.some((v) => v.name === "y" && v.type === "float"));

      // Check validator
      assert.strictEqual(validator.hasIssues(), false);
    });

    test("should handle mixed valid and invalid nodes", async () => {
      const visitor = new ASTVisitor();
      const validator = new ASTValidationPlugin();
      const funcCollector = new FunctionDeclarationCollectorPlugin();

      visitor.registerPlugin(validator);
      visitor.registerPlugin(funcCollector);

      // Create tree with valid and invalid nodes
      const validFunc = createTestNode(
        "FunctionDecl",
        "declaration",
        undefined,
        "validFunc"
      );
      const invalidChild: Partial<ASTNode> = {
        kind: "InvalidNode",
        // missing role
        range: mockRange,
      };
      const parent = createTestNode("CompoundStmt", "statement", [
        validFunc,
        invalidChild as ASTNode,
      ]);

      await visitor.walk(parent);

      // Function should still be collected
      assert.strictEqual(funcCollector.getFunctions().length, 1);

      // But validation issues should be reported
      assert.strictEqual(validator.hasIssues(), true);
      const issues = validator.getIssues();
      assert.ok(issues.some((issue) => issue.includes("Node missing role")));
    });
  });

  suite("demonstrateASTVisitor function", () => {
    // Mock vscode.window.showInformationMessage for testing
    let mockMessages: string[];

    setup(() => {
      mockMessages = [];
      // Mock the vscode API
      const originalShowInformationMessage =
        vscode.window.showInformationMessage;
      (vscode.window as any).showInformationMessage = (message: string) => {
        mockMessages.push(message);
        return Promise.resolve(undefined);
      };
    });

    test("should demonstrate visitor with sample AST", async () => {
      // Create a sample AST
      const binaryOp = createTestNode(
        "BinaryOperator",
        "expression",
        undefined,
        "+"
      );
      const ifStmt = createTestNode("IfStmt", "statement", [binaryOp]);
      const func = createTestNode(
        "FunctionDecl",
        "declaration",
        [ifStmt],
        "demoFunc"
      );
      const variable = createTestNode(
        "VarDecl",
        "declaration",
        undefined,
        "demoVar",
        "VarDecl <0x1> <col:1, col:5> 'int' demoVar"
      );
      const root = createTestNode("TranslationUnitDecl", "declaration", [
        func,
        variable,
      ]);

      // This should not throw and should process the tree
      await assert.doesNotReject(async () => {
        await demonstrateASTVisitor(root);
      });

      // Check that information messages were shown
      assert.ok(mockMessages.length > 0);
      assert.ok(mockMessages.some((msg) => msg.includes("functions")));
      assert.ok(mockMessages.some((msg) => msg.includes("variables")));
    });

    test("should handle empty AST", async () => {
      const emptyNode = createTestNode("EmptyNode", "expression");

      await assert.doesNotReject(async () => {
        await demonstrateASTVisitor(emptyNode);
      });
    });

    test("should handle AST with no matching nodes", async () => {
      const unknownNode = createTestNode("UnknownNodeType", "expression");

      await assert.doesNotReject(async () => {
        await demonstrateASTVisitor(unknownNode);
      });
    });
  });
});
