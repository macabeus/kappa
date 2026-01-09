# Creating Your Own Kappa Plugin

Kappa plugins allow you to transform C code by visiting and modifying AST nodes. This guide will help you create your own plugin.

## Quick Start

For examples and templates, check out the [`example-kappa-plugins`](./example-kappa-plugins) directory.

## Plugin Structure

Every Kappa plugin follows this basic structure:

```js
export default class MyPlugin {
  get testsSpec() {
    return [];
  }

  async visit{NodeKind}(node, visitor, context) {
    // Your transformation logic here
  }
}
```

## Core Methods

### Visitor Methods

A plugin uses the visitor pattern to traverse the AST. You can implement methods the following methods:

- **`visit{NodeKind}(node, visitor, context)`** - Called when a node of kind `{NodeKind}` is encountered
- **`visitAny(node, visitor, context)`** - Called for every node (useful for debugging)

**Finding Node Kinds:**
The are two easy ways to to discover available node kinds:

- using the `visitAny(node, visitor, context)` method and printing `node.kind()` during traversal
- by exploring the [`ast-grep` playground](https://ast-grep.github.io/playground.html#eyJtb2RlIjoiQ29uZmlnIiwibGFuZyI6ImMiLCJxdWVyeSI6IiIsInJld3JpdGUiOiIiLCJzdHJpY3RuZXNzIjoic21hcnQiLCJzZWxlY3RvciI6IiIsImNvbmZpZyI6IiMgWUFNTCBSdWxlIGlzIG1vcmUgcG93ZXJmdWwhXG4jIGh0dHBzOi8vYXN0LWdyZXAuZ2l0aHViLmlvL2d1aWRlL3J1bGUtY29uZmlnLmh0bWwjcnVsZVxucnVsZTpcbiAgYW55OlxuICAgIC0gcGF0dGVybjogeFxuIiwic291cmNlIjoiaW50IG1haW4oKSB7XG4gIGludCB4O1xuICB4ID0gNDI7XG4gIHJldHVybiAwO1xufSJ9)

**Example:**

```js
async visitBinaryOperator(node, visitor) {
  // Handle binary operations like +, -, *, /
}

async visitRecord(node, visitor) {
  // Handle the `struct` statement
}
```

### Modifying the Source Code

Use these methods to transform the source code:

#### `visitor.updateDocumentNodeWithRawCode(node: ASTNode, raw: string)`

Replace an AST node with the provided raw code string.

**Example:**

```js
visitor.updateDocumentNodeWithRawCode(integerNode, `Q(${value})`);
```

#### `visitor.updateDocumentFromNode(node: ASTNode)`

Update the document after modifying a node's properties in-place.

**Example:**

```js
integerNode.detail = `${Number(integerNode.detail) * 2}`;
visitor.updateDocumentFromNode(integerNode);
```

#### `visitor.addLeadingComment(node: ASTNode, comment: string)`

Add a comment at the beginning of the line containing the specified node.

**Example:**

```js
visitor.addLeadingComment(node, 'Example');
```

#### `visitor.addTrailingComment(node: ASTNode, comment: string, atEndOfLine: boolean = false)`

Add a trailing comment after the specified node. When `atEndOfLine` is `true`, the comment will always be placed at the end of the line.

**Example:**

```js
visitor.addTrailingComment(node, 'Example', true);
```

#### `visitor.insertLineBeforeNode(node: ASTNode, text: string, keepIdentation: boolean = true)`

Insert a new line of text before the specified node. When `keepIdentation` is `true`, the inserted text will maintain the same indentation as the node's line.

**Example:**

```js
visitor.insertLineBeforeNode(node, 'printf("Debug: entering function");');
```

#### `visitor.insertLineAfterNode(node: ASTNode, text: string, keepIdentation: boolean = true)`

Insert a new line of text after the specified node. When `keepIdentation` is `true`, the inserted text will maintain the same indentation as the node's line.

**Example:**

```js
visitor.insertLineAfterNode(node, 'printf("Debug: exiting function");');
```

#### `visitor.applyRegexReplace(node: ASTNode, regex: RegExp, replace: string)`

Apply a regular expression replacement to the text content of the specified node's range.

**Example:**

```js
visitor.applyRegexReplace(node, /\bint\b/g, 'int32_t');
```

### Test Specification

The `testsSpec` getter defines test cases for your plugin:

```ts
get testsSpec(): Array<{
  name: string;
  description: string;
  given: string;
  then: string;
}>
```

**Properties:**

- **`name`** - Short test case name
- **`description`** - What the plugin should do
- **`given`** - Input C code with a cursor position marker
- **`then`** - Expected output after transformation

**Cursor Position:**
Mark where the plugin should run using a comment with a single asterisk:

```c
//   *
```

The plugin will execute at the column position of the asterisk on the following line.
