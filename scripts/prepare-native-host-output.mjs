import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const DEFAULT_OUTPUT_DIR = resolve(repoRoot, '.output/chrome-mv3');

export async function prepareNativeHostOutput(options = {}) {
  const outputDir = resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  await mkdir(outputDir, { recursive: true });

  await copyDirectory(resolve(repoRoot, 'native-host'), resolve(outputDir, 'native-host'));
  await copyDirectory(resolve(repoRoot, 'local-service'), resolve(outputDir, 'local-service'));
  await writeFile(
    resolve(outputDir, 'register-native-host.ps1'),
    createRegisterScript(),
    'ascii',
  );
  await writeFile(
    resolve(outputDir, 'register-native-host.cmd'),
    createRegisterCmd(),
    'ascii',
  );
}

async function copyDirectory(from, to) {
  await cp(from, to, {
    recursive: true,
    force: true,
    filter: (source) => !shouldSkipGeneratedNativeHostFile(source),
  });
}

function shouldSkipGeneratedNativeHostFile(source) {
  return /(?:^|[\\/])opx-native-host\.exe$/i.test(source) ||
    /(?:^|[\\/])opx-native-host\.node-path\.txt$/i.test(source) ||
    /(?:^|[\\/])com\.openai_plus_vxt\.local_store\.json$/i.test(source);
}

function createRegisterScript() {
  return `param(
  [string]$ExtensionId = "",
  [ValidateSet("Chrome", "Edge", "Both")]
  [string]$Browser = "Chrome"
)

$ErrorActionPreference = "Stop"
$OutputDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Installer = Join-Path $OutputDir "native-host\\install-native-host.ps1"

if (-not $ExtensionId) {
  $ExtensionId = Read-Host "Enter the extension ID shown in chrome://extensions"
}

if (-not $ExtensionId) {
  throw "ExtensionId cannot be empty."
}

& $Installer -ExtensionId $ExtensionId -Browser $Browser
`;
}

function createRegisterCmd() {
  return `@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0register-native-host.ps1" %*
if errorlevel 1 (
  echo.
  echo Native Host registration failed.
  pause
  exit /b %errorlevel%
)
echo.
echo Native Host registration completed.
pause
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareNativeHostOutput();
}
