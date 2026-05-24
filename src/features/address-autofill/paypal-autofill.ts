import { loadRegisterState, loadSmsRelayState } from '../../app/state';
import { setInputValueWithFallback } from '../register/dom-input';
import { resolveRegisterEmailForFill } from '../register/email-alias';
import { waitForDocumentLoadComplete } from '../../app/page-ready.js';
import { loadAddressAutofillSettings, saveAddressAutofillSettings } from '../settings/state';
import type { AddressAutofillSettings } from '../settings/types';
import { getSelectedSmsRelayTarget } from '../sms/target-list';
import { hasCompleteCreditCardInfo } from './address-source';
import {
  detectPaypalSecurityChallenge,
  observePaypalChallengeArtifacts,
  PAYPAL_SECURITY_CHALLENGE_CODE,
  PAYPAL_SECURITY_CHALLENGE_MESSAGE,
  removePaypalChallengeArtifacts,
} from './paypal-security-challenge';
import {
  detectPaypalHostedStage,
  evaluatePaypalSignupReadiness,
  isPaypalHostedSubmitButtonMetadata,
  normalizePaypalSignupPhone,
  normalizePaypalVerificationCode,
} from './paypal-form-utils';
import type { PaypalHostedStage, PaypalSignupFieldStatus, PaypalSignupReadiness } from './paypal-form-utils';
import { createPaypalSignupPassword } from './paypal-password';
import type { AddressProfile, RandomAddressResponse } from './types';

const LOG_PREFIX = '[OPX PayPal Autofill]';
const PAYPAL_ADDRESS_SESSION_KEY = 'opx.paypal.autofill.address';
const PAYPAL_PENDING_MANUAL_KEY = 'opx.paypal.autofill.pendingManual';
const PAYPAL_FILLED_ATTR = 'data-opx-paypal-filled';
const MAX_AUTOFILL_ATTEMPTS_PER_PAGE = 3;
const PAYPAL_COUNTRY_LABELS: Record<string, string> = {
  AR: 'Argentina',
  AU: 'Australia',
  CA: 'Canada',
  CN: 'China',
  DE: 'Germany',
  ES: 'Spain',
  FR: 'France',
  GB: 'United Kingdom',
  HK: 'Hong Kong',
  IT: 'Italy',
  JP: 'Japan',
  KR: 'South Korea',
  MY: 'Malaysia',
  NL: 'Netherlands',
  PH: 'Philippines',
  RU: 'Russia',
  SG: 'Singapore',
  TH: 'Thailand',
  TR: 'Turkey',
  TW: 'Taiwan',
  US: 'United States',
  VN: 'Vietnam',
};

let initialized = false;
let running = false;
let scheduledTimer: number | null = null;
let pageAddress: AddressProfile | null = null;
let observer: MutationObserver | null = null;
let challengeArtifactObserver: MutationObserver | null = null;
let attemptKey = '';
let attemptCount = 0;
let manualFillKey = '';

export function initPaypalAutofill(): void {
  if (initialized || !location.hostname.endsWith('paypal.com')) {
    return;
  }

  initialized = true;
  installPaypalChallengeArtifactObserver();
  if (!isPaypalSignupPage()) {
    return;
  }
  installStorageListener();
  installObserver();
  if (consumePendingManualFill()) {
    scheduleManualSessionAutofill(900);
  } else {
    scheduleAutofill(800);
  }
}

export async function fillPaypalAddressNow(
  address?: AddressProfile,
  force = false,
  allowRetry = true,
  options: { submitCreateAccount?: boolean } = {},
): Promise<{ ok: boolean; filled: number; message: string; countryChanged: boolean; code?: string; submitted?: boolean }> {
  if (!isPaypalSignupPage()) {
    return { ok: false, filled: 0, message: '当前不是 PayPal 注册支付页', countryChanged: false };
  }

  const loaded = await waitForDocumentLoadComplete(15_000);
  if (!loaded) {
    return { ok: false, filled: 0, message: '页面仍在加载中，已停止自动填写 PayPal，请稍后重试', countryChanged: false };
  }

  if (detectPaypalSecurityChallenge(document)) {
    return {
      ok: false,
      filled: 0,
      message: PAYPAL_SECURITY_CHALLENGE_MESSAGE,
      countryChanged: false,
      code: PAYPAL_SECURITY_CHALLENGE_CODE,
    };
  }

  const settings = await loadAddressAutofillSettings();
  const usSettings = { ...settings, countryCode: 'US', city: '' };
  const targetAddress = address?.countryCode === 'US'
    ? address
    : await getPageAddress(usSettings);
  if (!targetAddress) {
    return { ok: false, filled: 0, message: '没有可用地址资料', countryChanged: false };
  }
  if (!hasCompleteCreditCardInfo(targetAddress.creditCard)) {
    return {
      ok: false,
      filled: 0,
      message: 'PayPal 注册资料缺少完整信用卡号、CVV 或有效期，已停止填写',
      countryChanged: false,
    };
  }

  rememberSessionAddress(targetAddress);
  if (force && !allowRetry) {
    cancelScheduledAutofill();
  }
  if (force) {
    resetFilledMarks();
    resetAttempts();
  }
  const result = await fillPaypalSignupFields(targetAddress, allowRetry, options.submitCreateAccount !== false);
  if (result.challenge) {
    return {
      ok: false,
      filled: result.filled,
      message: PAYPAL_SECURITY_CHALLENGE_MESSAGE,
      countryChanged: result.countryChanged,
      code: PAYPAL_SECURITY_CHALLENGE_CODE,
    };
  }
  noteAttempt(targetAddress, result.countryChanged, allowRetry);
  if (force && !allowRetry) {
    manualFillKey = pageAttemptKey(targetAddress);
    if (result.countryChanged) {
      markPendingManualFill();
      scheduleManualSessionAutofill(1600);
    } else {
      clearPendingManualFill();
    }
  }
  const signupReadiness = getPaypalSignupReadiness();
  const shouldOnlyFillSignupForm = options.submitCreateAccount === false;
  const readyToCreateAccount = shouldOnlyFillSignupForm && signupReadiness.ready;
  return {
    ok: shouldOnlyFillSignupForm
      ? readyToCreateAccount
      : result.filled > 0 || result.countryChanged || Boolean(result.submitted),
    filled: result.filled,
    countryChanged: result.countryChanged,
    submitted: result.submitted,
    message: result.countryChanged
      ? `已选择 PayPal 国家：${targetAddress.countryCode}，等待页面重新加载`
      : result.submitted
        ? `已填写 PayPal ${Math.max(0, result.filled - 1)} 项并点击创建账号`
      : readyToCreateAccount
        ? 'PayPal 注册信息已填写，创建账号按钮已就绪'
      : shouldOnlyFillSignupForm && signupReadiness.missing.length > 0
        ? `PayPal 注册信息尚未填完，等待字段：${signupReadiness.missing.join('、')}`
      : result.filled > 0
        ? `已填写 PayPal ${result.filled} 项`
        : '未找到可填写的 PayPal 字段',
  };
}

