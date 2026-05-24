import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addRegisterEmailItemsFromInput,
  canGenerateAliasFromSelectedEmails,
  createGeneratedAlias,
  filterRegisterEmailAliasesBySessionEmails,
  inferRegisterBaseEmailFromAlias,
  mergeRegisterEmailItemsFromSessionEmails,
  mergeRegisterEmailItems,
  recordRegisterEmailSession,
  removeRegisterEmailItem,
  resolveRegisterEmailForFill,
  setRegisterEmailItemSelected,
  syncRegisterEmailItemsWithSessionEmails,
} from '../.tmp-test/src/features/register/email-alias.js';

test('infers base Gmail address from imported plus aliases', () => {
  assert.equal(inferRegisterBaseEmailFromAlias('hwei44360+hw2@gmail.com'), 'hwei44360@gmail.com');
  assert.equal(inferRegisterBaseEmailFromAlias('weifat.0816+jay1@gmail.com'), 'weifat0816@gmail.com');
  assert.equal(inferRegisterBaseEmailFromAlias('weifat0816+jay1@googlemail.com'), 'weifat0816@gmail.com');
  assert.equal(inferRegisterBaseEmailFromAlias('weifat.0816+jay1@googlemail.com'), 'weifat0816@gmail.com');
  assert.equal(inferRegisterBaseEmailFromAlias('plain@example.com'), 'plain@example.com');
});

test('adds inferred base emails and updates generated alias counts from imported account sessions', () => {
  const result = mergeRegisterEmailItemsFromSessionEmails([], [
    'cooldes.787+shop@gmail.com',
    'cooldes787+test@googlemail.com',
    'plain@example.com',
  ]);

  assert.equal(result.addedBaseCount, 2);
  assert.equal(result.addedAliasCount, 2);
  assert.deepEqual(result.items.map((item) => item.email), ['cooldes787@gmail.com', 'plain@example.com']);
  assert.deepEqual(result.items[0].aliases.map((alias) => alias.email), [
    'cooldes.787+shop@gmail.com',
    'cooldes787+test@googlemail.com',
  ]);
  assert.equal(result.items[1].aliases.length, 0);
});

test('syncs existing register email items with maintained account session emails', () => {
  const items = mergeRegisterEmailItems('cooldes787@gmail.com', []);
  const synced = syncRegisterEmailItemsWithSessionEmails(items, [
    'cooldes787+shop@gmail.com',
  ]);

  assert.deepEqual(synced.map((item) => item.email), ['cooldes787@gmail.com']);
  assert.deepEqual(synced[0].aliases.map((alias) => alias.email), ['cooldes787+shop@gmail.com']);
});

test('adds email input into persistent email list only when requested', () => {
  const first = addRegisterEmailItemsFromInput([], 'cooldes787@gmail.com');

  assert.equal(first.addedCount, 1);
  assert.deepEqual(first.errors, []);
  assert.equal(first.items[0].email, 'cooldes787@gmail.com');
  assert.equal(first.items[0].selected, true);

  const duplicate = addRegisterEmailItemsFromInput(first.items, 'cooldes787@gmail.com\nother@example.com');

  assert.equal(duplicate.addedCount, 1);
  assert.equal(duplicate.items.length, 2);
  assert.deepEqual(duplicate.items.map((item) => item.email), ['cooldes787@gmail.com', 'other@example.com']);
});

test('allows generating alias after adding a selected Gmail item', () => {
  const result = addRegisterEmailItemsFromInput([], 'cooldes787@gmail.com');

  assert.equal(canGenerateAliasFromSelectedEmails(result.items), true);
  assert.equal(canGenerateAliasFromSelectedEmails(result.items.map((item) => ({ ...item, selected: false }))), false);
});

test('selects only one original email at a time', () => {
  const result = addRegisterEmailItemsFromInput([], 'first@gmail.com\nsecond@gmail.com');
  const next = setRegisterEmailItemSelected(result.items, 'email:second@gmail.com', true);

  assert.deepEqual(next.map((item) => [item.email, item.selected]), [
    ['first@gmail.com', false],
    ['second@gmail.com', true],
  ]);
});

test('merges raw account input into selected email items and preserves existing aliases', () => {
  const previous = mergeRegisterEmailItems('cooldes787@gmail.com\nother@example.com', []);
  const withAlias = {
    ...previous[0],
    selected: false,
    aliases: [
      {
        id: 'existing',
        email: 'cooldes787+shop@gmail.com',
        category: 'plus-gmail',
        createdAt: 1,
      },
    ],
  };

  const next = mergeRegisterEmailItems('other@example.com\ncooldes787@gmail.com', [withAlias, previous[1]]);

  assert.equal(next.length, 2);
  assert.equal(next[0].email, 'other@example.com');
  assert.equal(next[0].selected, true);
  assert.equal(next[1].email, 'cooldes787@gmail.com');
  assert.equal(next[1].selected, false);
  assert.deepEqual(next[1].aliases.map((item) => item.email), ['cooldes787+shop@gmail.com']);
});

