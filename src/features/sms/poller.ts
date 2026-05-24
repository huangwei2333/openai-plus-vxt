import { extractSmsPayload } from './parser';
import type { SmsRelayFetchResponse, SmsRelayTarget } from './types';

export type SmsPollResult =
  | {
      kind: 'code';
      target: SmsRelayTarget;
      code: string;
      message: string;
    }
  | {
      kind: 'empty';
      target: SmsRelayTarget;
      message: string;
    }
  | {
      kind: 'error';
      target: SmsRelayTarget;
      message: string;
    };

export async function fetchSmsRelayCode(target: SmsRelayTarget): Promise<SmsPollResult> {
  const permission = await ensureSmsRelayHostPermissions([target.url]);
  if (!permission.ok) {
    return {
      kind: 'error',
      target,
      message: permission.message,
    };
  }

  let response = await requestSmsRelay(target);
  if (isSmsRelayRedirectResponse(response)) {
    const redirectPermission = await ensureSmsRelayHostPermissions([response.redirectUrl]);
    if (!redirectPermission.ok) {
      return {
        kind: 'error',
        target,
        message: redirectPermission.message,
      };
    }
    response = await requestSmsRelay({ ...target, url: response.redirectUrl });
  }

  if (!isSmsRelayFetchResponse(response) || !response.ok) {
    return {
      kind: 'error',
      target,
      message: response?.message || 'API 返回结果无效',
    };
  }

  const extracted = extractSmsPayload({
    raw: response.raw,
    data: response.data,
    text: response.text,
    message: response.message,
  });
  const message = extracted.message;
  const code = extracted.code;
  if (!code) {
    return {
      kind: 'empty',
      target,
      message: message || response.data || response.message || '暂无短信',
    };
  }

  return {
    kind: 'code',
    target,
    code,
    message,
  };
}

async function requestSmsRelay(target: SmsRelayTarget): Promise<SmsRelayFetchResponse | null> {
  try {
    return await browser.runtime.sendMessage({
      type: 'opx:fetch-sms-relay',
      url: target.url,
    });
  } catch (error) {
    return {
      ok: false,
      message: `请求失败：${errorMessage(error)}`,
    };
  }
}

export async function ensureSmsRelayHostPermissions(urls: string[]): Promise<{ ok: boolean; message: string }> {
  if (!browser.permissions?.contains || !browser.permissions.request) {
    return { ok: false, message: '当前扩展未启用动态域名授权能力，请重新构建并加载扩展。' };
  }

  const originPatterns = [...new Set(urls.map(toOriginPattern).filter(Boolean))];
  if (!originPatterns.length) {
    return { ok: false, message: '接码 API 链接格式无效' };
  }

  try {
    const permissions = { origins: originPatterns };
    const granted = await browser.permissions.contains(permissions);
    if (granted) {
      return { ok: true, message: 'OK' };
    }

    const accepted = await browser.permissions.request(permissions);
    if (!accepted) {
      return { ok: false, message: '未允许接码 API 域名权限，无法请求已添加号码的 API' };
    }
    const confirmed = await browser.permissions.contains(permissions);
    return confirmed
      ? { ok: true, message: 'OK' }
      : { ok: false, message: `接码 API 域名权限未生效：${originPatterns.join(', ')}` };
  } catch (error) {
    return {
      ok: false,
      message: `接码 API 域名权限申请失败：${errorMessage(error)}`,
    };
  }
}

function toOriginPattern(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return '';
  }
}

function isSmsRelayFetchResponse(value: unknown): value is SmsRelayFetchResponse {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as SmsRelayFetchResponse).ok === 'boolean' &&
      typeof (value as SmsRelayFetchResponse).message === 'string',
  );
}

function isSmsRelayRedirectResponse(value: unknown): value is SmsRelayFetchResponse & { redirectUrl: string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as SmsRelayFetchResponse).code === 'sms-relay-redirect' &&
      typeof (value as SmsRelayFetchResponse).redirectUrl === 'string' &&
      Boolean((value as SmsRelayFetchResponse).redirectUrl),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
