import { loadAccountRecords, loadRegisterState, saveAccountRecords, saveRegisterState } from '../../app/state';
import { sendActiveTabCommand } from '../../app/sidepanel-controller';
import type { FeaturePanelHandle } from '../../app/types';
import {
  buildAccountRecordFromSession,
  createAccountsExportFileName,
  getAccountRuntimeStatus,
  serializeAccountsForExport,
  upsertAccountRecord,
} from './session';
import type { ChatGptSessionResponse } from '../link-extractor/types';
import {
  addRegisterEmailItemsFromInput,
  inferRegisterBaseEmailFromAlias,
  mergeRegisterEmailItemsFromSessionEmails,
  recordRegisterEmailSession,
  setRegisterEmailItemSelected,
} from '../register/email-alias';
import type { AccountRecord } from './types';

const LOGIN_URL = 'https://chatgpt.com/auth/login';
const LOGIN_PAGE_TIMEOUT_MS = 15_000;
const SESSION_POLL_TIMEOUT_MS = 180_000;
const SESSION_POLL_INTERVAL_MS = 3_000;

export function createAccountsPanel(container: HTMLElement): FeaturePanelHandle {
  const summary = document.createElement('div');
  summary.className = 'opx-summary';

  const selectRow = document.createElement('label');
  selectRow.className = 'opx-account-select-row';
  const selectAllCheckbox = document.createElement('input');
  selectAllCheckbox.className = 'opx-checkbox';
  selectAllCheckbox.type = 'checkbox';
  const selectAllText = document.createElement('span');
  selectAllText.textContent = '全选';
  selectRow.append(selectAllCheckbox, selectAllText);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'opx-button-row opx-account-actions';
  const refreshButton = createButton('保存', 'opx-button opx-button-secondary');
  refreshButton.title = '保存当前 ChatGPT session';
  const importButton = createButton('导入', 'opx-button opx-button-secondary');
  importButton.title = '导入账号 JSON';
  const exportButton = createButton('导出');
  exportButton.title = '导出选中的账号';
  const deleteSelectedButton = createButton('删除选中', 'opx-button opx-button-danger');
  deleteSelectedButton.title = '删除已勾选的账号记录';
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json,.json';
  importInput.hidden = true;
  buttonRow.append(refreshButton, importButton, exportButton, deleteSelectedButton, importInput);

  const list = document.createElement('div');
  list.className = 'opx-account-list';

  const status = document.createElement('div');
  status.className = 'opx-status';
  status.textContent = '账号列表会显示已保存的成功账号。';

  let records: AccountRecord[] = [];
  let polling = false;

  container.append(summary, selectRow, buttonRow, status, list);

  selectAllCheckbox.addEventListener('change', () => void setAllSelected(selectAllCheckbox.checked));
  refreshButton.addEventListener('click', () => void saveCurrentSession());
  importButton.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => void importAccountsFromFile());
  exportButton.addEventListener('click', () => void exportSelected());
  deleteSelectedButton.addEventListener('click', () => void deleteSelectedAccounts());

  const update = async () => {
    records = await loadSharedAccountRecords();
    render();
  };

  void update();
  return { update, onShow: update };

  async function saveCurrentSession(): Promise<void> {
    refreshButton.disabled = true;
    setStatus(status, '正在读取当前 ChatGPT session...', 'pending');
    try {
      const response = await fetchCurrentSession();
      if (!isChatGptSessionResponse(response) || !response.session?.accessToken) {
        setStatus(status, response?.message || '未读取到有效 session', 'error');
        return;
      }
      const nextRecord = buildAccountRecordFromSession(response);
      if (!nextRecord.email) {
        setStatus(status, 'session 中没有邮箱，无法保存账号。', 'error');
        return;
      }
      records = await saveSharedSession(nextRecord);
      await markRegisterEmailSessionSaved(nextRecord.email);
      render();
      setStatus(status, `已保存 ${nextRecord.email}`, 'ok');
    } catch (error) {
      setStatus(status, `读取 session 失败：${String(error)}`, 'error');
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function deleteAccount(record: AccountRecord, options: { renderAfterDelete?: boolean } = {}): Promise<void> {
    const response = await browser.runtime.sendMessage({
      type: 'opx:local-store-delete-account',
      accountId: record.id,
    }).catch(() => null);
    if (isLocalStoreResponse(response) && response.ok && response.store) {
      records = await saveAccountRecords(response.store.accounts);
    } else {
      records = await saveAccountRecords(records.filter((item) => item.id !== record.id));
    }
    if (options.renderAfterDelete !== false) {
      render();
      setStatus(status, `已删除 ${record.email}`, 'ok');
    }
  }

  async function deleteSelectedAccounts(): Promise<void> {
    const selectedRecords = records.filter((record) => record.selected);
    if (!selectedRecords.length) {
      setStatus(status, '请先勾选要删除的账号。', 'error');
      return;
    }

    deleteSelectedButton.disabled = true;
    setStatus(status, `正在删除 ${selectedRecords.length} 个账号...`, 'pending');
    try {
      for (const record of selectedRecords) {
        await deleteAccount(record, { renderAfterDelete: false });
      }
      render();
      setStatus(status, `已删除 ${selectedRecords.length} 个账号。`, 'ok');
    } finally {
      deleteSelectedButton.disabled = false;
      render();
    }
  }

  async function toggleSelected(record: AccountRecord, selected: boolean): Promise<void> {
    records = await updateAccountSelections([{ id: record.id, selected }]);
    render();
  }

  async function setAllSelected(selected: boolean): Promise<void> {
    if (!records.length) {
      render();
      return;
    }
    selectAllCheckbox.disabled = true;
    try {
      records = await updateAccountSelections(records.map((record) => ({ id: record.id, selected })));
      render();
      setStatus(status, selected ? '已全选账号。' : '已取消全选。', 'ok');
    } finally {
      selectAllCheckbox.disabled = false;
    }
  }

  async function updateAccountSelections(patches: Array<{ id: string; selected: boolean }>): Promise<AccountRecord[]> {
    let latest: AccountRecord[] | null = null;
    for (const patch of patches) {
      const response = await browser.runtime.sendMessage({
        type: 'opx:local-store-update-account',
        accountId: patch.id,
        patch: { selected: patch.selected },
      }).catch(() => null);
      if (isLocalStoreResponse(response) && response.ok && response.store) {
        latest = response.store.accounts;
      } else {
        latest = null;
        break;
      }
    }
    if (latest) {
      return saveAccountRecords(latest);
    }
    const selectedById = new Map(patches.map((patch) => [patch.id, patch.selected]));
    return saveAccountRecords(records.map((item) =>
      selectedById.has(item.id) ? { ...item, selected: Boolean(selectedById.get(item.id)) } : item
    ));
  }

  async function startRelogin(record: AccountRecord): Promise<void> {
    if (polling) {
      return;
    }
    polling = true;
    setStatus(status, `正在打开登录页并填写 ${record.email}...`, 'pending');
    try {
      await prepareRegisterEmail(record.email);
      await browser.tabs.create({ url: LOGIN_URL, active: true });
      const ready = await waitForLoginPage();
      if (!ready) {
        setStatus(status, '已打开登录页，但页面尚未就绪，请稍后手动继续。', 'error');
        return;
      }
      const fillResult = await sendActiveTabCommand('fill-email');
      if (!isActionResult(fillResult) || !fillResult.ok) {
        const message = isActionResult(fillResult) ? fillResult.message : '自动填写邮箱失败，请手动填写。';
        setStatus(status, message, 'error');
        return;
      }
      setStatus(status, '邮箱已提交。请手动完成验证码/登录，面板会监听 session 刷新。', 'pending');
      await pollRefreshedSession(record);
    } catch (error) {
      setStatus(status, `重新登录失败：${String(error)}`, 'error');
    } finally {
      polling = false;
    }
  }

  async function prepareRegisterEmail(email: string): Promise<void> {
    const register = await loadRegisterState();
    const added = addRegisterEmailItemsFromInput(register.emailItems, email);
    const items = setRegisterEmailItemSelected(added.items, `email:${email.toLowerCase()}`, true);
    await saveRegisterState({
      rawInput: email,
      email,
      accountLine: '',
      inputMode: 'email',
      emailItems: items,
      autoOtp: false,
    });
  }

  async function waitForLoginPage(): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < LOGIN_PAGE_TIMEOUT_MS) {
      const page = await sendActiveTabCommand('get-page-state').catch(() => null);
      if (isPageState(page) && page.canFillEmail) {
        return true;
      }
      await delay(500);
    }
    return false;
  }

  async function pollRefreshedSession(record: AccountRecord): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < SESSION_POLL_TIMEOUT_MS) {
      await delay(SESSION_POLL_INTERVAL_MS);
      const response = await fetchCurrentSession().catch(() => null);
      if (!isChatGptSessionResponse(response) || !response.session?.accessToken) {
        continue;
      }
      const nextRecord = buildAccountRecordFromSession(response, record);
      if (nextRecord.email.toLowerCase() !== record.email.toLowerCase()) {
        continue;
      }
      records = await saveSharedSession(nextRecord);
      await markRegisterEmailSessionSaved(nextRecord.email);
      render();
      setStatus(status, `已刷新 ${record.email} 的 session`, 'ok');
      return;
    }
    setStatus(status, '等待 session 刷新超时。登录成功后可点“保存当前 session”。', 'error');
  }

  async function markRegisterEmailSessionSaved(email: string): Promise<void> {
    const register = await loadRegisterState();
    const next = recordRegisterEmailSession(register, email);
    if (next.emailItems !== register.emailItems) {
      await saveRegisterState({ emailItems: next.emailItems });
    }
  }

  async function fetchCurrentSession(): Promise<ChatGptSessionResponse> {
    return browser.runtime.sendMessage({ type: 'opx:fetch-chatgpt-session' });
  }

  async function loadSharedAccountRecords(): Promise<AccountRecord[]> {
    const response = await browser.runtime.sendMessage({ type: 'opx:local-store-get' }).catch(() => null);
    if (isLocalStoreResponse(response) && response.ok && response.store) {
      return saveAccountRecords(response.store.accounts);
    }
    return loadAccountRecords();
  }

  async function saveSharedSession(nextRecord: AccountRecord): Promise<AccountRecord[]> {
    const response = await browser.runtime.sendMessage({
      type: 'opx:local-store-upsert-session',
      account: nextRecord,
    }).catch(() => null);
    if (isLocalStoreResponse(response) && response.ok && response.store) {
      return saveAccountRecords(response.store.accounts);
    }
    return saveAccountRecords(upsertAccountRecord(records, nextRecord));
  }

  async function importAccountsFromFile(): Promise<void> {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const response = await browser.runtime.sendMessage({
        type: 'opx:local-store-import-accounts',
        payload,
      });
      if (!isLocalStoreResponse(response) || !response.ok || !response.store) {
        setStatus(status, response?.message || '导入失败：本地账号服务未启动或返回无效', 'error');
        return;
      }
      records = await saveAccountRecords(response.store.accounts);
      const synced = await syncImportedAccountEmailsToRegisterList(response.store.accounts);
      render();
      const syncText = [
        synced.addedBaseCount ? `同步 ${synced.addedBaseCount} 个原邮箱` : '',
        synced.addedAliasCount ? `更新 ${synced.addedAliasCount} 个已生成记录` : '',
      ].filter(Boolean).join('，');
      setStatus(status, `已导入 ${response.importedCount || 0} 个账号${syncText ? `，${syncText}` : ''}`, 'ok');
    } catch (error) {
      setStatus(status, `导入 JSON 失败：${String(error)}`, 'error');
    }
  }

  async function syncImportedAccountEmailsToRegisterList(
    importedRecords: AccountRecord[],
  ): Promise<{ addedBaseCount: number; addedAliasCount: number }> {
    const register = await loadRegisterState();
    const merged = mergeRegisterEmailItemsFromSessionEmails(
      register.emailItems,
      importedRecords.map((record) => record.email),
    );
    if (merged.items !== register.emailItems) {
      await saveRegisterState({ emailItems: merged.items });
      await browser.runtime.sendMessage({
        type: 'opx:local-store-upsert-register-email-items',
        items: merged.items,
      }).catch(() => undefined);
    }
    return {
      addedBaseCount: merged.addedBaseCount,
      addedAliasCount: merged.addedAliasCount,
    };
  }

  async function exportSelected(): Promise<void> {
    const selectedIds = new Set(records.filter((record) => record.selected).map((record) => record.id));
    if (!selectedIds.size) {
      setStatus(status, '请先勾选要导出的账号。', 'error');
      return;
    }
    const json = serializeAccountsForExport(records, selectedIds);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileName = createAccountsExportFileName(selectedIds.size);
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(status, `已导出 ${selectedIds.size} 个账号：${fileName}`, 'ok');
  }

  function render(): void {
    list.textContent = '';
    const selectedCount = records.filter((record) => record.selected).length;
    summary.textContent = `${records.length} 个账号 · 已勾选 ${selectedCount} 个`;
    selectAllCheckbox.checked = records.length > 0 && selectedCount === records.length;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < records.length;
    selectAllCheckbox.disabled = records.length === 0;
    selectAllText.textContent = selectedCount === records.length && records.length > 0 ? '取消全选' : '全选';
    exportButton.disabled = selectedCount === 0;
    deleteSelectedButton.disabled = selectedCount === 0;

    if (!records.length) {
      const empty = document.createElement('div');
      empty.className = 'opx-empty-inline';
      empty.textContent = '暂无成功账号。登录成功后点击“保存”。';
      list.append(empty);
      return;
    }

    for (const group of groupAccountsByOriginalEmail(records)) {
      const groupElement = document.createElement('section');
      groupElement.className = 'opx-account-group';
      const heading = document.createElement('div');
      heading.className = 'opx-account-group-title';
      heading.textContent = `${group.originalEmail} · ${group.records.length} 个账号`;
      const groupList = document.createElement('div');
      groupList.className = 'opx-account-group-list';
      for (const record of group.records) {
        groupList.append(createAccountRow(record));
      }
      groupElement.append(heading, groupList);
      list.append(groupElement);
    }
  }

  function createAccountRow(record: AccountRecord): HTMLElement {
    const runtime = getAccountRuntimeStatus(record);
    const row = document.createElement('div');
    row.className = 'opx-account-row';
    row.dataset.planExpired = String(runtime.planExpired);
    row.dataset.sessionExpired = String(runtime.sessionExpired);

    const checkbox = document.createElement('input');
    checkbox.className = 'opx-checkbox';
    checkbox.type = 'checkbox';
    checkbox.checked = record.selected;
    checkbox.addEventListener('change', () => void toggleSelected(record, checkbox.checked));

    const main = document.createElement('div');
    main.className = 'opx-account-main';
    const email = document.createElement('strong');
    email.textContent = record.email;
    const meta = document.createElement('div');
    meta.className = 'opx-account-meta';
    const plan = document.createElement('span');
    plan.className = `opx-account-plan is-${getPlanTone(record.planType)}`;
    plan.textContent = `套餐：${record.planType || '未知'}`;
    const planRemaining = document.createElement('span');
    planRemaining.textContent = `套餐剩余：${runtime.planRemainingText}`;
    const sessionRemaining = document.createElement('span');
    sessionRemaining.textContent = `session：${runtime.sessionRemainingText}`;
    meta.append(plan, planRemaining, sessionRemaining);

    main.append(email, meta);

    const actions = document.createElement('div');
    actions.className = 'opx-account-row-actions';

    const sessionButton = createButton('session', 'opx-mini-button opx-mini-button-secondary');
    sessionButton.title = '复制账号 session';
    sessionButton.addEventListener('click', () => void copyAccountSession(record)
      .then(() => setStatus(status, 'Chat GPT Session 复制成功', 'ok'))
      .catch((error) => setStatus(status, `复制 session 失败：${String(error)}`, 'error')));

    const infoButton = createButton('信息', 'opx-mini-button opx-mini-button-secondary');
    infoButton.title = '复制账号信息和长链接';
    infoButton.addEventListener('click', () => void copyAccountInfo(record)
      .then(() => setStatus(status, '账号信息复制成功', 'ok'))
      .catch((error) => setStatus(status, `复制账号信息失败：${String(error)}`, 'error')));

    actions.append(sessionButton, infoButton);
    row.append(checkbox, main, actions);
    return row;
  }
}

