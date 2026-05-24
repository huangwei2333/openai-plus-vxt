import { waitForDocumentLoadComplete } from '../../app/page-ready.js';
import { loadAddressAutofillSettings, saveAddressAutofillSettings } from '../settings/state';
import type { AddressAutofillSettings } from '../settings/types';
import type { AddressProfile, RandomAddressResponse } from './types';

const LOG_PREFIX = '[OPX Pay Autofill]';
const PAYPAL_ACCORDION_BUTTON_SELECTOR = 'button[data-testid="paypal-accordion-item-button"]';
const HOSTED_PAYMENT_SUBMIT_BUTTON_SELECTOR = 'button[data-testid="hosted-payment-submit-button"]';

let initialized = false;
let running = false;
let scheduledTimer: number | null = null;
let pageAddress: AddressProfile | null = null;
let pageAddressScope = '';

export function initPayOpenAiAddressAutofill(): void {
  if (initialized || location.hostname !== 'pay.openai.com') {
    return;
  }

  initialized = true;
  installStorageListener();
  installObserver();
  scheduleAutofill(800);
}

async function runAutofill(): Promise<void> {
  if (running) {
    return;
  }

  running = true;
  try {
    const settings = await loadAddressAutofillSettings();
    if (!settings.payOpenAiEnabled) {
      console.info(`${LOG_PREFIX} disabled`);
      return;
    }

    const address = await getPageAddress(settings);
    if (!address) {
      console.info(`${LOG_PREFIX} no address available`);
      return;
    }

    const result = await fillPayOpenAiAddressNow(address);
    console.info(`${LOG_PREFIX} ${result.message}`, {
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.countryCode,
      source: address.source,
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} failed`, error);
  } finally {
    running = false;
  }
}

export async function fillPayOpenAiAddressNow(address: AddressProfile): Promise<{ ok: boolean; filled: number; message: string }> {
  if (location.hostname !== 'pay.openai.com') {
    return { ok: false, filled: 0, message: '当前不是 pay.openai.com 页面' };
  }

  const loaded = await waitForDocumentLoadComplete(15_000);
  if (!loaded) {
    return { ok: false, filled: 0, message: '页面仍在加载中，已停止自动填写 OpenAI Pay，请稍后重试' };
  }

  const paypalSelected = await selectPaypalIfPresent();
  if (!paypalSelected) {
    return { ok: false, filled: 0, message: '未选中 PayPal 支付方式，请确认 PayPal 单选框是否可见并可点击' };
  }

  const filled = await fillCheckoutFields(address);
  const billingReady = hasFilledBillingAddress(address);
  if (!billingReady) {
    return { ok: false, filled, message: filled > 0 ? '已尝试填写账单地址，但页面仍未显示完整账单地址' : '未找到可填写的 OpenAI 支付账单地址字段' };
  }

  const subscribed = await clickSubscribeIfReady();
  return {
    ok: subscribed,
    filled,
    message: subscribed
      ? `已填写 OpenAI 支付页 ${filled} 项，并已点击订阅`
      : 'PayPal 支付方式和账单地址已就绪，但“订阅”按钮不可点击',
  };
}

async function getPageAddress(settings: AddressAutofillSettings): Promise<AddressProfile | null> {
  const scope = `${settings.countryCode}|${settings.city}`;
  if (pageAddress && pageAddressScope === scope) {
    return pageAddress;
  }

  pageAddress = await fetchAndStoreAddress(settings);
  pageAddressScope = scope;
  return pageAddress;
}

async function fetchAndStoreAddress(settings: AddressAutofillSettings): Promise<AddressProfile | null> {
  const response = await browser.runtime.sendMessage({
    type: 'opx:fetch-random-address',
    countryCode: settings.countryCode,
    city: settings.city,
  });

  if (!isRandomAddressResponse(response) || !response.ok || !response.address) {
    console.warn(`${LOG_PREFIX} address fetch failed`, response);
    return null;
  }

  await saveAddressAutofillSettings({ lastAddress: response.address });
  return response.address;
}

async function fillCheckoutFields(address: AddressProfile): Promise<number> {
  let filled = 0;

  filled += fillInput('#billingName', address.fullName, true);
  filled += fillSelect('#billingCountry', address.countryCode, [address.countryLabel, address.countryCode]);

  if (document.querySelector('#billingCountry')) {
    await delay(550);
  }

  filled += fillInput('#billingAddressLine1', address.line1, true);
  filled += fillInput('#billingAddressLine2', address.line2, true);
  filled += fillInput('#billingLocality', address.city, true);
  filled += fillSelectOrInput('#billingAdministrativeArea', address.state, [address.stateFull, address.state]);
  filled += fillInput('#billingPostalCode', address.postalCode, true);
  filled += fillInput('#phoneNumber', address.phone, false);

  filled += fillByAutocomplete('billing address-line1', address.line1);
  filled += fillByAutocomplete('billing address-line2', address.line2);
  filled += fillByAutocomplete('billing address-level2', address.city);
  filled += fillByAutocomplete('billing postal-code', address.postalCode);
  filled += fillSelectOrInputByAutocomplete('billing address-level1', address.state, [address.stateFull, address.state]);
  filled += fillSelectByAutocomplete('billing country', address.countryCode, [address.countryLabel, address.countryCode]);
  filled += checkVisibleTermsCheckboxes();

  return filled;
}

function hasFilledBillingAddress(address: AddressProfile): boolean {
  const groups = [
    {
      selectors: ['#billingName', 'input[name="billingName"]', 'input[autocomplete="billing name"]'],
      expected: [address.fullName],
    },
    {
      selectors: ['#billingAddressLine1', 'input[name="billingAddressLine1"]', 'input[autocomplete="billing address-line1"]'],
      expected: [address.line1],
    },
    {
      selectors: ['#billingLocality', 'input[name="billingLocality"]', 'input[autocomplete="billing address-level2"]'],
      expected: [address.city],
    },
    {
      selectors: ['#billingPostalCode', 'input[name="billingPostalCode"]', 'input[autocomplete="billing postal-code"]'],
      expected: [address.postalCode],
    },
  ];

  let visibleGroups = 0;
  let readyGroups = 0;
  for (const group of groups) {
    const element = group.selectors.map(findFirstVisibleControl).find(Boolean);
    if (!element) {
      continue;
    }
    visibleGroups += 1;
    if (controlHasValue(element, group.expected)) {
      readyGroups += 1;
    }
  }

  return visibleGroups >= 3 && readyGroups === visibleGroups;
}

async function selectPaypalIfPresent(): Promise<boolean> {
  if (isPaypalPaymentSelected() && hasVisibleBillingAddressFields()) {
    return true;
  }

  const button = findPaypalAccordionButton();
  if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') {
    return false;
  }

  clickElement(button);
  return waitForPaypalBillingAddressFields();
}

function findPaypalAccordionButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(PAYPAL_ACCORDION_BUTTON_SELECTOR);
}

function isPaypalPaymentSelected(): boolean {
  const button = findPaypalAccordionButton();
  return Boolean(button && hasPaymentMethodSelectionMarker(button));
}

async function waitForPaypalBillingAddressFields(timeoutMs = 5_000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (isPaypalPaymentSelected() && hasVisibleBillingAddressFields()) {
      return true;
    }
    await delay(250);
  }
  return false;
}

function hasPaymentMethodSelectionMarker(element: HTMLElement): boolean {
  return element.getAttribute('aria-checked') === 'true' ||
    element.getAttribute('aria-selected') === 'true' ||
    element.getAttribute('aria-pressed') === 'true' ||
    element.getAttribute('aria-expanded') === 'true' ||
    element.getAttribute('data-selected') === 'true' ||
    ['checked', 'open', 'selected', 'active', 'expanded'].includes(normalizedText(element.getAttribute('data-state'))) ||
    /\b(?:is-)?(?:selected|active|checked|expanded|open)\b/i.test(element.className);
}

function hasVisibleBillingAddressFields(): boolean {
  return [
    '#billingAddressLine1',
    '#billingLocality',
    '#billingPostalCode',
    '#billingAdministrativeArea',
  ].some((selector) => {
    const element = document.querySelector(selector);
    return Boolean(element && isVisible(element));
  });
}

async function clickSubscribeIfReady(): Promise<boolean> {
  await delay(450);
  const button = findSubscribeButton();
  if (!button || !isVisible(button) || isBusyOrDisabled(button)) {
    return false;
  }
  clickElement(button);
  return true;
}

function findSubscribeButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>(HOSTED_PAYMENT_SUBMIT_BUTTON_SELECTOR);
}

function isBusyOrDisabled(element: HTMLElement): boolean {
  const button = element as HTMLButtonElement;
  const visibleText = normalizedText(
    Array.from(element.querySelectorAll<HTMLElement>('[aria-hidden="false"], [aria-hidden]:not([aria-hidden="true"])'))
      .filter(isVisible)
      .map((item) => item.innerText || item.textContent || '')
      .join(' ') || element.innerText || element.textContent,
  );
  const stateText = normalizedText([
    element.getAttribute('aria-busy'),
    element.getAttribute('data-loading'),
    element.getAttribute('data-processing'),
    element.getAttribute('data-state'),
  ].join(' '));
  return Boolean(button.disabled) ||
    element.getAttribute('aria-disabled') === 'true' ||
    stateText.includes('processing') ||
    stateText.includes('loading') ||
    visibleText.includes('processing') ||
    visibleText.includes('loading') ||
    visibleText.includes('正在处理') ||
    visibleText.includes('加载');
}

function fillInput(selector: string, value: string, overwrite: boolean): number {
  if (!value) {
    return 0;
  }
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!isTextControl(input) || !isVisible(input) || isSensitivePaymentField(input)) {
    return 0;
  }
  if (!overwrite && input.value.trim()) {
    return 0;
  }
  if (input.value === value) {
    return 0;
  }
  setNativeValue(input, value);
  return 1;
}

function fillByAutocomplete(autocomplete: string, value: string): number {
  const selector = `input[autocomplete="${cssEscape(autocomplete)}"], textarea[autocomplete="${cssEscape(autocomplete)}"]`;
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!isTextControl(input) || !isVisible(input) || input.value === value || isSensitivePaymentField(input)) {
    return 0;
  }
  setNativeValue(input, value);
  return 1;
}

function fillSelect(selector: string, preferredValue: string, preferredLabels: string[]): number {
  const select = document.querySelector<HTMLSelectElement>(selector);
  if (!isSelectControl(select) || !isVisible(select)) {
    return 0;
  }
  return setSelectOption(select, preferredValue, preferredLabels);
}

function fillSelectByAutocomplete(autocomplete: string, preferredValue: string, preferredLabels: string[]): number {
  const select = document.querySelector<HTMLSelectElement>(`select[autocomplete="${cssEscape(autocomplete)}"]`);
  if (!isSelectControl(select) || !isVisible(select)) {
    return 0;
  }
  return setSelectOption(select, preferredValue, preferredLabels);
}

function fillSelectOrInput(selector: string, preferredValue: string, preferredLabels: string[]): number {
  const element = document.querySelector(selector);
  if (isSelectControl(element)) {
    return isVisible(element) ? setSelectOption(element, preferredValue, preferredLabels) : 0;
  }
  if (isTextControl(element)) {
    return fillInput(selector, preferredValue, true);
  }
  return 0;
}

function fillSelectOrInputByAutocomplete(autocomplete: string, preferredValue: string, preferredLabels: string[]): number {
  const select = document.querySelector(`select[autocomplete="${cssEscape(autocomplete)}"]`);
  if (isSelectControl(select)) {
    return isVisible(select) ? setSelectOption(select, preferredValue, preferredLabels) : 0;
  }
  return fillByAutocomplete(autocomplete, preferredValue || preferredLabels[0] || '');
}

function setSelectOption(select: HTMLSelectElement, preferredValue: string, preferredLabels: string[]): number {
  const options = Array.from(select.options).filter((option) => !option.disabled && option.value);
  const normalizedPreferred = normalizedText(preferredValue);
  const labelNeedles = preferredLabels.map((label) => normalizedText(label)).filter(Boolean);
  const option = options.find((item) => normalizedText(item.value) === normalizedPreferred) ||
    options.find((item) => labelNeedles.some((needle) => normalizedText(`${item.text} ${item.value}`).includes(needle)));

  if (!option || select.value === option.value) {
    return 0;
  }

  select.value = option.value;
  emitChange(select);
  return 1;
}

function setNativeValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
  emitChange(input);
}

function checkVisibleTermsCheckboxes(): number {
  let checked = 0;
  const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    .filter(isVisible)
    .filter((checkbox) => !checkbox.checked)
    .filter((checkbox) => {
      const text = normalizedText([
        checkbox.id,
        checkbox.name,
        checkbox.getAttribute('aria-label'),
        checkbox.closest('label')?.textContent,
        checkbox.parentElement?.textContent,
      ].join(' '));
      return text.includes('terms') ||
        text.includes('consent') ||
        text.includes('使用条款') ||
        text.includes('隐私政策') ||
        text.includes('取消') ||
        checkbox.id === 'termsOfServiceConsentCheckbox';
    });

  for (const checkbox of checkboxes) {
    checkbox.click();
    checked += 1;
  }

  return checked;
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

function installObserver(): void {
  const observer = new MutationObserver(() => scheduleAutofill(250));
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function installStorageListener(): void {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (Object.keys(changes).some((key) => key.includes('settings'))) {
      pageAddress = null;
      pageAddressScope = '';
      scheduleAutofill(100);
    }
  });
}

function scheduleAutofill(delayMs: number): void {
  if (scheduledTimer) {
    window.clearTimeout(scheduledTimer);
  }
  scheduledTimer = window.setTimeout(() => {
    scheduledTimer = null;
    void runAutofill();
  }, delayMs);
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

function isSensitivePaymentField(element: Element): boolean {
  const haystack = normalizedText([
    element.getAttribute('aria-label'),
    element.getAttribute('placeholder'),
    element.getAttribute('autocomplete'),
    element.getAttribute('name'),
    element.getAttribute('id'),
  ].join(' '));

  return [
    'cc-number',
    'card number',
    'credit card',
    'security code',
    'cvc',
    'cvv',
    'expiry',
    'expiration',
  ].some((needle) => haystack.includes(needle));
}

function findFirstVisibleControl(selector: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  const element = document.querySelector(selector);
  if ((isTextControl(element) || isSelectControl(element)) && isVisible(element) && !isSensitivePaymentField(element)) {
    return element;
  }
  return null;
}

function controlHasValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, expectedValues: string[]): boolean {
  if (isSelectControl(element)) {
    const selected = element.selectedOptions[0];
    const value = normalizedText(`${element.value} ${selected?.textContent || ''}`);
    return Boolean(value) && expectedValues.some((expected) => value.includes(normalizedText(expected)));
  }

  const value = normalizedText(element.value);
  return Boolean(value);
}

function isRadioInput(element: Element | null): element is HTMLInputElement {
  return Boolean(element && element instanceof HTMLInputElement && element.type === 'radio');
}

function isTextControl(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return Boolean(element && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement));
}

function isSelectControl(element: Element | null): element is HTMLSelectElement {
  return Boolean(element && element instanceof HTMLSelectElement);
}

function normalizedText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
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
