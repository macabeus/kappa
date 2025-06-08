import * as vscode from 'vscode';
import type { ASTNode } from './clangd/vscode-clangd';
import { BaseLanguageClient } from 'vscode-languageclient';
import { DefinitionRequest } from 'vscode-languageserver-protocol';
import { ASTRequestType } from './clangd/ast';

/**
 * Plugin interface for the AST visitor.
 * Plugins can define methods for specific node types, similar to Babel visitors.
 */
export interface ASTVisitorPlugin {
  /**
   * Special method that handles all node types (wildcard)
   * @param node The AST node being visited
   * @param visitor The AST visitor instance (for accessing utility methods)
   * @param context Optional context object that can be passed between plugins
   */
  visitAny?: (node: ASTNode, visitor: ASTVisitor, context?: any) => void | Promise<void>;

  /**
   * Dynamic methods for specific node types
   * Method names should be prefixed with `visit` and match the node kind (e.g., BinaryOperator, IfStmt, etc.)
   * Each visitor method should have the signature: (node: ASTNode, visitor: ASTVisitor, context?: any) => void | Promise<void>
   */
  [key: string]: ((node: ASTNode, visitor: ASTVisitor, context?: any) => void | Promise<void>) | any;
}

/**
 * Visitor class that walks through an AST tree and executes plugins
 * based on node types.
 */
export class ASTVisitor {
  private client: BaseLanguageClient;
  private pendingEdits = new vscode.WorkspaceEdit();
  private plugins: Map<string, ASTVisitorPlugin[]> = new Map();

  constructor(client: BaseLanguageClient) {
    this.client = client;
  }

  /**
   * Register a plugin to handle specific node types
   * @param plugin The plugin to register
   */
  registerPlugin(plugin: ASTVisitorPlugin): void {
    // Get all visitor methods from all plugins
    const visitMethodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(plugin))
      .concat(Object.getOwnPropertyNames(plugin))
      .filter((name) => name.startsWith('visit'));