function groupAccountsByOriginalEmail(records: AccountRecord[]): Array<{ originalEmail: string; records: AccountRecord[] }> {
  const groups = new Map<string, AccountRecord[]>();
  for (const record of records) {
    const originalEmail = inferRegisterBaseEmailFromAlias(record.email) || record.email.toLowerCase();
    const current = groups.get(originalEmail) || [];
    current.push(record);
    groups.set(originalEmail, current);
  }
  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([originalEmail, groupRecords]) => ({
      originalEmail,
      records: groupRecords.slice().sort((left, right) => left.email.localeCompare(right.email)),
    }));
}

function getPlanTone(planType: string): 'plus' | 'free' | 'unknown' {
  const normalized = planType.trim().toLowerCase();
  if (normalized === 'plus') {
    return 'plus';
  }
  if (normalized === 'free') {
    return 'free';
  }
  return 'unknown';
}

async function copyAccountSession(record: AccountRecord): Promise<void> {
  await navigator.clipboard.writeText(serializeAccountsForExport([record], new Set([record.id])));
}

async function copyAccountInfo(record: AccountRecord): Promise<void> {
  const lines = [
    `email: ${record.email}`,
    `plan: ${record.planType || 'unknown'}`,
    `subscription_status: ${record.subscriptionStatus || 'unknown'}`,
    `subscription_type: ${record.subscriptionType || record.planType || 'unknown'}`,
    `checkoutUrl: ${record.checkoutUrl || ''}`,
    `session_expired_at: ${record.sessionExpiredAt || ''}`,
    `plan_expires_at: ${record.planExpiresAt || ''}`,
    `account_id: ${record.accountId || ''}`,
  ];
  await navigator.clipboard.writeText(lines.join('\n'));
}

function createButton(label: string, className = 'opx-button'): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = className;
  button.type = 'button';
  button.textContent = label;
  return button;
}

function setStatus(element: HTMLElement, message: string, type: 'pending' | 'ok' | 'error'): void {
  element.textContent = message;
  element.dataset.type = type;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isChatGptSessionResponse(value: unknown): value is ChatGptSessionResponse {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as ChatGptSessionResponse).ok === 'boolean' &&
      typeof (value as ChatGptSessionResponse).message === 'string',
  );
}

function isActionResult(value: unknown): value is { ok: boolean; message: string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { ok?: unknown }).ok === 'boolean' &&
      typeof (value as { message?: unknown }).message === 'string',
  );
}

function isPageState(value: unknown): value is { canFillEmail: boolean } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { canFillEmail?: unknown }).canFillEmail === 'boolean',
  );
}

function isLocalStoreResponse(value: unknown): value is {
  ok: boolean;
  message?: string;
  importedCount?: number;
  store?: { accounts: AccountRecord[] };
} {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { ok?: unknown }).ok === 'boolean',
  );
}
