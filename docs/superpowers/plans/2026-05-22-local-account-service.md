# Local Account Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manually started local HTTP service that stores shared account, register email, and SMS relay data for all Chrome Profiles using the extension.

**Architecture:** The extension keeps UI-only state in `chrome.storage.local` and proxies shared-data operations through `background.ts` to `http://127.0.0.1:8788`. A dependency-free Node service owns `~/.openai-plus-vxt/store.json`, normalizes inputs, backs up before writes, and exposes JSON APIs.

**Tech Stack:** WXT, TypeScript, Chrome extension APIs, Node.js built-in `http`, `fs/promises`, `os`, `path`, `node:test`.

---

## File Map

- Create `local-service/normalize.mjs`: normalize store shape, accounts, register email items, SMS targets, and import formats.
- Create `local-service/store.mjs`: read/write `store.json`, backup old data, provide CRUD helpers.
- Create `local-service/server.mjs`: HTTP routing, JSON parsing, safe responses, loopback service.
- Create `local-service/README.md`: local service startup and API notes.
- Create `tests/local-service-normalize.test.mjs`: red/green tests for import and normalization.
- Create `tests/local-service-store.test.mjs`: red/green tests for persistence and backup.
- Create `src/features/local-store/types.ts`: shared extension-side request/response and data types.
- Create `src/features/local-store/client.ts`: extension background client for the local HTTP service.
- Modify `entrypoints/background.ts`: proxy `opx:local-store-*` messages.
- Modify `src/app/state.ts`: preserve UI state in browser storage, but make shared-data loading mergeable with service data.
- Modify account/register/SMS panels and controllers: read/write shared data through local-store messages when service is available.
- Modify `wxt.config.ts`: add host permission for `http://127.0.0.1:8788/*` and `http://localhost:8788/*`.
- Modify `package.json`: add `local:accounts` and `test:local-service`.

## Task 1: Local Service Normalization

**Files:**
- Create: `local-service/normalize.mjs`
- Create: `tests/local-service-normalize.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests**

Test exported Codex JSON import, duplicate account upsert by `accountId`, SMS URL validation, and default empty store.

- [ ] **Step 2: Run test and verify failure**

Run: `node --test tests/local-service-normalize.test.mjs`
Expected: FAIL because `local-service/normalize.mjs` does not exist.

- [ ] **Step 3: Implement normalization**

Export `createEmptyStore`, `normalizeStore`, `normalizeAccount`, `importAccountsPayload`, `upsertAccounts`, `normalizeRegisterEmailItems`, `normalizeSmsTargets`, and `upsertSmsTargets`.

- [ ] **Step 4: Run test and verify pass**

Run: `node --test tests/local-service-normalize.test.mjs`
Expected: PASS.

## Task 2: Local Service Persistence

**Files:**
- Create: `local-service/store.mjs`
- Create: `tests/local-service-store.test.mjs`

- [ ] **Step 1: Write failing tests**

Use a temp directory. Verify first load creates an empty store, writes persist, and a second write creates a backup.

- [ ] **Step 2: Run test and verify failure**

Run: `node --test tests/local-service-store.test.mjs`
Expected: FAIL because `local-service/store.mjs` does not exist.

- [ ] **Step 3: Implement persistence**

Export `resolveStoreDir`, `createStoreRepository`, and repository methods `load`, `save`, `upsertSessionAccount`, `importAccounts`, `patchAccount`, `deleteAccount`, `upsertRegisterEmailItems`, `deleteRegisterEmailItem`, `upsertSmsTargets`, `deleteSmsTarget`, and `patchSmsRelay`.

- [ ] **Step 4: Run test and verify pass**

Run: `node --test tests/local-service-store.test.mjs`
Expected: PASS.

## Task 3: Local HTTP Server

**Files:**
- Create: `local-service/server.mjs`
- Create: `local-service/README.md`
- Modify: `package.json`

- [ ] **Step 1: Implement dependency-free HTTP routes**

Routes: `/health`, `/v1/store`, `/v1/import/accounts`, `/v1/accounts/session`, `/v1/accounts/:id`, `/v1/register-email-items`, `/v1/register-email-items/:id`, `/v1/sms-targets`, `/v1/sms-targets/:id`, `/v1/sms-relay`.

- [ ] **Step 2: Add scripts**

Add `local:accounts` and `test:local-service`.

- [ ] **Step 3: Verify service tests**

Run: `pnpm test:local-service`
Expected: PASS.

## Task 4: Extension Local Store Client

**Files:**
- Create: `src/features/local-store/types.ts`
- Create: `src/features/local-store/client.ts`
- Modify: `wxt.config.ts`
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: Add TypeScript types**

Define message types, local store shape, and normalized response types.

- [ ] **Step 2: Add background client**

Use `fetch` from background only, default base URL `http://127.0.0.1:8788`, JSON-only requests, timeout handling via `AbortController`.

