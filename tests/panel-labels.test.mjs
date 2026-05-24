import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('side panel topbar labels separate registration and subscription pages', async () => {
  const source = await readFile(new URL('../src/app/panel.ts', import.meta.url), 'utf8');
  const stateSource = await readFile(new URL('../src/app/state.ts', import.meta.url), 'utf8');

  assert.match(source, /createTab\('register', '注册'\)/);
  assert.match(source, /createTab\('subscription', '订阅'\)/);
  assert.match(source, /createTab\('config', '配置'\)/);
  assert.match(source, /createTab\('accounts', '账号'\)/);
  assert.match(source, /tabs\.append\(configTab, registerTab, subscriptionTab, accountsTab\)/);
  assert.match(stateSource, /activeTab: 'config'/);
  assert.match(source, /settingsButton\.title = '打开设置'/);
  assert.match(source, /settingsButton\.setAttribute\('aria-label', '打开设置'\)/);
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
  assert.match(source, /const progressText = document\.createElement\('span'\)/);
  assert.match(source, /emailButton\.className = 'opx-workflow-email-copy'/);
  assert.match(source, /void copyWorkflowEmail\(emailButton, currentEmail\)/);
  assert.match(styles, /\.opx-workflow-email-copy/);
  assert.match(styles, /\.opx-email-list-summary/);
});

test('subscription page accepts copied account info and shows selected SMS phone', async () => {
  const source = await readFile(new URL('../src/app/panel.ts', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/app/styles.ts', import.meta.url), 'utf8');

  assert.match(source, /normalizeAccountRecords/);
  assert.match(source, /readManualWorkflowAccountInput/);
  assert.match(source, /sessionLabel\.textContent = isSubscriptionPanel \? '账号信息'/);
  assert.match(source, /sessionInput\.placeholder = isSubscriptionPanel/);
  assert.match(source, /codex_accounts\.json/);
  assert.match(source, /loadSmsRelayState/);
  assert.match(source, /selectedSmsRelayTarget/);
  assert.match(source, /opx-workflow-phone/);
  assert.doesNotMatch(source, /sessionLabel\.textContent = isSubscriptionPanel \? 'checkout/);
  assert.match(styles, /\.opx-workflow-phone/);
});

test('registration workflow checks local account service before starting', async () => {
  const source = await readFile(new URL('../src/app/panel.ts', import.meta.url), 'utf8');

  assert.match(source, /ensureLocalStoreReadyForRegistration/);
  assert.match(source, /opx:local-store-health/);
  assert.match(source, /本地账号服务/);
});
