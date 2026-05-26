param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId,

  [ValidateSet("Chrome", "Edge", "Both")]
  [string]$Browser = "Chrome"
)

$ErrorActionPreference = "Stop"

$HostName = "com.openai_plus_vxt.local_store"
$SourceHostDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceRoot = Split-Path -Parent $SourceHostDir
$SourceServiceDir = Join-Path $SourceRoot "local-service"
$StoreRoot = if ($env:OPX_LOCAL_STORE_DIR) { $env:OPX_LOCAL_STORE_DIR } else { Join-Path $env:USERPROFILE ".openai-plus-vxt" }
$InstallRoot = Join-Path $StoreRoot "native-host-install"
$HostDir = Join-Path $InstallRoot "native-host"
$ServiceDir = Join-Path $InstallRoot "local-service"
$HostSourcePath = Join-Path $HostDir "opx-native-host.cs"
$HostPath = Join-Path $HostDir "opx-native-host.exe"
$NodePathFile = Join-Path $HostDir "opx-native-host.node-path.txt"
$ManifestPath = Join-Path $HostDir "$HostName.json"

if (-not (Test-Path -LiteralPath (Join-Path $SourceHostDir "opx-native-host.cs"))) {
  throw "Native host source not found: $SourceHostDir"
}
if (-not (Test-Path -LiteralPath (Join-Path $SourceHostDir "launcher.mjs"))) {
  throw "Native host launcher not found: $SourceHostDir"
}
if (-not (Test-Path -LiteralPath (Join-Path $SourceServiceDir "server.mjs"))) {
  throw "Local service source not found: $SourceServiceDir"
}

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCommand) {
  throw "Node.js was not found in PATH. Install Node.js or add it to PATH before installing the native host."
}

New-Item -ItemType Directory -Force -Path $HostDir | Out-Null
New-Item -ItemType Directory -Force -Path $ServiceDir | Out-Null

Copy-Item -Path (Join-Path $SourceHostDir "*") -Destination $HostDir -Recurse -Force -Exclude @(
  "opx-native-host.exe",
  "opx-native-host.node-path.txt",
  "$HostName.json"
)
Copy-Item -Path (Join-Path $SourceServiceDir "*") -Destination $ServiceDir -Recurse -Force

Set-Content -LiteralPath $NodePathFile -Value $NodeCommand.Source -Encoding ASCII

Remove-Item -LiteralPath $HostPath -ErrorAction SilentlyContinue

Add-Type `
  -TypeDefinition (Get-Content -LiteralPath $HostSourcePath -Raw) `
  -Language CSharp `
  -OutputAssembly $HostPath `
  -OutputType ConsoleApplication

$manifest = [ordered]@{
  name = $HostName
  description = "openai-plus-vxt local account service launcher"
  path = $HostPath
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestPath -Encoding ASCII

$targets = @()
if ($Browser -eq "Chrome" -or $Browser -eq "Both") {
  $targets += "HKCU\Software\Google\Chrome\NativeMessagingHosts\$HostName"
}
if ($Browser -eq "Edge" -or $Browser -eq "Both") {
  $targets += "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
}

foreach ($target in $targets) {
  & reg add $target /ve /t REG_SZ /d $ManifestPath /f | Out-Null
}

Write-Host "Installed native host '$HostName' for $Browser."
Write-Host "Manifest: $ManifestPath"
