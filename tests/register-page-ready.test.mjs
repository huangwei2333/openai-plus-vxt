import test from 'node:test';
import assert from 'node:assert/strict';

import {
  waitForDocumentLoadComplete,
  waitForStableElement,
} from '../.tmp-test/src/app/page-ready.js';

test('waitForDocumentLoadComplete waits until the page readyState is complete', async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;

  const listeners = new Map();
  globalThis.document = { readyState: 'loading' };
  globalThis.window = {
    setTimeout,
    clearTimeout,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };

  try {
    const waiting = waitForDocumentLoadComplete(1_000);

    setTimeout(() => {
      globalThis.document.readyState = 'complete';
      listeners.get('load')?.();
    }, 20);

    assert.equal(await waiting, true);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test('waitForStableElement ignores elements that are replaced before becoming stable', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { setTimeout };

  try {
    const first = { isConnected: true };
    const second = { isConnected: true };
    let current = first;

    setTimeout(() => {
      first.isConnected = false;
      current = second;
    }, 40);

    const result = await waitForStableElement(() => current, {
      timeoutMs: 1_000,
      pollMs: 20,
      stableMs: 80,
    });

    assert.equal(result, second);
  } finally {
    globalThis.window = previousWindow;
  }
});
