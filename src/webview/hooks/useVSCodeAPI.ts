/**
 * VS Code API Hook
 * Provides access to the VS Code webview API
 */

import { useMemo } from 'react';

/**
 * VS Code API interface
 */
interface IVSCodeAPI {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

/**
 * Acquire VS Code API (only available in webview context)
 */
function acquireVsCodeApi(): IVSCodeAPI {
  // @ts-ignore - acquireVsCodeApi is injected by VS Code
  if (typeof acquireVsCodeApi === 'function') {
    // @ts-ignore
    return acquireVsCodeApi();
  }

  // Mock for development outside VS Code
  console.warn('VS Code API not available, using mock');
  return {
    postMessage: (message: unknown) => {
      console.log('Mock postMessage:', message);
    },
    getState: () => ({}),
    setState: (state: unknown) => {
      console.log('Mock setState:', state);
    },
  };
}

// Singleton instance
let vscodeApi: IVSCodeAPI | null = null;

/**
 * Get VS Code API instance
 */
function getVSCodeAPI(): IVSCodeAPI {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

/**
 * Hook to access VS Code API
 * @returns VS Code API instance
 */
export function useVSCodeAPI(): IVSCodeAPI {
  return useMemo(() => getVSCodeAPI(), []);
}

