import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createNoActiveAssistantActionResult,
  createNoActiveAssistantPageState,
} from '../.tmp-test/src/app/active-tab-fallback.js';

test('active tab fallback avoids unsupported-page warning when workflow can open target pages', () => {
  const pageState = createNoActiveAssistantPageState();
  const actionResult = createNoActiveAssistantActionResult();

  assert.equal(pageState.kind, 'unknown');
  assert.equal(pageState.canFillEmail, false);
  assert.equal(pageState.canFillOtp, false);
  assert.equal(pageState.canFillProfile, false);
  assert.equal(actionResult.ok, false);

  assert.doesNotMatch(pageState.label, /当前标签页不是支持/);
  assert.doesNotMatch(actionResult.message, /当前标签页不是支持/);
  assert.match(pageState.label, /自动打开目标页面/);
  assert.match(actionResult.message, /自动打开目标页面/);
});
