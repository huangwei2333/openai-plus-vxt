import test from 'node:test';
import assert from 'node:assert/strict';

import { createCheckoutLink } from '../.tmp-test/src/features/link-extractor/checkout.js';

const ACCESS_TOKEN = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0In0.signature';
const HOSTED_CHECKOUT_URL = 'https://pay.openai.com/c/pay/cs_live_test_123';

test('hosted checkout keeps the generated long-link API flow', async () => {
  const originalFetch = globalThis.fetch;
  let requestedPayload = null;
  globalThis.fetch = async (_url, init) => {
    requestedPayload = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      checkout_session_id: 'cs_live_test_123',
      url: HOSTED_CHECKOUT_URL,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const response = await createCheckoutLink(ACCESS_TOKEN, {
      planName: 'chatgptplusplan',
      uiMode: 'hosted',
      region: 'US',
    });

    assert.equal(requestedPayload.checkout_ui_mode, 'hosted');
    assert.equal(requestedPayload.plan_name, 'chatgptplusplan');
    assert.equal(response.ok, true);
    assert.equal(response.link, HOSTED_CHECKOUT_URL);
    assert.equal(response.url, HOSTED_CHECKOUT_URL);
    assert.equal(response.longUrl, HOSTED_CHECKOUT_URL);
    assert.equal(response.uiMode, 'hosted');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
