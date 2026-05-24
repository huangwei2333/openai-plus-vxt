import { fillEmailAndContinue, isChatGptLoginPage } from './chatgpt-auth-page';
import { fillOtpAndContinue, isEmailVerificationPage } from './openai-email-verification-page';
import { fillAboutYouAndCreate, isAboutYouPage } from './openai-about-you-page';
import { shouldAutoFillProfileOnPageLoad } from './auto-run';
import { waitForDocumentLoadComplete } from '../../app/page-ready.js';
import { parseAccountInput } from './account-input';
import {
  addRegisterEmailItemsFromInput,
  createGeneratedAlias,
  removeRegisterEmailItem,
  resolveRegisterEmailForFill,
  setRegisterEmailItemSelected,
  toggleRegisterEmailItemExpanded,
} from './email-alias';
import { loadRegisterState, saveRegisterState } from '../../app/state';
import type { ActionResult, PageState, RegisterController, RegisterEmailItem } from './types';

let autoProfileStarted = false;

export function createRegisterController(): RegisterController {
  return {
    getPageState,
    loadState: loadSharedRegisterState,
    saveInput: async (rawInput: string) => {
      const parsed = parseAccountInput(rawInput);
      return saveRegisterState({
        rawInput,
        inputMode: parsed.mode,
      });
    },
    openRegisterPage: async () => {
      window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
      return { ok: true, message: '已打开注册页面' };
    },
    addInputToEmailList: async () => {
      const state = await loadRegisterState();
      const result = addRegisterEmailItemsFromInput(state.emailItems, state.rawInput);
      if (result.errors.length) {
        return fail(result.errors.join('；'));
      }
      if (!result.addedCount) {
        return fail(result.items.length ? '邮箱已在列表中，无需重复添加' : '请先输入邮箱');
      }
      await saveRegisterState({
        rawInput: '',
        emailItems: result.items,
      });
      await syncRegisterEmailItems(result.items);
      return {
        ok: true,
        message: `已添加 ${result.addedCount} 个邮箱`,
      };
    },
    setEmailSelected: async (emailItemId: string, selected: boolean) => {
      const state = await loadRegisterState();
      const emailItems = setRegisterEmailItemSelected(state.emailItems, emailItemId, selected);
      const next = await saveRegisterState({ emailItems });
      await syncRegisterEmailItems(next.emailItems);
      return next;
    },
    toggleEmailExpanded: async (emailItemId: string) => {
      const state = await loadRegisterState();
      const emailItems = toggleRegisterEmailItemExpanded(state.emailItems, emailItemId);
      const next = await saveRegisterState({ emailItems });
      await syncRegisterEmailItems(next.emailItems);
      return next;
    },
    removeEmailItem: async (emailItemId: string) => {
      const state = await loadRegisterState();
      const emailItems = removeRegisterEmailItem(state.emailItems, emailItemId);
      const next = await saveRegisterState({ emailItems });
      await browser.runtime.sendMessage({
        type: 'opx:local-store-delete-register-email-item',
        itemId: emailItemId,
      }).catch(() => undefined);
      await syncRegisterEmailItems(next.emailItems);
      return next;
    },
    generateAliasAndFillEmail: async () => {
      if (!isChatGptLoginPage()) {
        return fail('请先打开 ChatGPT 注册页面');
      }
      const state = await loadRegisterState();
      const generated = createGeneratedAlias(state);
      if (!generated.ok || !generated.state) {
        return fail(generated.message);
      }
      await saveRegisterState(generated.state);
      await syncRegisterEmailItems(generated.state.emailItems);
      const fillResult = await fillEmailAndContinue(generated.state.email);
      return {
        ...fillResult,
        message: fillResult.ok ? `已生成并提交邮箱：${generated.state.email}` : fillResult.message,
      };
    },
    fillEmailFromInput: async () => {
      const state = await loadRegisterState();
      const parsed = parseAccountInput(state.rawInput);
      const resolved = resolveRegisterEmailForFill(state);
      if (!resolved && !parsed.ok) {
        return fail(parsed.message);
      }
      if (!resolved) {
        return fail('请至少选中一个邮箱');
      }
      if (!isChatGptLoginPage()) {
        return fail('当前页面不是 ChatGPT 登录页');
      }
      await saveRegisterState({
        email: resolved.email,
        accountLine: resolved.accountLine,
        inputMode: resolved.inputMode,
        autoOtp: resolved.inputMode === 'outlook-line',
        otpRequestedAt: Date.now(),
      });
      return fillEmailAndContinue(resolved.email);
    },
    fillOtp: async (code: string) => {
      if (!isEmailVerificationPage()) {
        return fail('当前页面不是邮箱验证码页');
      }
      return fillOtpAndContinue(code);
    },
    waitForOutlookOtp: async () => {
      if (!isEmailVerificationPage()) {
        return fail('当前页面不是邮箱验证码页');
      }
      const state = await loadRegisterState();
      if (!state.accountLine) {
        return fail('当前输入不是 Outlook 账号行，不能自动接收验证码');
      }

      const response = await browser.runtime.sendMessage({
        type: 'opx:wait-outlook-otp',
        accountLine: state.accountLine,
        apiBase: state.apiBase,
        since: state.otpRequestedAt || state.updatedAt || Date.now(),
        timeoutMs: 180_000,
        intervalMs: 5_000,
      });

      if (!isActionResult(response)) {
        return fail('Outlook API 没有返回有效结果');
      }

      if (!response.ok || !response.code) {
        return response;
      }

      const fillResult = await fillOtpAndContinue(response.code);
      return {
        ...fillResult,
        code: response.code,
        message: fillResult.ok ? `已收到并提交验证码：${response.code}` : fillResult.message,
      };
    },
    fillProfileAndCreate: async () => {
      if (!isAboutYouPage()) {
        return fail('当前页面不是资料填写页');
      }
      return fillAboutYouAndCreate();
    },
    autoRunForCurrentPage: async () => {
      if (!shouldAutoFillProfileOnPageLoad() || !isAboutYouPage() || autoProfileStarted) {
        return;
      }
      autoProfileStarted = true;
      await waitForDocumentLoadComplete(15_000);
      await waitForPageReady();
      await fillAboutYouAndCreate();
    },
  };
}

