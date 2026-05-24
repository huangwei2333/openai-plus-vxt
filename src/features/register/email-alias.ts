import type {
  AccountInputMode,
  RegisterEmailAlias,
  RegisterEmailAliasCategory,
  RegisterEmailItem,
  RegisterState,
} from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
const MAX_ALIASES_PER_CATEGORY = 5;
const ALIAS_TAGS = ['paypal1', 'paypal2', 'paypal3', 'paypal4', 'paypal5'];

const CATEGORY_DOMAINS: Record<RegisterEmailAliasCategory, 'gmail.com' | 'googlemail.com'> = {
  'plus-gmail': 'gmail.com',
  'dotted-plus-gmail': 'gmail.com',
  'plus-googlemail': 'googlemail.com',
  'dotted-plus-googlemail': 'googlemail.com',
};

export const REGISTER_ALIAS_CATEGORY_LABELS: Record<RegisterEmailAliasCategory, string> = {
  'plus-gmail': '原名 + Gmail',
  'dotted-plus-gmail': '点分裂 + Gmail',
  'plus-googlemail': '原名 + Googlemail',
  'dotted-plus-googlemail': '点分裂 + Googlemail',
};

interface AliasStateInput {
  emailItems: RegisterEmailItem[];
  email: string;
  accountLine: string;
  inputMode: AccountInputMode;
}

interface ResolvedRegisterEmail {
  email: string;
  accountLine: string;
  inputMode: Exclude<AccountInputMode, 'empty' | 'invalid'>;
}

interface GeneratedAliasResult {
  ok: boolean;
  message: string;
  alias?: RegisterEmailAlias;
  state?: AliasStateInput;
}

interface ParsedEmailLine {
  email: string;
  accountLine: string;
  inputMode: Exclude<AccountInputMode, 'empty' | 'invalid'>;
}

export function addRegisterEmailItemsFromInput(
  previousItems: RegisterEmailItem[],
  rawInput: string,
): { items: RegisterEmailItem[]; addedCount: number; errors: string[] } {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const items = [...previousItems];
  const errors: string[] = [];
  let addedCount = 0;

  for (const line of rawInput.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const parsed = parseRegisterEmailLine(line);
    if (!parsed) {
      errors.push(`${line} 格式不正确`);
      continue;
    }

    const id = getEmailItemId(parsed);
    if (previousById.has(id)) {
      continue;
    }

    const item: RegisterEmailItem = {
      id,
      email: parsed.email,
      accountLine: parsed.accountLine,
      inputMode: parsed.inputMode,
      selected: true,
      expanded: false,
      aliases: [],
    };
    previousById.set(id, item);
    items.push(item);
    addedCount += 1;
  }

  return { items, addedCount, errors };
}

export function mergeRegisterEmailItems(rawInput: string, previousItems: RegisterEmailItem[]): RegisterEmailItem[] {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const next: RegisterEmailItem[] = [];

  for (const line of parseRegisterEmailLines(rawInput)) {
    const id = getEmailItemId(line);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const previous = previousById.get(id);
    next.push({
      id,
      email: line.email,
      accountLine: line.accountLine,
      inputMode: line.inputMode,
      selected: previous?.selected ?? true,
      expanded: previous?.expanded ?? false,
      aliases: normalizeAliases(previous?.aliases || []),
    });
  }

  return next;
}

export function normalizeRegisterEmailItems(value: unknown): RegisterEmailItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): RegisterEmailItem | null => {
      if (!isRecord(item)) {
        return null;
      }
      const email = String(item.email || '').trim();
      const inputMode = normalizeEmailItemMode(item.inputMode);
      if (!EMAIL_RE.test(email) || !inputMode) {
        return null;
      }
      const parsed: ParsedEmailLine = {
        email,
        accountLine: String(item.accountLine || '').trim(),
        inputMode,
      };
      return {
        id: String(item.id || getEmailItemId(parsed)),
        email,
        accountLine: parsed.accountLine,
        inputMode,
        selected: item.selected !== false,
        expanded: Boolean(item.expanded),
        aliases: normalizeAliases(item.aliases),
      };
    })
    .filter((item): item is RegisterEmailItem => Boolean(item));
}

