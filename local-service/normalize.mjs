const STORE_VERSION = 1;
const DIAL_CODE_REGIONS = [
  ['1', '美国/加拿大'],
  ['7', '俄罗斯/哈萨克斯坦'],
  ['20', '埃及'],
  ['27', '南非'],
  ['30', '希腊'],
  ['31', '荷兰'],
  ['32', '比利时'],
  ['33', '法国'],
  ['34', '西班牙'],
  ['36', '匈牙利'],
  ['39', '意大利'],
  ['40', '罗马尼亚'],
  ['41', '瑞士'],
  ['43', '奥地利'],
  ['44', '英国'],
  ['45', '丹麦'],
  ['46', '瑞典'],
  ['47', '挪威'],
  ['48', '波兰'],
  ['49', '德国'],
  ['52', '墨西哥'],
  ['55', '巴西'],
  ['60', '马来西亚'],
  ['61', '澳大利亚'],
  ['62', '印度尼西亚'],
  ['63', '菲律宾'],
  ['64', '新西兰'],
  ['65', '新加坡'],
  ['66', '泰国'],
  ['81', '日本'],
  ['82', '韩国'],
  ['84', '越南'],
  ['86', '中国大陆'],
  ['90', '土耳其'],
  ['91', '印度'],
  ['92', '巴基斯坦'],
  ['93', '阿富汗'],
  ['94', '斯里兰卡'],
  ['95', '缅甸'],
  ['98', '伊朗'],
  ['212', '摩洛哥'],
  ['213', '阿尔及利亚'],
  ['216', '突尼斯'],
  ['218', '利比亚'],
  ['234', '尼日利亚'],
  ['254', '肯尼亚'],
  ['351', '葡萄牙'],
  ['352', '卢森堡'],
  ['353', '爱尔兰'],
  ['354', '冰岛'],
  ['358', '芬兰'],
  ['380', '乌克兰'],
  ['420', '捷克'],
  ['852', '中国香港'],
  ['853', '中国澳门'],
  ['855', '柬埔寨'],
  ['856', '老挝'],
  ['880', '孟加拉国'],
  ['886', '中国台湾'],
  ['971', '阿联酋'],
  ['972', '以色列'],
  ['966', '沙特阿拉伯'],
].sort((left, right) => right[0].length - left[0].length);

export function createEmptyStore() {
  return {
    version: STORE_VERSION,
    accounts: [],
    registerEmailItems: [],
    smsRelay: {
      targets: [],
      selectedTargetId: '',
      history: [],
    },
    updatedAt: Date.now(),
  };
}

export function normalizeStore(value) {
  const source = isRecord(value) ? value : {};
  const targets = normalizeSmsTargets(source.smsRelay?.targets);
  return {
    version: STORE_VERSION,
    accounts: normalizeAccounts(source.accounts),
    registerEmailItems: normalizeRegisterEmailItems(source.registerEmailItems),
    smsRelay: {
      targets,
      selectedTargetId: normalizeSelectedSmsTargetId(targets, source.smsRelay?.selectedTargetId),
      history: normalizeSmsHistory(source.smsRelay?.history),
    },
    updatedAt: Number(source.updatedAt || 0) || Date.now(),
  };
}

export function importAccountsPayload(payload) {
  const records = collectAccountRecords(payload);
  const accounts = [];
  let skippedCount = 0;
  for (const record of records) {
    const account = normalizeAccount(record);
    if (account) {
      accounts.push(account);
    } else {
      skippedCount += 1;
    }
  }
  return {
    accounts: upsertAccounts([], accounts),
    skippedCount,
  };
}

