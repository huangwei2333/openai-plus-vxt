import type { LocalStoreMessage, LocalStoreResponse, NativeLocalStoreLaunchResponse } from './types';

const DEFAULT_LOCAL_STORE_BASE = 'http://127.0.0.1:8788';
const NATIVE_HOST_NAME = 'com.openai_plus_vxt.local_store';
const REQUEST_TIMEOUT_MS = 5_000;
const AUTH_TOKEN_STORAGE_KEY = 'opx:local-store-auth-token';

export async function requestLocalStore(message: LocalStoreMessage): Promise<LocalStoreResponse> {
  try {
    return await dispatchLocalStoreRequest(message);
  } catch (error) {
    const launch = await ensureLocalStoreStarted();
    if (!launch.ok) {
      return {
        ok: false,
        message: `本地账号服务不可用，自动启动失败：${launch.message || String(error)}`,
      };
    }
    try {
      return await dispatchLocalStoreRequest(message);
    } catch (retryError) {
      return {
        ok: false,
        message: `本地账号服务已尝试启动，但仍不可用：${String(retryError)}`,
      };
    }
  }
}

async function dispatchLocalStoreRequest(message: LocalStoreMessage): Promise<LocalStoreResponse> {
    const authToken = await getLocalStoreAuthToken();
    switch (message.type) {
      case 'opx:local-store-health':
        return await request('/health');
      case 'opx:local-store-get':
        return await request('/v1/store', { authToken });
      case 'opx:local-store-upsert-session':
        return await request('/v1/accounts/session', {
          method: 'POST',
          body: { account: message.account },
          authToken,
        });
      case 'opx:local-store-import-accounts':
        return await request('/v1/import/accounts', {
          method: 'POST',
          body: message.payload,
          authToken,
        });
      case 'opx:local-store-update-account':
        return await request(`/v1/accounts/${encodeURIComponent(message.accountId)}`, {
          method: 'PATCH',
          body: message.patch,
          authToken,
        });
      case 'opx:local-store-delete-account':
        return await request(`/v1/accounts/${encodeURIComponent(message.accountId)}`, {
          method: 'DELETE',
          authToken,
        });
      case 'opx:local-store-upsert-register-email-items':
        return await request('/v1/register-email-items', {
          method: 'POST',
          body: { items: message.items },
          authToken,
        });
      case 'opx:local-store-delete-register-email-item':
        return await request(`/v1/register-email-items/${encodeURIComponent(message.itemId)}`, {
          method: 'DELETE',
          authToken,
        });
      case 'opx:local-store-upsert-sms-targets':
        return await request('/v1/sms-targets', {
          method: 'POST',
          body: { targets: message.targets },
          authToken,
        });
      case 'opx:local-store-delete-sms-target':
        return await request(`/v1/sms-targets/${encodeURIComponent(message.targetId)}`, {
          method: 'DELETE',
          authToken,
        });
      case 'opx:local-store-update-sms-relay':
        return await request('/v1/sms-relay', {
          method: 'PATCH',
          body: message.patch,
          authToken,
        });
    }
}

async function request(path: string, options: { method?: string; body?: unknown; authToken?: string } = {}): Promise<LocalStoreResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.authToken) {
    headers['X-OPX-Local-Store-Token'] = options.authToken;
  }
  try {
    const response = await fetch(`${DEFAULT_LOCAL_STORE_BASE}${path}`, {
      method: options.method || 'GET',
      headers: Object.keys(headers).length ? headers : undefined,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await readJson(response);
    if (!response.ok) {
      return {
        ok: false,
        message: stringValue(payload.message) || `本地账号服务 HTTP ${response.status}`,
      };
    }
    return normalizeResponse(payload);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    const payload = JSON.parse(text) as unknown;
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeResponse(payload: Record<string, unknown>): LocalStoreResponse {
  return {
    ok: payload.ok !== false,
    message: stringValue(payload.message),
    store: isRecord(payload.store) ? payload.store as unknown as LocalStoreResponse['store'] : undefined,
    account: payload.account === null || isRecord(payload.account)
      ? payload.account as LocalStoreResponse['account']
      : undefined,
    deleted: typeof payload.deleted === 'boolean' ? payload.deleted : undefined,
    importedCount: typeof payload.importedCount === 'number' ? payload.importedCount : undefined,
    skippedCount: typeof payload.skippedCount === 'number' ? payload.skippedCount : undefined,
  };
}

async function ensureLocalStoreStarted(): Promise<NativeLocalStoreLaunchResponse> {
  const runtime = browser.runtime as typeof browser.runtime & {
    sendNativeMessage?: (application: string, message: unknown) => Promise<unknown>;
  };
  if (typeof runtime.sendNativeMessage !== 'function') {
    return {
      ok: false,
      message: '当前浏览器不支持 Native Messaging 或扩展缺少 nativeMessaging 权限',
    };
  }

  try {
    const token = await getLocalStoreAuthToken();
    const response = await runtime.sendNativeMessage(NATIVE_HOST_NAME, {
      command: 'ensure-local-store',
      token,
    });
    return normalizeNativeLaunchResponse(response);
  } catch (error) {
    return {
      ok: false,
      message: `Native Host 未安装或启动失败：${String(error)}`,
    };
  }
}

async function getLocalStoreAuthToken(): Promise<string> {
  const saved = await browser.storage.local.get(AUTH_TOKEN_STORAGE_KEY).catch(() => ({}));
  const existing = stringValue((saved as Record<string, unknown>)[AUTH_TOKEN_STORAGE_KEY]);
  if (existing) {
    return existing;
  }

  const token = createAuthToken();
  await browser.storage.local.set({ [AUTH_TOKEN_STORAGE_KEY]: token }).catch(() => undefined);
  return token;
}

function createAuthToken(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(32);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeNativeLaunchResponse(value: unknown): NativeLocalStoreLaunchResponse {
  if (!isRecord(value)) {
    return { ok: false, message: 'Native Host 返回无效结果' };
  }
  return {
    ok: value.ok === true,
    message: stringValue(value.message),
    started: typeof value.started === 'boolean' ? value.started : undefined,
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
