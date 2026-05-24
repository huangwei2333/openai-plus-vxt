import { initPayOpenAiAddressAutofill } from '../src/features/address-autofill/pay-openai-autofill';
import {
  clickPaypalCreateAccountNow,
  confirmPaypalVerificationResultNow,
  completePaypalSubscriptionNow,
  fillPaypalVerificationCodeNow,
  initPaypalAutofill,
  inspectPaypalHostedStageNow,
  inspectPaypalSignupPage,
  preparePaypalRegistrationNow,
} from '../src/features/address-autofill/paypal-autofill';
import { fillPayOpenAiAddressNow } from '../src/features/address-autofill/pay-openai-autofill';
import { fillPaypalAddressNow } from '../src/features/address-autofill/paypal-autofill';
import { respondToContentCommand } from '../src/app/content-command-handler';
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
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    return respondToContentCommand(registerController, fillCurrentPaymentPage, message, sendResponse);
  });
}

async function fillCurrentPaymentPage(address: AddressProfile | undefined, payload?: Record<string, unknown>) {
  const mode = String(payload?.mode || '');
  if (mode === 'prepare-paypal-registration') {
    if (location.hostname.endsWith('paypal.com')) {
      return preparePaypalRegistrationNow();
    }
    return { ok: false, message: '当前页面不是 PayPal 注册入口页' };
  }
  if (mode === 'inspect-paypal-signup-form') {
    return location.hostname.endsWith('paypal.com')
      ? inspectPaypalSignupPage()
      : { ok: true, ready: false, challenge: false, message: '当前页面不是 PayPal 注册页' };
  }
  if (mode === 'inspect-paypal-stage') {
    return location.hostname.endsWith('paypal.com')
      ? inspectPaypalHostedStageNow()
      : { ok: true, stage: 'outside_paypal', challenge: false, ready: false, message: '当前页面不是 PayPal 页面' };
  }
  if (mode === 'click-paypal-create-account') {
    return clickPaypalCreateAccountNow();
  }
  if (mode === 'fill-paypal-verification-code') {
    return fillPaypalVerificationCodeNow(String(payload?.code || ''));
  }
  if (mode === 'confirm-paypal-verification-result') {
    return confirmPaypalVerificationResultNow();
  }
  if (mode === 'complete-paypal-subscription') {
    return completePaypalSubscriptionNow();
  }
  if (!address) {
    return { ok: false, filled: 0, message: '缺少地址资料' };
  }
  if (location.hostname === 'pay.openai.com') {
    return fillPayOpenAiAddressNow(address);
  }
  if (location.hostname.endsWith('paypal.com')) {
    return fillPaypalAddressNow(address, true, false, {
      submitCreateAccount: mode !== 'fill-paypal-signup-form',
    });
  }
  return { ok: false, filled: 0, message: '当前页面不是 OpenAI 支付页或 PayPal 注册支付页' };
}
