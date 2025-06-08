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

  async visitCompound(node, visitor) {
    // Collect all variable declarations that have initializers and are not at the top
    const declarations = [];
    let firstNonDeclNode = null;

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];

      if (child.kind === 'Decl') {
        if (firstNonDeclNode) {
          declarations.push(child);
        }
      } else if (!firstNonDeclNode) {
        firstNonDeclNode = node.children[i];
      }
    }

    // Update the block to lift the declarations
    for (const decl of declarations) {
      // Add the declaration to the top of the block
      visitor.insertLineBeforeNode(
        firstNonDeclNode,
        `${decl.children[0].children[0].detail} ${decl.children[0].detail};`,
      );

      // Remove the declaration from its original position
      visitor.applyRegexReplace(decl, /^[\w\d]+\s+/, '');
    }
  }
}
