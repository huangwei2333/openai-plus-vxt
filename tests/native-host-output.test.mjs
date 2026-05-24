import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { prepareNativeHostOutput } from '../scripts/prepare-native-host-output.mjs';

test('writes native host registration assets into the extension output directory', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'opx-output-'));
  try {
    await prepareNativeHostOutput({ outputDir });

    await assertFile(join(outputDir, 'register-native-host.ps1'));
    await assertFile(join(outputDir, 'register-native-host.cmd'));
    await assertFile(join(outputDir, 'native-host', 'install-native-host.ps1'));
    await assertFile(join(outputDir, 'native-host', 'launcher.mjs'));
    await assertFile(join(outputDir, 'native-host', 'opx-native-host.cs'));
    await assertFile(join(outputDir, 'local-service', 'server.mjs'));

    const registerScript = await readFile(join(outputDir, 'register-native-host.ps1'), 'utf8');
    assert.match(registerScript, /ExtensionId/);
    assert.match(registerScript, /native-host[\\/]install-native-host\.ps1/);
    assert.doesNotMatch(registerScript, /[^\x00-\x7F]/);

    const cmdScript = await readFile(join(outputDir, 'register-native-host.cmd'), 'utf8');
    assert.match(cmdScript, /register-native-host\.ps1/);
    assert.match(cmdScript, /ExecutionPolicy Bypass/);
    assert.doesNotMatch(cmdScript, /[^\x00-\x7F]/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

async function assertFile(path) {
  const item = await stat(path);
  assert.equal(item.isFile(), true, `${path} should be a file`);
}
