import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchRandomAddress,
  hasCompleteCreditCardInfo,
} from '../.tmp-test/src/features/address-autofill/address-source.js';

test('fallback address includes complete credit card information', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('network unavailable');
  };

  try {
    const response = await fetchRandomAddress('US', '');

    assert.equal(response.ok, true);
    assert.equal(response.address?.source, 'fallback');
    assert.equal(hasCompleteCreditCardInfo(response.address?.creditCard), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('credit card completeness requires number, cvv, and expiration', () => {
  assert.equal(hasCompleteCreditCardInfo({
    type: 'Visa',
    number: '4111111111111111',
    cvv: '123',
    expires: '12/30',
    last4: '1111',
    maskedNumber: '**** **** **** 1111',
  }), true);
  assert.equal(hasCompleteCreditCardInfo({
    type: 'Visa',
    number: '',
    cvv: '123',
    expires: '12/30',
    last4: '',
    maskedNumber: '',
  }), false);
});