export function normalizeAccount(value) {
  if (!isRecord(value)) {
    return null;
  }

  const accessToken = stringValue(value.accessToken || value.access_token);
  if (!accessToken) {
    return null;
  }

  const idToken = stringValue(value.idToken || value.id_token);
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
  const email = stringValue(value.email || value.account_email) ||
    stringValue(accessPayload.email) ||
    stringValue(idPayload.email) ||
    stringValue(accessProfilePayload.email) ||
    stringValue(idProfilePayload.email);
  if (!email) {
    return null;
  }

  const accountId = stringValue(value.accountId || value.account_id) ||
    extractAccountIdFromAuthPayload(accessAuthPayload) ||
    extractAccountIdFromAuthPayload(idAuthPayload);
  const now = Date.now();
  const id = stringValue(value.id) || accountId || email.toLowerCase();
  return {
    id,
    email,
    selected: value.selected !== false,
    idToken,
    accessToken,
    refreshToken: stringValue(value.refreshToken || value.refresh_token),
    accountId,
    planType: stringValue(value.planType || value.plan_type) ||
      stringValue(idAuthPayload.chatgpt_plan_type) ||
      stringValue(accessAuthPayload.chatgpt_plan_type),
    checkoutUrl: stringValue(value.checkoutUrl || value.checkout_url),
    subscriptionStatus: normalizeSubscriptionStatus(value.subscriptionStatus || value.subscription_status),
    subscriptionType: normalizeSubscriptionType(value.subscriptionType || value.subscription_type || value.planType || value.plan_type),
    planExpiresAt: normalizeIsoDate(value.planExpiresAt || value.plan_expires_at),
    sessionExpiredAt: normalizeEpochSeconds(accessPayload.exp) ||
      normalizeIsoDate(value.sessionExpiredAt || value.session_expired_at || value.expired),
    lastRefreshAt: normalizeIsoDate(value.lastRefreshAt || value.last_refresh) || new Date(now).toISOString(),
    createdAt: Number(value.createdAt || value.created_at || 0) || now,
    updatedAt: Number(value.updatedAt || value.updated_at || 0) || now,
  };
}

export function normalizeAccounts(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return upsertAccounts([], value.map(normalizeAccount).filter(Boolean));
}

export function upsertAccounts(currentAccounts, nextAccounts) {
  const accounts = normalizeAccountsWithoutUpsert(currentAccounts);
  for (const rawNext of nextAccounts) {
    const next = normalizeAccount(rawNext);
    if (!next) {
      continue;
    }
    const index = accounts.findIndex((item) => isSameAccount(item, next));
    if (index < 0) {
      accounts.push(next);
      continue;
    }
    const previous = accounts[index];
    accounts[index] = {
      ...previous,
      ...next,
      id: previous.id || next.id,
      selected: previous.selected,
      checkoutUrl: next.checkoutUrl || previous.checkoutUrl,
      subscriptionStatus: mergeSubscriptionStatus(previous.subscriptionStatus, next.subscriptionStatus),
      subscriptionType: next.subscriptionType && next.subscriptionType !== 'unknown' ? next.subscriptionType : previous.subscriptionType,
      createdAt: previous.createdAt || next.createdAt,
      updatedAt: Math.max(previous.updatedAt || 0, next.updatedAt || Date.now()),
    };
  }
  return accounts;
}

