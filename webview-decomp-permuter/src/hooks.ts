import { useCallback, useEffect, useRef } from 'react';
import type { Disposable } from 'vscode-messenger-common';

import { vsCodeAPI } from './vscode';

export const useVSCodeMessaging = () => {
  const disposables = useRef<Disposable[]>([]);

  useEffect(() => {
    // Cleanup function to dispose of all listeners when component unmounts
    return () => {
      disposables.current.forEach((disposable) => disposable.dispose());
      disposables.current = [];
    };
  }, []);

  // Register a message handler (doesn't cause re-renders)
  const onMessage = useCallback((messageType: string, handler: (payload: any) => void) => {
    let disposable: Disposable;

    // Map message types to notification handlers using the new API
    switch (messageType) {
      case 'init':
        disposable = vsCodeAPI.onInit(handler);
        break;
      case 'update-status':
        disposable = vsCodeAPI.onUpdateStatus(handler);
        break;
      case 'permuter-output':
        disposable = vsCodeAPI.onPermuterOutput(handler);
        break;
      case 'best-match':
        disposable = vsCodeAPI.onBestMatch(handler);
        break;
      case 'error':
        disposable = vsCodeAPI.onError(handler);
        break;
      default:
        console.warn('Unknown message type:', messageType);
        return () => {}; // Return empty cleanup function
    }

    disposables.current.push(disposable);

    return () => {
      disposable.dispose();
      const index = disposables.current.indexOf(disposable);
      if (index > -1) {
        disposables.current.splice(index, 1);
      }
    };
  }, []);

  // Send a fire-and-forget message
  const sendMessage = useCallback((message: { type: string; payload?: any }) => {
    switch (message.type) {
      case 'ready':
        vsCodeAPI.ready();
        break;
      case 'cancel-permuter':
        vsCodeAPI.cancelPermuter();
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }, []);

  // Send a request and wait for response (async/await style)
  const request = useCallback(async <T = any>(command: string, args?: any): Promise<T> => {
    return vsCodeAPI.request<T>(command, args);
  }, []);

  return {
    onMessage,
    sendMessage,
    request,
  };
}; // Specialized hook for common VS Code operations with async support
export const useVSCodeAPI = () => {
  const { request, sendMessage, onMessage } = useVSCodeMessaging();

  // Helper methods for common operations
  const api = {
    cancelPermuter: useCallback(() => {
      sendMessage({ type: 'cancel-permuter' });
    }, [sendMessage]),

    // Workspace operations
    getWorkspaceFiles: useCallback(async (): Promise<string[]> => {
      return request<string[]>('get-workspace-files');
    }, [request]),

    // Generic request method
    request,
    sendMessage,
    onMessage,
  };

  return api;
};
