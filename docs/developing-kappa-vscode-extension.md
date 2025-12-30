# Developing the Kappa VS Code extension

## Testing

Kappa has two types of tests:

### Unit Tests

Unit tests are fast, lightweight tests that don't require launching VS Code. They test individual functions and utilities in isolation using [Vitest](https://vitest.dev/).

**Run all unit tests:**

```bash
yarn tests:unit
```

**Run unit tests in watch mode:**

```bash
yarn tests:unit:watch
```

**Writing unit tests:**

Unit test files should be placed next to the source code they test with a `.spec.ts` extension. For example:

- Source: `src/utils/asm-utils.ts`
- Tests: `src/utils/asm-utils.spec.ts`

```typescript
import { describe, expect, it } from 'vitest';

import { myFunction } from './my-module';

describe('.myFunction', () => {
  it('does something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });
});
```

Unit tests automatically mock the `vscode` module using `src/__mocks__/vscode.ts`, so you don't need VS Code APIs available. If you need additional VS Code API mocks for your tests, add them to this centralized mock file.

### E2E Tests

End-to-end (e2e) tests launch a real VS Code instance and test the extension's behavior using WebDriver. These tests are slower but test the full integration with VS Code.

**Run all e2e tests:**

```bash
yarn tests:e2e
```

**Run a specific e2e test file** by providing a filter pattern:

```bash
yarn tests:e2e [test-file-pattern]
```

Example: run any test file matching `*example-kappa-plugins*.spec.ts`:

```bash
yarn tests:e2e example-kappa-plugins
```

E2E test files are located in `src/tests-e2e/` and use the WebdriverIO framework with Mocha.

## When to use each type of test

- **Use unit tests** for:
  - Testing utility functions (parsing, formatting, transformations)
  - Testing business logic that doesn't require VS Code APIs
  - Fast feedback during development

- **Use e2e tests** for:
  - Testing VS Code commands and UI interactions
  - Testing language server integrations
  - Testing webview functionality
  - Testing the full extension activation and behavior
