import { initPayOpenAiAddressAutofill } from '../src/features/address-autofill/pay-openai-autofill';
import { initPaypalAutofill } from '../src/features/address-autofill/paypal-autofill';
import { fillPayOpenAiAddressNow } from '../src/features/address-autofill/pay-openai-autofill';
import { fillPaypalAddressNow } from '../src/features/address-autofill/paypal-autofill';
import { createRegisterController } from '../src/features/register/controller';
import type { RegisterController } from '../src/features/register/types';
import type { AddressProfile } from '../src/features/address-autofill/types';

const CONTENT_LOADED_KEY = '__opx_assistant_content_loaded__';

export default defineContentScript({
  matches: [
    'https://chatgpt.com/*',
    'https://auth.openai.com/*',
    'https://pay.openai.com/*',
    'https://www.paypal.com/*',
    'https://paypal.com/*',
  ],
  runAt: 'document_idle',
  registration: 'manifest',
  main() {
    const scope = globalThis as unknown as Partial<Record<typeof CONTENT_LOADED_KEY, boolean>>;
    if (scope[CONTENT_LOADED_KEY]) {
      return;
    }
    scope[CONTENT_LOADED_KEY] = true;

    const registerController = createRegisterController();
    installContentCommandHandler(registerController);
    void registerController.autoRunForCurrentPage();
    try {
      initPayOpenAiAddressAutofill();
    } catch (error) {
      console.warn('[OPX] pay autofill init failed', error);
    }
    try {
      initPaypalAutofill();
    } catch (error) {
      console.warn('[OPX] PayPal autofill init failed', error);
    }
  },
});

function installContentCommandHandler(registerController: RegisterController): void {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isContentCommandMessage(message)) {
      return undefined;
    }

    if (message.command === 'get-page-state') {
      return registerController.getPageState();
    }
    if (message.command === 'fill-email') {
      return registerController.fillEmailFromInput();
    }
    if (message.command === 'fill-otp') {
      const payload = isRecord(message.payload) ? message.payload : {};
      return registerController.fillOtp(String(payload.code || ''));
    }
    if (message.command === 'wait-outlook-otp') {
      return registerController.waitForOutlookOtp();
    }
    if (message.command === 'fill-profile') {
      return registerController.fillProfileAndCreate();
    }
    if (message.command === 'fill-current-payment-page') {
      const payload = isRecord(message.payload) ? message.payload : {};
      return fillCurrentPaymentPage(payload.address as AddressProfile | undefined);
    }

    return {
      ok: false,
      message: `未知 content 命令：${message.command}`,
    };
  });
}

async function fillCurrentPaymentPage(address: AddressProfile | undefined) {
  if (!address) {
    return { ok: false, filled: 0, message: '缺少地址资料' };
  }
  if (location.hostname === 'pay.openai.com') {
    return fillPayOpenAiAddressNow(address);
  }
  if (location.hostname.endsWith('paypal.com')) {
    return fillPaypalAddressNow(address, true, false);
  }
  return { ok: false, filled: 0, message: '当前页面不是 OpenAI 支付页或 PayPal 注册支付页' };
}

function isContentCommandMessage(value: unknown): value is { type: 'opx:content-command'; command: string; payload?: unknown } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { type?: unknown }).type === 'opx:content-command' &&
      typeof (value as { command?: unknown }).command === 'string',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