test('generates aliases across gmail and googlemail variants with a cap of five per category', () => {
  let state = {
    emailItems: mergeRegisterEmailItems('cooldes787@gmail.com', []),
    email: '',
    accountLine: '',
    inputMode: 'empty',
  };

  const generated = [];
  for (let i = 0; i < 20; i += 1) {
    const result = createGeneratedAlias(state, () => 0);
    assert.equal(result.ok, true);
    assert.ok(result.state);
    assert.ok(result.alias);
    generated.push(result.alias.email);
    state = recordRegisterEmailSession(result.state, result.alias.email);
  }

  assert.equal(generated.filter((email) => /^cooldes787\+.+@gmail\.com$/.test(email)).length, 5);
  assert.equal(generated.filter((email) => /^cooldes\.787\+.+@gmail\.com$/.test(email)).length, 5);
  assert.equal(generated.filter((email) => /^cooldes787\+.+@googlemail\.com$/.test(email)).length, 5);
  assert.equal(generated.filter((email) => /^cooldes\.787\+.+@googlemail\.com$/.test(email)).length, 5);
  assert.deepEqual(
    Array.from(new Set(generated.map((email) => email.split('+')[1].split('@')[0]))).sort(),
    ['paypal1', 'paypal2', 'paypal3', 'paypal4', 'paypal5'],
  );

  const exhausted = createGeneratedAlias(state, () => 0);
  assert.equal(exhausted.ok, false);
  assert.match(exhausted.message, /上限/);
});

test('does not count generated aliases until the email has a saved session', () => {
  const state = {
    emailItems: mergeRegisterEmailItems('cooldes787@gmail.com', []),
    email: '',
    accountLine: '',
    inputMode: 'empty',
  };

  const generated = createGeneratedAlias(state, () => 0);
  assert.equal(generated.ok, true);
  assert.ok(generated.state);
  assert.equal(generated.state.email, 'cooldes787+paypal1@gmail.com');
  assert.equal(generated.state.emailItems[0].aliases.length, 0);

  const withSession = recordRegisterEmailSession(generated.state, generated.state.email);
  assert.equal(withSession.emailItems[0].aliases.length, 1);
  assert.equal(withSession.emailItems[0].aliases[0].email, 'cooldes787+paypal1@gmail.com');

  const duplicate = recordRegisterEmailSession(withSession, generated.state.email);
  assert.equal(duplicate.emailItems[0].aliases.length, 1);
});

test('removes previously generated aliases without a saved session email', () => {
  const items = mergeRegisterEmailItems('cooldes787@gmail.com', []);
  const withAliases = [
    {
      ...items[0],
      aliases: [
        {
          id: 'plus:valid',
          email: 'cooldes787+shop@gmail.com',
          category: 'plus-gmail',
          createdAt: 1,
        },
        {
          id: 'plus:invalid',
          email: 'cooldes787+test@gmail.com',
          category: 'plus-gmail',
          createdAt: 2,
        },
      ],
    },
  ];

  const filtered = filterRegisterEmailAliasesBySessionEmails(withAliases, ['cooldes787+shop@gmail.com']);

  assert.deepEqual(filtered[0].aliases.map((alias) => alias.email), ['cooldes787+shop@gmail.com']);
});

test('removes an original email item from the persistent email list', () => {
  const result = addRegisterEmailItemsFromInput([], 'first@gmail.com\nsecond@gmail.com');
  const next = removeRegisterEmailItem(result.items, 'email:first@gmail.com');

  assert.deepEqual(next.map((item) => item.email), ['second@gmail.com']);
  assert.equal(next[0].selected, true);
});

test('removes an original email item with generated session emails', () => {
  const result = addRegisterEmailItemsFromInput([], 'first@gmail.com\nsecond@gmail.com');
  const items = result.items.map((item) => item.email === 'first@gmail.com'
    ? {
      ...item,
      aliases: [
        {
          id: 'plus:first',
          email: 'first+shop@gmail.com',
          category: 'plus-gmail',
          createdAt: 1,
        },
      ],
    }
    : item);

  const next = removeRegisterEmailItem(items, 'email:first@gmail.com');

  assert.deepEqual(next.map((item) => item.email), ['second@gmail.com']);
  assert.equal(next[0].selected, true);
});

test('resolves active generated email before falling back to selected base email', () => {
  const withItems = mergeRegisterEmailItems('cooldes787@gmail.com\nother@example.com', []);
  const withGenerated = createGeneratedAlias(
    {
      emailItems: withItems,
      email: '',
      accountLine: '',
      inputMode: 'empty',
    },
    () => 0,
  );

  assert.equal(withGenerated.ok, true);
  assert.ok(withGenerated.state);
  assert.equal(resolveRegisterEmailForFill(withGenerated.state)?.email, 'cooldes787+paypal1@gmail.com');

  const fallback = resolveRegisterEmailForFill({
    emailItems: withItems.map((item, index) => ({ ...item, selected: index === 1 })),
    email: '',
    accountLine: '',
    inputMode: 'empty',
  });
  assert.equal(fallback?.email, 'other@example.com');
});