export function normalizeRegisterEmailItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = [];
  const seen = new Set();
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const email = stringValue(item.email).toLowerCase();
    const inputMode = item.inputMode === 'outlook-line' ? 'outlook-line' : 'email';
    if (!isEmail(email)) {
      continue;
    }
    const id = stringValue(item.id) || `${inputMode}:${email}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    items.push({
      id,
      email,
      accountLine: stringValue(item.accountLine),
      inputMode,
      selected: item.selected !== false,
      expanded: Boolean(item.expanded),
      aliases: normalizeAliases(item.aliases),
    });
  }
  return items;
}

export function normalizeSmsTargets(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const targets = [];
  const seen = new Set();
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const phone = stringValue(item.phone);
    const url = stringValue(item.url);
    if (!phone || !isHttpUrl(url)) {
      continue;
    }
    const parsedPhone = normalizeSmsRelayPhone(phone);
    if (!parsedPhone.phone) {
      continue;
    }
    const dialCode = stringValue(item.dialCode) || parsedPhone.dialCode;
    const countryName = stringValue(item.countryName) || parsedPhone.countryName;
    const id = makeSmsTargetId(parsedPhone.phone, url, dialCode);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    targets.push({
      id,
      phone: parsedPhone.phone,
      url,
      ...(dialCode ? { dialCode } : {}),
      ...(countryName ? { countryName } : {}),
    });
  }
  return targets;
}

export function upsertSmsTargets(currentTargets, nextTargets) {
  return normalizeSmsTargets([...normalizeSmsTargets(currentTargets), ...normalizeSmsTargets(nextTargets)]);
}

export function normalizeSelectedSmsTargetId(targets, selectedTargetId) {
  const selected = stringValue(selectedTargetId);
  if (selected && targets.some((target) => target.id === selected)) {
    return selected;
  }
  const migratedSelectedTargetId = migrateLegacySmsTargetId(selected);
  if (migratedSelectedTargetId && targets.some((target) => target.id === migratedSelectedTargetId)) {
    return migratedSelectedTargetId;
  }
  return targets[0]?.id || '';
}

export function normalizeSmsTargetId(targetId) {
  const selected = stringValue(targetId);
  const separatorIndex = selected.indexOf('|');
  if (separatorIndex < 0) {
    return selected;
  }
  const phone = selected.slice(0, separatorIndex);
  const url = selected.slice(separatorIndex + 1);
  if (!phone || !url) {
    return selected;
  }
  const parsed = normalizeSmsRelayPhone(phone);
  return makeSmsTargetId(parsed.phone || phone, url, parsed.dialCode);
}

export function normalizeSmsHistory(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(normalizeSmsCodeRecord).filter(Boolean);
}

function normalizeSmsCodeRecord(value) {
  if (!isRecord(value)) {
    return null;
  }
  const phone = stringValue(value.phone);
  const code = stringValue(value.code);
  if (!phone || !code) {
    return null;
  }
  const receivedAt = Number(value.receivedAt || 0) || Date.now();
  return {
    id: stringValue(value.id) || `${phone}-${code}-${receivedAt}`,
    phone,
    code,
    message: stringValue(value.message),
    receivedAt,
  };
}

function normalizeSmsRelayPhone(value) {
  const raw = stringValue(value);
  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    return { phone: '', dialCode: '', countryName: '' };
  }

  const compact = raw.replace(/[\s().-]/g, '');
  const internationalDigits = raw.startsWith('+')
    ? digits
    : compact.startsWith('00')
      ? digits.slice(2)
      : inferBareInternationalDigits(digits);
  if (!internationalDigits) {
    return { phone: digits, dialCode: '', countryName: '' };
  }

  const region = DIAL_CODE_REGIONS.find(([dialCode]) => internationalDigits.startsWith(dialCode));
  if (!region) {
    return { phone: internationalDigits, dialCode: '', countryName: '' };
  }

  const [dialCode, countryName] = region;
  const phone = internationalDigits.slice(dialCode.length);
  return {
    phone: phone || internationalDigits,
    dialCode: `+${dialCode}`,
    countryName,
  };
}

function makeSmsTargetId(phone, url, dialCode = '') {
  return `${dialCode ? `${dialCode}:` : ''}${phone}|${url}`;
}

function inferBareInternationalDigits(digits) {
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits;
  }
  if (digits.length === 10) {
    return `1${digits}`;
  }
  return '';
}

function migrateLegacySmsTargetId(selectedTargetId) {
  const separatorIndex = selectedTargetId.indexOf('|');
  if (separatorIndex < 0) {
    return '';
  }
  const phone = selectedTargetId.slice(0, separatorIndex);
  const url = selectedTargetId.slice(separatorIndex + 1);
  if (!phone || !url) {
    return '';
  }
  const parsed = normalizeSmsRelayPhone(phone);
  return makeSmsTargetId(parsed.phone, url, parsed.dialCode);
}

function normalizeAliases(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .map((item) => ({
      id: stringValue(item.id),
      email: stringValue(item.email),
      category: stringValue(item.category),
      createdAt: Number(item.createdAt || 0),
    }))
    .filter((item) => item.id && isEmail(item.email) && item.category);
}

function normalizeAccountsWithoutUpsert(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(normalizeAccount).filter(Boolean);
}

function collectAccountRecords(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return [];
  }
  if (Array.isArray(payload.accounts)) {
    return payload.accounts;
  }
  return [];
}

function isSameAccount(left, right) {
  return left.email.toLowerCase() === right.email.toLowerCase();
}

function normalizeIsoDate(value) {
  if (typeof value === 'number') {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  const text = stringValue(value);
  if (!text) {
    return '';
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

function normalizeEpochSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }
  return new Date(seconds * 1000).toISOString();
}

function normalizeSubscriptionStatus(value) {
  const text = stringValue(value);
  return text === 'not_subscribed' ||
    text === 'active' ||
    text === 'expired' ||
    text === 'failed'
    ? text
    : 'unknown';
}

function normalizeSubscriptionType(value) {
  const text = stringValue(value).toLowerCase();
  return text || 'unknown';
}

function mergeSubscriptionStatus(previous, next) {
  return next && next !== 'unknown' ? next : previous || 'unknown';
}

function decodeJwtPayload(token) {
  const payload = stringValue(token).split('.')[1];
  if (!payload) {
    return {};
  }
  try {
    return JSON.parse(base64UrlDecode(payload));
  } catch {
    return {};
  }
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function extractAccountIdFromAuthPayload(value) {
  return stringValue(value.chatgpt_account_id) || stringValue(value.account_id);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function stringValue(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
