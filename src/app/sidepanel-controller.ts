import { loadRegisterState, saveRegisterState } from './state';
import { parseAccountInput } from '../features/register/account-input';
import {
  addRegisterEmailItemsFromInput,
  createGeneratedAlias,
  removeRegisterEmailItem,
  setRegisterEmailItemSelected,
  toggleRegisterEmailItemExpanded,
} from '../features/register/email-alias';
import type { ActionResult, PageState, RegisterController, RegisterEmailItem, RegisterState } from '../features/register/types';

const REGISTER_PAGE_URL = 'https://chatgpt.com/';
const REGISTER_PAGE_TIMEOUT_MS = 15_000;
const REGISTER_PAGE_POLL_MS = 500;
const ASSISTANT_SCRIPT_FILE = '/content-scripts/content.js';

const UNKNOWN_PAGE_STATE: PageState = {
  kind: 'unknown',
  label: '未识别页面',
  canFillEmail: false,
  canFillOtp: false,
  canFillProfile: false,
};

export function createSidePanelRegisterController(): RegisterController {
  let pageState = UNKNOWN_PAGE_STATE;
  let registerTabId: number | null = null;

  return {
    refreshPageState: async () => {
      try {
        const response = await sendRegisterTabCommand('get-page-state');
        pageState = isPageState(response) ? response : UNKNOWN_PAGE_STATE;
      } catch {
        pageState = UNKNOWN_PAGE_STATE;
      }
    },
    getPageState: () => pageState,
    loadState: loadSharedRegisterState,
    saveInput: async (rawInput: string): Promise<RegisterState> => {
      const parsed = parseAccountInput(rawInput);
      return saveRegisterState({
        rawInput,
        inputMode: parsed.mode,
      });
    },
    openRegisterPage: async () => {
      const tab = await browser.tabs.create({ url: REGISTER_PAGE_URL, active: true });
      registerTabId = typeof tab.id === 'number' ? tab.id : null;
      pageState = UNKNOWN_PAGE_STATE;
      return { ok: true, message: '已打开注册页面，请等待页面加载后继续' };
    },
    addInputToEmailList: async () => {
      const state = await loadRegisterState();
      const result = addRegisterEmailItemsFromInput(state.emailItems, state.rawInput);
      if (result.errors.length) {
        return { ok: false, message: result.errors.join('；') };
      }
      if (!result.addedCount) {
        return { ok: false, message: result.items.length ? '邮箱已在列表中，无需重复添加' : '请先输入邮箱' };
      }
      const next = await saveRegisterState({
        rawInput: '',
        emailItems: result.items,
      });
      await syncRegisterEmailItems(next.emailItems);
      return { ok: true, message: `已添加 ${result.addedCount} 个邮箱` };
    },
    setEmailSelected: async (emailItemId: string, selected: boolean): Promise<RegisterState> => {
      const state = await loadRegisterState();
      const next = await saveRegisterState({
        emailItems: setRegisterEmailItemSelected(state.emailItems, emailItemId, selected),
      });
      await syncRegisterEmailItems(next.emailItems);
      return next;
    },
    toggleEmailExpanded: async (emailItemId: string): Promise<RegisterState> => {
      const state = await loadRegisterState();
      const next = await saveRegisterState({
        emailItems: toggleRegisterEmailItemExpanded(state.emailItems, emailItemId),
      });
      await syncRegisterEmailItems(next.emailItems);
      return next;
    },
    removeEmailItem: async (emailItemId: string): Promise<RegisterState> => {
      const state = await loadRegisterState();
      const next = await saveRegisterState({
        emailItems: removeRegisterEmailItem(state.emailItems, emailItemId),
      });
      await browser.runtime.sendMessage({
        type: 'opx:local-store-delete-register-email-item',
        itemId: emailItemId,
      }).catch(() => undefined);
      await syncRegisterEmailItems(next.emailItems);
      return next;
    },
    generateAliasAndFillEmail: async () => {
      const ready = await ensureRegisterPageReady((nextPageState) => {
        pageState = nextPageState;
      });
      if (!ready.ok) {
        return ready;
      }
      const state = await loadRegisterState();
      const generated = createGeneratedAlias(state);
      if (!generated.ok || !generated.state) {
        return { ok: false, message: generated.message };
      }
      await saveRegisterState(generated.state);
      await syncRegisterEmailItems(generated.state.emailItems);
      const result = toActionResult(await sendRegisterTabCommand('fill-email'));
      return {
        ...result,
        message: result.ok ? `已生成并提交邮箱：${generated.state.email}` : result.message,
      };
    },
    fillEmailFromInput: async () => toActionResult(await sendRegisterTabCommand('fill-email')),
    fillOtp: async (code: string) => toActionResult(await sendRegisterTabCommand('fill-otp', { code })),
    waitForOutlookOtp: async () => toActionResult(await sendRegisterTabCommand('wait-outlook-otp')),
    fillProfileAndCreate: async () => toActionResult(await sendRegisterTabCommand('fill-profile')),
    autoRunForCurrentPage: async () => {},
  };

  async function ensureRegisterPageReady(updatePageState: (pageState: PageState) => void): Promise<ActionResult> {
    let currentPage = await readRegisterPageState();
    updatePageState(currentPage);
    if (currentPage.canFillEmail) {
      return { ok: true, message: '当前已在注册页面' };
    }

    if (!registerTabId) {
      const tab = await browser.tabs.create({ url: REGISTER_PAGE_URL, active: true });
      registerTabId = typeof tab.id === 'number' ? tab.id : null;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < REGISTER_PAGE_TIMEOUT_MS) {
      await delay(REGISTER_PAGE_POLL_MS);
      currentPage = await readRegisterPageState();
      updatePageState(currentPage);
      if (currentPage.canFillEmail) {
        return { ok: true, message: '已打开注册页面' };
      }
    }

    return { ok: false, message: '已打开注册页面，但页面尚未就绪，请稍后再试' };
  }

  async function readRegisterPageState(): Promise<PageState> {
    const page = await sendRegisterTabCommand('get-page-state').catch(() => UNKNOWN_PAGE_STATE);
    return isPageState(page) ? page : UNKNOWN_PAGE_STATE;
  }

  async function sendRegisterTabCommand(command: string, payload?: unknown): Promise<unknown> {
    if (typeof registerTabId === 'number') {
      try {
        await browser.scripting.executeScript({
          target: { tabId: registerTabId },
          files: [ASSISTANT_SCRIPT_FILE],
        }).catch(() => undefined);
        return await browser.tabs.sendMessage(registerTabId, {
          type: 'opx:content-command',
          command,
          payload,
        });
      } catch {
        registerTabId = null;
      }
    }
    return sendActiveTabCommand(command, payload);
  }
}

