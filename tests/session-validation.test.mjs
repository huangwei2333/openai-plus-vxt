import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getChatGptSessionValidationMessage,
  isUsableChatGptSessionResponse,
} from '../.tmp-test/src/features/link-extractor/session-validation.js';

test('rejects a ChatGPT session response with account info but empty accessToken', () => {
  const response = {
    ok: false,
    message: '已读取账号信息，但 session 内没有 accessToken',
    session: {
      email: 'demo+existing@example.com',
      planType: 'plus',
      accessToken: '',
      accountId: 'account-demo',
      sessionExpiredAt: '2026-08-20T06:34:00.111Z',
      fetchedAt: Date.now(),
    },
  };

  assert.equal(isUsableChatGptSessionResponse(response), false);
  assert.equal(getChatGptSessionValidationMessage(response), 'session 中没有 accessToken，不能用于生成 checkout 链接');
});

test('rejects a ChatGPT session response without account email', () => {
  const response = {
    ok: true,
    message: '已读取 ChatGPT session',
    session: {
      email: '',
      planType: 'free',
      accessToken: 'access-token',
      accountId: 'account-1',
      sessionExpiredAt: '2026-08-20T06:34:00.111Z',
      fetchedAt: Date.now(),
    },
  };

  assert.equal(isUsableChatGptSessionResponse(response), false);
  assert.equal(getChatGptSessionValidationMessage(response), 'session 中没有账号邮箱，不能作为已有登录账号继续');
});

test('rejects an expired ChatGPT session response', () => {
  const response = {
    ok: true,
    message: '已读取 ChatGPT session',
    session: {
      email: 'demo@example.com',
      planType: 'free',
      accessToken: 'access-token',
      accountId: 'account-1',
      sessionExpiredAt: '2026-01-01T00:00:00.000Z',
      fetchedAt: Date.now(),
    },
  };

  assert.equal(isUsableChatGptSessionResponse(response, Date.parse('2026-05-22T00:00:00.000Z')), false);
  assert.equal(getChatGptSessionValidationMessage(response, Date.parse('2026-05-22T00:00:00.000Z')), 'session 已过期，请重新登录 ChatGPT');
});

test('accepts a ChatGPT session response with token, email, and future expiry', () => {
  const response = {
    ok: true,
    message: '已读取 ChatGPT session',
    session: {
      email: 'demo@example.com',
      planType: 'free',
      accessToken: 'access-token',
      accountId: 'account-1',
      sessionExpiredAt: '2026-08-20T06:34:00.111Z',
      fetchedAt: Date.now(),
    },
  };

  assert.equal(isUsableChatGptSessionResponse(response, Date.parse('2026-05-22T00:00:00.000Z')), true);
  assert.equal(getChatGptSessionValidationMessage(response, Date.parse('2026-05-22T00:00:00.000Z')), '');
});
