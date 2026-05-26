import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorkflowRunControl,
  getWorkflowPrimaryButtonLabel,
} from '../.tmp-test/src/features/register/workflow-control.js';

test('workflow run control switches between start and stop states', () => {
  const control = createWorkflowRunControl();

  assert.equal(control.running, false);
  assert.equal(control.stopRequested, false);
  assert.equal(getWorkflowPrimaryButtonLabel(control), '开始');

  assert.equal(control.start(), true);
  assert.equal(control.running, true);
  assert.equal(control.stopRequested, false);
  assert.equal(getWorkflowPrimaryButtonLabel(control), '停止自动化');

  assert.equal(control.requestStop(), true);
  assert.equal(control.running, true);
  assert.equal(control.stopRequested, true);
  assert.equal(getWorkflowPrimaryButtonLabel(control), '停止中...');

  control.finish();
  assert.equal(control.running, false);
  assert.equal(control.stopRequested, true);
  assert.equal(getWorkflowPrimaryButtonLabel(control), '开始');

  assert.equal(control.start(), true);
  assert.equal(control.running, true);
  assert.equal(control.stopRequested, false);
});

test('workflow run control rejects duplicate starts while running', () => {
  const control = createWorkflowRunControl();

  assert.equal(control.start(), true);
  assert.equal(control.start(), false);
});
