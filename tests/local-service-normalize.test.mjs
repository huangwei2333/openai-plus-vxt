import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyStore,
  importAccountsPayload,
  normalizeStore,
  upsertAccounts,
  upsertSmsTargets,
} from '../local-service/normalize.mjs';

function tokenWithPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
}

test('creates an empty versioned store', () => {
  const store = createEmptyStore();

  assert.equal(store.version, 1);
  assert.deepEqual(store.accounts, []);
  assert.deepEqual(store.registerEmailItems, []);
  assert.deepEqual(store.smsRelay.targets, []);
  assert.equal(store.smsRelay.selectedTargetId, '');
});

test('imports current exported Codex account JSON format', () => {
  const imported = importAccountsPayload([
    {
      id_token: 'id.token',
      access_token: 'access.token',
      refresh_token: 'refresh.token',
      account_id: 'acct_123',
      last_refresh: '2026-05-22T00:00:00.000Z',
      email: 'USER@example.com',
      type: 'codex',
      expired: '2026-05-23T00:00:00.000Z',
    },
  ]);

  assert.equal(imported.accounts.length, 1);
  assert.equal(imported.skippedCount, 0);
  assert.equal(imported.accounts[0].id, 'acct_123');
  assert.equal(imported.accounts[0].email, 'USER@example.com');
  assert.equal(imported.accounts[0].accessToken, 'access.token');
  assert.equal(imported.accounts[0].refreshToken, 'refresh.token');
  assert.equal(imported.accounts[0].sessionExpiredAt, '2026-05-23T00:00:00.000Z');
});

test('imports Codex account plan metadata from token claims', () => {
  const idToken = tokenWithPayload({
    email: 'plan@example.com',
    'https://api.openai.com/auth': {
      chatgpt_plan_type: 'plus',
      account_id: 'acct_from_id',
    },
  });
  const accessToken = tokenWithPayload({
    exp: 1780209099,
    'https://api.openai.com/auth': {
      chatgpt_account_id: 'acct_from_access',
      chatgpt_plan_type: 'free',
    },
  });
  const imported = importAccountsPayload([
    {
      id_token: idToken,
      access_token: accessToken,
      refresh_token: 'refresh.token',
      email: 'plan@example.com',
      type: 'codex',
    },
  ]);

  assert.equal(imported.accounts.length, 1);
  assert.equal(imported.accounts[0].planType, 'plus');
  assert.equal(imported.accounts[0].accountId, 'acct_from_access');
  assert.equal(imported.accounts[0].sessionExpiredAt, '2026-05-31T06:31:39.000Z');
});

test('uses access token expiry before longer stored session expiry', () => {
  const accessToken = tokenWithPayload({
    exp: 1780309136,
    'https://api.openai.com/profile': {
      email: 'huangwei201811+test@gmail.com',
    },
  });

  const store = normalizeStore({
    accounts: [
      {
        email: 'huangwei201811+test@gmail.com',
        access_token: accessToken,
        expired: '2026-08-20T10:19:12.693Z',
      },
    ],
  });

  assert.equal(store.accounts[0].sessionExpiredAt, '2026-06-01T10:18:56.000Z');
});

test('imports access-token-only Codex account plan metadata from auth claims', () => {
  const accessToken = tokenWithPayload({
    exp: 1780209099,
    email: 'access-plan@example.com',
    'https://api.openai.com/auth': {
      chatgpt_account_id: 'acct_access_plan',
      chatgpt_plan_type: 'team',
    },
  });
  const imported = importAccountsPayload([
    {
      access_token: accessToken,
      refresh_token: 'refresh.token',
      email: 'access-plan@example.com',
      type: 'codex',
    },
  ]);

  assert.equal(imported.accounts.length, 1);
  assert.equal(imported.accounts[0].planType, 'team');
  assert.equal(imported.accounts[0].accountId, 'acct_access_plan');
});

