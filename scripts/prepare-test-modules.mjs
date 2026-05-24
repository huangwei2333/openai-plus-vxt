import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const outputDir = resolve(repoRoot, '.tmp-test');
const tsconfigPath = resolve(outputDir, 'tsconfig.json');

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await writeFile(tsconfigPath, JSON.stringify({
  extends: '../tsconfig.json',
  compilerOptions: {
    noEmit: false,
    outDir: '.',
    rootDir: '..',
    declaration: false,
    declarationMap: false,
    sourceMap: false,
  },
  include: [
    '../.wxt/wxt.d.ts',
    '../src/**/*.ts',
    '../entrypoints/**/*.ts',
  ],
}, null, 2), 'utf8');

await run(resolve(repoRoot, 'node_modules/typescript/bin/tsc'), ['-p', tsconfigPath]);

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [command, ...args], {
      cwd: repoRoot,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(new Error(`Command failed with exit code ${code}: ${command}`));
    });
  });
}
