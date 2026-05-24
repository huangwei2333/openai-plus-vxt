import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REGISTER_WORKFLOW_STEP_GROUPS,
  REGISTER_WORKFLOW_STEPS,
  canRerunWorkflowStep,
  getDefaultWorkflowStepSelection,
  getWorkflowGroupStatus,
  hasRunnableWorkflowSelection,
  isWorkflowStepSelected,
  setWorkflowSectionSelected,
} from '../.tmp-test/src/features/register/workflow.js';

test('workflow step groups split registration and subscription steps', () => {
  assert.deepEqual(
    REGISTER_WORKFLOW_STEP_GROUPS.map((group) => ({
      id: group.id,
      sectionId: group.sectionId,
      stepIds: group.stepIds,
    })),
    [
      { id: 'register-prep', sectionId: 'register', stepIds: ['email', 'address', 'sms'] },
      { id: 'register-submit', sectionId: 'register', stepIds: ['open-register', 'submit-email'] },
      { id: 'register-complete', sectionId: 'register', stepIds: ['submit-otp', 'fill-profile', 'read-session'] },
      { id: 'subscription-prep', sectionId: 'subscription', stepIds: ['create-checkout', 'open-checkout'] },
      { id: 'openai-pay', sectionId: 'subscription', stepIds: ['fill-openai-pay'] },
      { id: 'paypal-register', sectionId: 'subscription', stepIds: ['register-paypal', 'fill-paypal-signup', 'fill-paypal-code'] },
      { id: 'subscription-complete', sectionId: 'subscription', stepIds: ['confirm-paypal-code', 'complete-subscription'] },
    ],
  );
});

test('default workflow step selection enables every step', () => {
  const selection = getDefaultWorkflowStepSelection();

  assert.equal(REGISTER_WORKFLOW_STEPS.every((step) => isWorkflowStepSelected(selection, step.id)), true);
});

test('workflow section selection can choose registration or subscription only', () => {
  const registrationOnly = setWorkflowSectionSelected(
    setWorkflowSectionSelected(getDefaultWorkflowStepSelection(), 'subscription', false),
    'register',
    true,
  );
  const subscriptionOnly = setWorkflowSectionSelected(
    setWorkflowSectionSelected(getDefaultWorkflowStepSelection(), 'register', false),
    'subscription',
    true,
  );

  assert.equal(isWorkflowStepSelected(registrationOnly, 'submit-email'), true);
  assert.equal(isWorkflowStepSelected(registrationOnly, 'read-session'), true);
  assert.equal(isWorkflowStepSelected(subscriptionOnly, 'submit-email'), false);
  assert.equal(isWorkflowStepSelected(subscriptionOnly, 'read-session'), false);
});

test('workflow can start only when at least one section is selected', () => {
  const defaultSelection = getDefaultWorkflowStepSelection();
  const noneSelected = setWorkflowSectionSelected(
    setWorkflowSectionSelected(defaultSelection, 'register', false),
    'subscription',
    false,
  );

  assert.equal(hasRunnableWorkflowSelection(defaultSelection), true);
  assert.equal(hasRunnableWorkflowSelection(setWorkflowSectionSelected(defaultSelection, 'register', false)), true);
  assert.equal(hasRunnableWorkflowSelection(noneSelected), false);
});

test('workflow step rerun is only available after completed or failed states', () => {
  assert.equal(canRerunWorkflowStep('completed', false), true);
  assert.equal(canRerunWorkflowStep('failed', false), true);
  assert.equal(canRerunWorkflowStep('pending', false), false);
  assert.equal(canRerunWorkflowStep('running', false), false);
  assert.equal(canRerunWorkflowStep('skipped', false), false);
  assert.equal(canRerunWorkflowStep('completed', true), false);
});

test('workflow group status summarizes child step statuses', () => {
  const group = REGISTER_WORKFLOW_STEP_GROUPS.find((item) => item.id === 'paypal-register');
  assert.ok(group);

  const pending = REGISTER_WORKFLOW_STEPS.map(() => 'pending');
  assert.equal(getWorkflowGroupStatus(pending, group), 'pending');

  const running = [...pending];
  running[REGISTER_WORKFLOW_STEPS.findIndex((step) => step.id === 'fill-paypal-signup')] = 'running';
  assert.equal(getWorkflowGroupStatus(running, group), 'running');

  const failed = [...pending];
  failed[REGISTER_WORKFLOW_STEPS.findIndex((step) => step.id === 'register-paypal')] = 'completed';
  failed[REGISTER_WORKFLOW_STEPS.findIndex((step) => step.id === 'fill-paypal-signup')] = 'failed';
  assert.equal(getWorkflowGroupStatus(failed, group), 'failed');

  const completed = [...pending];
  for (const stepId of group.stepIds) {
    completed[REGISTER_WORKFLOW_STEPS.findIndex((step) => step.id === stepId)] = 'completed';
  }
  assert.equal(getWorkflowGroupStatus(completed, group), 'completed');

  const skipped = [...pending];
  for (const stepId of group.stepIds) {
    skipped[REGISTER_WORKFLOW_STEPS.findIndex((step) => step.id === stepId)] = 'skipped';
  }
  assert.equal(getWorkflowGroupStatus(skipped, group), 'skipped');
});
