import type { ChatGptSessionInfo, ChatGptSessionResponse } from './types';

export type UsableChatGptSessionResponse = ChatGptSessionResponse & {
  ok: true;
  session: ChatGptSessionInfo & {
    accessToken: string;
    email: string;
  };
};

export function isUsableChatGptSessionResponse(response: unknown, now = Date.now()): response is UsableChatGptSessionResponse {
  return getChatGptSessionValidationMessage(response, now) === '';
}

export function getChatGptSessionValidationMessage(response: unknown, now = Date.now()): string {
  if (!isChatGptSessionResponse(response)) {
    return 'ChatGPT session 返回结果无效';
  }

  const session = response.session;
  if (!response.ok) {
    if (session && !stringValue(session.accessToken)) {
      return 'session 中没有 accessToken，不能用于生成 checkout 链接';
    }
    return response.message || '未读取到有效 ChatGPT session';
  }

  if (!session) {
    return 'ChatGPT session 返回结果缺少 session 信息';
  }
  if (!stringValue(session.accessToken)) {
    return 'session 中没有 accessToken，不能用于生成 checkout 链接';
  }
  if (!stringValue(session.email)) {
    return 'session 中没有账号邮箱，不能作为已有登录账号继续';
  }
  if (isExpired(session.sessionExpiredAt, now)) {
    return 'session 已过期，请重新登录 ChatGPT';
  }

  return '';
}

function isChatGptSessionResponse(value: unknown): value is ChatGptSessionResponse {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as ChatGptSessionResponse).ok === 'boolean' &&
      typeof (value as ChatGptSessionResponse).message === 'string',
  );
}

function isExpired(value: unknown, now: number): boolean {
  const timestamp = Date.parse(stringValue(value));
  return Number.isFinite(timestamp) && timestamp <= now;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
