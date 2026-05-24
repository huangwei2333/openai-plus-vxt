export interface StableElementWaitOptions {
  timeoutMs: number;
  pollMs?: number;
  stableMs?: number;
}

export async function waitForDocumentLoadComplete(timeoutMs: number): Promise<boolean> {
  if (document.readyState === 'complete') {
    return true;
  }

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve(document.readyState === 'complete');
    }, timeoutMs);

    const onLoad = () => {
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('load', onLoad);
    };

    window.addEventListener('load', onLoad, { once: true });
  });
}

export async function waitForStableElement<T extends Element>(
  resolveElement: () => T | null,
  options: StableElementWaitOptions,
): Promise<T | null> {
  const timeoutMs = options.timeoutMs;
  const pollMs = options.pollMs ?? 100;
  const stableMs = options.stableMs ?? 300;
  const startedAt = Date.now();
  let candidate: T | null = null;
  let candidateSince = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const element = resolveElement();
    if (element && element.isConnected !== false) {
      if (element !== candidate) {
        candidate = element;
        candidateSince = Date.now();
      }
      if (Date.now() - candidateSince >= stableMs) {
        return element;
      }
    } else {
      candidate = null;
      candidateSince = 0;
    }
    await delay(pollMs);
  }

  const element = resolveElement();
  return element && element === candidate && element.isConnected !== false ? element : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
