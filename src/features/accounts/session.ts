import type { ChatGptSessionResponse } from '../link-extractor/types';
import type { AccountRecord, AccountRuntimeStatus } from './types';

interface ExportedCodexAccount {
  id_token: string;
  access_token: string;
  refresh_token: string;
  account_id: string;
  last_refresh: string;
  email: string;
  type: 'codex';
  expired: string;
}

const DEFAULT_ACCOUNT_TYPE = 'codex';

export function buildAccountRecordFromSession(
  response: ChatGptSessionResponse,
  previous?: AccountRecord,
): AccountRecord {
  const raw = isRecord(response.raw) ? response.raw : {};
  const session = response.session;
  const accessToken = stringValue(session?.accessToken) || findDeepString(raw, ['accessToken', 'access_token']);
  const idToken = stringValue(session?.idToken) || findDeepString(raw, ['idToken', 'id_token']);
  const refreshToken = stringValue(session?.refreshToken) || findDeepString(raw, ['refreshToken', 'refresh_token']);
  const accessPayload = decodeJwtPayload(accessToken);
  const idPayload = decodeJwtPayload(idToken);
  const accessAuthPayload = isRecord(accessPayload['https://api.openai.com/auth'])
    ? accessPayload['https://api.openai.com/auth']
    : {};
  const idAuthPayload = isRecord(idPayload['https://api.openai.com/auth'])
    ? idPayload['https://api.openai.com/auth']
    : {};
  const profilePayload = isRecord(accessPayload['https://api.openai.com/profile'])
    ? accessPayload['https://api.openai.com/profile']
    : {};
  const email = stringValue(session?.email) ||
    findDeepString(raw, ['email']) ||
    stringValue(profilePayload.email) ||
    stringValue(idPayload.email);
  const accountId = stringValue(session?.accountId) ||
    findDeepString(raw, ['accountId', 'account_id', 'chatgpt_account_id']) ||
    extractAccountIdFromAuthPayload(accessAuthPayload) ||
    extractAccountIdFromAuthPayload(idAuthPayload);
  const planType = stringValue(session?.planType) ||
    findDeepString(raw, ['planType', 'plan_type', 'chatgpt_plan_type']) ||
    stringValue(idAuthPayload.chatgpt_plan_type) ||
    stringValue(accessAuthPayload.chatgpt_plan_type);
  const planExpiresAt = normalizeIsoDate(
    stringValue(session?.planExpiresAt) ||
    findDeepString(raw, [
      'planExpiresAt',
      'plan_expires_at',
      'planExpires',
      'plan_expired',
      'subscriptionExpiresAt',
      'subscription_expires_at',
    ]),
  );
  const tokenExpiredAt = normalizeEpochSeconds(accessPayload.exp);
  const sessionExpiredAt = normalizeIsoDate(
    tokenExpiredAt ||
    stringValue(session?.sessionExpiredAt) ||
    findDeepString(raw, ['expired', 'expires', 'expiresAt', 'expires_at']),
  );
  const now = Date.now();
  const lastRefreshAt = normalizeIsoDate(session?.fetchedAt || response.raw && findDeepString(raw, ['lastRefresh', 'last_refresh'])) ||
    new Date(now).toISOString();

  return {
    id: previous?.id || accountId || email || `account-${now}`,
    email,
    selected: previous?.selected ?? true,
    idToken,
    accessToken,
    refreshToken,
    accountId,
    planType,
    checkoutUrl: stringValue((previous as AccountRecord | undefined)?.checkoutUrl),
    subscriptionStatus: normalizeSubscriptionStatus((previous as AccountRecord | undefined)?.subscriptionStatus),
    subscriptionType: normalizeSubscriptionType(planType || (previous as AccountRecord | undefined)?.subscriptionType),
    planExpiresAt,
    sessionExpiredAt,
    lastRefreshAt,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
}

export function normalizeAccountRecords(value: unknown): AccountRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const records: AccountRecord[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const accessToken = stringValue(item.accessToken || item.access_token);
    if (!accessToken) {
      continue;
    }
    const idToken = stringValue(item.idToken || item.id_token);
    const accessPayload = decodeJwtPayload(accessToken);
    const idPayload = decodeJwtPayload(idToken);
    const accessAuthPayload = isRecord(accessPayload['https://api.openai.com/auth'])
      ? accessPayload['https://api.openai.com/auth']
      : {};
    const idAuthPayload = isRecord(idPayload['https://api.openai.com/auth'])
      ? idPayload['https://api.openai.com/auth']
      : {};
    const accessProfilePayload = isRecord(accessPayload['https://api.openai.com/profile'])
      ? accessPayload['https://api.openai.com/profile']
      : {};
    const idProfilePayload = isRecord(idPayload['https://api.openai.com/profile'])
      ? idPayload['https://api.openai.com/profile']
      : {};
    const email = stringValue(item.email) ||
      stringValue(accessPayload.email) ||
      stringValue(idPayload.email) ||
      stringValue(accessProfilePayload.email) ||
      stringValue(idProfilePayload.email);
    if (!email) {
      continue;
    }
    const accountId = stringValue(item.accountId || item.account_id) ||
      extractAccountIdFromAuthPayload(accessAuthPayload) ||
      extractAccountIdFromAuthPayload(idAuthPayload);
    const id = stringValue(item.id) || accountId || email;
    const dedupeKey = email.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    records.push({
      id,
      email,
      selected: item.selected !== false,
      idToken,
      accessToken,
      refreshToken: stringValue(item.refreshToken || item.refresh_token),
      accountId,
      planType: stringValue(item.planType || item.plan_type) ||
        stringValue(idAuthPayload.chatgpt_plan_type) ||
        stringValue(accessAuthPayload.chatgpt_plan_type),
      checkoutUrl: stringValue(item.checkoutUrl || item.checkout_url),
      subscriptionStatus: normalizeSubscriptionStatus(item.subscriptionStatus || item.subscription_status),
      subscriptionType: normalizeSubscriptionType(item.subscriptionType || item.subscription_type || item.planType || item.plan_type),
      planExpiresAt: normalizeIsoDate(item.planExpiresAt || item.plan_expires_at),
      sessionExpiredAt: normalizeEpochSeconds(accessPayload.exp) ||
        normalizeIsoDate(item.sessionExpiredAt || item.expired),
      lastRefreshAt: normalizeIsoDate(item.lastRefreshAt || item.last_refresh) || new Date(0).toISOString(),
      createdAt: Number(item.createdAt || 0),
      updatedAt: Number(item.updatedAt || 0),
    });
  }
  return records;
}

