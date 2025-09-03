/// <reference types="vite/client" />

// VS Code Webview API
declare function acquireVsCodeApi(): {
  postMessage(message: any): void;
  setState(state: any): void;
  getState(): any;
};

// Declare module for webview playground
declare module '@vscode-elements/webview-playground' {
  // Module has no exports, it registers global custom elements
}

// Declare custom elements for JSX
declare namespace JSX {
  interface IntrinsicElements {
    'vscode-dev-toolbar': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  }
}

// Extend ImportMeta interface for Vite environment variables
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
