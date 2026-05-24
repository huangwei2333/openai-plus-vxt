export function setInputValueForReact(input: HTMLInputElement, value: string): void {
  const nextValue = String(value || '');
  input.focus();
  input.setAttribute('value', nextValue);
  setNativeValue(input, nextValue);
  dispatchBeforeInput(input, nextValue);
  dispatchInputEvents(input);
}

export function getInputValue(input: HTMLInputElement | null | undefined): string {
  return String(input?.value || '').trim();
}

export async function waitForInputValue(
  resolveInput: () => HTMLInputElement | null,
  expectedValue: string,
  timeoutMs: number,
): Promise<HTMLInputElement | null> {
  return waitForStableInputValue(resolveInput, expectedValue, timeoutMs, 120);
}

export async function waitForStableInputValue(
  resolveInput: () => HTMLInputElement | null,
  expectedValue: string,
  timeoutMs: number,
  stableMs: number,
): Promise<HTMLInputElement | null> {
  const expected = String(expectedValue || '').trim();
  const startedAt = Date.now();
  let matchedInput: HTMLInputElement | null = null;
  let matchedAt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const input = resolveInput();
    if (getInputValue(input) === expected) {
      if (input !== matchedInput) {
        matchedInput = input;
        matchedAt = Date.now();
      }
      if (Date.now() - matchedAt >= stableMs) {
        return input;
      }
    } else {
      matchedInput = null;
      matchedAt = 0;
    }
    await delay(50);
  }

  const input = resolveInput();
  return input && input === matchedInput && getInputValue(input) === expected ? input : null;
}

export async function setInputValueWithFallback(
  resolveInput: () => HTMLInputElement | null,
  value: string,
): Promise<HTMLInputElement | null> {
  const expected = String(value || '').trim();
  let input = resolveInput();
  if (!input || !expected) {
    return null;
  }

  setInputValueForReact(input, expected);
  input = await waitForInputValue(resolveInput, expected, 700);
  if (input) {
    return input;
  }

  input = resolveInput();
  if (!input) {
    return null;
  }

  setNativeValue(input, '');
  dispatchInputEvents(input);
  let current = '';
  input.focus();
  for (const char of expected) {
    current += char;
    setNativeValue(input, current);
    dispatchBeforeInput(input, char);
    dispatchInputEvents(input);
    await delay(8);
  }

  return waitForInputValue(resolveInput, expected, 1_200);
}

function setNativeValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
}

function dispatchBeforeInput(input: HTMLInputElement, value: string): void {
  if (typeof InputEvent === 'function') {
    input.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: value,
      inputType: 'insertText',
    }));
  }
}

function dispatchInputEvents(input: HTMLInputElement): void {
  if (typeof InputEvent === 'function') {
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: input.value,
      inputType: 'insertText',
    }));
  } else {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
