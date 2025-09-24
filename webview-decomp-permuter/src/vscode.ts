import type * as t from 'kappa';

import { DecompPermuterWebviewApi } from './api';

type VsCodeMessageRequest = {
  type: 'request';
  name: keyof DecompPermuterWebviewApi;
  requestId: string;
  payload: any;
};

type VsCodeMessageResponse = {
  type: 'response';
  requestId: string;
  payload: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
};

type VsCodeMessage = VsCodeMessageRequest | VsCodeMessageResponse;

// Get VS Code API instance
const vsCodeApi = acquireVsCodeApi();

const api = new DecompPermuterWebviewApi();

// Message dispatcher class for handling async requests
class MessageDispatcher {
  private requestId = 0;
  private pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();

  constructor() {
    window.addEventListener('message', (event) => {
      const message = event.data as VsCodeMessage;

      if (message.type === 'response') {
        const pending = this.pendingRequests.get(message.requestId);
        if (pending) {
          this.pendingRequests.delete(message.requestId);
          const response = message.payload;

          if (response.success) {
            pending.resolve(response.data);
          } else {
            pending.reject(new Error(response.error || 'Unknown error'));
          }
        } else {
          console.warn(`No pending request found for id: ${message.requestId}`);
        }
      } else {
        // @ts-expect-error
        api[message.name]?.(...message.payload);
      }
    });
  }

  get api() {
    const self = this;
    return new Proxy({} as t.HostApi, {
      get(_target, prop: string) {
        return (...args: unknown[]) => {
          return self.request(prop, args);
        };
      },
    });
  }

  async request<T = any>(command: string, args?: any): Promise<T> {
    this.requestId += 1;
    const requestId = `req_${this.requestId}`;

    return new Promise<T>((resolve, reject) => {
      // Store the promise resolvers
      this.pendingRequests.set(requestId, { resolve, reject });

      // Set a timeout to avoid hanging forever
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request timeout: ${command}`));
        }
      }, 30000); // 30 second timeout

      // Send the request
      const message = {
        type: 'request',
        requestId,
        payload: { command, args },
      };

      vsCodeApi.postMessage(message);
    });
  }
}

// Global message dispatcher instance
export const messageDispatcher = new MessageDispatcher();