test('upserts accounts by email before accountId or id', () => {
  const original = {
    id: 'old-id',
    email: 'same@example.com',
    selected: false,
    idToken: 'old-id-token',
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    accountId: 'acct_old',
    planType: 'free',
    planExpiresAt: '',
    sessionExpiredAt: '',
    lastRefreshAt: '2026-05-21T00:00:00.000Z',
    createdAt: 100,
    updatedAt: 100,
  };
  const next = {
    ...original,
    id: 'new-id',
    email: 'SAME@example.com',
    accessToken: 'new-access',
    refreshToken: 'new-refresh',
    accountId: 'acct_new',
    selected: true,
    createdAt: 200,
    updatedAt: 200,
  };

  const accounts = upsertAccounts([original], [next]);

  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].id, 'old-id');
  assert.equal(accounts[0].email, 'SAME@example.com');
  assert.equal(accounts[0].accessToken, 'new-access');
  assert.equal(accounts[0].refreshToken, 'new-refresh');
  assert.equal(accounts[0].accountId, 'acct_new');
  assert.equal(accounts[0].selected, false);
  assert.equal(accounts[0].createdAt, 100);
});

test('imports exported Codex accounts with email de-duplication', () => {
  const imported = importAccountsPayload([
    {
      id_token: 'first.id',
      access_token: 'first.access',
      refresh_token: 'first.refresh',
      account_id: 'acct_first',
      last_refresh: '2026-05-21T00:00:00.000Z',
      email: 'User@example.com',
      type: 'codex',
      expired: '2026-05-22T00:00:00.000Z',
    },
    {
      id_token: 'second.id',
      access_token: 'second.access',
      refresh_token: 'second.refresh',
      account_id: 'acct_second',
      last_refresh: '2026-05-22T00:00:00.000Z',
      email: 'user@example.com',
      type: 'codex',
      expired: '2026-05-23T00:00:00.000Z',
    },
  ]);

  assert.equal(imported.accounts.length, 1);
  assert.equal(imported.accounts[0].id, 'acct_first');
  assert.equal(imported.accounts[0].email, 'user@example.com');
  assert.equal(imported.accounts[0].accessToken, 'second.access');
  assert.equal(imported.accounts[0].accountId, 'acct_second');
});

test('keeps different emails even when accountId is duplicated', () => {
  const accounts = upsertAccounts([], [
    {
      email: 'first@example.com',
      access_token: 'first.access',
      account_id: 'acct_same',
    },
    {
      email: 'second@example.com',
      access_token: 'second.access',
      account_id: 'acct_same',
    },
  ]);

  assert.equal(accounts.length, 2);
  assert.deepEqual(accounts.map((account) => account.email), ['first@example.com', 'second@example.com']);
});

test('normalizes SMS targets and rejects non-http URLs', () => {
  const store = normalizeStore({
    smsRelay: {
      targets: [
        { phone: '+14642649811', url: 'https://example.com/a' },
        { phone: '+14642649811', url: 'https://example.com/a' },
        { phone: '+14642649812', url: 'javascript:alert(1)' },
      ],
      selectedTargetId: '',
      history: [],
    },
  });

  assert.equal(store.smsRelay.targets.length, 1);
  assert.equal(store.smsRelay.targets[0].id, '+1:4642649811|https://example.com/a');
  assert.equal(store.smsRelay.targets[0].phone, '4642649811');
  assert.equal(store.smsRelay.targets[0].dialCode, '+1');
  assert.equal(store.smsRelay.targets[0].countryName, '美国/加拿大');
  assert.equal(store.smsRelay.selectedTargetId, '+1:4642649811|https://example.com/a');

  const nextTargets = upsertSmsTargets(store.smsRelay.targets, [
    { phone: '+14642649813', url: 'http://example.com/c' },
  ]);
  assert.deepEqual(nextTargets.map((target) => target.phone), ['4642649811', '4642649813']);
});

test('normalizes bare international SMS targets before upserting', () => {
  const targets = upsertSmsTargets([], [
    { phone: '4642649811', url: 'https://example.com/a' },
    { phone: '14642649811', url: 'https://example.com/a' },
    { phone: '+14642649811', url: 'https://example.com/a' },
  ]);

  assert.equal(targets.length, 1);
  assert.equal(targets[0].id, '+1:4642649811|https://example.com/a');
  assert.equal(targets[0].phone, '4642649811');
  assert.equal(targets[0].dialCode, '+1');
  assert.ok(targets[0].countryName);
});
