param(
  [ValidateSet("Chrome", "Edge", "Both")]
  [string]$Browser = "Chrome"
)

$ErrorActionPreference = "Stop"

$HostName = "com.openai_plus_vxt.local_store"
$targets = @()
if ($Browser -eq "Chrome" -or $Browser -eq "Both") {
  $targets += "HKCU\Software\Google\Chrome\NativeMessagingHosts\$HostName"
}
if ($Browser -eq "Edge" -or $Browser -eq "Both") {
  $targets += "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
}

foreach ($target in $targets) {
  & reg delete $target /f 2>$null | Out-Null
}

Write-Host "Uninstalled native host '$HostName' for $Browser."
