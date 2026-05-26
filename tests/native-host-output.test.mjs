import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { prepareNativeHostOutput } from '../scripts/prepare-native-host-output.mjs';

test('writes native host registration assets into the extension output directory', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'opx-output-'));
  try {
    await mkdir(join(outputDir, 'native-host'), { recursive: true });
    await mkdir(join(outputDir, 'local-service'), { recursive: true });
    await writeFile(join(outputDir, 'native-host', 'stale.txt'), 'stale', 'utf8');
    await writeFile(join(outputDir, 'local-service', 'stale.txt'), 'stale', 'utf8');

    await prepareNativeHostOutput({ outputDir });

    await assertFile(join(outputDir, 'register-native-host.ps1'));
    await assertFile(join(outputDir, 'register-native-host.cmd'));
    await assertMissing(join(outputDir, 'native-host'));
    await assertMissing(join(outputDir, 'local-service'));

    const registerScript = await readFile(join(outputDir, 'register-native-host.ps1'), 'utf8');
    assert.match(registerScript, /ExtensionId/);
    assert.match(registerScript, /SourceRoot/);
    assert.match(registerScript, /native-host[\\/]install-native-host\.ps1/);
    assert.doesNotMatch(registerScript, /LOCALAPPDATA/);
    assert.doesNotMatch(registerScript, /[^\x00-\x7F]/);

    const cmdScript = await readFile(join(outputDir, 'register-native-host.cmd'), 'utf8');
    assert.match(cmdScript, /register-native-host\.ps1/);
    assert.match(cmdScript, /ExecutionPolicy Bypass/);
    assert.doesNotMatch(cmdScript, /[^\x00-\x7F]/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('installs native host under the local store directory', async () => {
  const script = await readFile(join(process.cwd(), 'native-host', 'install-native-host.ps1'), 'utf8');
  assert.match(script, /OPX_LOCAL_STORE_DIR/);
  assert.match(script, /USERPROFILE/);
  assert.match(script, /\.openai-plus-vxt/);
  assert.match(script, /native-host-install/);
  assert.doesNotMatch(script, /LOCALAPPDATA/);
});

async function assertFile(path) {
  const item = await stat(path);
  assert.equal(item.isFile(), true, `${path} should be a file`);
}

async function assertMissing(path) {
  await assert.rejects(
    () => stat(path),
    { code: 'ENOENT' },
    `${path} should not be written into the extension output directory`,
  );
}