export async function sendActiveTabCommand(command: string, payload?: unknown): Promise<unknown> {
  return browser.runtime.sendMessage({
    type: 'opx:active-tab-command',
    command,
    payload,
  });
}

async function loadSharedRegisterState(): Promise<RegisterState> {
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

async function syncRegisterEmailItems(emailItems: RegisterEmailItem[]): Promise<void> {
  await browser.runtime.sendMessage({
    type: 'opx:local-store-upsert-register-email-items',
    items: emailItems,
  }).catch(() => undefined);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function toActionResult(value: unknown): ActionResult {
  if (isActionResult(value)) {
    return value;
  }
  return {
    ok: false,
    message: '当前标签页没有返回有效结果',
  };
}

function isActionResult(value: unknown): value is ActionResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as ActionResult).ok === 'boolean' &&
      typeof (value as ActionResult).message === 'string',
  );
}

function isPageState(value: unknown): value is PageState {
  return Boolean(
    value &&
      typeof value === 'object' &&
      ['login', 'email-verification', 'about-you', 'unknown'].includes(String((value as PageState).kind)) &&
      typeof (value as PageState).label === 'string' &&
      typeof (value as PageState).canFillEmail === 'boolean' &&
      typeof (value as PageState).canFillOtp === 'boolean' &&
      typeof (value as PageState).canFillProfile === 'boolean',
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
