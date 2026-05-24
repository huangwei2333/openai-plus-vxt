import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addSmsRelayTargetsToList,
  getCompatibleSmsRelayTargetIds,
  getSelectedSmsRelayTarget,
} from '../.tmp-test/src/features/sms/target-list.js';

test('adds pasted SMS relay info to a persisted single-select target list', () => {
  const first = addSmsRelayTargetsToList([], '', [
    '+14642649811----https://example.com/a',
    '+14642649812----https://example.com/b',
  ].join('\n'));

  assert.equal(first.addedCount, 2);
  assert.equal(first.errors.length, 0);
  assert.equal(first.targets.length, 2);
  assert.equal(first.selectedTargetId, '+1:4642649811|https://example.com/a');
  assert.deepEqual(first.targets[0], {
    id: '+1:4642649811|https://example.com/a',
    phone: '4642649811',
    url: 'https://example.com/a',
    dialCode: '+1',
    countryName: '美国/加拿大',
  });

  const second = addSmsRelayTargetsToList(
    first.targets,
    '+1:4642649812|https://example.com/b',
    [
      '+14642649812----https://example.com/b',
      '+14642649813----https://example.com/c',
    ].join('\n'),
  );

  assert.equal(second.addedCount, 1);
  assert.deepEqual(second.targets.map((target) => target.phone), [
    '4642649811',
    '4642649812',
    '4642649813',
  ]);
  assert.equal(second.selectedTargetId, '+1:4642649812|https://example.com/b');
});

test('resolves the selected SMS relay target for polling only one number', () => {
  const result = addSmsRelayTargetsToList([], '', [
    '+14642649811----https://example.com/a',
    '+14642649812----https://example.com/b',
  ].join('\n'));

  assert.equal(getSelectedSmsRelayTarget(result.targets, '+1:4642649812|https://example.com/b')?.phone, '4642649812');
  assert.equal(getSelectedSmsRelayTarget(result.targets, 'missing'), undefined);
});

test('recognizes bare international SMS relay numbers and keeps them deduplicated', () => {
  const first = addSmsRelayTargetsToList([], '', '14642649811----https://example.com/a');

  assert.equal(first.addedCount, 1);
  assert.equal(first.targets.length, 1);
  assert.equal(first.targets[0].id, '+1:4642649811|https://example.com/a');
  assert.equal(first.targets[0].phone, '4642649811');
  assert.equal(first.targets[0].dialCode, '+1');
  assert.ok(first.targets[0].countryName);

  const second = addSmsRelayTargetsToList(
    first.targets,
    first.selectedTargetId,
    '+14642649811----https://example.com/a',
  );

  assert.equal(second.addedCount, 0);
  assert.equal(second.targets.length, 1);
  assert.equal(second.selectedTargetId, '+1:4642649811|https://example.com/a');
});

test('deduplicates ten digit NANP SMS relay numbers against their international form', () => {
  const result = addSmsRelayTargetsToList([], '', [
    '4642649811----https://example.com/a',
    '+14642649811----https://example.com/a',
  ].join('\n'));

  assert.equal(result.addedCount, 1);
  assert.equal(result.targets.length, 1);
  assert.equal(result.targets[0].id, '+1:4642649811|https://example.com/a');
  assert.equal(result.targets[0].dialCode, '+1');
  assert.ok(result.targets[0].countryName);
});

test('builds compatible SMS target ids for older local services', () => {
  assert.deepEqual(getCompatibleSmsRelayTargetIds({
    id: '+1:4642204493|http://a.62-us.com/api/get_sms?key=secret',
    phone: '4642204493',
    url: 'http://a.62-us.com/api/get_sms?key=secret',
    dialCode: '+1',
    countryName: '美国/加拿大',
  }), [
    '+1:4642204493|http://a.62-us.com/api/get_sms?key=secret',
    '4642204493|http://a.62-us.com/api/get_sms?key=secret',
    '+14642204493|http://a.62-us.com/api/get_sms?key=secret',
  ]);
});
