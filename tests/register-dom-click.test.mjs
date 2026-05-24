import test from 'node:test';
import assert from 'node:assert/strict';

import { submitFormControl } from '../.tmp-test/src/features/register/dom-click.js';

test('submitFormControl prefers form.requestSubmit for submit buttons', () => {
  let submittedWith = null;
  let clicked = false;
  const button = {
    form: {
      requestSubmit(submitter) {
        submittedWith = submitter;
      },
    },
    click() {
      clicked = true;
    },
    dispatchEvent() {
      return true;
    },
  };

  submitFormControl(button);

  assert.equal(submittedWith, button);
  assert.equal(clicked, false);
});

test('submitFormControl dispatches pointer and mouse events before click fallback', () => {
  const events = [];
  let clicked = false;
  const previousPointerEvent = globalThis.PointerEvent;
  const previousMouseEvent = globalThis.MouseEvent;

  globalThis.PointerEvent = class FakePointerEvent extends Event {};
  globalThis.MouseEvent = class FakeMouseEvent extends Event {};

  const button = {
    form: null,
    scrollIntoView() {},
    getBoundingClientRect() {
      return { left: 10, top: 20, width: 30, height: 40 };
    },
    dispatchEvent(event) {
      events.push(event.type);
      return true;
    },
    click() {
      clicked = true;
    },
  };

  try {
    submitFormControl(button);
  } finally {
    globalThis.PointerEvent = previousPointerEvent;
    globalThis.MouseEvent = previousMouseEvent;
  }

  assert.deepEqual(events, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
  assert.equal(clicked, true);
});
