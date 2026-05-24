import test from 'node:test';
import assert from 'node:assert/strict';

import { getInputValue, setInputValueWithFallback } from '../.tmp-test/src/features/register/dom-input.js';

class FakeInput {
  constructor() {
    this._value = '';
    this.events = [];
    this.attributes = {};
    this.focused = false;
  }

  get value() {
    return this._value;
  }

  set value(nextValue) {
    this._value = String(nextValue || '');
  }

  focus() {
    this.focused = true;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value || '');
  }

  dispatchEvent(event) {
    this.events.push(event.type);
    return true;
  }
}

test('setInputValueWithFallback writes email and dispatches form events before submit can continue', async () => {
  const previousWindow = globalThis.window;
  const previousHtmlInput = globalThis.HTMLInputElement;
  const previousInputEvent = globalThis.InputEvent;

  globalThis.window = { setTimeout };
  globalThis.HTMLInputElement = FakeInput;
  globalThis.InputEvent = class FakeInputEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.data = init.data;
      this.inputType = init.inputType;
    }
  };

  try {
    const input = new FakeInput();
    const result = await setInputValueWithFallback(() => input, 'demo+pay@gmail.com');

    assert.equal(result, input);
    assert.equal(getInputValue(input), 'demo+pay@gmail.com');
    assert.equal(input.focused, true);
    assert.equal(input.attributes.value, 'demo+pay@gmail.com');
    assert.ok(input.events.includes('beforeinput'));
    assert.ok(input.events.includes('input'));
    assert.ok(input.events.includes('change'));
  } finally {
    globalThis.window = previousWindow;
    globalThis.HTMLInputElement = previousHtmlInput;
    globalThis.InputEvent = previousInputEvent;
  }
});

test('setInputValueWithFallback retries when a controlled auth field clears the first full-value write', async () => {
  const previousWindow = globalThis.window;
  const previousHtmlInput = globalThis.HTMLInputElement;
  const previousInputEvent = globalThis.InputEvent;

  globalThis.window = { setTimeout };
  globalThis.HTMLInputElement = FakeInput;
  globalThis.InputEvent = class FakeInputEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.data = init.data;
      this.inputType = init.inputType;
    }
  };

  try {
    const input = new FakeInput();
    let lastBeforeInputData = '';

    input.dispatchEvent = (event) => {
      input.events.push(event.type);
      if (event.type === 'beforeinput') {
        lastBeforeInputData = String(event.data || '');
      }
      if (event.type === 'input' && lastBeforeInputData.length > 1) {
        setTimeout(() => {
          input.value = '';
        }, 20);
      }
      return true;
    };

    const result = await setInputValueWithFallback(() => input, 'demo+pay@gmail.com');

    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(result, input);
    assert.equal(getInputValue(input), 'demo+pay@gmail.com');
  } finally {
    globalThis.window = previousWindow;
    globalThis.HTMLInputElement = previousHtmlInput;
    globalThis.InputEvent = previousInputEvent;
  }
});
