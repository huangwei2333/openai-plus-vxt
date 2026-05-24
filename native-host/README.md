# Native Host

The extension can start the local account service through Chrome Native Messaging.

## Install

1. Open `chrome://extensions`.
2. Enable developer mode.
3. Copy the extension ID for the loaded `openai-plus-vxt` extension.
4. Register the native host. The installer records the current `node.exe` path, compiles `opx-native-host.cs` to a small local `opx-native-host.exe`, and writes the Chrome Native Messaging registry entry.

From the source repo:

```powershell
pnpm native:install -- -ExtensionId <chrome-extension-id>
```

From `.output/chrome-mv3` after `pnpm build`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\register-native-host.ps1 -ExtensionId <chrome-extension-id>
```

Or double-click / run:

```bat
register-native-host.cmd
```

If no extension ID is passed, the script prompts for the extension ID shown in `chrome://extensions`.

For Edge:

```powershell
pnpm native:install -- -ExtensionId <edge-extension-id> -Browser Edge
```

## How It Works

- The extension first tries `http://127.0.0.1:8788/health`.
- If the HTTP service is unavailable, the background service worker sends `ensure-local-store` to `com.openai_plus_vxt.local_store`.
- Chrome starts the generated `opx-native-host.exe`.
- The native host starts `local-service/server.mjs` and returns after `/health` succeeds.
- Services started by the native host exit automatically after 10 minutes without requests.

Manual startup still works:

```powershell
pnpm local:accounts
```

## Uninstall

```powershell
pnpm native:uninstall
```
