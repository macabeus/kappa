import react from '@vitejs/plugin-react';
import { copyFile } from 'fs/promises';
import { resolve } from 'path';
import { defineConfig } from 'vite';

// Custom plugin to copy codicons.css
const copyCodiconsPlugin = () => {
  return {
    name: 'copy-codicons',
    async writeBundle() {
      const sourceFile = resolve(__dirname, '../node_modules/@vscode/codicons/dist/codicon.css');
      const targetFile = resolve(__dirname, '../dist/webview/codicon.css');
      await copyFile(sourceFile, targetFile);

      const sourceFile2 = resolve(__dirname, '../node_modules/@vscode/codicons/dist/codicon.ttf');
      const targetFile2 = resolve(__dirname, '../dist/webview/codicon.ttf');
      await copyFile(sourceFile2, targetFile2);
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), copyCodiconsPlugin()],
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'decomp-permuter.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  define: {
    // This is needed for React in production builds
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
});