export function upsertAccountRecord(records: AccountRecord[], nextRecord: AccountRecord): AccountRecord[] {
  const normalized = normalizeAccountRecords(records);
  const index = normalized.findIndex((item) =>
    item.email.toLowerCase() === nextRecord.email.toLowerCase()
  );
  if (index < 0) {
    return [...normalized, nextRecord];
  }
  const previous = normalized[index];
  const next = buildAccountRecordFromSession({
    ok: true,
    message: '本地更新',
    session: {
      email: nextRecord.email,
      planType: nextRecord.planType,
      accessToken: nextRecord.accessToken,
      idToken: nextRecord.idToken,
      refreshToken: nextRecord.refreshToken,
      accountId: nextRecord.accountId,
      planExpiresAt: nextRecord.planExpiresAt,
      sessionExpiredAt: nextRecord.sessionExpiredAt,
      fetchedAt: Date.parse(nextRecord.lastRefreshAt) || Date.now(),
    },
    raw: {},
  }, previous);
  normalized[index] = {
    ...next,
    checkoutUrl: nextRecord.checkoutUrl || previous.checkoutUrl,
    subscriptionStatus: nextRecord.subscriptionStatus || previous.subscriptionStatus,
    subscriptionType: nextRecord.subscriptionType || previous.subscriptionType,
    selected: previous.selected,
  };
  return normalized;
}

