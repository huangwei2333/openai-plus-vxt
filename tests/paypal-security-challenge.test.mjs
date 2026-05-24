import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectPaypalSecurityChallenge,
  observePaypalChallengeArtifacts,
  removePaypalChallengeArtifacts,
} from '../.tmp-test/src/features/address-autofill/paypal-security-challenge.js';

function installPaypalDocument({ text = '', selectors = [] } = {}) {
  globalThis.location = {
    hostname: 'www.paypal.com',
    pathname: '/checkoutweb/signup',
  };
  const selectorSet = new Set(selectors);
  const document = {
    body: {
      innerText: text,
      textContent: text,
    },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: (selector) => {
      const requested = String(selector || '').split(',').map((item) => item.trim());
      if (requested.some((item) => selectorSet.has(item))) {
        return [{}];
      }
      return [];
    },
  };
  globalThis.document = document;
  return document;
}

test('paypal security challenge detector ignores generic challenge text', () => {
  const document = installPaypalDocument({ text: 'Security Challenge Verify you are human' });

  assert.equal(detectPaypalSecurityChallenge(document), false);
});

test('paypal security challenge detector ignores generic captcha iframe artifacts', () => {
  const document = installPaypalDocument({ selectors: ['iframe'] });

  assert.equal(detectPaypalSecurityChallenge(document), false);
});

test('paypal security challenge detector recognizes hosted captcha overlay artifacts', () => {
  const document = installPaypalDocument({ selectors: ['#captcha-standalone'] });

  assert.equal(detectPaypalSecurityChallenge(document), true);
});

test('paypal challenge artifact cleaner removes existing appChallengeNS nodes', () => {
  let removed = 0;
  const document = {
    querySelectorAll: (selector) => selector === '.appChallengeNS'
      ? [{ remove: () => { removed += 1; } }, { remove: () => { removed += 1; } }]
      : [],
  };

  assert.equal(removePaypalChallengeArtifacts(document), 2);
  assert.equal(removed, 2);
});

test('paypal challenge artifact observer removes future appChallengeNS nodes', () => {
  let callback;
  let observed = false;
  const document = {
    documentElement: {},
    querySelectorAll: () => [],
  };
  class FakeMutationObserver {
    constructor(listener) {
      callback = listener;
    }

    observe(target, options) {
      observed = target === document.documentElement && options.childList === true && options.subtree === true;
    }

    disconnect() {}
  }

  let removed = 0;
  const addedNode = {
    nodeType: 1,
    matches: (selector) => selector === '.appChallengeNS',
    querySelectorAll: () => [],
    remove: () => { removed += 1; },
  };

  const observer = observePaypalChallengeArtifacts(document, FakeMutationObserver);
  callback([{ addedNodes: [addedNode] }]);

  assert.ok(observer);
  assert.equal(observed, true);
  assert.equal(removed, 1);
});
