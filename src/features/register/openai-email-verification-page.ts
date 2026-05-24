import type { ActionResult } from './types';
import { waitForDocumentLoadComplete } from '../../app/page-ready.js';
import { getInputValue, setInputValueWithFallback } from './dom-input';

const OTP_SELECTORS = [
  'input[name="code"]',
  'input[name="otp"]',
  'input[autocomplete="one-time-code"]',
  'input[inputmode="numeric"]',
  'input[type="text"]',
];

export function isEmailVerificationPage(): boolean {
  return location.hostname === 'auth.openai.com' &&
    location.pathname.startsWith('/email-verification') &&
    Boolean(findOtpInput());
}

export async function fillOtpAndContinue(code: string): Promise<ActionResult> {
  const normalized = code.replace(/\D/g, '');
  if (!/^\d{6}$/.test(normalized)) {
    return fail('验证码必须是 6 位数字');
  }

  const loaded = await waitForDocumentLoadComplete(15_000);
  if (!loaded) {
    return fail('页面仍在加载中，已停止自动填写验证码，请稍后重试');
  }

  const input = await waitForOtpInput(10_000);
  if (!input) {
    return fail('没有找到验证码输入框');
  }

  const filledInput = await setInputValueWithFallback(findOtpInput, normalized);
  if (!filledInput || getInputValue(filledInput) !== normalized) {
    return fail(`验证码没有成功写入输入框，当前输入框值：${getInputValue(filledInput) || '空'}`);
  }

  await waitForUiTick();

  const button = findContinueButton();
  if (!button) {
    return fail('没有找到验证码继续按钮');
  }

  if (button.disabled) {
    await waitForEnabled(button, 2500);
  }

  if (button.disabled) {
    return fail('验证码继续按钮仍然不可点击');
  }

  button.click();
  return ok('已填入验证码并点击继续');
}

function findOtpInput(): HTMLInputElement | null {
  for (const selector of OTP_SELECTORS) {
    const input = document.querySelector<HTMLInputElement>(selector);
    if (input) {
      return input;
    }
  }

  const candidates = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
  return candidates.find((input) => {
    const label = [
      input.placeholder,
      input.ariaLabel,
      input.name,
      input.id,
    ].join(' ').toLowerCase();
    return label.includes('code') || label.includes('otp') || label.includes('验证');
  }) ?? null;
}

async function waitForOtpInput(timeoutMs: number): Promise<HTMLInputElement | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const input = findOtpInput();
    if (input) {
      return input;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
  return null;
}

function findContinueButton(): HTMLButtonElement | null {
  const submit = document.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) {
    return submit;
  }

  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => {
    const text = (button.textContent || '').trim();
    return text === '继续' || text.toLowerCase() === 'continue';
  }) ?? null;
}

function waitForUiTick(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 60));
}

function waitForEnabled(button: HTMLButtonElement, timeoutMs: number): Promise<void> {
  const started = Date.now();

  return new Promise((resolve) => {
    const check = () => {
      if (!button.disabled || Date.now() - started >= timeoutMs) {
        resolve();
        return;
      }
      window.setTimeout(check, 100);
    };
    check();
  });
}

function ok(message: string): ActionResult {
  return { ok: true, message };
}

function fail(message: string): ActionResult {
  return { ok: false, message };
}