- [ ] **Step 3: Wire message handlers**

Add `opx:local-store-*` message routing to `background.ts`.

- [ ] **Step 4: Verify compile**

Run: `pnpm compile`
Expected: PASS.

## Task 5: Account UI Integration

**Files:**
- Modify: `src/features/accounts/session.ts`
- Modify: account panel files under `src/features/accounts/`
- Modify: `src/app/panel.ts`

- [ ] **Step 1: Load account records from local service**

Fallback to existing browser storage when service is unavailable.

- [ ] **Step 2: Save current ChatGPT session to local service**

Use existing `buildAccountRecordFromSession` before sending `opx:local-store-upsert-session`.

- [ ] **Step 3: Import account JSON through local service**

Send JSON payload to `opx:local-store-import-accounts` and refresh account list.

- [ ] **Step 4: Delete account through local service**

Delete by ID and refresh local view.

## Task 6: Register Email and SMS Integration

**Files:**
- Modify: `src/app/state.ts`
- Modify: `src/features/register/controller.ts`
- Modify: `src/features/register/panel.ts`
- Modify: `src/features/sms/panel.ts`
- Modify: `src/features/sms/poller.ts`

- [ ] **Step 1: Register email reads from local service when available**

Merge with storage fallback and preserve alias fields.

- [ ] **Step 2: Register email writes to local service**

On add/remove/toggle/select, update local service and browser fallback state.

- [ ] **Step 3: SMS target reads/writes from local service**

On add/remove/select and history update, update local service and browser fallback state.

## Task 7: Verification

**Files:**
- Build outputs only, no committed generated artifacts.

- [ ] **Step 1: Run service tests**

Run: `pnpm test:local-service`
Expected: PASS.

- [ ] **Step 2: Run compile**

Run: `pnpm compile`
Expected: PASS.

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: PASS and `.output/chrome-mv3` updated locally.

- [ ] **Step 4: Run sidepanel guard**

Run: `pnpm verify:sidepanel`
Expected: PASS.

- [ ] **Step 5: Smoke test service**

Run `pnpm local:accounts`, call `/health`, stop service after confirming it responds.

## Self-Review

- Spec coverage: service, local store, JSON import, accounts, register email data, SMS data, security, and verification are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: plan uses existing `AccountRecord`, `RegisterEmailItem`, `SmsRelayTarget`, and `SmsCodeRecord` names from the repo.
- Project rule deviation: plan does not include commits because repository instructions say not to commit unless explicitly requested.

## Implementation Result

- 2026-05-22 已按本计划完成本地服务、扩展代理、账号 UI、注册邮箱资料与接码资料同步接入。
- 新增 HTTP server 回归测试，覆盖 `/health`、`/v1/store`、账号导入和非法导入输入。
- 验证命令已通过：`pnpm test:local-service`、`pnpm compile`、`pnpm build`、`pnpm verify:sidepanel`。
- 本地服务烟测已通过：临时启动服务后，`/health` 与 `/v1/store` 均返回正常 JSON。
- 2026-05-22 追加 Native Messaging Host 自动启动优化：扩展在 HTTP 服务不可用时调用 `com.openai_plus_vxt.local_store`，由 helper 启动本地 HTTP 服务；服务空闲 10 分钟后自动退出。
- 2026-05-22 追加输出目录注册脚本：`pnpm build` 后会在 `.output/chrome-mv3` 写入 `register-native-host.ps1`，并复制 `native-host/` 与 `local-service/`，方便直接从扩展产物目录注册 Native Host。
