import { mkdir, readFile, rename, copyFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import {
  createEmptyStore,
  importAccountsPayload,
  normalizeRegisterEmailItems,
  normalizeSmsHistory,
  normalizeSmsTargets,
  normalizeStore,
  normalizeSmsTargetId,
  upsertAccounts,
  upsertSmsTargets,
} from './normalize.mjs';

const DEFAULT_DIR_NAME = '.openai-plus-vxt';
const STORE_FILE_NAME = 'store.json';

export function resolveStoreDir(env = process.env) {
  return env.OPX_LOCAL_STORE_DIR || join(homedir(), DEFAULT_DIR_NAME);
}

export function createStoreRepository(options = {}) {
  const storeDir = options.storeDir || resolveStoreDir(options.env);
  const storePath = join(storeDir, STORE_FILE_NAME);
  const backupsDir = join(storeDir, 'backups');
  const codexDir = join(storeDir, 'codex');
  const codexAccountsDir = join(codexDir, 'accounts');
  const codexIndexPath = join(codexDir, 'codex_accounts.json');

  async function ensureDirs() {
    await mkdir(storeDir, { recursive: true });
    await mkdir(backupsDir, { recursive: true });
    await mkdir(codexAccountsDir, { recursive: true });
  }

  async function load() {
    await ensureDirs();
    if (!(await exists(storePath))) {
      const empty = createEmptyStore();
      await writeJsonAtomic(storePath, empty);
      return empty;
    }
    try {
      const content = await readFile(storePath, 'utf8');
      return normalizeStore(JSON.parse(content));
    } catch (error) {
      const damagedPath = join(storeDir, `store.damaged-${Date.now()}.json`);
      await rename(storePath, damagedPath).catch(() => undefined);
      const empty = createEmptyStore();
      await writeJsonAtomic(storePath, empty);
      return empty;
    }
  }

  async function save(store, { backup = true } = {}) {
    await ensureDirs();
    const normalized = normalizeStore({ ...store, updatedAt: Date.now() });
    if (backup && await exists(storePath)) {
      await copyFile(storePath, join(backupsDir, `store-${Date.now()}.json`));
    }
    await writeJsonAtomic(storePath, normalized);
    await writeCodexMirror(normalized, { codexIndexPath, codexAccountsDir });
    return normalized;
  }

  async function upsertSessionAccount(account) {
    const store = await load();
    store.accounts = upsertAccounts(store.accounts, [account]);
    return save(store);
  }

  async function importAccounts(payload) {
    const store = await load();
    const imported = importAccountsPayload(payload);
    store.accounts = upsertAccounts(store.accounts, imported.accounts);
    const saved = await save(store);
    return {
      store: saved,
      importedCount: imported.accounts.length,
      skippedCount: imported.skippedCount,
    };
  }

  async function patchAccount(accountId, patch) {
    const store = await load();
    const index = store.accounts.findIndex((account) => account.id === accountId);
    if (index < 0) {
      return { store, account: null };
    }
    const current = store.accounts[index];
    store.accounts[index] = {
      ...current,
      selected: typeof patch.selected === 'boolean' ? patch.selected : current.selected,
      planType: typeof patch.planType === 'string' ? patch.planType : current.planType,
      checkoutUrl: typeof patch.checkoutUrl === 'string' ? patch.checkoutUrl : current.checkoutUrl,
      subscriptionStatus: typeof patch.subscriptionStatus === 'string' ? patch.subscriptionStatus : current.subscriptionStatus,
      subscriptionType: typeof patch.subscriptionType === 'string' ? patch.subscriptionType : current.subscriptionType,
      planExpiresAt: typeof patch.planExpiresAt === 'string' ? patch.planExpiresAt : current.planExpiresAt,
      sessionExpiredAt: typeof patch.sessionExpiredAt === 'string' ? patch.sessionExpiredAt : current.sessionExpiredAt,
      updatedAt: Date.now(),
    };
    const saved = await save(store);
    return { store: saved, account: saved.accounts[index] };
  }

  async function deleteAccount(accountId) {
    const store = await load();
    const nextAccounts = store.accounts.filter((account) => account.id !== accountId);
    const deleted = nextAccounts.length !== store.accounts.length;
    if (!deleted) {
      return { store, deleted: false };
    }
    store.accounts = nextAccounts;
    return { store: await save(store), deleted: true };
  }

  async function upsertRegisterEmailItems(items) {
    const store = await load();
    const currentById = new Map(store.registerEmailItems.map((item) => [item.id, item]));
    for (const item of normalizeRegisterEmailItems(items)) {
      currentById.set(item.id, item);
    }
    store.registerEmailItems = [...currentById.values()];
    return save(store);
  }

  async function deleteRegisterEmailItem(itemId) {
    const store = await load();
    store.registerEmailItems = store.registerEmailItems.filter((item) => item.id !== itemId);
    return save(store);
  }

  async function upsertSmsTargets(targets) {
    const store = await load();
    store.smsRelay.targets = upsertSmsTargetsInternal(store.smsRelay.targets, targets);
    if (!store.smsRelay.selectedTargetId && store.smsRelay.targets[0]) {
      store.smsRelay.selectedTargetId = store.smsRelay.targets[0].id;
    }
    return save(store);
  }

  async function deleteSmsTarget(targetId) {
    const store = await load();
    const normalizedTargetId = normalizeSmsTargetId(targetId);
    store.smsRelay.targets = store.smsRelay.targets.filter((target) => (
      target.id !== targetId &&
      normalizeSmsTargetId(target.id) !== normalizedTargetId
    ));
    if (!store.smsRelay.targets.some((target) => target.id === store.smsRelay.selectedTargetId)) {
      store.smsRelay.selectedTargetId = store.smsRelay.targets[0]?.id || '';
    }
    return save(store);
  }

  async function patchSmsRelay(patch) {
    const store = await load();
    if (typeof patch.selectedTargetId === 'string') {
      store.smsRelay.selectedTargetId = patch.selectedTargetId;
    }
    if (Array.isArray(patch.history)) {
      store.smsRelay.history = normalizeSmsHistory(patch.history);
    }
    return save(store);
  }

  return {
    storeDir,
    storePath,
    backupsDir,
    codexDir,
    codexIndexPath,
    load,
    save,
    upsertSessionAccount,
    importAccounts,
    patchAccount,
    deleteAccount,
    upsertRegisterEmailItems,
    deleteRegisterEmailItem,
    upsertSmsTargets,
    deleteSmsTarget,
    patchSmsRelay,
  };
}

async function writeCodexMirror(store, paths) {
  const existing = await readExistingCodexIndex(paths.codexIndexPath);
  const accountByEmail = new Map(store.accounts.map((account) => [account.email.toLowerCase(), account]));
  const previousGenerated = new Map();
  for (const base of existing.baseEmails || []) {
    for (const generated of base.generated || []) {
      previousGenerated.set(String(generated.email || '').toLowerCase(), generated);
    }
  }

  const baseByEmail = new Map();
  for (const item of store.registerEmailItems) {
    const baseEmail = item.email.toLowerCase();
    const base = baseByEmail.get(baseEmail) || {
      email: baseEmail,
      accountLine: item.accountLine || '',
      inputMode: item.inputMode || 'email',
      selected: item.selected !== false,
      generated: [],
    };
    base.accountLine = item.accountLine || base.accountLine;
    base.inputMode = item.inputMode || base.inputMode;
    base.selected = item.selected !== false;
    for (const alias of item.aliases || []) {
      upsertGeneratedCodexEmail(base, alias.email, alias.category, alias.createdAt, accountByEmail, previousGenerated);
    }
    baseByEmail.set(baseEmail, base);
  }

  for (const account of store.accounts) {
    const baseEmail = inferCodexBaseEmail(account.email);
    const base = baseByEmail.get(baseEmail) || {
      email: baseEmail,
      accountLine: '',
      inputMode: 'email',
      selected: true,
      generated: [],
    };
    upsertGeneratedCodexEmail(base, account.email, '', account.createdAt, accountByEmail, previousGenerated);
    baseByEmail.set(baseEmail, base);
  }

  const index = {
    version: 1,
    baseEmails: [...baseByEmail.values()].map((base) => ({
      ...base,
      generated: base.generated.sort((left, right) => left.email.localeCompare(right.email)),
    })).sort((left, right) => left.email.localeCompare(right.email)),
    updatedAt: Date.now(),
  };

  await mkdir(paths.codexAccountsDir, { recursive: true });
  await writeJsonAtomic(paths.codexIndexPath, index);
  for (const account of store.accounts) {
    await writeJsonAtomic(join(paths.codexAccountsDir, safeEmailFileName(account.email)), serializeCodexSession(account));
  }
}

async function readExistingCodexIndex(indexPath) {
  if (!indexPath || !(await exists(indexPath))) {
    return { version: 1, baseEmails: [] };
  }
  try {
    const value = JSON.parse(await readFile(indexPath, 'utf8'));
    return value && typeof value === 'object' && Array.isArray(value.baseEmails)
      ? value
      : { version: 1, baseEmails: [] };
  } catch {
    return { version: 1, baseEmails: [] };
  }
}

function upsertGeneratedCodexEmail(base, email, category, createdAt, accountByEmail, previousGenerated) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || base.generated.some((item) => item.email.toLowerCase() === normalizedEmail)) {
    return;
  }
  const account = accountByEmail.get(normalizedEmail);
  const previous = previousGenerated.get(normalizedEmail) || {};
  base.generated.push({
    email: normalizedEmail,
    category: category || previous.category || '',
    checkoutUrl: account?.checkoutUrl || previous.checkoutUrl || '',
    sessionFile: account ? `accounts/${safeEmailFileName(normalizedEmail)}` : previous.sessionFile || '',
    subscriptionStatus: deriveSubscriptionStatus(account, previous.subscriptionStatus),
    subscriptionType: deriveSubscriptionType(account, previous.subscriptionType),
    createdAt: createdAt || account?.createdAt || previous.createdAt || Date.now(),
    updatedAt: account?.updatedAt || previous.updatedAt || Date.now(),
  });
}

