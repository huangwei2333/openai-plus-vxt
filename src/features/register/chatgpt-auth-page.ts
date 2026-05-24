import type { ActionResult } from './types';
import { isEmailInputMetadata, isSwitchToEmailActionText } from './auth-email-field';
import { clickElementLikeUser, submitFormControl } from './dom-click';
import { getInputValue, setInputValueWithFallback } from './dom-input';
import { waitForDocumentLoadComplete, waitForStableElement } from '../../app/page-ready.js';
import { isAuthEmailPageUrl } from './workflow';

const EMAIL_SELECTORS = [
  'input#email',
  'input[name="email"]',
  'input[type="email"]',
  'input[autocomplete="email"]',
  'input#username',
  'input[name="username"]',
  'input[autocomplete="username"]',
  'input#identifier',
  'input[name="identifier"]',
  'input[placeholder*="email" i]',
  'input[aria-label*="email" i]',
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'form button:not([type="button"])',
];

export function isChatGptLoginPage(): boolean {
  return isAuthEmailPageUrl(location.hostname, location.pathname) &&
    (Boolean(findEmailInput()) || Boolean(findSwitchToEmailTrigger()));
}

export async function fillEmailAndContinue(email: string): Promise<ActionResult> {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) {
    return fail('邮箱为空，无法填写');
  }

  await waitForDocumentLoadComplete(8_000);

  let input = await waitForStableEmailInput(3_000);
  if (!input) {
    await switchToEmailMode();
    input = await waitForStableEmailInput(4_000);
  }
  if (!input) {
    return fail('没有找到邮箱输入框');
  }

  input = await setInputValueWithFallback(findEmailInput, normalizedEmail);
  await waitForUiTick();
  if (!input || getInputValue(input) !== normalizedEmail) {
    return fail(`邮箱没有成功写入输入框，已停止点击继续。当前输入框值：${getInputValue(input) || '空'}`);
  }

  const button = findSubmitButton();
  if (!button) {
    return fail('没有找到继续按钮');
  }

  if (button.disabled) {
    await waitForEnabled(button, 2500);
  }

  if (button.disabled) {
    return fail('继续按钮仍然不可点击');
  }

  submitFormControl(button);
  return ok('已填入邮箱并点击继续');
}

function findEmailInput(): HTMLInputElement | null {
  const direct = findFirst<HTMLInputElement>(EMAIL_SELECTORS);
  if (direct && isVisibleInput(direct)) {
    return direct;
  }

  return Array.from(document.querySelectorAll<HTMLInputElement>('input')).find((input) => {
    if (!isVisibleInput(input)) {
      return false;
    }
    return isEmailInputMetadata({
      id: input.id,
      name: input.name,
      type: input.type,
      autocomplete: input.autocomplete,
      placeholder: input.placeholder,
      ariaLabel: input.ariaLabel || '',
      labelText: collectInputLabelText(input),
      maxLength: input.maxLength,
    });
  }) ?? null;
}

function collectInputLabelText(input: HTMLInputElement): string {
  return [
    input.closest('label')?.textContent || '',
    input.getAttribute('aria-labelledby') ? labelText(input.getAttribute('aria-labelledby') || '') : '',
    input.parentElement?.textContent || '',
  ].join(' ');
}

function labelText(ids: string): string {
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent || '')
    .join(' ');
}

function isVisibleInput(input: HTMLInputElement): boolean {
  if (!isEnabledElement(input)) {
    return false;
  }
  const type = (input.type || 'text').toLowerCase();
  if (type === 'hidden' || type === 'password' || type === 'submit' || type === 'button') {
    return false;
  }
  const rect = input.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && isVisibleElement(input);
}

function findSubmitButton(): HTMLButtonElement | null {
  for (const selector of SUBMIT_SELECTORS) {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (button) {
      return button;
    }
  }

  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => {
    const text = (button.textContent || '').trim();
    return text === '继续' || text.toLowerCase() === 'continue';
  }) ?? null;
}

async function switchToEmailMode(): Promise<void> {
  const trigger = findSwitchToEmailTrigger();
  if (!trigger) {
    return;
  }
  clickElementLikeUser(trigger);
  await waitForUiTick();
}

function findSwitchToEmailTrigger(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]',
    ),
  );
  return candidates.find((element) => {
    return isVisibleElement(element) && isEnabledElement(element) && isSwitchToEmailActionText(actionText(element));
  }) ?? null;
}

function actionText(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    return [element.value, element.ariaLabel, element.title].join(' ');
  }
  return [
    element.textContent,
    element.ariaLabel,
    element.title,
    element.getAttribute('data-testid') || '',
  ].join(' ');
}

function isVisibleElement(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0;
}

function isEnabledElement(element: HTMLElement): boolean {
  if (element instanceof HTMLButtonElement) {
    return !element.disabled;
  }
  if (element instanceof HTMLInputElement) {
    return !element.disabled && !element.readOnly;
  }
  return element.getAttribute('aria-disabled') !== 'true';
}

async function waitForStableEmailInput(timeoutMs: number): Promise<HTMLInputElement | null> {
  return waitForStableElement(findEmailInput, {
    timeoutMs,
    pollMs: 150,
    stableMs: 400,
  });
}

function findFirst<T extends Element>(selectors: string[]): T | null {
  for (const selector of selectors) {
    const element = document.querySelector<T>(selector);
    if (element) {
      return element;
    }
  }
  return null;
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
