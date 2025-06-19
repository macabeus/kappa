import { expect } from '@wdio/globals';
import { attachedCodeStorage } from '../prompt-builder/attached-code-storage.js';

describe('AttachedCodeStorage', () => {
  beforeEach(() => {
    // Clear storage before each test
    attachedCodeStorage.clear();
  });

  it('should store and retrieve attached code', () => {
    const testCode = 'int foo() { return 42; }';

    expect(attachedCodeStorage.hasAttached()).toBe(false);

    attachedCodeStorage.attach(testCode);
    expect(attachedCodeStorage.hasAttached()).toBe(true);

    const retrievedCode = attachedCodeStorage.consumeAttached();
    expect(retrievedCode).toBe(testCode);

    // After consuming, it should be cleared
    expect(attachedCodeStorage.hasAttached()).toBe(false);
  });

  it('should have one-shot behavior', () => {
    const testCode = 'int bar() { return 24; }';

    attachedCodeStorage.attach(testCode);

    // First consumption should return the code
    const firstRetrieval = attachedCodeStorage.consumeAttached();
    expect(firstRetrieval).toBe(testCode);

    // Second consumption should return null
    const secondRetrieval = attachedCodeStorage.consumeAttached();
    expect(secondRetrieval).toBe(null);
  });

  it('should clear attached code', () => {
    const testCode = 'int baz() { return 1; }';

    attachedCodeStorage.attach(testCode);
    expect(attachedCodeStorage.hasAttached()).toBe(true);

    attachedCodeStorage.clear();
    expect(attachedCodeStorage.hasAttached()).toBe(false);

    const retrievedCode = attachedCodeStorage.consumeAttached();
    expect(retrievedCode).toBe(null);
  });
});
