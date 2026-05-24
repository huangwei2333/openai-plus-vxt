import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectPaypalHostedStage,
  evaluatePaypalSignupReadiness,
  isPaypalHostedSubmitButtonMetadata,
  normalizePaypalSignupPhone,
  normalizePaypalVerificationCode,
} from '../.tmp-test/src/features/address-autofill/paypal-form-utils.js';

test('normalizes US PayPal signup phone by removing the +1 country code', () => {
  assert.equal(normalizePaypalSignupPhone('+14642649812'), '4642649812');
  assert.equal(normalizePaypalSignupPhone('+1 (464) 264-9812'), '4642649812');
  assert.equal(normalizePaypalSignupPhone('14642649812'), '4642649812');
  assert.equal(normalizePaypalSignupPhone('4642649812'), '4642649812');
});

test('recognizes PayPal hosted checkout submit button metadata', () => {
  assert.equal(isPaypalHostedSubmitButtonMetadata({
    text: 'Pay',
    dataTestId: 'hosted-payment-submit-button',
  }), true);
  assert.equal(isPaypalHostedSubmitButtonMetadata({
    text: '',
    dataAtomicWaitIntent: 'Submit_Email',
  }), true);
  assert.equal(isPaypalHostedSubmitButtonMetadata({
    text: 'Create account',
    dataTestId: '',
  }), false);
});

test('normalizes PayPal verification code to exactly six digits', () => {
  assert.equal(normalizePaypalVerificationCode('123 456'), '123456');
  assert.equal(normalizePaypalVerificationCode('code: 1234567'), '123456');
  assert.equal(normalizePaypalVerificationCode('12345'), '');
});

test('detects PayPal hosted checkout stage from page snapshot', () => {
  assert.equal(detectPaypalHostedStage({ isPaypalHost: false, pathname: '/pay' }), 'outside_paypal');
  assert.equal(detectPaypalHostedStage({ isPaypalHost: true, pathname: '/pay', hasEmailInput: true }), 'login');
  assert.equal(detectPaypalHostedStage({ isPaypalHost: true, pathname: '/checkoutweb/signup' }), 'signup');
  assert.equal(detectPaypalHostedStage({ isPaypalHost: true, pathname: '/pay', hasVerificationInputs: true }), 'verification');
  assert.equal(detectPaypalHostedStage({ isPaypalHost: true, pathname: '/webapps/hermes', hasReviewConsent: true }), 'review');
  assert.equal(detectPaypalHostedStage({ isPaypalHost: true, pathname: '/signin/authorize', hasApprovalButton: true }), 'approval');
});

test('does not treat visible create account button as ready when required PayPal fields are incomplete', () => {
  const result = evaluatePaypalSignupReadiness([
    { key: 'email', label: 'email', required: true, present: true, filled: true },
    { key: 'phone', label: 'phone', required: true, present: true, filled: false },
    { key: 'cardNumber', label: 'card number', required: true, present: true, filled: false },
    { key: 'billingLine2', label: 'address line 2', required: false, present: true, filled: false },
  ], true);

  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, ['phone', 'card number']);
});

test('requires an enabled create account button after PayPal fields are complete', () => {
  const fields = [
    { key: 'email', label: 'email', required: true, present: true, filled: true },
    { key: 'phone', label: 'phone', required: true, present: true, filled: true },
  ];

  assert.equal(evaluatePaypalSignupReadiness(fields, false).ready, false);
  assert.equal(evaluatePaypalSignupReadiness(fields, true).ready, true);
});
