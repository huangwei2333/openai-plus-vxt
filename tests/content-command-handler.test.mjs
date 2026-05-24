import test from 'node:test';
import assert from 'node:assert/strict';

import { respondToContentCommand } from '../.tmp-test/src/app/content-command-handler.js';

test('content command responder sends synchronous page-state responses through sendResponse', async () => {
  const pageState = {
    kind: 'login',
    label: 'ChatGPT 登录页',
    canFillEmail: true,
    canFillOtp: false,
    canFillProfile: false,
  };
  const responses = [];
  const keepChannelOpen = respondToContentCommand(
    {
      getPageState: () => pageState,
      fillEmailFromInput: async () => ({ ok: true, message: 'filled' }),
      fillOtp: async () => ({ ok: true, message: 'otp' }),
      waitForOutlookOtp: async () => ({ ok: true, message: 'otp ready' }),
      fillProfileAndCreate: async () => ({ ok: true, message: 'profile' }),
    },
    async () => ({ ok: true, filled: 1, message: 'payment' }),
    { type: 'opx:content-command', command: 'get-page-state' },
    (response) => responses.push(response),
  );

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(keepChannelOpen, true);
  assert.deepEqual(responses, [pageState]);
});

test('content command responder ignores unrelated messages', () => {
  const keepChannelOpen = respondToContentCommand(
    {
      getPageState: () => ({ kind: 'unknown', label: 'unknown', canFillEmail: false, canFillOtp: false, canFillProfile: false }),
      fillEmailFromInput: async () => ({ ok: false, message: 'noop' }),
      fillOtp: async () => ({ ok: false, message: 'noop' }),
      waitForOutlookOtp: async () => ({ ok: false, message: 'noop' }),
      fillProfileAndCreate: async () => ({ ok: false, message: 'noop' }),
    },
    async () => ({ ok: false, filled: 0, message: 'noop' }),
    { type: 'other-message' },
    () => assert.fail('sendResponse should not be called'),
  );

  assert.equal(keepChannelOpen, undefined);
});

test('content command responder waits for page load before running fill commands', async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const listeners = new Map();
  const calls = [];
  const responses = [];

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
    respondToContentCommand(
      {
        getPageState: () => ({ kind: 'unknown', label: 'unknown', canFillEmail: false, canFillOtp: false, canFillProfile: false }),
        fillEmailFromInput: async () => ({ ok: true, message: 'email' }),
        fillOtp: async () => ({ ok: true, message: 'otp' }),
        waitForOutlookOtp: async () => ({ ok: true, message: 'otp ready' }),
        fillProfileAndCreate: async () => {
          calls.push('fill-profile');
          return { ok: true, message: 'profile' };
        },
      },
      async () => ({ ok: true, filled: 1, message: 'payment' }),
      { type: 'opx:content-command', command: 'fill-profile' },
      (response) => responses.push(response),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(calls, []);
    assert.deepEqual(responses, []);

    globalThis.document.readyState = 'complete';
    listeners.get('load')?.();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(calls, ['fill-profile']);
    assert.deepEqual(responses, [{ ok: true, message: 'profile' }]);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});
