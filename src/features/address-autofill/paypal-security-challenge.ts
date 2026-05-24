export const PAYPAL_SECURITY_CHALLENGE_CODE = 'paypal-security-challenge';
export const PAYPAL_SECURITY_CHALLENGE_MESSAGE = '检测到 PayPal 人机验证，请手动完成后点击继续。';

const HOSTED_CAPTCHA_ARTIFACT_SELECTOR = [
  '#captcha-standalone',
  '.captcha-overlay',
  '.captcha-container',
].join(',');
const PAYPAL_CHALLENGE_ARTIFACT_SELECTOR = '.appChallengeNS';

export function detectPaypalSecurityChallenge(doc: Document = document): boolean {
  try {
    return doc.querySelectorAll(HOSTED_CAPTCHA_ARTIFACT_SELECTOR).length > 0;
  } catch {
    return false;
  }
}

export function removePaypalChallengeArtifacts(doc: Document = document): number {
  try {
    const nodes = Array.from(doc.querySelectorAll(PAYPAL_CHALLENGE_ARTIFACT_SELECTOR));
    for (const node of nodes) {
      node.remove();
    }
    return nodes.length;
  } catch {
    return 0;
  }
}

export function observePaypalChallengeArtifacts(
  doc: Document = document,
  ObserverCtor: typeof MutationObserver = MutationObserver,
): MutationObserver | null {
  removePaypalChallengeArtifacts(doc);
  const root = doc.documentElement;
  if (!root) {
    return null;
  }
  try {
    const observer = new ObserverCtor((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          removeChallengeArtifactNode(node);
        }
      }
      removePaypalChallengeArtifacts(doc);
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
    });
    return observer;
  } catch {
    return null;
  }
}

function removeChallengeArtifactNode(node: Node): void {
  if (node.nodeType !== 1) {
    return;
  }
  const element = node as Element;
  if (element.matches(PAYPAL_CHALLENGE_ARTIFACT_SELECTOR)) {
    element.remove();
    return;
  }
  for (const child of Array.from(element.querySelectorAll(PAYPAL_CHALLENGE_ARTIFACT_SELECTOR))) {
    child.remove();
  }
}
