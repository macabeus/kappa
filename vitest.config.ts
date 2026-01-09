import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['src/tests-e2e/**/*'],
    alias: {
      '~': path.resolve(__dirname, './src'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@configurations': path.resolve(__dirname, './src/configurations'),
      '@db': path.resolve(__dirname, './src/db'),
      '@decomp-permuter': path.resolve(__dirname, './src/decomp-permuter'),
      '@decompme': path.resolve(__dirname, './src/decompme'),
      '@language-model-tools': path.resolve(__dirname, './src/language-model-tools'),
      '@m2c': path.resolve(__dirname, './src/m2c'),
      '@objdiff': path.resolve(__dirname, './src/objdiff'),
      '@prompt-builder': path.resolve(__dirname, './src/prompt-builder'),
      '@providers': path.resolve(__dirname, './src/providers'),
      '@webview': path.resolve(__dirname, './src/webview'),
    },
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, './src/__mocks__/vscode.ts'),
    },
  },
});