export function getAccountRuntimeStatus(record: AccountRecord, now = Date.now()): AccountRuntimeStatus {
  const planExpiresAt = Date.parse(record.planExpiresAt);
  const sessionExpiredAt = Date.parse(record.sessionExpiredAt);
  return {
    planExpired: Number.isFinite(planExpiresAt) ? planExpiresAt <= now : false,
    sessionExpired: Number.isFinite(sessionExpiredAt) ? sessionExpiredAt <= now : false,
    planRemainingText: formatRemaining(planExpiresAt, now),
    sessionRemainingText: formatRemaining(sessionExpiredAt, now),
  };
}

export function serializeAccountsForExport(records: AccountRecord[], selectedIds: Set<string>): string {
  const exported: ExportedCodexAccount[] = normalizeAccountRecords(records)
    .filter((record) => selectedIds.has(record.id))
    .map((record) => ({
      id_token: record.idToken,
      access_token: record.accessToken,
      refresh_token: record.refreshToken,
      account_id: record.accountId,
      checkout_url: record.checkoutUrl || '',
      subscription_status: record.subscriptionStatus || 'unknown',
      subscription_type: record.subscriptionType || record.planType || 'unknown',
      last_refresh: record.lastRefreshAt,
      email: record.email,
      type: DEFAULT_ACCOUNT_TYPE,
      expired: record.sessionExpiredAt,
    }));
  return JSON.stringify(exported, null, 2);
}

export function createAccountsExportFileName(accountCount: number, now = new Date()): string {
  const safeCount = Math.max(0, Math.floor(accountCount));
  return `codex_accounts_${safeCount}_accounts_${formatLocalDateTimeMinute(now)}.json`;
}

function formatRemaining(targetTime: number, now: number): string {
  if (!Number.isFinite(targetTime) || targetTime <= 0) {
    return '未知';
  }
  const diff = targetTime - now;
  if (diff <= 0) {
    return '已过期';
  }
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) {
    return `${days} 天`;
  }
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) {
    return `${hours} 小时`;
  }
  const minutes = Math.max(1, Math.floor(diff / 60_000));
  return `${minutes} 分钟`;
}

function formatLocalDateTimeMinute(value: Date): string {
  const year = String(value.getFullYear());
  const month = padDatePart(value.getMonth() + 1);
  const day = padDatePart(value.getDate());
  const hour = padDatePart(value.getHours());
  const minute = padDatePart(value.getMinutes());
  return `${year}${month}${day}${hour}${minute}`;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) {
    return {};
  }
  try {
    return JSON.parse(base64UrlDecode(payload)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  if (typeof atob === 'function') {
    return atob(padded);
  }
  const bufferCtor = (globalThis as typeof globalThis & {
    Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } };
  }).Buffer;
  return bufferCtor?.from(padded, 'base64').toString('utf8') || '';
}

function normalizeEpochSeconds(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }
  return new Date(seconds * 1000).toISOString();
}

function normalizeIsoDate(value: unknown): string {
  if (typeof value === 'number') {
    return value > 10_000_000_000
      ? new Date(value).toISOString()
      : normalizeEpochSeconds(value);
  }
  const text = stringValue(value);
  if (!text) {
    return '';
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return new Date(parsed).toISOString();
}

function findDeepString(value: unknown, fieldNames: string[], depth = 0): string {
  if (!isRecord(value) || depth > 5) {
    return '';
  }
  const normalizedFields = new Set(fieldNames.map(normalizeFieldName));
  for (const [key, child] of Object.entries(value)) {
    if (normalizedFields.has(normalizeFieldName(key)) && (typeof child === 'string' || typeof child === 'number')) {
      return String(child).trim();
    }
  }
  for (const child of Object.values(value)) {
    const found = findDeepString(child, fieldNames, depth + 1);
    if (found) {
      return found;
    }
  }
  return '';
}

function extractAccountIdFromAuthPayload(value: Record<string, unknown>): string {
  return stringValue(value.chatgpt_account_id) || stringValue(value.account_id);
}

function normalizeFieldName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeSubscriptionStatus(value: unknown): AccountRecord['subscriptionStatus'] {
  return value === 'not_subscribed' ||
    value === 'active' ||
    value === 'expired' ||
    value === 'failed'
    ? value
    : 'unknown';
}

function normalizeSubscriptionType(value: unknown): string {
  const text = stringValue(value).toLowerCase();
  return text || 'unknown';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
