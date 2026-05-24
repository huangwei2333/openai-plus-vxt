import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createNoSessionTabResponse,
  selectActiveAssistantTab,
  selectActiveSessionTab,
} from '../.tmp-test/src/features/link-extractor/session-tab.js';

test('selectActiveAssistantTab keeps automation commands inside the matching browsing context', () => {
  const normalTab = { id: 1, url: 'https://chatgpt.com/', incognito: false };
  const incognitoTab = { id: 2, url: 'https://chatgpt.com/', incognito: true };

  assert.deepEqual(selectActiveAssistantTab([normalTab, incognitoTab], true), incognitoTab);
  assert.deepEqual(selectActiveAssistantTab([normalTab, incognitoTab], false), normalTab);
});

test('selectActiveAssistantTab rejects automation tabs from the wrong browsing context', () => {
  const normalTab = { id: 1, url: 'https://chatgpt.com/', incognito: false };

  assert.equal(selectActiveAssistantTab([normalTab], true), null);
});

test('selectActiveAssistantTab accepts PayPal automation pages', () => {
  const paypalTab = { id: 1, url: 'https://www.paypal.com/pay?token=abc&country.x=US', incognito: false };

  assert.deepEqual(selectActiveAssistantTab([paypalTab], false), paypalTab);
});

test('selectActiveSessionTab rejects PayPal pages for ChatGPT session reads', () => {
  const paypalTab = { id: 1, url: 'https://www.paypal.com/pay?token=abc&country.x=US', incognito: false };

  assert.equal(selectActiveSessionTab([paypalTab], false), null);
});

test('createNoSessionTabResponse explains that background session fallback is blocked', () => {
  assert.deepEqual(createNoSessionTabResponse(true), {
    ok: false,
    message: '没有找到当前无痕窗口中的 ChatGPT / OpenAI 页面，已停止读取 session，避免误用普通窗口登录态',
  });
  assert.deepEqual(createNoSessionTabResponse(false), {
    ok: false,
    message: '没有找到当前普通窗口中的 ChatGPT / OpenAI 页面，已停止读取 session',
  });
});