    // Register node handler methods
    for (const methodName of visitMethodNames) {
      const nodeKind = methodName === 'visitAny' ? '*' : methodName.replace('visit', '');

      if (!this.plugins.has(nodeKind)) {
        this.plugins.set(nodeKind, []);
      }

      this.plugins.get(nodeKind)!.push(plugin);
    }
  }

  /**
   * Unregister a plugin
   * @param plugin The plugin to unregister
   */
  unregisterPlugin(plugin: ASTVisitorPlugin): void {
    // Remove the plugin from all node type lists
    for (const [nodeType, pluginsForType] of this.plugins.entries()) {
      const index = pluginsForType.indexOf(plugin);
      if (index !== -1) {
        pluginsForType.splice(index, 1);
      }
      if (pluginsForType.length === 0) {
        this.plugins.delete(nodeType);
      }
    }
  }

  /**
   * Visit a single AST node and execute all registered plugins for its type
   * @param node The node to visit
   * @param context Optional context object
   */
  private async visitNode(node: ASTNode, context?: any): Promise<void> {
    // Check for plugins registered for this specific node type
    const pluginsForType = this.plugins.get(node.kind);
    if (pluginsForType) {
      for (const plugin of pluginsForType) {
        await plugin[`visit${node.kind}`]?.(node, this, context);
      }
    }

    // Check for wildcard plugins (registered with '*')
    const wildcardPlugins = this.plugins.get('*');
    if (wildcardPlugins) {
      for (const plugin of wildcardPlugins) {
        await plugin['visitAny']?.(node, this, context);
      }
    }
  }

  /**
   * Walk through the entire AST tree starting from the root node
   * @param rootNode The root node to start walking from
   * @param context Optional context object that will be passed to all plugins
   * @param visitOrder The order in which to visit nodes ('pre-order' or 'post-order')
   */
  async walk(rootNode: ASTNode, context?: any, visitOrder: 'pre-order' | 'post-order' = 'pre-order'): Promise<void> {
    if (visitOrder === 'pre-order') {
      // Visit the current node first
      await this.visitNode(rootNode, context);

      // Then visit children
      if (rootNode.children) {
        for (const child of rootNode.children) {
          await this.walk(child, context, visitOrder);
        }
      }
    } else {
      // Visit children first
      if (rootNode.children) {
        for (const child of rootNode.children) {
          await this.walk(child, context, visitOrder);
        }
      }

      // Then visit the current node
      await this.visitNode(rootNode, context);
    }
  }

  /**
   * Get all registered plugins for a specific node type
   * @param nodeType The node type to get plugins for
   * @returns Array of plugins registered for the node type
   */
  getPluginsForNodeType(nodeType: string): ASTVisitorPlugin[] {
    return this.plugins.get(nodeType) || [];
  }

  /**
   * Get all registered node types
   * @returns Array of all node types that have registered plugins
   */
  getRegisteredNodeTypes(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Clear all registered plugins
   */
  clearPlugins(): void {
    this.plugins.clear();
  }

  /**
   * Extract type information from an AST node
   * @param node The AST node to extract type from
   * @returns The type string if found, or 'unknown' if not found
   */
  getNodeType(node: ASTNode): string {
    if (!node.arcana) {
      return 'unknown';
    }

    // Parse the arcana field to extract type information
    // Typical format: "NodeKind <address> <location> 'type' [additional info]"
    // Example: "BinaryOperator <0x12345> <col:12, col:1> 'bool' '||'"
    // Example: "VarDecl <0x789> <col:1, col:20> 'std::vector<int>' varName"

    // Look for quoted type information
    const typeMatch = node.arcana.match(/'([^']+)'/);
    if (typeMatch && typeMatch[1]) {
      return typeMatch[1];
    }

    // If no quoted type found, try to extract from the arcana string
    // Some nodes might have different formats
    const parts = node.arcana.split(' ');
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith("'") && parts[i].endsWith("'")) {
        return parts[i].slice(1, -1);
      }
    }

    return 'unknown';
  }

  /**
   * Schedule to update the VS Code document with new code from an AST node
   * @param node The AST node containing the new code and range information
   * @returns boolean indicating whether the scheduling was successful
   */
  updateDocumentFromNode(node: ASTNode): boolean {
    try {
      // Check if node has the required information
      if (!node.range || !node.detail) {
        console.warn('Node missing range or detail information for document update');
        return false;
      }

      // Get the active text editor
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        console.warn('No active text editor found');
        return false;
      }

      // Convert language server range to VS Code range
      const vscodeRange = new vscode.Range(
        new vscode.Position(node.range.start.line, node.range.start.character),
        new vscode.Position(node.range.end.line, node.range.end.character),
      );

      // Schedule to replace the text at the node's range with the new detail
      this.pendingEdits.replace(activeEditor.document.uri, vscodeRange, node.detail);

      return true;
    } catch (error) {
      console.error('Error updating document from node:', error);
      return false;
    }
  }

  /**
   * Schedule to update the VS Code document from the node with raw code
   * @param node The AST node containing the range information
   * @param raw The raw code to insert
   * @returns boolean indicating whether the scheduling was successful
   */
  updateDocumentNodeWithRawCode(node: ASTNode, raw: string): boolean {
    try {
      // Check if node has the required information
      if (!node.range) {
        console.warn('Node missing range information for document update');
        return false;
      }

      // Get the active text editor
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        console.warn('No active text editor found');
        return false;
      }

      // Convert language server range to VS Code range
      const vscodeRange = new vscode.Range(
        new vscode.Position(node.range.start.line, node.range.start.character),
        new vscode.Position(node.range.end.line, node.range.end.character),
      );

      // Schedule to replace the text at the node's range with the new detail
      this.pendingEdits.replace(activeEditor.document.uri, vscodeRange, raw);

      return true;
    } catch (error) {
      console.error('Error updating document from node:', error);
      return false;
    }
  }

  /**
   * Schedule to add a leading comment before an AST node
   * @param node The AST node to add Comment before
   * @param Comment The Comment text to add (without delimiters)
   * @returns boolean indicating whether the scheduling was successful
   */
  addLeadingComment(node: ASTNode, Comment: string): boolean {
    try {
      if (!node.range) {
        console.warn('Node missing range information for adding leading Comment');
        return false;
      }

      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        console.warn('No active text editor found');
        return false;
      }

      const CommentText = `/* ${Comment} */ `;
      const insertPosition = new vscode.Position(node.range.start.line, node.range.start.character);
      this.pendingEdits.insert(activeEditor.document.uri, insertPosition, CommentText);

      return true;
    } catch (error) {
      console.error('Error adding leading Comment:', error);
      return false;
    }
  }

  /**
   * Schedule to add a trailing comment
   * @param node The AST node to add comment after
   * @param Comment The Comment text to add (without delimiters)
   * @param atEndOfLine If true, adds the comment at the end of the line instead of at right after the node
   * @returns boolean indicating whether the scheduling was successful
   */
  addTrailingComment(node: ASTNode, Comment: string, atEndOfLine: boolean = false): boolean {
    try {
      if (!node.range) {
        console.warn('Node missing range information for adding trailing Comment');
        return false;
      }

      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        console.warn('No active text editor found');
        return false;
      }

      const CommentText = ` /* ${Comment} */`;
      let insertPosition: vscode.Position;

      if (atEndOfLine) {
        // Add comment at the end of the line
        const document = activeEditor.document;
        const line = document.lineAt(node.range.end.line);
        insertPosition = new vscode.Position(node.range.end.line, line.text.length);
      } else {
        // Add comment at the end of the node (original behavior)
        insertPosition = new vscode.Position(node.range.end.line, node.range.end.character);
      }

      this.pendingEdits.insert(activeEditor.document.uri, insertPosition, CommentText);

      return true;
    } catch (error) {
      console.error('Error adding trailing Comment:', error);
      return false;
    }
  }

  /**
   * Schedule to insert a line before the given node
   * @param node The AST node to add the text before
   * @param text The text to insert
   * @param keepIdentation If true, keeps the indentation of the node's line
   * @returns boolean indicating whether the scheduling was successful
   */
  insertLineBeforeNode(node: ASTNode, text: string, keepIdentation = true): boolean {
    try {
      if (!node.range) {
        console.warn('Node missing range information for inserting text after node');
        return false;
      }

      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        console.warn('No active text editor found');
        return false;
      }

      const insertPosition = new vscode.Position(node.range.end.line, 0);

      const line = activeEditor.document.lineAt(node.range.end.line);
      const indent = keepIdentation ? line.text.match(/^\s*/)?.[0] || '' : '';

      this.pendingEdits.insert(activeEditor.document.uri, insertPosition, `${indent}${text}\n`);

      return true;
    } catch (error) {
      console.error('Error inserting text after node:', error);
      return false;
    }
  }

  /**
   * Schedule to apply regex a replacement in the node's range
   * @param node The AST node to add comment after
   * @param regex The regex pattern to match
   * @param replace The string to replace the matched text with
   * @returns boolean indicating whether the scheduling was successful
   */
  applyRegexReplace(node: ASTNode, regex: RegExp, replace: string): boolean {
    try {
      if (!node.range) {
        console.warn('Node missing range information for applying regex replacement');
        return false;
      }

      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        console.warn('No active text editor found');
        return false;
      }

      const vscodeRange = new vscode.Range(
        new vscode.Position(node.range.start.line, node.range.start.character),
        new vscode.Position(node.range.end.line, node.range.end.character),
      );

      const text = activeEditor.document.getText(vscodeRange);
      const newText = text.replace(regex, replace);

      this.pendingEdits.replace(activeEditor.document.uri, vscodeRange, newText);

      return true;
    } catch (error) {
      console.error('Error applying regex replacement:', error);
      return false;
    }
  }

  /**
   * Get the trailing comment from the line where the node ends
   * @param node The AST node to get the trailing comment from
   * @returns The trailing comment text if found, or an empty string if not found
   */
  async getTrailingComment(node: ASTNode): Promise<string> {
    if (!node.range) {
      console.warn('Node missing range information for adding trailing Comment');
      return '';
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      console.warn('No active text editor found');
      return '';
    }

    const line = activeEditor.document.lineAt(node.range.end.line);

    const comment = /\/\*(.*)\*\//.exec(line.text);
    if (!comment || comment.length < 2) {
      return '';
    }

    return comment[1].trim();
  }

  /**
   * Get the definition of an AST node
   * @param node The AST node to get the definition for
   * @returns The definition AST node if found, or null if not found
   */
  async getDefinition(node: ASTNode): Promise<ASTNode | null> {
    if (!node.range) {
      console.warn('Node missing range information for adding trailing Comment');
      return null;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      console.warn('No active text editor found');
      return null;
    }

    const converter = this.client.code2ProtocolConverter;
    const position = new vscode.Position(node.range.start.line, node.range.start.character);

    const definition = await this.client.sendRequest(
      DefinitionRequest.type,
      converter.asTextDocumentPositionParams(activeEditor.document, position),
    );

    if (!definition || !Array.isArray(definition) || definition.length === 0) {
      console.warn('No definition found for the node');
      return null;
    }

    if (!('range' in definition[0])) {
      console.warn('Definition does not contain a range');
      return null;
    }

    const item = await this.client.sendRequest(ASTRequestType, {
      textDocument: converter.asTextDocumentIdentifier(activeEditor.document),
      range: definition[0].range,
    });

    return item;
  }

  /**
   * Apply all pending edits to the active document
   * @returns Promise that resolves when all edits are applied
   */
  async applyPendingEdits(): Promise<void> {
    const result = await vscode.workspace.applyEdit(this.pendingEdits);
    if (!result) {
      vscode.window.showErrorMessage(`Failed to apply the edit. Check the console for details.`);
    }
  }
}
