import { loadRegisterState, saveRegisterState } from './state';
import { parseAccountInput } from '../features/register/account-input';
import type { ActionResult, PageState, RegisterController, RegisterState } from '../features/register/types';

const UNKNOWN_PAGE_STATE: PageState = {
  kind: 'unknown',
  label: '未识别页面',
  canFillEmail: false,
  canFillOtp: false,
  canFillProfile: false,
};

export function createSidePanelRegisterController(): RegisterController {
  let pageState = UNKNOWN_PAGE_STATE;

  return {
    refreshPageState: async () => {
      try {
        const response = await sendActiveTabCommand('get-page-state');
        pageState = isPageState(response) ? response : UNKNOWN_PAGE_STATE;
      } catch {
        pageState = UNKNOWN_PAGE_STATE;
      }
    },
    getPageState: () => pageState,
    loadState: loadRegisterState,
    saveInput: async (rawInput: string): Promise<RegisterState> => {
      const parsed = parseAccountInput(rawInput);
      return saveRegisterState({
        rawInput,
        email: parsed.email,
        accountLine: parsed.accountLine,
        inputMode: parsed.mode,
        autoOtp: parsed.mode === 'outlook-line',
      });
    },
    fillEmailFromInput: async () => toActionResult(await sendActiveTabCommand('fill-email')),
    fillOtp: async (code: string) => toActionResult(await sendActiveTabCommand('fill-otp', { code })),
    waitForOutlookOtp: async () => toActionResult(await sendActiveTabCommand('wait-outlook-otp')),
    fillProfileAndCreate: async () => toActionResult(await sendActiveTabCommand('fill-profile')),
    autoRunForCurrentPage: async () => {},
  };
}

export async function sendActiveTabCommand(command: string, payload?: unknown): Promise<unknown> {
  return browser.runtime.sendMessage({
    type: 'opx:active-tab-command',
    command,
    payload,
  });
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
