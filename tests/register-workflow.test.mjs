import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REGISTER_WORKFLOW_STEPS,
  allowsPaypalManualChallenge,
  canPreparePaypalRegistrationStep,
  canEnterPaypalSignupStep,
  canCompleteSubmitOtpStep,
  canCompleteOpenAiPayStep,
  appendPaypalCountryUsParam,
  getExistingSessionWorkflowStatuses,
  isAuthEmailPageUrl,
  getInitialWorkflowStatuses,
  getResumeWorkflowStatuses,
  getWorkflowProgressText,
  getWorkflowStatusLabel,
  parseManualWorkflowSessionInput,
} from '../.tmp-test/src/features/register/workflow.js';

test('register workflow exposes the full automation path from registration to PayPal', () => {
  assert.deepEqual(
    REGISTER_WORKFLOW_STEPS.map((step) => step.id),
    [
      'email',
      'address',
      'sms',
      'open-register',
      'submit-email',
      'submit-otp',
      'fill-profile',
      'read-session',
      'create-checkout',
      'open-checkout',
      'fill-openai-pay',
      'register-paypal',
      'fill-paypal-signup',
      'fill-paypal-code',
      'confirm-paypal-code',
      'complete-subscription',
    ],
  );
  assert.equal(REGISTER_WORKFLOW_STEPS.every((step) => step.automatable), true);
});

test('register workflow progress text counts completed and skipped steps', () => {
  const statuses = getInitialWorkflowStatuses();
  statuses[0] = 'completed';
  statuses[1] = 'skipped';
  statuses[2] = 'running';

  assert.equal(getWorkflowProgressText(statuses), `2 / ${REGISTER_WORKFLOW_STEPS.length}`);
  assert.equal(getWorkflowStatusLabel('running'), '执行中');
});

test('register workflow resume keeps previous steps and resets failed step onward', () => {
  const statuses = getInitialWorkflowStatuses();
  statuses[0] = 'completed';
  statuses[1] = 'skipped';
  statuses[2] = 'completed';
  statuses[3] = 'failed';
  statuses[4] = 'failed';

  assert.deepEqual(
    getResumeWorkflowStatuses(statuses, 'open-register').slice(0, 6),
    ['completed', 'skipped', 'completed', 'pending', 'pending', 'pending'],
  );
});

test('register workflow recognizes OpenAI auth email entry URLs without matching later steps', () => {
  assert.equal(isAuthEmailPageUrl('chatgpt.com', '/'), true);
  assert.equal(isAuthEmailPageUrl('chatgpt.com', '/auth/login'), true);
  assert.equal(isAuthEmailPageUrl('auth.openai.com', '/log-in'), true);
  assert.equal(isAuthEmailPageUrl('auth.openai.com', '/sign-up'), true);
  assert.equal(isAuthEmailPageUrl('auth.openai.com', '/u/login/identifier'), true);
  assert.equal(isAuthEmailPageUrl('auth.openai.com', '/email-verification'), false);
  assert.equal(isAuthEmailPageUrl('auth.openai.com', '/about-you'), false);
});

test('submit-otp step completes only after profile page is ready', () => {
  assert.equal(canCompleteSubmitOtpStep({ canFillOtp: true, canFillProfile: false }), false);
  assert.equal(canCompleteSubmitOtpStep({ canFillOtp: false, canFillProfile: true }), true);
});

test('openai pay step completes only after redirecting to PayPal signup', () => {
  assert.equal(canCompleteOpenAiPayStep('https://pay.openai.com/c/pay/cs_test_123'), false);
  assert.equal(canCompleteOpenAiPayStep('https://www.paypal.com/checkoutweb/signup?token=abc'), true);
  assert.equal(canCompleteOpenAiPayStep('https://www.paypal.com/pay/?ssrt=1779371485912&token=abc&ul=1'), true);
  assert.equal(canCompleteOpenAiPayStep('https://www.paypal.com/webapps/hermes?token=abc'), true);
  assert.equal(canCompleteOpenAiPayStep('https://www.paypal.com/authflow/verification?token=abc'), true);
  assert.equal(canCompleteOpenAiPayStep('https://paypal.com/checkoutweb/signup?token=abc'), true);
  assert.equal(canCompleteOpenAiPayStep('not a url'), false);
});

test('openai pay step appends PayPal US country parameter after redirect', () => {
  assert.equal(
    appendPaypalCountryUsParam('https://www.paypal.com/checkoutweb/signup?token=abc'),
    'https://www.paypal.com/checkoutweb/signup?token=abc&country.x=US',
  );
  assert.equal(
    appendPaypalCountryUsParam('https://www.paypal.com/pay/?token=abc&country.x=CA'),
    'https://www.paypal.com/pay/?token=abc&country.x=US',
  );
  assert.equal(
    appendPaypalCountryUsParam('https://pay.openai.com/c/pay/cs_test_123'),
    'https://pay.openai.com/c/pay/cs_test_123',
  );
});

test('paypal signup fill step starts only on address and card form URL', () => {
  assert.equal(canEnterPaypalSignupStep('https://www.paypal.com/pay/?token=abc&country.x=US'), false);
  assert.equal(canEnterPaypalSignupStep('https://www.paypal.com/checkoutweb/signup?token=abc'), true);
  assert.equal(canEnterPaypalSignupStep('https://pay.openai.com/c/pay/cs_test_123'), false);
});

test('paypal registration preparation runs only on the email entry URL', () => {
  assert.equal(canPreparePaypalRegistrationStep('https://www.paypal.com/pay/?token=abc&country.x=US'), true);
  assert.equal(canPreparePaypalRegistrationStep('https://paypal.com/pay?token=abc'), true);
  assert.equal(canPreparePaypalRegistrationStep('https://www.paypal.com/checkoutweb/signup?token=abc&country.x=US'), false);
  assert.equal(canPreparePaypalRegistrationStep('https://pay.openai.com/c/pay/cs_test_123'), false);
});

test('paypal manual challenge continue is allowed on PayPal registration steps', () => {
  assert.equal(allowsPaypalManualChallenge('register-paypal'), true);
  assert.equal(allowsPaypalManualChallenge('fill-paypal-signup'), true);
  assert.equal(allowsPaypalManualChallenge('fill-paypal-code'), true);
  assert.equal(allowsPaypalManualChallenge('confirm-paypal-code'), true);
  assert.equal(allowsPaypalManualChallenge('complete-subscription'), true);
});

test('existing session shortcut skips registration steps and resumes at read-session', () => {
  const statuses = getExistingSessionWorkflowStatuses();

  assert.deepEqual(statuses.slice(0, 7), Array.from({ length: 7 }, () => 'skipped'));
  assert.equal(REGISTER_WORKFLOW_STEPS[7].id, 'read-session');
  assert.equal(statuses[7], 'pending');
  assert.equal(statuses[8], 'pending');
  assert.equal(getWorkflowProgressText(statuses), `7 / ${REGISTER_WORKFLOW_STEPS.length}`);
});

test('manual workflow session input accepts accessToken text and session JSON', () => {
  const token = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0In0.signature';
  assert.deepEqual(parseManualWorkflowSessionInput(token), {
    accessToken: token,
    sessionClipboardText: token,
  });

  const sessionJson = JSON.stringify({ user: { email: 'demo@example.com' }, accessToken: token });
  assert.deepEqual(parseManualWorkflowSessionInput(sessionJson), {
    accessToken: token,
    sessionClipboardText: sessionJson,
    email: 'demo@example.com',
  });
});
