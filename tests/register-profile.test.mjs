import test from 'node:test';
import assert from 'node:assert/strict';

import { randomProfileAge } from '../.tmp-test/src/features/register/openai-about-you-page.js';

test('profile age is a random integer from 20 to 30', () => {
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(randomProfileAge(), 20);

    Math.random = () => 0.999999;
    assert.equal(randomProfileAge(), 30);
  } finally {
    Math.random = originalRandom;
  }
});
