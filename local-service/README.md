# openai-plus-vxt Local Account Service

This service stores shared extension data on the local machine so multiple Chrome Profiles can see the same account, register email, and SMS relay records.

## Start

```bash
pnpm local:accounts
```

Default URL:

```text
http://127.0.0.1:8788
```

Default data directory:

```text
~/.openai-plus-vxt
```

## Environment

- `OPX_LOCAL_STORE_PORT`: override port.
- `OPX_LOCAL_STORE_DIR`: override store directory.

The service only binds to `127.0.0.1` and only reads/writes its own store directory.

## Auto Start From The Extension

Chrome extensions cannot directly start local processes. For automatic startup,
register the Native Messaging Host:

```powershell
pnpm native:install -- -ExtensionId <chrome-extension-id>
```

`pnpm build` also writes a convenience script into `.output/chrome-mv3`:

```powershell
cd .output/chrome-mv3
powershell -NoProfile -ExecutionPolicy Bypass -File .\register-native-host.ps1 -ExtensionId <chrome-extension-id>
```

You can also run `register-native-host.cmd` from `.output/chrome-mv3`. If no
extension ID is passed, it prompts for the ID shown in `chrome://extensions`.

After registration, the extension will try to start this service automatically
when it opens or reads shared account data. A service started this way exits
after 10 minutes without requests.
