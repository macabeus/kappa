import * as vscode from 'vscode';
import { ASTNode } from './clangd/vscode-clangd';

/**
 * Plugin interface for the AST visitor.
 * Plugins can register to handle specific node types.
 */
export interface ASTVisitorPlugin {
  /**
   * The node types this plugin handles (e.g., 'BinaryOperator', 'IfStmt', etc.)
   */
  nodeTypes: string[];

  /**
   * The function to execute when visiting a node of the specified type
   * @param node The AST node being visited
   * @param visitor The AST visitor instance (for accessing utility methods)
   * @param context Optional context object that can be passed between plugins
   */
  visit(node: ASTNode, visitor: ASTVisitor, context?: any): void | Promise<void>;
}

/**
 * Visitor class that walks through an AST tree and executes plugins
 * based on node types.
 */
export class ASTVisitor {
  private plugins: Map<string, ASTVisitorPlugin[]> = new Map();

  constructor() {}

  /**
   * Register a plugin to handle specific node types
   * @param plugin The plugin to register
   */
  registerPlugin(plugin: ASTVisitorPlugin): void {
    for (const nodeType of plugin.nodeTypes) {
      if (!this.plugins.has(nodeType)) {
        this.plugins.set(nodeType, []);
      }
      this.plugins.get(nodeType)!.push(plugin);
    }
  }

  /**
   * Unregister a plugin
   * @param plugin The plugin to unregister
   */
  unregisterPlugin(plugin: ASTVisitorPlugin): void {
    for (const nodeType of plugin.nodeTypes) {
      const pluginsForType = this.plugins.get(nodeType);
      if (pluginsForType) {
        const index = pluginsForType.indexOf(plugin);
        if (index !== -1) {
          pluginsForType.splice(index, 1);
        }
        if (pluginsForType.length === 0) {
          this.plugins.delete(nodeType);
        }
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
        await plugin.visit(node, this, context);
      }
    }

    // Check for wildcard plugins (registered with '*')
    const wildcardPlugins = this.plugins.get('*');
    if (wildcardPlugins) {
      for (const plugin of wildcardPlugins) {
        await plugin.visit(node, this, context);
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
   * Update the VS Code document with new code from an AST node
   * @param node The AST node containing the new code and range information
   * @returns Promise<boolean> indicating whether the update was successful
   */
  async updateDocumentFromNode(node: ASTNode): Promise<boolean> {
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

      // Create a workspace edit
      const edit = new vscode.WorkspaceEdit();

      // Replace the text at the node's range with the new detail
      edit.replace(activeEditor.document.uri, vscodeRange, node.detail);

      // Apply the edit
      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        console.log(`Successfully updated document with new code: ${node.detail}`);
      } else {
        console.error('Failed to apply workspace edit');
      }

      return success;
    } catch (error) {
      console.error('Error updating document from node:', error);
      return false;
    }
  }

  /**
   * Update the VS Code document from the node with raw code
   * @param node The AST node containing the range information
   * @param raw The raw code to insert
   * @returns Promise<boolean> indicating whether the update was successful
   */
  async updateDocumentNodeWithRawCode(node: ASTNode, raw: string): Promise<boolean> {
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

      // Create a workspace edit
      const edit = new vscode.WorkspaceEdit();

      // Replace the text at the node's range with the new detail
      edit.replace(activeEditor.document.uri, vscodeRange, raw);

      // Apply the edit
      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        console.log(`Successfully updated document with new code: ${node.detail}`);
      } else {
        console.error('Failed to apply workspace edit');
      }

      return success;
    } catch (error) {
      console.error('Error updating document from node:', error);
      return false;
    }
  }
}