export function filterRegisterEmailAliasesBySessionEmails(
  items: RegisterEmailItem[],
  sessionEmails: Iterable<string>,
): RegisterEmailItem[] {
  const validEmails = new Set(Array.from(sessionEmails, (email) => email.trim().toLowerCase()).filter(Boolean));
  return items.map((item) => ({
    ...item,
    aliases: item.aliases.filter((alias) => validEmails.has(alias.email.toLowerCase())),
  }));
}

export function syncRegisterEmailItemsWithSessionEmails(
  items: RegisterEmailItem[],
  sessionEmails: Iterable<string>,
): RegisterEmailItem[] {
  return mergeRegisterEmailItemsFromSessionEmails(
    filterRegisterEmailAliasesBySessionEmails(items, sessionEmails),
    sessionEmails,
  ).items;
}

export function setRegisterEmailItemSelected(
  items: RegisterEmailItem[],
  emailItemId: string,
  selected: boolean,
): RegisterEmailItem[] {
  return items.map((item) => {
    if (item.id === emailItemId) {
      return { ...item, selected };
    }
    return selected ? { ...item, selected: false } : item;
  });
}

export function toggleRegisterEmailItemExpanded(items: RegisterEmailItem[], emailItemId: string): RegisterEmailItem[] {
  return items.map((item) => item.id === emailItemId ? { ...item, expanded: !item.expanded } : item);
}

export function removeRegisterEmailItem(items: RegisterEmailItem[], emailItemId: string): RegisterEmailItem[] {
  const nextItems = items.filter((item) => item.id !== emailItemId);
  if (nextItems.some((item) => item.selected)) {
    return nextItems;
  }
  const [firstItem] = nextItems;
  if (!firstItem) {
    return [];
  }
  return nextItems.map((item, index) => index === 0 ? { ...item, selected: true } : item);
}

export function mergeRegisterEmailItemsFromSessionEmails(
  previousItems: RegisterEmailItem[],
  sessionEmails: Iterable<string>,
): { items: RegisterEmailItem[]; addedBaseCount: number; addedAliasCount: number } {
  const emails = Array.from(new Set(
    Array.from(sessionEmails, (email) => email.trim().toLowerCase()).filter((email) => EMAIL_RE.test(email)),
  ));
  const baseEmails = Array.from(new Set(emails.map(inferRegisterBaseEmailFromAlias).filter(Boolean)));
  const added = addRegisterEmailItemsFromInput(previousItems, baseEmails.join('\n'));
  const beforeAliasCount = countAliases(added.items);
  let next: AliasStateInput = {
    emailItems: added.items,
    email: '',
    accountLine: '',
    inputMode: 'empty',
  };

  for (const email of emails) {
    next = recordRegisterEmailSession(next, email);
  }

  return {
    items: next.emailItems,
    addedBaseCount: added.addedCount,
    addedAliasCount: Math.max(0, countAliases(next.emailItems) - beforeAliasCount),
  };
}

export function canGenerateAliasFromSelectedEmails(items: RegisterEmailItem[]): boolean {
  return items
    .filter((item) => item.selected)
    .some((item) => getAvailableCategories(item).length > 0);
}

export function createGeneratedAlias(
  state: AliasStateInput,
  random: () => number = Math.random,
): GeneratedAliasResult {
  const candidates = state.emailItems
    .filter((item) => item.selected)
    .map((item) => ({ item, categories: getAvailableCategories(item) }))
    .filter((candidate) => candidate.categories.length > 0);

  if (!state.emailItems.some((item) => item.selected)) {
    return { ok: false, message: '请至少选中一个邮箱' };
  }

  if (candidates.length === 0) {
    return { ok: false, message: '已选中的 Gmail / Googlemail 邮箱别名都达到上限' };
  }

  const candidate = candidates[pickIndex(candidates.length, random)];
  const category = candidate.categories[pickIndex(candidate.categories.length, random)];
  const alias = buildAlias(candidate.item, category, random);
  if (!alias) {
    return { ok: false, message: '当前邮箱无法生成点分裂别名' };
  }

  const nextItems = state.emailItems.map((item) => item.id === candidate.item.id
    ? { ...item, expanded: true }
    : item);

  return {
    ok: true,
    message: `已生成注册邮箱：${alias.email}`,
    alias,
    state: {
      emailItems: nextItems,
      email: alias.email,
      accountLine: candidate.item.accountLine,
      inputMode: candidate.item.inputMode,
    },
  };
}

