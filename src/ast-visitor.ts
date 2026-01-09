import type { SgNode } from '@ast-grep/napi';
import * as vscode from 'vscode';

/**
 * Plugin interface for the AST visitor.
 * Plugins can define methods for specific node kinds, similar to Babel visitors.
 */
export interface ASTVisitorPlugin {
  /**
   * Special method that handles all node kinds (wildcard)
   * @param node The AST node being visited
   * @param visitor The AST visitor instance (for accessing utility methods)
   * @param context Optional context object that can be passed between plugins
   */
  visitAny?: (node: SgNode, visitor: ASTVisitor, context?: any) => void | Promise<void>;

  /**
   * Dynamic methods for specific node kinds
   * Method names should be prefixed with `visit` and match the node kind in PascalCase.
   * ast-grep node kinds are in snake_case (e.g., assignment_expression, struct_specifier),
   * but visitor methods should use PascalCase (e.g., visitAssignmentExpression, visitStructSpecifier).
   * Each visitor method should have the signature: (node: SgNode, visitor: ASTVisitor, context?: any) => void | Promise<void>
   */
  [key: string]: ((node: SgNode, visitor: ASTVisitor, context?: any) => void | Promise<void>) | any;
}

/**
 * Convert snake_case to PascalCase
 * @param str The snake_case string to convert
 * @returns The PascalCase string
 */
