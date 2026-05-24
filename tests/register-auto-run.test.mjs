import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldAutoFillProfileOnPageLoad } from '../.tmp-test/src/features/register/auto-run.js';

test('profile page is not auto-filled on content script page load', () => {
  assert.equal(shouldAutoFillProfileOnPageLoad(), false);
});