export function recordRegisterEmailSession(state: AliasStateInput, email: string): AliasStateInput {
  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalizedEmail)) {
    return state;
  }

  let changed = false;
  const emailItems = state.emailItems.map((item) => {
    const alias = createAliasFromSessionEmail(item, normalizedEmail);
    if (!alias || item.aliases.some((entry) => entry.email.toLowerCase() === normalizedEmail)) {
      return item;
    }
    changed = true;
    return {
      ...item,
      aliases: [...item.aliases, alias],
    };
  });

  return changed ? { ...state, emailItems } : state;
}

export function inferRegisterBaseEmailFromAlias(email: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalizedEmail)) {
    return '';
  }

  const [rawLocal, rawDomain] = normalizedEmail.split('@');
  if (!rawLocal || !rawDomain || !GMAIL_DOMAINS.has(rawDomain)) {
    return normalizedEmail;
  }

  const baseLocal = rawLocal.split('+')[0]?.replace(/\./g, '');
  return baseLocal ? `${baseLocal}@gmail.com` : normalizedEmail;
}

export function resolveRegisterEmailForFill(state: AliasStateInput): ResolvedRegisterEmail | null {
  const activeEmail = state.email.trim().toLowerCase();
  if (activeEmail) {
    for (const item of state.emailItems) {
      if (!item.selected) {
        continue;
      }
      if (item.email.toLowerCase() === activeEmail) {
        return {
          email: item.email,
          accountLine: item.accountLine,
          inputMode: item.inputMode,
        };
      }
      const alias = item.aliases.find((entry) => entry.email.toLowerCase() === activeEmail);
      if (alias || createAliasFromSessionEmail(item, activeEmail)) {
        return {
          email: alias?.email || state.email.trim(),
          accountLine: item.accountLine,
          inputMode: item.inputMode,
        };
      }
    }
  }

  const firstSelected = state.emailItems.find((item) => item.selected);
  if (!firstSelected) {
    return null;
  }

  return {
    email: firstSelected.email,
    accountLine: firstSelected.accountLine,
    inputMode: firstSelected.inputMode,
  };
}

export function getRegisterAliasUsage(item: RegisterEmailItem, category: RegisterEmailAliasCategory): number {
  return item.aliases.filter((alias) => alias.category === category).length;
}

function parseRegisterEmailLines(rawInput: string): ParsedEmailLine[] {
  return rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseRegisterEmailLine)
    .filter((item): item is ParsedEmailLine => Boolean(item));
}

function parseRegisterEmailLine(line: string): ParsedEmailLine | null {
  if (line.includes('----')) {
    const parts = line.split('----').map((item) => item.trim());
    const email = parts[0] || '';
    if (!EMAIL_RE.test(email) || parts.length < 4 || !parts[2] || !parts[3]) {
      return null;
    }
    return {
      email,
      accountLine: line,
      inputMode: 'outlook-line',
    };
  }

  if (!EMAIL_RE.test(line)) {
    return null;
  }

  return {
    email: line,
    accountLine: '',
    inputMode: 'email',
  };
}

function getAvailableCategories(item: RegisterEmailItem): RegisterEmailAliasCategory[] {
  const base = getGmailBase(item.email);
  if (!base) {
    return [];
  }

  return (Object.keys(CATEGORY_DOMAINS) as RegisterEmailAliasCategory[])
    .filter((category) => getRegisterAliasUsage(item, category) < MAX_ALIASES_PER_CATEGORY)
    .filter((category) => category.startsWith('dotted') ? Boolean(getDottedLocal(base.local)) : true)
    .filter((category) => Boolean(getUnusedTag(item, category)));
}

function buildAlias(
  item: RegisterEmailItem,
  category: RegisterEmailAliasCategory,
  random: () => number,
): RegisterEmailAlias | null {
  const base = getGmailBase(item.email);
  const tag = getUnusedTag(item, category, random);
  if (!base || !tag) {
    return null;
  }

  const local = category.startsWith('dotted') ? getDottedLocal(base.local) : base.local;
  if (!local) {
    return null;
  }

  const email = `${local}+${tag}@${CATEGORY_DOMAINS[category]}`;
  return {
    id: `${category}:${email}`,
    email,
    category,
    createdAt: Date.now(),
  };
}

