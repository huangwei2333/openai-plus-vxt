import type { SmsRelayTarget } from './types';
import { createSmsRelayTargetId, normalizeSmsRelayPhone } from './phone-region.js';

export interface AddSmsRelayTargetsResult {
  targets: SmsRelayTarget[];
  selectedTargetId: string;
  addedCount: number;
  errors: string[];
}

export function addSmsRelayTargetsToList(
  currentTargets: SmsRelayTarget[],
  currentSelectedTargetId: string,
  input: string,
): AddSmsRelayTargetsResult {
  const parsed = parseTargets(input);
  const targets = normalizeSmsRelayTargets(currentTargets);
  const seen = new Set(targets.map((target) => target.id));
  let addedCount = 0;

  for (const target of parsed.targets) {
    if (seen.has(target.id)) {
      continue;
    }
    seen.add(target.id);
    targets.push(target);
    addedCount += 1;
  }

  return {
    targets,
    selectedTargetId: normalizeSelectedSmsRelayTargetId(targets, currentSelectedTargetId),
    addedCount,
    errors: parsed.errors,
  };
}

export function getSelectedSmsRelayTarget(
  targets: SmsRelayTarget[],
  selectedTargetId: string,
): SmsRelayTarget | undefined {
  return targets.find((target) => target.id === selectedTargetId);
}

export function getCompatibleSmsRelayTargetIds(target: SmsRelayTarget): string[] {
  const ids = [target.id, createSmsRelayTargetId(target.phone, target.url)];
  if (target.dialCode === '+1' && target.phone.length === 10) {
    ids.push(`+1${target.phone}|${target.url}`);
  }
  return [...new Set(ids.filter(Boolean))];
}

export function normalizeSelectedSmsRelayTargetId(targets: SmsRelayTarget[], selectedTargetId: string): string {
  if (selectedTargetId && targets.some((target) => target.id === selectedTargetId)) {
    return selectedTargetId;
  }
  const migratedSelectedTargetId = migrateLegacySelectedTargetId(selectedTargetId);
  if (migratedSelectedTargetId && targets.some((target) => target.id === migratedSelectedTargetId)) {
    return migratedSelectedTargetId;
  }
  return targets[0]?.id || '';
}

export function normalizeSmsRelayTargets(value: unknown): SmsRelayTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const targets: SmsRelayTarget[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const source = item as Partial<SmsRelayTarget>;
    const phone = String(source.phone || '').trim();
    const url = String(source.url || '').trim();
    if (!phone || !isHttpUrl(url)) {
      continue;
    }

    const target = createSmsRelayTarget(phone, url, source);
    if (!target.phone) {
      continue;
    }
    if (seen.has(target.id)) {
      continue;
    }
    seen.add(target.id);
    targets.push(target);
  }
  return targets;
}

function parseTargets(input: string): { targets: SmsRelayTarget[]; errors: string[] } {
  const targets: SmsRelayTarget[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, index) => {
    const separatorIndex = line.indexOf('----');
    if (separatorIndex < 0) {
      errors.push(`第 ${index + 1} 行缺少 ---- 分隔符`);
      return;
    }

    const phone = line.slice(0, separatorIndex).trim();
    const url = line.slice(separatorIndex + 4).trim();
    if (!phone || !url) {
      errors.push(`第 ${index + 1} 行号码或 API 链接为空`);
      return;
    }
    if (!isHttpUrl(url)) {
      errors.push(`第 ${index + 1} 行 API 链接不是 http/https 地址`);
      return;
    }

    const target = createSmsRelayTarget(phone, url);
    if (!target.phone) {
      errors.push(`第 ${index + 1} 行号码无法识别`);
      return;
    }
    if (seen.has(target.id)) {
      return;
    }
    seen.add(target.id);
    targets.push(target);
  });

  return { targets, errors };
}

function createSmsRelayTarget(
  phone: string,
  url: string,
  source: Partial<SmsRelayTarget> = {},
): SmsRelayTarget {
  const parsed = normalizeSmsRelayPhone(phone);
  const dialCode = String(source.dialCode || parsed.dialCode || '').trim();
  const countryName = String(source.countryName || parsed.countryName || '').trim();
  return {
    id: createSmsRelayTargetId(parsed.phone, url, dialCode),
    phone: parsed.phone,
    url,
    ...(dialCode ? { dialCode } : {}),
    ...(countryName ? { countryName } : {}),
  };
}

function migrateLegacySelectedTargetId(selectedTargetId: string): string {
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
  return createSmsRelayTargetId(parsed.phone, url, parsed.dialCode);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
