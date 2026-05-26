import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('accounts panel deletes selected accounts from the top action bar', async () => {
  const source = await readFile(new URL('../src/features/accounts/panel.ts', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/app/styles.ts', import.meta.url), 'utf8');

  assert.match(source, /const deleteSelectedButton = createButton\('删除选中'/);
  assert.match(source, /deleteSelectedButton\.addEventListener\('click', \(\) => void deleteSelectedAccounts\(\)\)/);
  assert.match(source, /container\.append\(summary, selectRow, buttonRow, status, list\)/);
  assert.match(styles, /\.opx-account-actions\s*\{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(source, /const deleteAction = document\.createElement\('button'\)/);
  assert.doesNotMatch(source, /actions\.append\(action, deleteAction\)/);
});

test('accounts panel groups read-only accounts by original email without subscription chips', async () => {
  const source = await readFile(new URL('../src/features/accounts/panel.ts', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/app/styles.ts', import.meta.url), 'utf8');

  assert.match(source, /groupAccountsByOriginalEmail\(records\)/);
  assert.match(source, /inferRegisterBaseEmailFromAlias/);
  assert.match(styles, /\.opx-account-group/);
  assert.match(styles, /\.opx-account-group-title/);
  assert.doesNotMatch(source, /订阅状态/);
  assert.doesNotMatch(source, /订阅类型/);
  assert.doesNotMatch(styles, /\.opx-account-chip-row/);
  assert.doesNotMatch(source, /createSubscriptionStatusSelect/);
  assert.doesNotMatch(source, /createSubscriptionTypeInput/);
  assert.doesNotMatch(source, /保存订阅/);
  assert.doesNotMatch(styles, /\.opx-account-maintenance/);
});

test('accounts panel colors plan text and copies session or account info', async () => {
  const source = await readFile(new URL('../src/features/accounts/panel.ts', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/app/styles.ts', import.meta.url), 'utf8');

  assert.match(source, /plan\.className = `opx-account-plan is-\$\{getPlanTone\(record\.planType\)\}`/);
  assert.match(source, /copyAccountSession\(record\)/);
  assert.match(source, /copyAccountInfo\(record\)/);
  assert.match(source, /createButton\('session'/);
  assert.match(source, /createButton\('信息'/);
  assert.match(source, /Chat GPT Session 复制成功/);
  assert.match(source, /账号信息复制成功/);
  assert.match(source, /checkoutUrl/);
  assert.match(styles, /\.opx-account-plan\.is-plus/);
  assert.match(styles, /\.opx-account-plan\.is-free/);
  assert.doesNotMatch(source, /action\.textContent = '正常'/);
});
