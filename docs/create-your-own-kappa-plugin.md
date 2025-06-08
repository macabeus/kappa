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

Kappa uses the visitor pattern to traverse the AST. You can implement methods for specific node types:

- **`visit{NodeType}(node, visitor)`** - Called when a node of type `{NodeType}` is encountered
- **`visitAny(node, visitor)`** - Called for every node (useful for debugging)

**Finding Node Types:**
The easiest way to discover available node types is by exploring the AST using the [`vscode-clangd`](https://github.com/clangd/vscode-clangd) extension.

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

Here's a complete plugin that converts hex values to Q notation:

```js
export default class AddOffsetCommentsPlugin {
  get testsSpec() {
    return [
      {
        name: 'Simple',
        description: 'It adds offset comments to a self-contained struct',
        given: `
          #include <stdint.h>

          typedef uint8_t u8;
          typedef uint16_t u16;
          typedef int16_t s32;

          //       *
          typedef struct {
            u8 foo;
            u16 bar;
            s32 baz;
          } Example;
        `,
        then: `
          #include <stdint.h>

          typedef uint8_t u8;
          typedef uint16_t u16;
          typedef int16_t s32;

          //       *
          typedef struct {
            /* 0x00 */ u8 foo;
            /* 0x02 */ u16 bar;
            /* 0x04 */ s32 baz;
          } Example; /* size: 0x08 */
        `,
      },

      {
        name: 'Transitive Struct',
        description: 'It adds offset comments to a struct that uses another struct',
        given: `
          #include <stdint.h>

          typedef uint8_t u8;
          typedef uint16_t u16;
          typedef int16_t s32;
          typedef int16_t u32;

          typedef struct {
            /* 0x00 */ s32 x;
            /* 0x04 */ s32 y;
          } Vec2_32; /* size: 0x08 */

          //       *
          typedef struct {
            u8 foo;
            Vec2_32 qValue;
            u16 bar;
            s32 baz;
            u32 qux;
          } Aotento;
        `,
        then: `
          #include <stdint.h>

          typedef uint8_t u8;
          typedef uint16_t u16;
          typedef int16_t s32;
          typedef int16_t u32;

          typedef struct {
            /* 0x00 */ s32 x;
            /* 0x04 */ s32 y;
          } Vec2_32; /* size: 0x08 */

          //       *
          typedef struct {
            /* 0x00 */ u8 foo;
            /* 0x08 */ Vec2_32 qValue;
            /* 0x10 */ u16 bar;
            /* 0x14 */ s32 baz;
            /* 0x18 */ u32 qux;
          } Aotento; /* size: 0x20 */
        `,
      },
    ];
  }

  async visitRecord(node, visitor) {
    let lastOffset = 0;

    for (const child of node.children) {
      if (child.kind === 'Field') {
        const type = visitor.getNodeType(child);
        const size = mapTypeToSize[type] ?? (await getSize(child, visitor));

        // Calculate aligned offset for this field
        const alignedOffset = getAlignedOffset(lastOffset, size);

        await visitor.addLeadingComment(child, `0x${alignedOffset.toString(16).padStart(2, '0').toUpperCase()}`);

        lastOffset = alignedOffset + size;
      }
    }

    // Apply final alignment to the total struct size
    const finalSize = getAlignedOffset(lastOffset, MEMORY_ALIGNMENT);
    await visitor.addTrailingComment(node, `size: 0x${finalSize.toString(16).padStart(2, '0').toUpperCase()}`, true);
  }
}
```