function createAliasFromSessionEmail(item: RegisterEmailItem, email: string): RegisterEmailAlias | null {
  const base = getGmailBase(item.email);
  const [rawLocal, domain] = email.split('@');
  const tag = getAliasTag(email);
  if (!base || !rawLocal || !domain || !tag) {
    return null;
  }

  const plainLocal = base.local;
  const dottedLocal = getDottedLocal(base.local);
  let category: RegisterEmailAliasCategory | null = null;
  if (domain === 'gmail.com' && rawLocal.split('+')[0] === plainLocal) {
    category = 'plus-gmail';
  } else if (domain === 'gmail.com' && dottedLocal && rawLocal.split('+')[0] === dottedLocal) {
    category = 'dotted-plus-gmail';
  } else if (domain === 'googlemail.com' && rawLocal.split('+')[0] === plainLocal) {
    category = 'plus-googlemail';
  } else if (domain === 'googlemail.com' && dottedLocal && rawLocal.split('+')[0] === dottedLocal) {
    category = 'dotted-plus-googlemail';
  }

  return category
    ? {
      id: `${category}:${email}`,
      email,
      category,
      createdAt: Date.now(),
    }
    : null;
}

function getGmailBase(email: string): { local: string } | null {
  const [rawLocal, rawDomain] = email.trim().toLowerCase().split('@');
  if (!rawLocal || !rawDomain || !GMAIL_DOMAINS.has(rawDomain)) {
    return null;
  }

  const local = rawLocal.split('+')[0].replace(/\./g, '');
  return local ? { local } : null;
}

function getDottedLocal(local: string): string | null {
  if (local.length < 2) {
    return null;
  }

  const digitSplit = local.match(/^(.+?)(\d+)$/);
  if (digitSplit?.[1] && digitSplit[2]) {
    return `${digitSplit[1]}.${digitSplit[2]}`;
  }

  const splitAt = Math.floor(local.length / 2);
  return `${local.slice(0, splitAt)}.${local.slice(splitAt)}`;
}

function getUnusedTag(
  item: RegisterEmailItem,
  category: RegisterEmailAliasCategory,
  random: () => number = Math.random,
): string | null {
  const used = new Set(
    item.aliases
      .filter((alias) => alias.category === category)
      .map((alias) => getAliasTag(alias.email))
      .filter((tag): tag is string => Boolean(tag)),
  );
  const available = ALIAS_TAGS.filter((tag) => !used.has(tag));
  return available[pickIndex(available.length, random)] || null;
}

function getAliasTag(email: string): string | null {
  const local = email.split('@')[0] || '';
  const tag = local.split('+')[1] || '';
  return tag || null;
}

function countAliases(items: RegisterEmailItem[]): number {
  return items.reduce((count, item) => count + item.aliases.length, 0);
}

function normalizeAliases(value: unknown): RegisterEmailAlias[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const aliases: RegisterEmailAlias[] = [];

  for (const item of value) {
    if (!isRecord(item) || !isAliasCategory(item.category)) {
      continue;
    }
    const email = String(item.email || '').trim();
    if (!EMAIL_RE.test(email) || seen.has(email.toLowerCase())) {
      continue;
    }
    seen.add(email.toLowerCase());
    aliases.push({
      id: String(item.id || `${item.category}:${email}`),
      email,
      category: item.category,
      createdAt: Number(item.createdAt || 0),
    });
  }

  return aliases;
}

function getEmailItemId(line: ParsedEmailLine): string {
  return `${line.inputMode}:${line.email.toLowerCase()}`;
}

function normalizeEmailItemMode(value: unknown): ParsedEmailLine['inputMode'] | null {
  return value === 'email' || value === 'outlook-line' ? value : null;
}

function isAliasCategory(value: unknown): value is RegisterEmailAliasCategory {
  return value === 'plus-gmail' ||
    value === 'dotted-plus-gmail' ||
    value === 'plus-googlemail' ||
    value === 'dotted-plus-googlemail';
}

function pickIndex(length: number, random: () => number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.min(length - 1, Math.floor(random() * length));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
