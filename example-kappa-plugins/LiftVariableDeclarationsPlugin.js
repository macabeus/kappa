/**
 * Plugin to lift variable declarations from the middle of compound statements to the top
 * to make C code ANSI compliant.
 *
 * For example, for the given file:
 *
 * ```c
 * int example(MyStruct *str) { // <-- Let's run the plugin on this function
 *   int strFoo = str->foo;
 *
 *   str->foo = 0x20;
 *
 *   int value = (str->foo) + strFoo;
 *
 *   return value;
 * }
 * ```
 *
 * The function will be transformed to:
 *
 * ```c
 * int example(MyStruct *str) {
 *   int strFoo = str->foo;
 *   int value;
 *
 *   str->foo = 0x20;
 *
 *   value = (str->foo) + strFoo;
 *
 *   return value;
 * }
 * ```
 */

export default class LiftVariableDeclarationsPlugin {
  get testsSpec() {
    return [
      {
        name: 'Simple variable lifting',
        description: 'Lifts variable declarations to the top of a compound statement',
        given: `
          typedef struct {
            int foo;
          } MyStruct;

          //     *
          int example(MyStruct *str) {
            str->foo = 0x20;
            int value = (str->foo) + 0x10;
            return value;
          }
        `,
        then: `
          typedef struct {
            int foo;
          } MyStruct;

          //     *
          int example(MyStruct *str) {
            int value;
            str->foo = 0x20;
            value = (str->foo) + 0x10;
            return value;
          }
        `,
      },

      {
        name: 'Variable lifting with other declarations',
        description: 'Lifts variable declarations to the top of the other declarations',
        given: `
          typedef struct {
            int foo;
            int bar;
          } MyStruct;

          //     *
          int example(MyStruct *str) {
            int strFoo = str->foo;
            int strBar = str->bar;
            str->foo = 0x20;
            int value = (str->foo) + strFoo;
            int value2 = (str->foo) - strFoo;
            return value + value2;
          }
        `,
        then: `
          typedef struct {
            int foo;
            int bar;
          } MyStruct;

          //     *
          int example(MyStruct *str) {
            int strFoo = str->foo;
            int strBar = str->bar;
            int value;
            int value2;
            str->foo = 0x20;
            value = (str->foo) + strFoo;
            value2 = (str->foo) - strFoo;
            return value + value2;
          }
        `,
      },

      {
        name: 'Nested blocks',
        description: 'Lifts variable declarations in nested compound statements',
        given: `
          typedef struct {
            int foo;
          } MyStruct;

          //     *
          int example(MyStruct *str) {
            int strFoo = str->foo;
            str->foo = 0x20;
            int value = (str->foo) + strFoo;
            if (strFoo) {
              int strFoo = str->foo;
              str->foo = 0x20;
              int value2 = (str->foo) + strFoo;
            }
            return value;
          }
        `,
        then: `
          typedef struct {
            int foo;
          } MyStruct;

          //     *
          int example(MyStruct *str) {
            int strFoo = str->foo;
            int value;
            str->foo = 0x20;
            value = (str->foo) + strFoo;
            if (strFoo) {
              int strFoo = str->foo;
              int value2;
              str->foo = 0x20;
              value2 = (str->foo) + strFoo;
            }
            return value;
          }
        `,
      },
    ];
  }

  async visitCompoundStatement(node, visitor) {
    const declarations = [];
    let firstNonDeclNode = null;

    // Find declarations with initializers that are not at the top
    for (const child of node.children()) {
      if (child.kind() === 'declaration') {
        const declarationChildren = child.children();

        // Check if this is a declaration with initializer (like "int value = expression;")
        const hasInitializer = declarationChildren.some(
          (dc) => dc.kind() === 'init_declarator' && dc.text().includes('='),
        );

        if (firstNonDeclNode && hasInitializer) {
          declarations.push(child);
        }
      } else if (!firstNonDeclNode && child.kind() !== '{' && child.kind() !== '}') {
        firstNonDeclNode = child;
      }
    }

    // Update the block to lift the declarations
    for (const decl of declarations) {
      const declChildren = decl.children();

      // Extract variable name and type from the declaration
      for (const declChild of declChildren) {
        if (declChild.kind() === 'init_declarator') {
          const initDeclChildren = declChild.children();
          if (initDeclChildren.length >= 3) {
            const varName = initDeclChildren[0].text();

            // Find the type from the declaration
            const typeSpec = declChildren.find(
              (dc) => dc.kind() === 'type_specifier' || dc.kind() === 'primitive_type',
            );
            const varType = typeSpec ? typeSpec.text() : 'int';

            // Add the declaration to the top of the block
            visitor.insertLineBeforeNode(firstNonDeclNode, `${varType} ${varName};`);

            // Replace the original declaration with just an assignment
            const assignmentText = `${varName} = ${initDeclChildren[2].text()};`;
            visitor.updateDocumentNodeWithRawCode(decl, assignmentText);
          }
        }
      }
    }
  }
}
