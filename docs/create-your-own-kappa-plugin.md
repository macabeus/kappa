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

  async visit{NodeType}(node, visitor) {
    // Your transformation logic here
  }
}
```

## Core Methods

### Visitor Methods

A plugin uses the visitor pattern to traverse the AST. You can implement methods the following methods:

- **`visit{NodeType}(node, visitor)`** - Called when a node of type `{NodeType}` is encountered
- **`visitAny(node, visitor)`** - Called for every node (useful for debugging)

**Finding Node Types:**
The are two easy ways to to discover available node types:

- using the `visitAny(node, visitor)` method and printing `node.kind`
- by exploring the AST using the [`vscode-clangd`](https://github.com/clangd/vscode-clangd) extension

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

## Complete Examples

Here's a complete plugin that converts literal integer with Q notation on assignments for `Vec2_32` fields:

```js
export default class ApplyQNotationPlugin {
  get testsSpec() {
    return [
      {
        name: 'Convert hex to Q notation',
        description: 'Replaces integer assignments with Q notation for Vec2_32 fields',
        given: `
          #include <stdio.h>

          #define Q_24_8(n) ((s32)((n) * 256))
          #define Q(n) Q_24_8(n)

          typedef int32_t s32;

          typedef struct {
            s32 x;
            s32 y;
          } Vec2_32;

          struct Example {
            Vec2_32 qValue;
          };

          //   *
          int main() {
            struct Example example;
            example.qValue.x = 0x100;
            example.qValue.y = 0x80;
            return 0;
          }
        `,
        then: `
          #include <stdio.h>

          #define Q_24_8(n) ((s32)((n) * 256))
          #define Q(n) Q_24_8(n)

          typedef int32_t s32;

          typedef struct {
            s32 x;
            s32 y;
          } Vec2_32;

          struct Example {
            Vec2_32 qValue;
          };

          //   *
          int main() {
            struct Example example;
            example.qValue.x = Q(1);
            example.qValue.y = Q(0.5);
            return 0;
          }
        `,
      },
    ];
  }

  async visitBinaryOperator(node, visitor) {
    if (node.detail === '=' && node.children?.[1].kind === 'IntegerLiteral') {
      const leftChild = node.children[0];

      if (leftChild.children?.[0] && visitor.getNodeType(leftChild.children[0]) === 'Vec2_32') {
        const leftChildType = visitor.getNodeType(leftChild);

        if (leftChildType === 's32') {
          const rightChild = node.children[1];
          const rawValue = Number(rightChild.detail);
          const qNotationValue = rawValue / 256;

          visitor.updateDocumentNodeWithRawCode(rightChild, `Q(${qNotationValue})`);
        }
      }
    }
  }
}
```
