import test from 'node:test';
import assert from 'node:assert/strict';

import { isEmailInputMetadata, isSwitchToEmailActionText } from '../.tmp-test/src/features/register/auth-email-field.js';

test('auth email field matcher accepts current OpenAI username-style email inputs', () => {
  assert.equal(isEmailInputMetadata({ type: 'text', name: 'username', autocomplete: 'username' }), true);
  assert.equal(isEmailInputMetadata({ type: 'text', id: 'identifier', placeholder: 'Email address' }), true);
  assert.equal(isEmailInputMetadata({ type: 'email', name: 'email' }), true);
});

test('auth email field matcher rejects otp and password inputs', () => {
  assert.equal(isEmailInputMetadata({ type: 'text', name: 'code', autocomplete: 'one-time-code', maxLength: 6 }), false);
  assert.equal(isEmailInputMetadata({ type: 'password', name: 'password', autocomplete: 'current-password' }), false);
});

test('auth email action matcher accepts switch-to-email actions but skips work email actions', () => {
  assert.equal(isSwitchToEmailActionText('Continue using email address'), true);
  assert.equal(isSwitchToEmailActionText('继续使用电子邮件地址登录'), true);
  assert.equal(isSwitchToEmailActionText('Use email instead'), true);
  assert.equal(isSwitchToEmailActionText('免费注册 signup-button'), true);
  assert.equal(isSwitchToEmailActionText('Continue with work email'), false);
});
