# AST Visitor Tests Documentation

This document describes the comprehensive test suite for the AST Visitor system.

## Test Files

### 1. `ast-visitor.test.ts`

Tests the core `ASTVisitor` class functionality:

#### Basic Functionality Tests

- **Empty visitor creation**: Verifies new visitor starts with no registered plugins
- **Plugin registration**: Tests single and multiple plugin registration
- **Multi-type plugins**: Tests plugins that handle multiple node types
- **Plugin unregistration**: Verifies plugins can be removed
- **Plugin clearing**: Tests clearing all registered plugins

#### Tree Walking Tests

- **Single node visits**: Tests visiting a single AST node
- **Pre-order traversal**: Verifies parent nodes are visited before children
- **Post-order traversal**: Verifies children are visited before parent
- **Deep nesting**: Tests walking through deeply nested tree structures
- **Unregistered types**: Ensures unregistered node types are ignored
- **Empty children**: Handles nodes with empty children arrays

#### Async Support Tests

- **Async plugins**: Tests plugins with async `visit` methods
- **Multiple async plugins**: Ensures multiple async plugins work together

#### Context Passing Tests

- **Context propagation**: Verifies context is passed to all plugins
- **Undefined context**: Handles cases with no context provided

#### Built-in Plugin Tests

- **BinaryOperatorLoggerPlugin**: Tests logging of binary operators
- **StatementCounterPlugin**: Tests counting of different statement types
- **Plugin state management**: Tests resetting and retrieving plugin state

#### Edge Cases and Error Handling

- **Missing properties**: Handles nodes without optional properties
- **Empty plugin types**: Handles plugins with no registered types
- **Non-existent operations**: Tests graceful handling of invalid operations
- **Plugin errors**: Ensures plugin exceptions are properly propagated
- **Async rejections**: Tests handling of async plugin failures

#### Integration Tests

- **Complex scenarios**: Tests multiple plugins working together on complex AST trees

### 2. `ast-visitor-examples.test.ts`

Tests the example plugins and utility functions:

#### FunctionDeclarationCollectorPlugin Tests

- **Node type registration**: Verifies correct node types are handled
- **Function collection**: Tests collecting function declarations
- **Missing details**: Handles functions without detail information
- **State management**: Tests clearing and retrieving collected functions
- **Array isolation**: Ensures returned arrays are independent copies

#### VariableDeclarationPlugin Tests

- **Multiple node types**: Tests handling of `VarDecl` and `ParmVarDecl`
- **Variable collection**: Tests extracting variable information
- **Type extraction**: Tests parsing type information from `arcana` field
- **Missing information**: Handles variables without complete information
- **State management**: Tests clearing and retrieving collected variables

#### ASTValidationPlugin Tests

- **Wildcard handling**: Tests the `*` node type for universal matching
- **Validation rules**: Tests detection of missing required fields
- **Invalid children**: Tests detection of malformed child nodes
- **Valid structures**: Ensures valid nodes pass validation
- **Issue management**: Tests clearing and retrieving validation issues

#### Integration Tests

- **Multi-plugin scenarios**: Tests multiple plugins working together
- **Mixed validity**: Tests handling of both valid and invalid nodes in the same tree

#### demonstrateASTVisitor Function Tests

- **End-to-end functionality**: Tests the complete demonstration function
- **Empty AST handling**: Tests behavior with minimal AST structures
- **Unknown node types**: Tests handling of unrecognized node types
- **VSCode integration**: Tests mocked VSCode API interactions

## Test Data Structures

### Mock AST Nodes

The tests use helper functions to create mock `ASTNode` objects:

```typescript
function createTestNode(
  kind: string,
  role: string = "expression",
  children?: ASTNode[],
  detail?: string,
  arcana?: string
): ASTNode;
```

### Mock VSCode Range

Tests use a consistent mock range object:

```typescript
const mockRange = {
  start: { line: 1, character: 5 },
  end: { line: 1, character: 15 },
};
```

## Test Coverage

The test suite provides comprehensive coverage of:

1. **Core Functionality**: All public methods and properties
2. **Error Scenarios**: Exception handling and edge cases
3. **Async Operations**: Promise-based plugin execution
4. **Plugin Architecture**: Registration, execution, and management
5. **Tree Traversal**: Both depth-first orders (pre and post)
6. **Context Management**: Data flow between visitor and plugins
7. **Integration**: Multiple plugins working together
8. **Real-world Usage**: Practical examples and utilities

## Running Tests

Execute the test suite with:

```bash
npm test
```

Or compile and run tests separately:

```bash
npm run compile-tests
npm run test
```

## Test Results

All 53 tests should pass, covering:

- ✅ 25 core AST visitor tests
- ✅ 25 example plugin tests
- ✅ 3 integration demonstration tests

The tests verify that the AST visitor system is robust, extensible, and ready for production use in analyzing C/C++ abstract syntax trees from clangd.
