import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const DEFAULT_OUTPUT_DIR = resolve(repoRoot, '.output/chrome-mv3');

export async function prepareNativeHostOutput(options = {}) {
  const outputDir = resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  await mkdir(outputDir, { recursive: true });

  await rm(resolve(outputDir, 'native-host'), { recursive: true, force: true });
  await rm(resolve(outputDir, 'local-service'), { recursive: true, force: true });
  await writeFile(
    resolve(outputDir, 'register-native-host.ps1'),
    createRegisterScript(repoRoot),
    'ascii',
  );
  await writeFile(
    resolve(outputDir, 'register-native-host.cmd'),
    createRegisterCmd(),
    'ascii',
  );
}

function createRegisterScript(sourceRoot) {
  const escapedSourceRoot = sourceRoot.replace(/'/g, "''");
  return `param(
  [string]$ExtensionId = "",
  [ValidateSet("Chrome", "Edge", "Both")]
  [string]$Browser = "Chrome"
)

$ErrorActionPreference = "Stop"
$SourceRoot = '${escapedSourceRoot}'
$Installer = Join-Path $SourceRoot "native-host\\install-native-host.ps1"

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
