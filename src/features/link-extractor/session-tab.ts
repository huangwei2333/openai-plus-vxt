import type { ChatGptSessionResponse } from './types';

export interface SessionTabCandidate {
  id?: number;
  url?: string;
  incognito?: boolean;
}

const SESSION_TAB_URL_PREFIXES = [
  'https://chatgpt.com/',
  'https://auth.openai.com/',
  'https://pay.openai.com/',
];

const ASSISTANT_TAB_URL_PREFIXES = [
  ...SESSION_TAB_URL_PREFIXES,
  'https://www.paypal.com/',
  'https://paypal.com/',
];

export function selectActiveAssistantTab(
  tabs: SessionTabCandidate[],
  incognito: boolean | undefined,
): SessionTabCandidate | null {
  return tabs.find((tab) => (
    typeof tab.id === 'number' &&
    isAssistantUrl(tab.url) &&
    matchesIncognito(tab, incognito)
  )) ?? null;
}

export function selectActiveSessionTab(
  tabs: SessionTabCandidate[],
  incognito: boolean | undefined,
): SessionTabCandidate | null {
  return tabs.find((tab) => (
    typeof tab.id === 'number' &&
    isSessionUrl(tab.url) &&
    matchesIncognito(tab, incognito)
  )) ?? null;
}

export function createNoSessionTabResponse(incognito: boolean | undefined): ChatGptSessionResponse {
  if (incognito === true) {
    return {
      ok: false,
      message: '没有找到当前无痕窗口中的 ChatGPT / OpenAI 页面，已停止读取 session，避免误用普通窗口登录态',
    };
  }
  if (incognito === false) {
    return {
      ok: false,
      message: '没有找到当前普通窗口中的 ChatGPT / OpenAI 页面，已停止读取 session',
    };
  }
  return {
    ok: false,
    message: '没有找到当前窗口中的 ChatGPT / OpenAI 页面，已停止读取 session',
  };
}

function isSessionUrl(url: string | undefined): boolean {
  return SESSION_TAB_URL_PREFIXES.some((prefix) => url?.startsWith(prefix));
}

function isAssistantUrl(url: string | undefined): boolean {
  return ASSISTANT_TAB_URL_PREFIXES.some((prefix) => url?.startsWith(prefix));
}

function matchesIncognito(tab: SessionTabCandidate, incognito: boolean | undefined): boolean {
  return typeof incognito !== 'boolean' || Boolean(tab.incognito) === incognito;
}
