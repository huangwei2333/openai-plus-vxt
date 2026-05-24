export function submitFormControl(element: HTMLElement): void {
  const form = getAssociatedForm(element);
  if (form && typeof form.requestSubmit === 'function') {
    try {
      form.requestSubmit(element as HTMLButtonElement);
      return;
    } catch {
      // Some pages reject a non-submit submitter; fall back to a user-like click.
    }
  }

  clickElementLikeUser(element);
}

export function clickElementLikeUser(element: HTMLElement): void {
  element.scrollIntoView?.({ block: 'center', inline: 'center' });
  const rect = typeof element.getBoundingClientRect === 'function'
    ? element.getBoundingClientRect()
    : { left: 0, top: 0, width: 0, height: 0 };
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const events = [
    ['pointerdown', getPointerEventCtor()],
    ['mousedown', getMouseEventCtor()],
    ['pointerup', getPointerEventCtor()],
    ['mouseup', getMouseEventCtor()],
    ['click', getMouseEventCtor()],
  ] as const;

  for (const [type, EventCtor] of events) {
    element.dispatchEvent(new EventCtor(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
      buttons: type.endsWith('down') ? 1 : 0,
    }));
  }
  element.click?.();
}

function getAssociatedForm(element: HTMLElement): HTMLFormElement | null {
  const control = element as HTMLButtonElement | HTMLInputElement;
  return control.form || element.closest?.('form') || null;
}

function getPointerEventCtor(): typeof MouseEvent {
  return typeof PointerEvent === 'function' ? PointerEvent : getMouseEventCtor();
}

function getMouseEventCtor(): typeof MouseEvent {
  return typeof MouseEvent === 'function' ? MouseEvent : Event as typeof MouseEvent;
}
