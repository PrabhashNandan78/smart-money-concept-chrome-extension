// Test setup - mock Chrome Extension APIs
import '@testing-library/jest-dom';

// Mock chrome APIs for unit tests
const chromeMock = {
  storage: {
    local: {
      get: (_keys: unknown, callback?: (result: Record<string, unknown>) => void) => {
        if (callback) callback({});
        return Promise.resolve({});
      },
      set: (_items: unknown, callback?: () => void) => {
        if (callback) callback();
        return Promise.resolve();
      },
    },
  },
  runtime: {
    sendMessage: (_message: unknown, callback?: (response: unknown) => void) => {
      if (callback) callback({});
      return Promise.resolve({});
    },
    onMessage: {
      addListener: (_fn: unknown) => {},
      removeListener: (_fn: unknown) => {},
    },
    lastError: null,
  },
  sidePanel: {
    open: (_options: unknown) => Promise.resolve(),
  },
  action: {
    onClicked: {
      addListener: (_fn: unknown) => {},
    },
  },
  tabs: {
    query: (_options: unknown, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      if (callback) callback([]);
      return Promise.resolve([]);
    },
  },
};

(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

