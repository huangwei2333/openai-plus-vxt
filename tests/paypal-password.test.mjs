import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPaypalSignupPassword,
  isValidPaypalSignupPassword,
} from '../.tmp-test/src/features/address-autofill/paypal-password.js';

test('validates PayPal signup password length and required digit or symbol', () => {
  assert.equal(isValidPaypalSignupPassword('abcdefg1'), true);
  assert.equal(isValidPaypalSignupPassword('abcdefg!'), true);
  assert.equal(isValidPaypalSignupPassword('abcdefgh'), false);
  assert.equal(isValidPaypalSignupPassword('abc1'), false);
  assert.equal(isValidPaypalSignupPassword('abcdefghijklmnopqrstu1'), false);
});

test('creates PayPal signup passwords between 8 and 20 characters', () => {
  const generated = createPaypalSignupPassword({
    preferredPassword: 'very-long-password-without-paypal-fit',
    username: 'long.username@example.com',
    fullName: 'Long Username Example',
    id: 'address-1234567890',
    fetchedAt: 1779450000000,
  });

  assert.equal(isValidPaypalSignupPassword(generated), true);
  assert.ok(generated.length >= 8);
  assert.ok(generated.length <= 20);
});

test('keeps an existing PayPal-compatible password', () => {
  assert.equal(createPaypalSignupPassword({
    preferredPassword: 'GoodPass9',
    username: 'ignored',
    fullName: 'Ignored User',
    id: 'address-1',
    fetchedAt: 1,
  }), 'GoodPass9');
});
