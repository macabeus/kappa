import { expect } from '@wdio/globals';
import { runOnVSCode } from './utils';

describe('Objdiff', () => {
  it('runs', async () => {
    const result = await runOnVSCode(async function fn({ runCompareObjectFiles }) {
      const result = await runCompareObjectFiles();
      return result;
    });

    expect(result).toContain('Successfully');
  });
});