function getPageState(): PageState {
  if (isChatGptLoginPage()) {
    return {
      kind: 'login',
      label: 'ChatGPT 登录页',
      canFillEmail: true,
      canFillOtp: false,
      canFillProfile: false,
    };
  }

  if (isEmailVerificationPage()) {
    return {
      kind: 'email-verification',
      label: '邮箱验证码页',
      canFillEmail: false,
      canFillOtp: true,
      canFillProfile: false,
    };
  }

  if (isAboutYouPage()) {
    return {
      kind: 'about-you',
      label: '资料填写页',
      canFillEmail: false,
      canFillOtp: false,
      canFillProfile: true,
    };
  }

  return {
    kind: 'unknown',
    label: '未识别页面',
    canFillEmail: false,
    canFillOtp: false,
    canFillProfile: false,
  };
}

function fail(message: string): ActionResult {
  return { ok: false, message };
}

async function loadSharedRegisterState() {
  const state = await loadRegisterState();
  const response = await browser.runtime.sendMessage({ type: 'opx:local-store-get' }).catch(() => null);
  if (!isLocalStoreResponse(response) || !response.ok || !response.store) {
    return state;
  }
  const emailItems = response.store.registerEmailItems;
  if (!Array.isArray(emailItems)) {
    return state;
  }
  return saveRegisterState({ emailItems: emailItems.filter(isRegisterEmailItem) });
}

async function syncRegisterEmailItems(emailItems: unknown[]): Promise<void> {
  await browser.runtime.sendMessage({
    type: 'opx:local-store-upsert-register-email-items',
    items: emailItems,
  }).catch(() => undefined);
}

function isActionResult(value: unknown): value is ActionResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as ActionResult).ok === 'boolean' &&
      typeof (value as ActionResult).message === 'string',
  );
}

function isLocalStoreResponse(value: unknown): value is {
  ok: boolean;
  store?: { registerEmailItems?: unknown[] };
} {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { ok?: unknown }).ok === 'boolean',
  );
}

function isRegisterEmailItem(value: unknown): value is RegisterEmailItem {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { id?: unknown }).id === 'string' &&
      typeof (value as { email?: unknown }).email === 'string',
  );
}

function waitForPageReady(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 800));
}