function snakeToPascal(str: string): string {
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Visitor class that walks through an AST tree and executes plugins
 * based on node types.
 */
export class ASTVisitor {
  private pendingEdits = new vscode.WorkspaceEdit();
  private plugins: Map<string, ASTVisitorPlugin[]> = new Map();

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
      if (methodName === 'visitAny') {
        // Special case for wildcard
        const pluginsCallingWildcard = this.plugins.get('*');
        if (pluginsCallingWildcard) {
          pluginsCallingWildcard.push(plugin);
        } else {
          this.plugins.set('*', [plugin]);
        }
      } else {
        const pascalCaseKind = methodName.replace('visit', '');
        const pluginsCallingThisKind = this.plugins.get(pascalCaseKind);
        if (pluginsCallingThisKind) {
          pluginsCallingThisKind.push(plugin);
        } else {
          this.plugins.set(pascalCaseKind, [plugin]);
        }
      }
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
  private async visitNode(node: SgNode, context?: any): Promise<void> {
    const nodeKind = `${node.kind()}`;
    const pascalCaseKind = snakeToPascal(nodeKind);

    // Check for plugins registered for this specific node type
    const pluginsForType = this.plugins.get(pascalCaseKind);
    if (pluginsForType) {
      const methodName = `visit${pascalCaseKind}`;
      for (const plugin of pluginsForType) {
        await plugin[methodName]?.(node, this, context);
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
  async walk(rootNode: SgNode, context?: any, visitOrder: 'pre-order' | 'post-order' = 'pre-order'): Promise<void> {
    if (visitOrder === 'pre-order') {
      // Visit the current node first
      await this.visitNode(rootNode, context);

      // Then visit children
      const children = rootNode.children();
      for (const child of children) {
        await this.walk(child, context, visitOrder);
      }
    } else {
      // Visit children first
      const children = rootNode.children();
      for (const child of children) {
        await this.walk(child, context, visitOrder);
      }

      // Then visit the current node
      await this.visitNode(rootNode, context);
    }
  }

  /**
   * Clear all registered plugins
   */
  clearPlugins(): void {
    this.plugins.clear();
  }

  /**
   * Schedule to update the VS Code document with new code from an AST node
   * @param node The AST node containing the new code and range information
   * @returns boolean indicating whether the scheduling was successful
   */
  updateDocumentFromNode(node: SgNode): boolean {
    try {
      // Get the active text editor
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        console.warn('No active text editor found');
        return false;
      }

      // Get node range from ast-grep
      const range = node.range();
      const text = node.text();

      // Convert ast-grep range to VS Code range
      const vscodeRange = new vscode.Range(
        new vscode.Position(range.start.line, range.start.column),
        new vscode.Position(range.end.line, range.end.column),
      );

      // Schedule to replace the text at the node's range with the new text
      this.pendingEdits.replace(activeEditor.document.uri, vscodeRange, text);

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
  updateDocumentNodeWithRawCode(node: SgNode, raw: string): boolean {
    try {
      // Get the active text editor
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        console.warn('No active text editor found');
        return false;
      }

      // Get node range from ast-grep
      const range = node.range();

      // Convert ast-grep range to VS Code range
      const vscodeRange = new vscode.Range(
        new vscode.Position(range.start.line, range.start.column),
        new vscode.Position(range.end.line, range.end.column),
      );

      // Schedule to replace the text at the node's range with the raw code
      this.pendingEdits.replace(activeEditor.document.uri, vscodeRange, raw);

      return true;
    } catch (error) {
      console.error('Error updating document from node:', error);
      return false;
    }
  }

  /**
   * Schedule to add a leading comment before an AST node
   * @param node The AST node to add comment before
   * @param comment The comment text to add (without delimiters)
   * @returns boolean indicating whether the scheduling was successful
   */
  addLeadingComment(node: SgNode, comment: string): boolean {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        console.warn('No active text editor found');
        return false;
      }

      const range = node.range();
      const commentText = `/* ${comment} */ `;
      const insertPosition = new vscode.Position(range.start.line, range.start.column);
      this.pendingEdits.insert(activeEditor.document.uri, insertPosition, commentText);

      return true;
    } catch (error) {
      console.error('Error adding leading comment:', error);
      return false;
    }
  }

  /**
   * Schedule to add a trailing comment
   * @param node The AST node to add comment after
   * @param comment The comment text to add (without delimiters)
   * @param atEndOfLine If true, adds the comment at the end of the line instead of at right after the node
   * @returns boolean indicating whether the scheduling was successful
   */
  addTrailingComment(node: SgNode, comment: string, atEndOfLine: boolean = false): boolean {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        console.warn('No active text editor found');
        return false;
      }

      const range = node.range();
      const commentText = ` /* ${comment} */`;
      let insertPosition: vscode.Position;

      if (atEndOfLine) {
        // Add comment at the end of the line
        const document = activeEditor.document;
        const line = document.lineAt(range.end.line);
        insertPosition = new vscode.Position(range.end.line, line.text.length);
      } else {
        // Add comment at the end of the node (original behavior)
        insertPosition = new vscode.Position(range.end.line, range.end.column);
      }

      this.pendingEdits.insert(activeEditor.document.uri, insertPosition, commentText);

      return true;
    } catch (error) {
      console.error('Error adding trailing comment:', error);
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
  insertLineBeforeNode(node: SgNode, text: string, keepIdentation = true): boolean {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        console.warn('No active text editor found');
        return false;
      }

      const range = node.range();
      const insertPosition = new vscode.Position(range.end.line, 0);

      const line = activeEditor.document.lineAt(range.end.line);
      const indent = keepIdentation ? line.text.match(/^\s*/)?.[0] || '' : '';

      this.pendingEdits.insert(activeEditor.document.uri, insertPosition, `${indent}${text}\n`);

      return true;
    } catch (error) {
      console.error('Error inserting text after node:', error);
      return false;
    }
  }

  /**
   * Schedule to insert a line after the given node
   * @param node The AST node to add the text before
   * @param text The text to insert
   * @param keepIdentation If true, keeps the indentation of the node's line
   * @returns boolean indicating whether the scheduling was successful
   */
  insertLineAfterNode(node: SgNode, text: string, keepIdentation = true): boolean {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        console.warn('No active text editor found');
        return false;
      }

      const range = node.range();
      const insertPosition = new vscode.Position(range.end.line + 1, 0);

      const line = activeEditor.document.lineAt(range.end.line);
      const indent = keepIdentation ? line.text.match(/^\s*/)?.[0] || '' : '';

      const finalText = `${indent}${text}\n`;

      this.pendingEdits.insert(activeEditor.document.uri, insertPosition, finalText);

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
  applyRegexReplace(node: SgNode, regex: RegExp, replace: string): boolean {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        console.warn('No active text editor found');
        return false;
      }

      const range = node.range();
      const vscodeRange = new vscode.Range(
        new vscode.Position(range.start.line, range.start.column),
        new vscode.Position(range.end.line, range.end.column),
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
  getTrailingComment(node: SgNode): string {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      console.warn('No active text editor found');
      return '';
    }

    const range = node.range();
    const line = activeEditor.document.lineAt(range.end.line);

    const comment = /\/\*(.*)\*\//.exec(line.text);
    if (!comment || comment.length < 2) {
      return '';
    }

    return comment[1].trim();
  }

  /**
   * Get the definition node from a given identifier node.
   * It's a best effort attempt and may return null if it's definied outside the current file.
   * @param node The AST node to get the definition for
   * @returns The declaration node if found, null otherwise
   */
  getIdentifierDeclaration(identiferNode: SgNode): SgNode | null {
    const identifierName = identiferNode.text();

    // Helper function to check if a node is a declaration of the given identifier
    const isDeclarationOf = (node: SgNode, name: string): boolean => {
      const kind = node.kind();

      // TODO: Add more declaration kinds as needed

      // Check for typedef
      if (kind === 'type_definition') {
        const typedefNodeName = node.children().at(-2); // Usually the second last child is the typedef name
        if (typedefNodeName && typedefNodeName.text() === name) {
          return true;
        }
      }

      return false;
    };

    // Helper function to search for declaration in a scope node
    const findDeclarationInScope = (scopeNode: SgNode, name: string): SgNode | null => {
      const children = scopeNode.children();

      for (const child of children) {
        if (isDeclarationOf(child, name)) {
          return child;
        }

        // Recursively search in nested blocks
        if (child.kind() === 'compound_statement' || child.kind() === 'declaration') {
          const nestedDecl = findDeclarationInScope(child, name);
          if (nestedDecl) {
            return nestedDecl;
          }
        }
      }

      return null;
    };

    // Start from the identifier node and traverse up the tree
    let currentNode: SgNode | null = identiferNode.parent();

    while (currentNode) {
      const kind = currentNode.kind();

      // Check if we're in a scope that can contain declarations
      if (
        kind === 'compound_statement' ||
        kind === 'function_definition' ||
        kind === 'translation_unit' ||
        kind === 'for_statement' ||
        kind === 'while_statement' ||
        kind === 'if_statement'
      ) {
        // For function definitions, check parameters first
        if (kind === 'function_definition') {
          const paramList = currentNode.find('parameter_list');
          if (paramList) {
            const decl = findDeclarationInScope(paramList, identifierName);
            if (decl) {
              return decl;
            }
          }
        }

        // Search for declaration in current scope
        const declaration = findDeclarationInScope(currentNode, identifierName);
        if (declaration) {
          return declaration;
        }
      }

      // Move up to parent scope
      currentNode = currentNode.parent();
    }

    return null;
  }

  /**
   * Apply all pending edits to the active document
   * @returns Promise that resolves when all edits are applied
   */
  async applyPendingEdits(): Promise<void> {
    if (this.pendingEdits.size === 0) {
      return;
    }

    const result = await vscode.workspace.applyEdit(this.pendingEdits);

    if (!result) {
      vscode.window.showErrorMessage(`Failed to apply the edit. Check the console for details.`);
    }
  }
}