export async function preparePaypalRegistrationNow(): Promise<{ ok: boolean; message: string; countryChanged: boolean; code?: string }> {
  if (!isPaypalRegistrationEntryPage()) {
    return { ok: false, message: '当前不是 PayPal 注册入口页', countryChanged: false };
  }

  const loaded = await waitForDocumentLoadComplete(15_000);
  if (!loaded) {
    return { ok: false, message: '页面仍在加载中，已停止自动填写 PayPal 邮箱，请稍后重试', countryChanged: false };
  }

  if (detectPaypalSecurityChallenge(document)) {
    return {
      ok: false,
      countryChanged: false,
      code: PAYPAL_SECURITY_CHALLENGE_CODE,
      message: PAYPAL_SECURITY_CHALLENGE_MESSAGE,
    };
  }

  const countryChanged = ensurePaypalCountryInUrl('US') || selectCountryCode('US');
  if (countryChanged) {
    return {
      ok: true,
      countryChanged,
      message: '已切换 PayPal 国家为美国，等待页面重新加载',
    };
  }

  const email = await resolvePaypalRegistrationEmail();
  const emailFilled = await fillPaypalRegistrationEmail(email);
  const submitted = await clickPaypalEmailNextButton();
  return {
    ok: true,
    countryChanged: false,
    message: submitted
      ? `已填写 PayPal 邮箱${emailFilled ? '' : '（字段已存在）'}并点击 Next`
      : `已填写 PayPal 邮箱${emailFilled ? '' : '（字段已存在）'}，等待 Next 按钮可用`,
  };
}

export function isPaypalSignupFormPage(): boolean {
  return location.hostname.endsWith('paypal.com') && (
    location.pathname.startsWith('/checkoutweb/signup') ||
    Boolean(document.getElementById('cardNumber')) ||
    Boolean(document.getElementById('billingLine1')) ||
    Boolean(findTextControl(PAYPAL_FIELDS.cardNumber) && findTextControl(PAYPAL_FIELDS.address1))
  );
}

export function inspectPaypalSignupPage(): { ok: true; ready: boolean; challenge: boolean; message: string } {
  const challenge = location.hostname.endsWith('paypal.com') && detectPaypalSecurityChallenge(document);
  if (challenge) {
    return {
      ok: true,
      ready: false,
      challenge: true,
      message: PAYPAL_SECURITY_CHALLENGE_MESSAGE,
    };
  }

  const ready = isPaypalSignupFormPage();
  return {
    ok: true,
    ready,
    challenge: false,
    message: ready ? '已进入 PayPal 地址和信用卡页面' : '尚未进入 PayPal 地址和信用卡页面',
  };
}

export function inspectPaypalHostedStageNow(): {
  ok: true;
  stage: PaypalHostedStage;
  challenge: boolean;
  ready: boolean;
  message: string;
} {
  const challenge = location.hostname.endsWith('paypal.com') && detectPaypalSecurityChallenge(document);
  const stage = getPaypalHostedStage();
  return {
    ok: true,
    stage,
    challenge,
    ready: stage !== 'outside_paypal' && stage !== 'unknown',
    message: challenge ? PAYPAL_SECURITY_CHALLENGE_MESSAGE : paypalHostedStageMessage(stage),
  };
}

export async function clickPaypalCreateAccountNow(): Promise<{ ok: boolean; message: string; code?: string }> {
  if (!location.hostname.endsWith('paypal.com')) {
    return { ok: false, message: '当前页面不是 PayPal 注册页' };
  }
  if (detectPaypalSecurityChallenge(document)) {
    return {
      ok: false,
      code: PAYPAL_SECURITY_CHALLENGE_CODE,
      message: PAYPAL_SECURITY_CHALLENGE_MESSAGE,
    };
  }
  const stage = getPaypalHostedStage();
  if (stage === 'verification') {
    return { ok: true, message: 'PayPal 已进入验证码页，无需再次点击创建账号' };
  }
  if (stage === 'review' || stage === 'approval' || stage === 'outside_paypal') {
    return { ok: true, message: 'PayPal 已离开注册表单页，继续后续确认步骤' };
  }
  if (stage === 'login') {
    return preparePaypalRegistrationNow();
  }
  const signupReadiness = getPaypalSignupReadiness();
  if (!signupReadiness.ready) {
    return {
      ok: false,
      message: `PayPal 注册信息尚未填完，暂不点击创建账号。等待字段：${signupReadiness.missing.join('、')}`,
    };
  }
  const clicked = await clickPaypalCreateAccountButton(12_000);
  if (!clicked) {
    return { ok: false, message: '未找到可点击的 PayPal 创建账号按钮' };
  }
  await delay(900);
  if (detectPaypalSecurityChallenge(document)) {
    return {
      ok: false,
      code: PAYPAL_SECURITY_CHALLENGE_CODE,
      message: PAYPAL_SECURITY_CHALLENGE_MESSAGE,
    };
  }
  return { ok: true, message: '已点击 PayPal 创建账号按钮' };
}

export async function fillPaypalVerificationCodeNow(code: string): Promise<{ ok: boolean; message: string; code?: string }> {
  if (!location.hostname.endsWith('paypal.com')) {
    return { ok: false, message: '当前页面不是 PayPal 验证码页' };
  }
  removePaypalChallengeArtifacts(document);
  if (detectPaypalSecurityChallenge(document)) {
    return {
      ok: false,
      code: PAYPAL_SECURITY_CHALLENGE_CODE,
      message: PAYPAL_SECURITY_CHALLENGE_MESSAGE,
    };
  }


  const normalized = normalizePaypalVerificationCode(code);
  if (!normalized) {
    return { ok: false, message: 'PayPal 验证码必须是 6 位数字' };
  }

  const filled = fillPaypalVerificationCode(normalized);
  if (!filled) {
    const stage = getPaypalHostedStage();
    if (stage === 'review' || stage === 'approval' || stage === 'outside_paypal') {
      return { ok: true, message: 'PayPal 已离开验证码页，无需重复填入验证码' };
    }
    return { ok: false, message: '未找到 PayPal 验证码输入框' };
  }

  const clicked = await clickPaypalVerificationContinueButton(5_000);
  return {
    ok: true,
    message: clicked ? '已填写 PayPal 验证码并点击继续' : '已填写 PayPal 验证码，等待继续按钮可用',
  };
}

export function confirmPaypalVerificationResultNow(): { ok: boolean; message: string; code?: string } {
  if (!location.hostname.endsWith('paypal.com')) {
    return { ok: true, message: 'PayPal 已跳转离开，等待订阅结果同步' };
  }
  removePaypalChallengeArtifacts(document);
  if (detectPaypalSecurityChallenge(document)) {
    return {
      ok: false,
      code: PAYPAL_SECURITY_CHALLENGE_CODE,
      message: PAYPAL_SECURITY_CHALLENGE_MESSAGE,
    };
  }
  const stage = getPaypalHostedStage();
  if (stage === 'review' || stage === 'approval' || stage === 'outside_paypal') {
    return { ok: true, message: paypalHostedStageMessage(stage) };
  }
  if (stage === 'login') {
    return { ok: false, message: 'PayPal 仍在邮箱入口页，等待进入注册或验证码页面' };
  }
  if (findPaypalVerificationSplitInputs().length >= 6 || findPaypalVerificationSingleInput()) {
    return { ok: false, message: 'PayPal 验证码提交后仍在验证码页，等待校验通过' };
  }
  if (isPaypalSignupFormPage()) {
    return { ok: false, message: 'PayPal 仍停留在注册表单页，等待验证码校验结果' };
  }
  return { ok: true, message: 'PayPal 验证码已通过，进入后续确认页面' };
}