function serializeCodexSession(account) {
  return {
    id_token: account.idToken || '',
    access_token: account.accessToken || '',
    refresh_token: account.refreshToken || '',
    account_id: account.accountId || '',
    checkout_url: account.checkoutUrl || '',
    subscription_status: deriveSubscriptionStatus(account),
    subscription_type: deriveSubscriptionType(account),
    last_refresh: account.lastRefreshAt || '',
    email: account.email || '',
    type: 'codex',
    expired: account.sessionExpiredAt || '',
  };
}

function deriveSubscriptionStatus(account, fallback = 'unknown') {
  if (!account) {
    return fallback || 'unknown';
  }
  if (account.subscriptionStatus && account.subscriptionStatus !== 'unknown') {
    return account.subscriptionStatus;
  }
  const planType = String(account.planType || account.subscriptionType || '').toLowerCase();
  if (planType === 'free') {
    return 'not_subscribed';
  }
  if (planType === 'plus' || planType === 'pro' || planType === 'team') {
    const expiresAt = Date.parse(account.planExpiresAt || '');
    return Number.isFinite(expiresAt) && expiresAt <= Date.now() ? 'expired' : 'active';
  }
  return fallback || 'unknown';
}

function deriveSubscriptionType(account, fallback = 'unknown') {
  if (!account) {
    return fallback || 'unknown';
  }
  const type = String(account.subscriptionType || account.planType || '').trim().toLowerCase();
  return type || fallback || 'unknown';
}

function inferCodexBaseEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const [rawLocal, domain] = normalizedEmail.split('@');
  if (!rawLocal || !domain || (domain !== 'gmail.com' && domain !== 'googlemail.com')) {
    return normalizedEmail;
  }
  const baseLocal = rawLocal.split('+')[0]?.replace(/\./g, '');
  return baseLocal ? `${baseLocal}@gmail.com` : normalizedEmail;
}

function safeEmailFileName(email) {
  return `${String(email || '').trim().toLowerCase().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')}.json`;
}


function upsertSmsTargetsInternal(currentTargets, nextTargets) {
  return upsertSmsTargets(normalizeSmsTargets(currentTargets), normalizeSmsTargets(nextTargets));
}

async function writeJsonAtomic(path, value) {
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tempPath, path);
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
