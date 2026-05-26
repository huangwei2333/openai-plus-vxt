import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('side panel topbar labels separate registration and subscription pages', async () => {
  const source = await readFile(new URL('../src/app/panel.ts', import.meta.url), 'utf8');
  const stateSource = await readFile(new URL('../src/app/state.ts', import.meta.url), 'utf8');

  assert.match(source, /createTab\('register', /);
  assert.match(source, /createTab\('subscription', /);
  assert.match(source, /createTab\('config', /);
  assert.match(source, /createTab\('accounts', /);
  assert.match(source, /tabs\.append\(configTab, registerTab, subscriptionTab, accountsTab\)/);
  assert.match(stateSource, /activeTab: 'config'/);
  assert.match(source, /settingsButton\.title = /);
  assert.match(source, /settingsButton\.setAttribute\('aria-label', /);
});

test('configuration page owns setup cards while workflow pages stay focused', async () => {
  const source = await readFile(new URL('../src/app/panel.ts', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/app/styles.ts', import.meta.url), 'utf8');

  assert.match(source, /registerView\.append\(registerProgressSection\.body\)/);
  assert.match(source, /subscriptionView\.append\(subscriptionProgressSection\.body\)/);
  assert.match(source, /configView\.append\(emailSection\.body, smsSection\.body, addressSection\.body\)/);
  assert.match(source, /createRegisterWorkflowPanel\(registerProgressSection\.content, registerController, 'register'\)/);
  assert.match(source, /createRegisterWorkflowPanel\(subscriptionProgressSection\.content, registerController, 'subscription'\)/);
  assert.match(source, /const configEmbeddedHandles = \[/);
  assert.match(source, /await showPanelHandles\(configEmbeddedHandles\)/);
  assert.match(source, /await updatePanelHandles\(configEmbeddedHandles\)/);
  assert.match(source, /const progressText = document\.createElement\('span'\)/);
  assert.match(source, /emailButton\.className = 'opx-workflow-email-copy'/);
  assert.match(source, /void copyWorkflowEmail\(emailButton, currentEmail\)/);
  assert.match(styles, /\.opx-workflow-email-copy/);
  assert.match(styles, /\.opx-email-list-summary/);
});

test('configuration maintenance lists are expanded on first render', async () => {
  const registerPanelSource = await readFile(new URL('../src/features/register/panel.ts', import.meta.url), 'utf8');

  assert.match(registerPanelSource, /let expanded = true/);
});

test('subscription page accepts copied account info and shows selected SMS phone', async () => {
  const source = await readFile(new URL('../src/app/panel.ts', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/app/styles.ts', import.meta.url), 'utf8');

  assert.match(source, /normalizeAccountRecords/);
  assert.match(source, /readManualWorkflowAccountInput/);
  assert.match(source, /sessionLabel\.textContent = isSubscriptionPanel \? /);
  assert.match(source, /sessionInput\.placeholder = isSubscriptionPanel/);
  assert.match(source, /sessionInput\.rows = 2/);
  assert.doesNotMatch(source, /return `订阅：\$\{registerController\.getPageState\(\)\.label\}`/);
  assert.match(source, /codex_accounts\.json/);
  assert.match(source, /loadSmsRelayState/);
  assert.match(source, /selectedSmsRelayTarget/);
  assert.match(source, /opx-workflow-phone/);
  assert.doesNotMatch(source, /注册：邮箱生成与资料准备/);
  assert.match(source, /if \(isSubscriptionPanel\) \{\s+const checkbox = createWorkflowCheckbox/);
  assert.match(source, /section\.classList\.toggle\('is-readonly', !isSubscriptionPanel\)/);
  assert.doesNotMatch(source, /sessionLabel\.textContent = isSubscriptionPanel \? 'checkout/);
  assert.match(styles, /\.opx-workflow-phone/);
  assert.match(styles, /\.opx-workflow-account-input \{\s+height: 54px;\s+min-height: 54px;\s+max-height: 54px;/);
});

test('workflow progress row shows parsed email and start button', async () => {
  const source = await readFile(new URL('../src/app/panel.ts', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/app/styles.ts', import.meta.url), 'utf8');
  const controlSource = await readFile(new URL('../src/features/register/workflow-control.ts', import.meta.url), 'utf8');

  assert.match(source, /workflowHeader\.append\(progress, startButton\)/);
  assert.match(source, /container\.append\(sessionField, selectedPhone, workflowHeader, list, status, otpDialog\.element\)/);
  assert.match(source, /progress\.append\(progressText\)/);
  assert.match(source, /progress\.append\(emailButton\)/);
  assert.match(controlSource, /return '开始'/);
  assert.doesNotMatch(source, /actionRow\.append\(startButton\)/);
  assert.match(styles, /\.opx-workflow-header/);
  assert.match(styles, /\.opx-workflow-header \.opx-button/);
});

test('registration workflow checks local account service before starting', async () => {
  const source = await readFile(new URL('../src/app/panel.ts', import.meta.url), 'utf8');

  assert.match(source, /ensureLocalStoreReadyForRegistration/);
  assert.match(source, /opx:local-store-health/);
});