export async function completePaypalSubscriptionNow(): Promise<{ ok: boolean; message: string; code?: string }> {
  if (!location.hostname.endsWith('paypal.com')) {
    return { ok: true, message: 'PayPal 页面已离开，等待订阅结果同步' };
  }
  if (detectPaypalSecurityChallenge(document)) {
    return {
      ok: false,
      code: PAYPAL_SECURITY_CHALLENGE_CODE,
      message: PAYPAL_SECURITY_CHALLENGE_MESSAGE,
    };
  }

  const stage = getPaypalHostedStage();
  if (stage === 'verification') {
    return { ok: false, message: 'PayPal 仍在验证码页，需要先完成验证码校验' };
  }
  if (stage === 'signup' || stage === 'login') {
    return { ok: false, message: paypalHostedStageMessage(stage) };
  }
  if (stage === 'outside_paypal') {
    return { ok: true, message: paypalHostedStageMessage(stage) };
  }

  const clicked = await clickPaypalCompletionButton(8_000);
  if (!clicked) {
    return { ok: false, message: '未找到 PayPal 完成订阅或同意继续按钮' };
  }
  return { ok: true, message: '已点击 PayPal 完成订阅按钮' };
}

async function runAutofill(): Promise<void> {
  if (running) {
    return;
  }
  if (manualFillKey && attemptKey === manualFillKey) {
    return;
  }

  running = true;
  try {
    const settings = await loadAddressAutofillSettings();
    if (!settings.payPalSignupEnabled) {
      console.info(`${LOG_PREFIX} disabled`);
      return;
    }

    const result = await fillPaypalAddressNow();
    console.info(`${LOG_PREFIX} ${result.message}`);
    if (!result.ok || reachedAttemptLimit()) {
      observer?.disconnect();
      observer = null;
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} failed`, error);
  } finally {
    running = false;
  }
}

async function getPageAddress(settings: AddressAutofillSettings): Promise<AddressProfile | null> {
  if (pageAddress && addressMatchesSettings(pageAddress, settings) && hasCompleteCreditCardInfo(pageAddress.creditCard)) {
    return pageAddress;
  }

  const sessionAddress = loadSessionAddress();
  if (sessionAddress && addressMatchesSettings(sessionAddress, settings) && hasCompleteCreditCardInfo(sessionAddress.creditCard)) {
    pageAddress = sessionAddress;
    return pageAddress;
  }

  const response = await browser.runtime.sendMessage({
    type: 'opx:fetch-random-address',
    countryCode: settings.countryCode,
    city: settings.city,
  });

  if (!isRandomAddressResponse(response) || !response.ok || !response.address) {
    console.warn(`${LOG_PREFIX} address fetch failed`, response);
    return null;
  }

  pageAddress = response.address;
  rememberSessionAddress(response.address);
  await saveAddressAutofillSettings({ lastAddress: response.address });
  return pageAddress;
}

async function fillPaypalSignupFields(
  address: AddressProfile,
  allowRetry: boolean,
  submitCreateAccount: boolean,
): Promise<{ filled: number; countryChanged: boolean; challenge?: boolean; submitted?: boolean }> {
  let filled = 0;
  const countryChanged = selectCountry(address);
  if (countryChanged) {
    if (allowRetry) {
      scheduleAutofill(1500);
    }
    return { filled: 1, countryChanged: true };
  }

  const email = await resolveEmail(address);
  const phone = normalizePaypalSignupPhone(await resolveSmsRelayPhone(address));
  const password = resolvePassword(address);
  const name = splitName(address.fullName);
  const expiry = parseExpiry(address.creditCard.expires);

  filled += fillHostedPaypalSignupFields(address, {
    email,
    phone,
    password,
    firstName: name.first,
    lastName: name.last,
    expiry: expiry.short,
  });
  filled += fillText(PAYPAL_FIELDS.email, email, true);
  filled += fillText(PAYPAL_FIELDS.phone, phone, true);
  filled += fillText(PAYPAL_FIELDS.cardNumber, address.creditCard.number, true);
  filled += fillText(PAYPAL_FIELDS.expiry, expiry.short, true);
  filled += fillText(PAYPAL_FIELDS.csc, address.creditCard.cvv, true);
  filled += fillText(PAYPAL_FIELDS.fullName, address.fullName, true);
  filled += fillText(PAYPAL_FIELDS.firstName, name.first, true);
  filled += fillText(PAYPAL_FIELDS.lastName, name.last, true);
  filled += fillText(PAYPAL_FIELDS.address1, address.line1, true);
  filled += fillText(PAYPAL_FIELDS.address2, address.line2, true);
  filled += fillText(PAYPAL_FIELDS.city, address.city, true);
  filled += fillSelectOrInput(PAYPAL_FIELDS.state, address.state, [address.stateFull, address.state]);
  filled += fillText(PAYPAL_FIELDS.postalCode, address.postalCode, true);
  filled += fillBillingAddressGroup(address, name);
  filled += fillSelectOrInput(PAYPAL_FIELDS.expiryMonth, expiry.month, [expiry.month]);
  filled += fillSelectOrInput(PAYPAL_FIELDS.expiryYear, expiry.year4, [expiry.year4, expiry.year2]);
  filled += fillPasswordField(password);

  const signupReadiness = getPaypalSignupReadiness();
  const submitted = submitCreateAccount && signupReadiness.ready
    ? await clickPaypalCreateAccountButton()
    : false;
  if (submitted) {
    filled += 1;
    await delay(900);
  }

  return {
    filled,
    countryChanged: false,
    submitted,
    challenge: detectPaypalSecurityChallenge(document),
  };
}

function fillHostedPaypalSignupFields(
  address: AddressProfile,
  values: {
    email: string;
    phone: string;
    password: string;
    firstName: string;
    lastName: string;
    expiry: string;
  },
): number {
  let filled = 0;
  filled += fillHostedInputById('email', values.email);
  filled += fillHostedInputById('phone', values.phone);
  filled += fillHostedInputById('cardNumber', address.creditCard.number.replace(/\s+/g, ''));
  filled += fillHostedInputById('cardExpiry', values.expiry);
  filled += fillHostedInputById('cardCvv', address.creditCard.cvv);
  filled += fillHostedInputById('password', values.password);
  filled += fillHostedInputById('firstName', values.firstName);
  filled += fillHostedInputById('lastName', values.lastName);
  filled += fillHostedInputById('billingLine1', address.line1);
  filled += fillHostedInputById('billingLine2', address.line2);
  filled += fillHostedInputById('billingCity', address.city);
  filled += fillHostedInputById('billingPostalCode', address.postalCode);
  filled += selectHostedOptionByIdText('billingState', address.state || address.stateFull) ? 1 : 0;
  return filled;
}

function fillHostedInputById(id: string, value: string): number {
  const input = document.getElementById(id);
  if (!isTextControl(input) || !isVisible(input) || !value) {
    return 0;
  }
  return fillTextControl(input, value, true);
}

function selectHostedOptionByIdText(id: string, text: string): boolean {
  const select = document.getElementById(id);
  const expectedText = normalizedText(text);
  if (!(select instanceof HTMLSelectElement) || !isVisible(select) || !expectedText) {
    return false;
  }
  const match = Array.from(select.options || []).find((option) => {
    const label = normalizedText(option.textContent || option.label || '');
    const value = normalizedText(option.value || '');
    return label.includes(expectedText) || value.includes(expectedText);
  });
  if (!match || select.value === match.value) {
    return false;
  }
  select.value = match.value;
  emitChange(select);
  return true;
}

function getPaypalSignupReadiness(): PaypalSignupReadiness {
  const button = findPaypalCreateAccountButton();
  return evaluatePaypalSignupReadiness(
    getPaypalSignupFieldStatuses(),
    Boolean(button && isVisible(button) && !isDisabledButton(button)),
  );
}

function getPaypalSignupFieldStatuses(): PaypalSignupFieldStatus[] {
  const statuses = paypalSignupFieldDefinitions().map((field) => {
    const control = findPaypalSignupFieldControl(field);
    return {
      key: field.key,
      label: field.label,
      required: field.required,
      present: Boolean(control),
      filled: control ? isPaypalSignupFieldFilled(field.key, control) : false,
    };
  });

  const hasSignupShell = location.pathname.startsWith('/checkoutweb/signup') ||
    statuses.some((field) => field.present && field.required !== false);
  if (!hasSignupShell) {
    return statuses.filter((field) => field.present);
  }

  return statuses.map((field) => field.required === false
    ? field
    : { ...field, present: true });
}

function paypalSignupFieldDefinitions(): Array<{
  key: string;
  label: string;
  required: boolean;
  id?: string;
  selectors?: string[];
  kind: 'text' | 'select';
}> {
  return [
    { key: 'email', label: '邮箱', required: true, id: 'email', selectors: PAYPAL_FIELDS.email, kind: 'text' },
    { key: 'phone', label: '手机号', required: true, id: 'phone', selectors: PAYPAL_FIELDS.phone, kind: 'text' },
    { key: 'cardNumber', label: '卡号', required: true, id: 'cardNumber', selectors: PAYPAL_FIELDS.cardNumber, kind: 'text' },
    { key: 'cardExpiry', label: '有效期', required: true, id: 'cardExpiry', selectors: PAYPAL_FIELDS.expiry, kind: 'text' },
    { key: 'cardCvv', label: '安全码', required: true, id: 'cardCvv', selectors: PAYPAL_FIELDS.csc, kind: 'text' },
    { key: 'password', label: '密码', required: true, id: 'password', selectors: PAYPAL_FIELDS.password, kind: 'text' },
    { key: 'firstName', label: '名', required: true, id: 'firstName', selectors: PAYPAL_FIELDS.firstName, kind: 'text' },
    { key: 'lastName', label: '姓', required: true, id: 'lastName', selectors: PAYPAL_FIELDS.lastName, kind: 'text' },
    { key: 'billingLine1', label: '地址', required: true, id: 'billingLine1', selectors: PAYPAL_FIELDS.address1, kind: 'text' },
    { key: 'billingLine2', label: '地址补充', required: false, id: 'billingLine2', selectors: PAYPAL_FIELDS.address2, kind: 'text' },
    { key: 'billingCity', label: '城市', required: true, id: 'billingCity', selectors: PAYPAL_FIELDS.city, kind: 'text' },
    { key: 'billingPostalCode', label: '邮编', required: true, id: 'billingPostalCode', selectors: PAYPAL_FIELDS.postalCode, kind: 'text' },
    { key: 'billingState', label: '州', required: true, id: 'billingState', selectors: PAYPAL_FIELDS.state, kind: 'select' },
  ];
}

function findPaypalSignupFieldControl(field: {
  id?: string;
  selectors?: string[];
  kind: 'text' | 'select';
}): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  const byId = field.id ? document.getElementById(field.id) : null;
  if ((isTextControl(byId) || isSelectControl(byId)) && isVisible(byId)) {
    return byId;
  }

  if (!field.selectors) {
    return null;
  }
  const control = field.kind === 'select'
    ? findSelect(field.selectors) || findTextControl(field.selectors)
    : findTextControl(field.selectors);
  return control && isVisible(control) ? control : null;
}

function isPaypalSignupFieldFilled(
  key: string,
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): boolean {
  const value = getControlValue(control);
  const compact = comparableValue(value);
  if (!compact) {
    return false;
  }
  if (key === 'email') {
    return isEmail(value);
  }
  if (key === 'phone') {
    return normalizePaypalSignupPhone(value).length >= 10;
  }
  if (key === 'cardNumber') {
    return compact.length >= 12;
  }
  if (key === 'cardExpiry') {
    return /\d{1,2}\D*\d{2,4}/.test(value);
  }
  if (key === 'cardCvv') {
    return compact.length >= 3;
  }
  return true;
}

function getControlValue(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  if (control instanceof HTMLSelectElement) {
    const selected = control.selectedOptions[0];
    return [
      control.value,
      selected?.textContent || selected?.label || '',
    ].join(' ').trim();
  }
  return control.value.trim();
}

function selectCountry(address: AddressProfile): boolean {
  return selectCountryCode(address.countryCode, [
    address.countryCode,
    PAYPAL_COUNTRY_LABELS[address.countryCode] || '',
    address.countryLabel,
  ]) || ensurePaypalCountryInUrl(address.countryCode);
}

function selectCountryCode(countryCode: string, labels?: string[]): boolean {
  const select = findSelect(PAYPAL_FIELDS.country);
  if (!select || !isVisible(select)) {
    return false;
  }

  return setSelectOption(select, countryCode, labels || [
    countryCode,
    PAYPAL_COUNTRY_LABELS[countryCode] || '',
  ]);
}

async function resolveEmail(address: AddressProfile): Promise<string> {
  return resolvePaypalRegistrationEmail(address);
}

async function resolveSmsRelayPhone(address: AddressProfile): Promise<string> {
  const state = await loadSmsRelayState();
  const selected = getSelectedSmsRelayTarget(state.targets, state.selectedTargetId);
  return selected?.phone || address.phone;
}

async function resolvePaypalRegistrationEmail(address?: AddressProfile): Promise<string> {
  const register = await loadRegisterState();
  const resolved = resolveRegisterEmailForFill(register);
  if (resolved?.email && isEmail(resolved.email)) {
    return resolved.email;
  }
  if (address && isEmail(address.identity.temporaryMail)) {
    return address.identity.temporaryMail;
  }
  return address ? createOutlookEmail(address) : `paypal${Date.now().toString().slice(-8)}@outlook.com`;
}

async function fillPaypalRegistrationEmail(email: string): Promise<boolean> {
  const input = findTextControl(PAYPAL_FIELDS.email);
  if (!input || !isVisible(input)) {
    return false;
  }
  if (input instanceof HTMLInputElement) {
    const result = await setInputValueWithFallback(() => {
      const nextInput = findTextControl(PAYPAL_FIELDS.email);
      return nextInput instanceof HTMLInputElement && isVisible(nextInput) ? nextInput : null;
    }, email);
    return Boolean(result);
  }
  return fillTextControl(input, email, true) > 0;
}

function fillText(selectors: string[], value: string, overwrite: boolean): number {
  if (!value) {
    return 0;
  }

  const input = findTextControl(selectors);
  if (!input || !isVisible(input)) {
    return 0;
  }

  return fillTextControl(input, value, overwrite);
}

function fillTextControl(input: HTMLInputElement | HTMLTextAreaElement, value: string, overwrite: boolean): number {
  if (!value || !isVisible(input)) {
    return 0;
  }

  const currentValue = input.value.trim();
  if (input.getAttribute(PAYPAL_FILLED_ATTR) === '1' || equivalentValue(currentValue, value)) {
    input.setAttribute(PAYPAL_FILLED_ATTR, '1');
    return 0;
  }
  if (!overwrite && currentValue) {
    return 0;
  }

  setNativeValue(input, value);
  input.setAttribute(PAYPAL_FILLED_ATTR, '1');
  return 1;
}

function fillPasswordField(value: string): number {
  if (!value) {
    return 0;
  }

  const input = document.querySelector<HTMLInputElement>('input#password') ||
    findTextControl(PAYPAL_FIELDS.password);
  if (!input || !isVisible(input)) {
    return 0;
  }

  const currentValue = input.value.trim();
  if (equivalentValue(currentValue, value)) {
    return 0;
  }

  setNativeValue(input, value);
  return 1;
}

function resolvePassword(address: AddressProfile): string {
  return createPaypalSignupPassword({
    preferredPassword: address.identity.password,
    username: address.identity.username,
    fullName: address.fullName,
    id: address.id,
    fetchedAt: address.fetchedAt,
  });
}

async function clickPaypalEmailNextButton(timeoutMs = 2500): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const button = findPaypalEmailNextButton();
    if (button && isVisible(button) && !isDisabledButton(button)) {
      clickElement(button);
      return true;
    }
    await delay(120);
  }
  return false;
}

function findPaypalEmailNextButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>('button[data-atomic-wait-intent="Submit_Email"]') ||
    Array.from(document.querySelectorAll<HTMLElement>('button'))
      .find((item) => isVisible(item) && normalizedText(item.textContent || item.getAttribute('aria-label')).includes('next')) ||
    null;
}

async function clickPaypalCreateAccountButton(timeoutMs = 2500): Promise<boolean> {
  const startedAt = Date.now();
  let clicked = false;
  while (Date.now() - startedAt < timeoutMs) {
    const button = findPaypalCreateAccountButton();
    if (button && isVisible(button) && !isDisabledButton(button)) {
      const buttonText = normalizedText(getActionText(button));
      clickElement(button);
      clicked = true;
      await delay(1000);
      if (findPaypalVerificationSplitInputs().length >= 6 || findPaypalVerificationSingleInput()) {
        return true;
      }
      const currentText = normalizedText(getActionText(button));
      if (currentText && currentText === buttonText && !currentText.includes('processing')) {
        await delay(1000);
        continue;
      }
      return true;
    }
    await delay(120);
  }
  return clicked;
}

function findPaypalCreateAccountButton(): HTMLElement | null {
  const selectors = [
    'button[data-testid="submit-button"]',
    'button[data-testid="hosted-payment-submit-button"]',
    'button[data-atomic-wait-intent="Submit_Email"]',
    'button.SubmitButton--complete',
    'button[data-testid*="create" i]',
    'button[data-atomic-wait-intent*="create" i]',
    'button[type="submit"]',
  ];
  for (const selector of selectors) {
    const button = document.querySelector<HTMLElement>(selector);
    if (button && isVisible(button) && (isPaypalHostedSubmitButton(button) || isCreateAccountButtonText(button))) {
      return button;
    }
  }
  return Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], input[type="submit"]'))
    .find((item) => isVisible(item) && (isPaypalHostedSubmitButton(item) || isCreateAccountButtonText(item))) ||
    null;
}

function isPaypalHostedSubmitButton(element: HTMLElement): boolean {
  return isPaypalHostedSubmitButtonMetadata({
    text: element.textContent || element.getAttribute('value') || '',
    dataTestId: element.getAttribute('data-testid') || '',
    dataAtomicWaitIntent: element.getAttribute('data-atomic-wait-intent') || '',
    className: typeof element.className === 'string' ? element.className : '',
  });
}

function isCreateAccountButtonText(element: HTMLElement): boolean {
  const text = normalizedText([
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('value'),
    element.getAttribute('data-atomic-wait-intent'),
    element.getAttribute('data-testid'),
  ].join(' '));
  return text.includes('create account') ||
    text.includes('create paypal account') ||
    text.includes('agree and create account') ||
    text.includes('创建账号') ||
    text.includes('建立帳戶');
}

function fillPaypalVerificationCode(code: string): boolean {
  const splitInputs = findPaypalVerificationSplitInputs();
  if (splitInputs.length >= Math.min(code.length, 6)) {
    splitInputs.forEach((input, index) => {
      setNativeValue(input, code[index] || '');
      input.setAttribute(PAYPAL_FILLED_ATTR, '1');
    });
    return true;
  }

  const input = findPaypalVerificationSingleInput();
  if (!input) {
    return false;
  }
  setNativeValue(input, code);
  input.setAttribute(PAYPAL_FILLED_ATTR, '1');
  return true;
}

function findPaypalVerificationSplitInputs(): HTMLInputElement[] {
  const byHostedId = Array.from({ length: 8 }, (_, index) => document.getElementById(`ci-ciBasic-${index}`))
    .filter((input): input is HTMLInputElement => input instanceof HTMLInputElement && isVisible(input) && !isDisabledInput(input));
  if (byHostedId.length >= 4) {
    return byHostedId;
  }

  const candidates = Array.from(document.querySelectorAll<HTMLInputElement>('input[inputmode="numeric"], input[autocomplete="one-time-code"], input[maxlength="1"]'))
    .filter((input) =>
      isVisible(input) &&
      !isDisabledInput(input) &&
      !isIgnoredInput(input) &&
      !isLikelyCardField(input) &&
      Number(input.maxLength || 1) <= 1,
    );
  return candidates.length >= 4 ? candidates : [];
}

function findPaypalVerificationSingleInput(): HTMLInputElement | null {
  const selectors = [
    'input[autocomplete="one-time-code"]',
    'input[name*="verification" i]',
    'input[id*="verification" i]',
    'input[name*="otp" i]',
    'input[id*="otp" i]',
    'input[name*="code" i]',
    'input[id*="code" i]',
  ];
  for (const selector of selectors) {
    const input = document.querySelector<HTMLInputElement>(selector);
    if (input && isVisible(input) && !isDisabledInput(input) && !isIgnoredInput(input) && !isLikelyCardField(input)) {
      return input;
    }
  }

  return Array.from(document.querySelectorAll<HTMLInputElement>('input'))
    .find((input) =>
      isVisible(input) &&
      !isDisabledInput(input) &&
      !isIgnoredInput(input) &&
      !isLikelyCardField(input) &&
      /verification|one-time|otp|confirmation|验证码|驗證碼/i.test([
        input.id,
        input.name,
        input.placeholder,
        input.autocomplete,
        input.getAttribute('aria-label'),
        labelledText(input),
        closestLabelText(input),
      ].join(' ')),
    ) || null;
}

async function clickPaypalVerificationContinueButton(timeoutMs = 2500): Promise<boolean> {
  return clickPaypalButtonByText([
    /continue|next|submit|verify|confirm/i,
    /继续|下一步|提交|验证|確認|繼續|驗證/,
  ], timeoutMs);
}

async function clickPaypalCompletionButton(timeoutMs = 2500): Promise<boolean> {
  const direct = findPaypalCompletionButton();
  if (direct) {
    clickElement(direct);
    return true;
  }

  return clickPaypalButtonByText([
    /agree\s*(?:and)?\s*continue|agree\s*(?:and)?\s*subscribe|complete|confirm|pay\s*now|subscribe|continue/i,
    /同意并继续|同意並繼續|同意|完成|确认|確認|订阅|訂閱|继续|繼續/,
  ], timeoutMs);
}

function findPaypalCompletionButton(): HTMLElement | null {
  const direct = findPaypalReviewConsentButton();
  if (direct) {
    return direct;
  }
  return Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], input[type="submit"], a'))
    .find((item) =>
      isVisible(item) &&
      !isDisabledButton(item) &&
      [
        /agree\s*(?:and)?\s*continue|agree\s*(?:and)?\s*subscribe|complete|confirm|pay\s*now|subscribe|continue/i,
        /同意并继续|同意並繼續|同意|完成|确认|確認|订阅|訂閱|继续|繼續/,
      ].some((pattern) => pattern.test(getActionText(item))),
    ) || null;
}

function findPaypalReviewConsentButton(): HTMLElement | null {
  const direct = document.getElementById('consentButton') ||
    document.querySelector<HTMLElement>('button[data-testid="consentButton"]');
  return direct instanceof HTMLElement && isVisible(direct) && !isDisabledButton(direct) ? direct : null;
}

async function clickPaypalButtonByText(patterns: RegExp[], timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const button = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], input[type="submit"], a'))
      .find((item) => isVisible(item) && !isDisabledButton(item) && patterns.some((pattern) => pattern.test(getActionText(item))));
    if (button) {
      clickElement(button);
      return true;
    }
    await delay(120);
  }
  return false;
}

function getActionText(element: HTMLElement): string {
  return [
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('value'),
    element.getAttribute('data-testid'),
    element.getAttribute('data-atomic-wait-intent'),
  ].join(' ');
}

function isLikelyCardField(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  return /card|cc|csc|cvv|cvc|expiry|expire|security/i.test([
    input.id,
    input.name,
    'placeholder' in input ? input.placeholder : '',
    input.getAttribute('aria-label'),
    labelledText(input as HTMLElement),
  ].join(' '));
}

function isDisabledInput(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  return Boolean(input.disabled) ||
    input.getAttribute('aria-disabled') === 'true' ||
    ('readOnly' in input && input.readOnly);
}

function fillSelectOrInput(selectors: string[], preferredValue: string, preferredLabels: string[]): number {
  if (!preferredValue && !preferredLabels.some(Boolean)) {
    return 0;
  }

  const select = findSelect(selectors);
  if (select && isVisible(select)) {
    return setSelectOption(select, preferredValue, preferredLabels) ? 1 : 0;
  }

  return fillText(selectors, preferredValue || preferredLabels.find(Boolean) || '', true);
}

function fillBillingAddressGroup(address: AddressProfile, name: { first: string; last: string }): number {
  const group = findBillingAddressGroup();
  if (!group) {
    return 0;
  }

  const fallbackControls = Array.from(group.querySelectorAll('input, textarea, select'))
    .filter((control): control is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
      (isTextControl(control) || isSelectControl(control)) &&
      isVisible(control) &&
      !isIgnoredInput(control) &&
      !isLikelyEmailPhoneOrCard(control),
    );

  let filled = 0;
  filled += fillGroupText(group, ['first name', 'given name'], name.first, fallbackControls[0]);
  filled += fillGroupText(group, ['last name', 'family name', 'surname'], name.last, fallbackControls[1]);
  filled += fillGroupText(group, ['street address', 'address line 1', 'address 1'], address.line1, fallbackControls[2]);
  filled += fillGroupText(group, ['apt', 'ste', 'bldg', 'address line 2', 'address 2'], address.line2, fallbackControls[3]);
  filled += fillGroupText(group, ['city', 'locality'], address.city, fallbackControls[4]);
  filled += fillGroupSelectOrInput(group, ['state', 'province', 'region'], address.state, [address.stateFull, address.state], fallbackControls[5]);
  filled += fillGroupText(group, ['zip', 'postal code', 'postcode'], address.postalCode, fallbackControls[6]);
  return filled;
}

function fillGroupText(
  group: Element,
  needles: string[],
  value: string,
  fallback?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): number {
  const fallbackText: HTMLInputElement | HTMLTextAreaElement | null = fallback && isTextControl(fallback) ? fallback : null;
  const control = findControlInGroup(group, needles, isTextControl) ||
    fallbackText;
  return control ? fillTextControl(control, value, true) : 0;
}

function fillGroupSelectOrInput(
  group: Element,
  needles: string[],
  preferredValue: string,
  preferredLabels: string[],
  fallback?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): number {
  const fallbackSelect: HTMLSelectElement | null = fallback && isSelectControl(fallback) ? fallback : null;
  const select = findControlInGroup(group, needles, isSelectControl) ||
    fallbackSelect;
  if (select) {
    return setSelectOption(select, preferredValue, preferredLabels) ? 1 : 0;
  }

  const fallbackText: HTMLInputElement | HTMLTextAreaElement | null = fallback && isTextControl(fallback) ? fallback : null;
  const input = findControlInGroup(group, needles, isTextControl) ||
    fallbackText;
  return input ? fillTextControl(input, preferredValue || preferredLabels.find(Boolean) || '', true) : 0;
}

function findBillingAddressGroup(): Element | null {
  return Array.from(document.querySelectorAll('fieldset, [role="group"], section, form > div'))
    .find((element) => {
      const text = normalizedText(element.textContent || '');
      return text.includes('billing address') &&
        (text.includes('street address') || text.includes('address')) &&
        (text.includes('first name') || text.includes('last name'));
    }) || null;
}

function findControlInGroup<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
  group: Element,
  needles: string[],
  guard: (element: Element | null) => element is T,
): T | null {
  const normalizedNeedles = needles.map(normalizedText).filter(Boolean);
  const controls = Array.from(group.querySelectorAll('input, textarea, select')).filter(guard);
  const candidates = controls
    .map((control) => ({
      control,
      score: scoreControlMatch(control, normalizedNeedles),
    }))
    .filter((item) => item.score > 0 && isVisible(item.control) && !isIgnoredInput(item.control))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.control || null;
}

function findTextControl(selectors: string[]): HTMLInputElement | HTMLTextAreaElement | null {
  for (const selector of selectors) {
    const element = querySelectorCandidate(selector);
    if (isTextControl(element)) {
      return element;
    }
  }

  return findControlByNeedles(selectors, isTextControl);
}

function findSelect(selectors: string[]): HTMLSelectElement | null {
  for (const selector of selectors) {
    const element = querySelectorCandidate(selector);
    if (isSelectControl(element)) {
      return element;
    }
  }

  return findControlByNeedles(selectors, isSelectControl);
}

function querySelectorCandidate(selector: string): Element | null {
  if (!isCssSelectorCandidate(selector)) {
    return null;
  }
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function isCssSelectorCandidate(value: string): boolean {
  const selector = value.trim();
  return /^[.#[]/.test(selector) ||
    /^(input|select|textarea|button|label|form|fieldset|section|div)([#.[\s:]|$)/i.test(selector);
}

function findControlByNeedles<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
  needles: string[],
  guard: (element: Element | null) => element is T,
): T | null {
  const normalizedNeedles = needles
    .filter((item) => !item.includes('[') && !item.includes('#') && !item.includes('.'))
    .map(normalizedText)
    .filter(Boolean);

  if (!normalizedNeedles.length) {
    return null;
  }

  const controls = Array.from(document.querySelectorAll('input, textarea, select')).filter(guard);
  const candidates = controls
    .map((control) => ({
      control,
      score: scoreControlMatch(control, normalizedNeedles),
    }))
    .filter((item) => item.score > 0 && isVisible(item.control) && !isIgnoredInput(item.control))
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.control || null;
}

function scoreControlMatch(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  normalizedNeedles: string[],
): number {
  if (!isVisible(control) || isIgnoredInput(control)) {
    return 0;
  }

  const directText = normalizedText([
    control.id,
    control.name,
    'placeholder' in control ? control.placeholder : '',
    'autocomplete' in control ? control.autocomplete : '',
    control.getAttribute('aria-label'),
    labelledText(control),
    closestLabelText(control),
  ].join(' '));

  const nearbyText = normalizedText([
    control.previousElementSibling?.textContent,
    control.nextElementSibling?.textContent,
    compactContainerText(control),
  ].join(' '));

  const broadText = normalizedText(control.parentElement?.textContent || '');

  if (normalizedNeedles.some((needle) => directText.includes(needle))) {
    return 30;
  }
  if (normalizedNeedles.some((needle) => nearbyText.includes(needle))) {
    return 20;
  }
  if (broadText.length <= 120 && normalizedNeedles.some((needle) => broadText.includes(needle))) {
    return 5;
  }
  return 0;
}

function labelledText(control: HTMLElement): string {
  const labels: string[] = [];
  const labelledBy = control.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const element = document.getElementById(id);
      if (element?.textContent) {
        labels.push(element.textContent);
      }
    }
  }

  const id = control.id;
  if (id) {
    for (const label of Array.from(document.querySelectorAll<HTMLLabelElement>(`label[for="${cssEscape(id)}"]`))) {
      labels.push(label.textContent || '');
    }
  }

  return labels.join(' ');
}

function closestLabelText(control: HTMLElement): string {
  return control.closest('label')?.textContent || '';
}

function compactContainerText(control: HTMLElement): string {
  const container = control.closest('div, label, section');
  const text = container?.textContent || '';
  return text.length <= 160 ? text : '';
}

function resetFilledMarks(): void {
  for (const element of Array.from(document.querySelectorAll(`[${PAYPAL_FILLED_ATTR}]`))) {
    element.removeAttribute(PAYPAL_FILLED_ATTR);
  }
}

function noteAttempt(address: AddressProfile, countryChanged: boolean, allowRetry: boolean): void {
  const key = pageAttemptKey(address);
  if (attemptKey !== key) {
    attemptKey = key;
    attemptCount = 0;
  }
  attemptCount += 1;
  if (allowRetry && !countryChanged && attemptCount < MAX_AUTOFILL_ATTEMPTS_PER_PAGE) {
    scheduleAutofill(1200);
  }
}

function reachedAttemptLimit(): boolean {
  return Boolean(attemptKey && attemptCount >= MAX_AUTOFILL_ATTEMPTS_PER_PAGE);
}

function resetAttempts(): void {
  attemptKey = '';
  attemptCount = 0;
  manualFillKey = '';
}

function pageAttemptKey(address: AddressProfile): string {
  return [
    location.origin,
    location.pathname,
    new URLSearchParams(location.search).get('token') || '',
    address.id,
  ].join('|');
}

function equivalentValue(currentValue: string, targetValue: string): boolean {
  if (!currentValue || !targetValue) {
    return false;
  }
  if (currentValue === targetValue) {
    return true;
  }
  return comparableValue(currentValue) === comparableValue(targetValue);
}

function comparableValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}

function setSelectOption(select: HTMLSelectElement, preferredValue: string, preferredLabels: string[]): boolean {
  const normalizedPreferred = normalizedText(preferredValue);
  const labelNeedles = preferredLabels.map(normalizedText).filter(Boolean);
  const options = Array.from(select.options).filter((option) => !option.disabled && option.value);
  const option = options.find((item) => normalizedText(item.value) === normalizedPreferred) ||
    options.find((item) => labelNeedles.some((needle) => normalizedText(`${item.text} ${item.value}`).includes(needle)));

  if (!option || select.value === option.value) {
    return false;
  }

  select.value = option.value;
  emitChange(select);
  return true;
}

function setNativeValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.focus();
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
  emitChange(input);
}

function emitChange(element: HTMLElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

function clickElement(element: HTMLElement): void {
  element.scrollIntoView({ block: 'center', inline: 'center' });
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const EventCtor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
    element.dispatchEvent(new EventCtor(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      button: 0,
      buttons: type.endsWith('down') ? 1 : 0,
      pointerId: 1,
      pointerType: 'mouse',
    }));
  }
  element.click();
}

function isDisabledButton(element: HTMLElement): boolean {
  const button = element as HTMLButtonElement;
  return Boolean(button.disabled) ||
    element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true' ||
    normalizedText(element.className).includes('disabled');
}

function installObserver(): void {
  observer?.disconnect();
  observer = new MutationObserver(() => {
    if (manualFillKey && attemptKey === manualFillKey) {
      return;
    }
    if (!reachedAttemptLimit()) {
      scheduleAutofill(350);
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function installPaypalChallengeArtifactObserver(): void {
  challengeArtifactObserver?.disconnect();
  challengeArtifactObserver = observePaypalChallengeArtifacts(document);
}

function installStorageListener(): void {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }
    if (Object.keys(changes).some((key) => key.includes('settings'))) {
      pageAddress = null;
      resetAttempts();
      scheduleAutofill(100);
    }
  });
}

function scheduleAutofill(delayMs: number): void {
  cancelScheduledAutofill();
  scheduledTimer = window.setTimeout(() => {
    scheduledTimer = null;
    void runAutofill();
  }, delayMs);
}

function cancelScheduledAutofill(): void {
  if (scheduledTimer) {
    window.clearTimeout(scheduledTimer);
    scheduledTimer = null;
  }
}

function scheduleManualSessionAutofill(delayMs: number): void {
  window.setTimeout(() => {
    const address = loadSessionAddress();
    if (!address) {
      clearPendingManualFill();
      return;
    }
    void fillPaypalAddressNow(address, true, false);
  }, delayMs);
}

function loadSessionAddress(): AddressProfile | null {
  try {
    const raw = sessionStorage.getItem(PAYPAL_ADDRESS_SESSION_KEY);
    return raw ? JSON.parse(raw) as AddressProfile : null;
  } catch {
    return null;
  }
}

function markPendingManualFill(): void {
  try {
    sessionStorage.setItem(PAYPAL_PENDING_MANUAL_KEY, '1');
  } catch {
    // Ignore storage failures on restricted pages.
  }
}

function consumePendingManualFill(): boolean {
  try {
    const pending = sessionStorage.getItem(PAYPAL_PENDING_MANUAL_KEY) === '1';
    if (pending) {
      sessionStorage.removeItem(PAYPAL_PENDING_MANUAL_KEY);
    }
    return pending;
  } catch {
    return false;
  }
}

function clearPendingManualFill(): void {
  try {
    sessionStorage.removeItem(PAYPAL_PENDING_MANUAL_KEY);
  } catch {
    // Ignore storage failures on restricted pages.
  }
}

function rememberSessionAddress(address: AddressProfile): void {
  try {
    sessionStorage.setItem(PAYPAL_ADDRESS_SESSION_KEY, JSON.stringify(address));
  } catch {
    // Ignore storage failures on restricted pages.
  }
}

function addressMatchesSettings(address: AddressProfile, settings: AddressAutofillSettings): boolean {
  const countryMatches = settings.countryCode === 'RANDOM' || address.countryCode === settings.countryCode;
  const cityMatches = !settings.city.trim() || normalizedText(address.city) === normalizedText(settings.city);
  return countryMatches && cityMatches;
}

function parseExpiry(value: string): { month: string; year2: string; year4: string; short: string } {
  const parts = value.match(/\d+/g) || [];
  const month = (parts[0] || '').padStart(2, '0').slice(0, 2);
  const rawYear = parts[1] || '';
  const year4 = rawYear.length === 2 ? `20${rawYear}` : rawYear.slice(0, 4);
  const year2 = year4.slice(-2);
  return {
    month,
    year2,
    year4,
    short: month && year2 ? `${month}/${year2}` : value,
  };
}

function splitName(fullName: string): { first: string; last: string } {
  const compact = fullName.replace(/[^a-zA-Z]/g, '');
  if (compact && !fullName.includes(' ')) {
    return { first: compact.slice(0, Math.max(1, Math.floor(compact.length / 2))), last: compact.slice(Math.max(1, Math.floor(compact.length / 2))) || compact };
  }

  const parts = fullName.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  return {
    first: parts[0] || compact || 'Alex',
    last: parts.slice(1).join(' ') || 'Walker',
  };
}

function createOutlookEmail(address: AddressProfile): string {
  const base = (address.identity.username || address.fullName || 'outlookuser')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 18) || 'outlookuser';
  const suffix = (address.id + address.fetchedAt).replace(/\D/g, '').slice(-6) || String(Date.now()).slice(-6);
  return `${base}${suffix}@outlook.com`;
}

function isPaypalSignupPage(): boolean {
  return isPaypalRegistrationEntryPage();
}

function isPaypalRegistrationEntryPage(): boolean {
  return location.hostname.endsWith('paypal.com') && (
    location.pathname.startsWith('/checkoutweb/signup') ||
    location.pathname === '/pay' ||
    location.pathname === '/pay/'
  );
}

function getPaypalHostedStage(): PaypalHostedStage {
  return detectPaypalHostedStage({
    isPaypalHost: location.hostname.endsWith('paypal.com'),
    pathname: location.pathname,
    hasVerificationInputs: findPaypalVerificationSplitInputs().length >= 6 || Boolean(findPaypalVerificationSingleInput()),
    hasSignupFields: isPaypalSignupFormPage(),
    hasReviewConsent: Boolean(findPaypalReviewConsentButton()),
    hasApprovalButton: Boolean(findPaypalCompletionButton()),
    hasEmailInput: Boolean(findTextControl(PAYPAL_FIELDS.email)),
  });
}

function paypalHostedStageMessage(stage: PaypalHostedStage): string {
  if (stage === 'login') {
    return 'PayPal 当前在邮箱入口页';
  }
  if (stage === 'signup') {
    return 'PayPal 当前在注册表单页';
  }
  if (stage === 'verification') {
    return 'PayPal 当前在验证码页';
  }
  if (stage === 'review') {
    return 'PayPal 当前在账单确认页';
  }
  if (stage === 'approval') {
    return 'PayPal 当前在授权确认页';
  }
  if (stage === 'outside_paypal') {
    return 'PayPal 已跳转离开，等待订阅结果同步';
  }
  return 'PayPal 当前页面阶段暂未识别';
}

function ensurePaypalCountryInUrl(countryCode: string): boolean {
  const normalizedCountry = String(countryCode || '').trim().toUpperCase();
  if (normalizedCountry !== 'US' || !location.hostname.endsWith('paypal.com')) {
    return false;
  }

  const url = new URL(location.href);
  if (url.searchParams.get('country.x') === normalizedCountry) {
    return false;
  }

  url.searchParams.set('country.x', normalizedCountry);
  location.assign(url.toString());
  return true;
}

function isIgnoredInput(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  if (input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement) {
    return false;
  }
  return ['hidden', 'radio', 'checkbox', 'submit', 'button'].includes((input.type || '').toLowerCase());
}

function isLikelyEmailPhoneOrCard(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  const text = normalizedText([
    input.id,
    input.name,
    'placeholder' in input ? input.placeholder : '',
    'autocomplete' in input ? input.autocomplete : '',
    input.getAttribute('aria-label'),
    labelledText(input),
  ].join(' '));
  return [
    'email',
    'phone',
    'mobile',
    'card',
    'credit',
    'expiry',
    'expiration',
    'cvv',
    'csc',
    'security code',
  ].some((needle) => text.includes(needle));
}

function isVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  if ('disabled' in htmlElement && Boolean((htmlElement as HTMLInputElement).disabled)) {
    return false;
  }
  const style = window.getComputedStyle(htmlElement);
  const rect = htmlElement.getBoundingClientRect();
  return style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    rect.width > 0 &&
    rect.height > 0;
}

function isTextControl(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return Boolean(element && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement));
}

function isSelectControl(element: Element | null): element is HTMLSelectElement {
  return Boolean(element && element instanceof HTMLSelectElement);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizedText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isRandomAddressResponse(value: unknown): value is RandomAddressResponse {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as RandomAddressResponse).ok === 'boolean' &&
      typeof (value as RandomAddressResponse).message === 'string',
  );
}

const PAYPAL_FIELDS = {
  country: [
    'select#country',
    'select[name="country"]',
    'select[name="country.x"]',
    'country',
    'country or region',
  ],
  email: [
    'input#email',
    'input[name="email"]',
    'input[type="email"]',
    'input[autocomplete="email"]',
    'email',
  ],
  password: [
    'input#password',
    'input[name="password"]',
    'input[type="password"]',
    'input[autocomplete="new-password"]',
    'create password',
    'password',
  ],
  phone: [
    'input#phone',
    'input#phoneNumber',
    'input[name="phone"]',
    'input[name="phoneNumber"]',
    'input[type="tel"]',
    'phone number',
    'mobile',
  ],
  cardNumber: [
    'input#cardNumber',
    'input#card_number',
    'input[name="cardNumber"]',
    'input[name="card_number"]',
    'input[autocomplete="cc-number"]',
    'card number',
    'credit card number',
  ],
  expiry: [
    'input#expiryDate',
    'input#expirationDate',
    'input#cardExpiry',
    'input[name="expiryDate"]',
    'input[name="expirationDate"]',
    'input[name="cardExpiry"]',
    'input[autocomplete="cc-exp"]',
    'expiration',
    'expiry',
    '有效期限',
  ],
  expiryMonth: [
    'select#expMonth',
    'select#expiryMonth',
    'select[name="expMonth"]',
    'select[name="expiryMonth"]',
    'expiration month',
    'expiry month',
  ],
  expiryYear: [
    'select#expYear',
    'select#expiryYear',
    'select[name="expYear"]',
    'select[name="expiryYear"]',
    'expiration year',
    'expiry year',
  ],
  csc: [
    'input#cvv',
    'input#csc',
    'input#securityCode',
    'input[name="cvv"]',
    'input[name="csc"]',
    'input[name="securityCode"]',
    'input[autocomplete="cc-csc"]',
    'csc',
    'cvv',
    'security code',
  ],
  fullName: [
    'input#cardholderName',
    'input#nameOnCard',
    'input#fullName',
    'input[name="cardholderName"]',
    'input[name="nameOnCard"]',
    'input[name="fullName"]',
    'input[autocomplete="cc-name"]',
    'name on card',
    'full name',
  ],
  firstName: [
    'input#firstName',
    'input#billingFirstName',
    'input[name="firstName"]',
    'input[name="billingFirstName"]',
    'input[autocomplete="given-name"]',
    'first name',
  ],
  lastName: [
    'input#lastName',
    'input#billingLastName',
    'input[name="lastName"]',
    'input[name="billingLastName"]',
    'input[autocomplete="family-name"]',
    'last name',
  ],
  address1: [
    'input#address1',
    'input#addressLine1',
    'input#billingAddressLine1',
    'input#billingLine1',
    'input[name="address1"]',
    'input[name="addressLine1"]',
    'input[name="billingLine1"]',
    'input[autocomplete="address-line1"]',
    'address line 1',
    'street address',
  ],
  address2: [
    'input#address2',
    'input#addressLine2',
    'input#billingAddressLine2',
    'input#billingLine2',
    'input[name="address2"]',
    'input[name="addressLine2"]',
    'input[name="billingLine2"]',
    'input[autocomplete="address-line2"]',
    'address line 2',
  ],
  city: [
    'input#city',
    'input#billingLocality',
    'input#billingCity',
    'input[name="city"]',
    'input[name="billingCity"]',
    'input[autocomplete="address-level2"]',
    'city',
  ],
  state: [
    'select#state',
    'input#state',
    'select#billingAdministrativeArea',
    'input#billingAdministrativeArea',
    'select#billingState',
    'input#billingState',
    'select[name="state"]',
    'input[name="state"]',
    'select[name="billingState"]',
    'input[name="billingState"]',
    'select[autocomplete="address-level1"]',
    'input[autocomplete="address-level1"]',
    'state',
    'province',
  ],
  postalCode: [
    'input#zip',
    'input#postalCode',
    'input#billingPostalCode',
    'input#billingZip',
    'input[name="zip"]',
    'input[name="postalCode"]',
    'input[name="billingPostalCode"]',
    'input[name="billingZip"]',
    'input[autocomplete="postal-code"]',
    'zip code',
    'postal code',
  ],
};
