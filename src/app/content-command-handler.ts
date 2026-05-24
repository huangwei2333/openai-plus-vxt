import type { AddressProfile } from '../features/address-autofill/types';
import type { RegisterController } from '../features/register/types';
import { waitForDocumentLoadComplete } from './page-ready.js';

type ContentCommandRegisterController = Pick<
  RegisterController,
  'getPageState' | 'fillEmailFromInput' | 'fillOtp' | 'waitForOutlookOtp' | 'fillProfileAndCreate'
>;

type FillCurrentPaymentPage = (address: AddressProfile | undefined, payload?: Record<string, unknown>) => Promise<unknown> | unknown;
type SendResponse = (response?: unknown) => void;

interface ContentCommandMessage {
  type: 'opx:content-command';
  command: string;
  payload?: unknown;
}

export function respondToContentCommand(
  registerController: ContentCommandRegisterController,
  fillCurrentPaymentPage: FillCurrentPaymentPage,
  message: unknown,
  sendResponse: SendResponse,
): true | undefined {
  if (!isContentCommandMessage(message)) {
    return undefined;
  }

  void Promise.resolve(handleContentCommand(registerController, fillCurrentPaymentPage, message))
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({
        ok: false,
        message: `content 命令执行失败：${errorMessage(error)}`,
      });
    });

  return true;
}

function handleContentCommand(
  registerController: ContentCommandRegisterController,
  fillCurrentPaymentPage: FillCurrentPaymentPage,
  message: ContentCommandMessage,
): Promise<unknown> | unknown {
  if (message.command === 'get-page-state') {
    return registerController.getPageState();
  }
  if (message.command === 'fill-email') {
    return runAfterPageLoadComplete(() => registerController.fillEmailFromInput());
  }
  if (message.command === 'fill-otp') {
    const payload = isRecord(message.payload) ? message.payload : {};
    return runAfterPageLoadComplete(() => registerController.fillOtp(String(payload.code || '')));
  }
  if (message.command === 'wait-outlook-otp') {
    return runAfterPageLoadComplete(() => registerController.waitForOutlookOtp());
  }
  if (message.command === 'fill-profile') {
    return runAfterPageLoadComplete(() => registerController.fillProfileAndCreate());
  }
  if (message.command === 'fill-current-payment-page') {
    const payload = isRecord(message.payload) ? message.payload : {};
    return runAfterPageLoadComplete(() => fillCurrentPaymentPage(payload.address as AddressProfile | undefined, payload));
  }

  return {
    ok: false,
    message: `未知 content 命令：${message.command}`,
  };
}

async function runAfterPageLoadComplete(action: () => Promise<unknown> | unknown): Promise<unknown> {
  const loaded = await waitForDocumentLoadComplete(15_000);
  if (!loaded) {
    return {
      ok: false,
      message: '页面仍在加载中，已停止自动填写，请稍后重试',
    };
  }
  return action();
}

function isContentCommandMessage(value: unknown): value is ContentCommandMessage {
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
