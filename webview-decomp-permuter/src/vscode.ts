import { type Disposable, HOST_EXTENSION, type NotificationType, type RequestType } from 'vscode-messenger-common';
import { Messenger } from 'vscode-messenger-webview';

// Message type definitions for type-safe communication
export interface PermuterCommand {
  command: string;
  args?: any;
}

// Notification types (fire-and-forget messages)
export const ReadyNotification: NotificationType<void> = { method: 'ready' };
export const CancelPermuterNotification: NotificationType<void> = { method: 'cancel-permuter' };
export const InitNotification: NotificationType<any> = { method: 'init' };
export const UpdateStatusNotification: NotificationType<any> = { method: 'update-status' };
export const PermuterOutputNotification: NotificationType<any> = { method: 'permuter-output' };
export const BestMatchNotification: NotificationType<any> = { method: 'best-match' };
export const ErrorNotification: NotificationType<string> = { method: 'error' };

// Request types (request-response messages)
export const GetWorkspaceFilesRequest: RequestType<void, string[]> = { method: 'get-workspace-files' };
export const GenericCommandRequest: RequestType<PermuterCommand, any> = { method: 'generic-command' };

// Create and start the messenger with explicit VS Code API
let messenger: Messenger;

// Initialize messenger safely
try {
  // Try to get the VS Code API explicitly
  const vscodeApi = (window as any).acquireVsCodeApi?.() || {
    postMessage: (message: any) => {
      console.warn('VS Code API not available, message not sent:', message);
    },
    setState: (state: any) => {
      console.warn('VS Code API not available, state not set:', state);
    },
    getState: () => {
      console.warn('VS Code API not available, returning null state');
      return null;
    },
  };

  messenger = new Messenger(vscodeApi);
} catch (error) {
  console.error('Failed to initialize messenger:', error);
  // Fallback messenger with mock API
  messenger = new Messenger({
    postMessage: () => {},
    setState: () => {},
    getState: () => null,
  });
}

messenger.start();

// Exported messenger instance for components to use
export { messenger };

// Type-safe helper functions for common operations
export const vsCodeAPI = {
  // Send notifications
  ready: () => messenger.sendNotification(ReadyNotification, HOST_EXTENSION),
  cancelPermuter: () => messenger.sendNotification(CancelPermuterNotification, HOST_EXTENSION),

  // Send requests
  getWorkspaceFiles: (): Promise<string[]> => messenger.sendRequest(GetWorkspaceFilesRequest, HOST_EXTENSION),

  request: <T = any>(command: string, args?: any): Promise<T> =>
    messenger.sendRequest(GenericCommandRequest, HOST_EXTENSION, { command, args }),

  // Register notification handlers (returns Disposable)
  onInit: (handler: (data: any) => void): Disposable => {
    messenger.onNotification(InitNotification, handler);
    return {
      dispose: () => {
        // TODO: Implement proper cleanup
      },
    };
  },

  onUpdateStatus: (handler: (data: any) => void): Disposable => {
    messenger.onNotification(UpdateStatusNotification, handler);
    return {
      dispose: () => {
        // TODO: Implement proper cleanup
      },
    };
  },

  onPermuterOutput: (handler: (data: any) => void): Disposable => {
    messenger.onNotification(PermuterOutputNotification, handler);
    return {
      dispose: () => {
        // TODO: Implement proper cleanup
      },
    };
  },

  onBestMatch: (handler: (data: any) => void): Disposable => {
    messenger.onNotification(BestMatchNotification, handler);
    return {
      dispose: () => {
        // TODO: Implement proper cleanup
      },
    };
  },

  onError: (handler: (error: string) => void): Disposable => {
    messenger.onNotification(ErrorNotification, handler);
    return {
      dispose: () => {
        // TODO: Implement proper cleanup
      },
    };
  },
};

// Legacy API for backwards compatibility (deprecated)
export const messageDispatcher = {
  send: (message: { type: string; payload?: any }) => {
    switch (message.type) {
      case 'ready':
        vsCodeAPI.ready();
        break;
      case 'cancel-permuter':
        vsCodeAPI.cancelPermuter();
        break;
      default:
        console.warn('Legacy message type not supported:', message.type);
    }
  },
  request: <T = any>(command: string, args?: any): Promise<T> => vsCodeAPI.request<T>(command, args),
};
