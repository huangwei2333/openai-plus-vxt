# 本地账号服务设计

日期：2026-05-22
项目：openai-plus-vxt
状态：已实施

## 1. 背景与目标

当前插件的数据主要保存在 `chrome.storage.local` 中。该存储按 Chrome Profile 隔离，导致不同 Chrome 账号或不同浏览器 Profile 安装同一插件后，无法共享账号、邮箱和接码配置。

本设计引入一个本地 HTTP 服务，作为多个插件实例共享的数据源。第一版目标是完成“账号维护”和“配置资料维护”，并提供可选 Native Messaging Host 用于自动启动该本地 HTTP 服务；不做开机自启、托盘程序，也不修改 Cockpit Tools。

第一版覆盖：

- 维护插件读取到的 ChatGPT session 账号记录。
- 支持通过 JSON 文件内容导入初始账号数据。
- 维护注册页配置里添加的邮箱和 Outlook 账号行。
- 维护接码页添加的手机号和接码 API 信息。
- 所有 Chrome Profile 通过同一个本地服务读取同一份本地记录。

第一版不覆盖：

- 不刷新 token。
- 不反写 Cockpit Tools。
- 不读取浏览器 Cookie。
- 不做 Windows 服务、开机自启或托盘程序。
- Native Messaging Host 只负责启动/保活本地 HTTP 服务，不直接读写账号数据。

## 2. 推荐方案

采用本地 HTTP 服务：

```text
side panel
  -> background.ts
  -> http://127.0.0.1:8788
  -> ~/.openai-plus-vxt/store.json
```

原因：

- 与项目已有 `127.0.0.1:8787` Outlook API 风格一致。
- 调试简单，可用浏览器和命令行直接检查 `/health`。
- 多个 Chrome Profile 可共用同一端口和同一份本地文件。
- 如果需要免手动启动，可以通过 Chrome Native Messaging Host 启动本地 HTTP 服务；账号数据仍只经本地 HTTP API 读写。

## 3. 本地数据目录

默认目录：

```text
~/.openai-plus-vxt/
  store.json
  backups/
```

环境变量：

- `OPX_LOCAL_STORE_PORT`：覆盖默认端口，默认 `8788`。
- `OPX_LOCAL_STORE_DIR`：覆盖默认数据目录。

写入规则：

- 所有写入都先读取并 normalize 当前 `store.json`。
- 写入前将旧文件复制到 `backups/store-<timestamp>.json`。
- 使用临时文件加 rename 的方式原子写入。
- 不在日志里打印完整 token、邮箱账号行、接码 URL。

## 4. 数据模型

第一版使用单文件 `store.json`，避免索引文件和详情文件之间出现一致性问题。

```ts
interface LocalStore {
  version: 1;
  accounts: AccountRecord[];
  registerEmailItems: RegisterEmailItem[];
  smsRelay: {
    targets: SmsRelayTarget[];
    selectedTargetId: string;
    history: SmsCodeRecord[];
  };
  updatedAt: number;
}
```

`AccountRecord` 复用当前插件结构：

```ts
interface AccountRecord {
  id: string;
  email: string;
  selected: boolean;
  idToken: string;
  accessToken: string;
  refreshToken: string;
  accountId: string;
  planType: string;
  planExpiresAt: string;
  sessionExpiredAt: string;
  lastRefreshAt: string;
  createdAt: number;
  updatedAt: number;
}
```

邮箱数据复用 `RegisterEmailItem`。接码数据复用 `SmsRelayTarget` 和 `SmsCodeRecord`。

账号去重规则：

1. 优先按 `accountId` 匹配。
2. 其次按 `id` 匹配。
3. 最后按小写 `email` 匹配。

接码目标去重规则：

- 使用现有 `phone|url` 作为唯一 ID。

邮箱目标去重规则：

- 使用现有 `inputMode:email` 或 `inputMode:outlook-line` + 邮箱生成的 ID。

## 5. 本地服务 API

所有接口只监听 `127.0.0.1`，请求和响应均为 JSON。

### 5.1 健康检查

```http
GET /health
```

响应：

```json
{
  "ok": true,
  "version": 1
}
```

### 5.2 读取完整存储

```http
GET /v1/store
```

返回 normalize 后的 `LocalStore`。

### 5.3 覆盖完整存储

```http
PUT /v1/store
```

用于后续迁移或调试。第一版 UI 不直接暴露该危险操作。

### 5.4 导入账号 JSON

```http
POST /v1/import/accounts
```

请求：

```json
{
  "source": "manual-json",
  "accounts": []
}
```

兼容输入：

- `AccountRecord[]`
- `{ "accounts": AccountRecord[] }`
- 当前插件导出的 Codex JSON 数组格式，包括 `id_token`、`access_token`、`refresh_token`、`account_id`、`email`、`expired`

响应包含导入数量和跳过数量。

### 5.5 保存当前 session

```http
POST /v1/accounts/session
```

请求为 `AccountRecord` 或可转换为 `AccountRecord` 的 session payload。

服务端执行 upsert，并返回保存后的账号。

### 5.6 更新账号非 token 字段

```http
PATCH /v1/accounts/:id
```

第一版允许更新：

- `selected`
- `planType`
- `planExpiresAt`
- `sessionExpiredAt`

不通过该接口直接编辑完整 token 字段，避免误覆盖敏感凭据。

### 5.7 删除账号

```http
DELETE /v1/accounts/:id
```

按 `id` 删除。若 UI 只有 email，需要先从账号列表解析到具体 ID，避免同邮箱多个账号被误删。

### 5.8 邮箱资料维护

```http
POST /v1/register-email-items
DELETE /v1/register-email-items/:id
PATCH /v1/register-email-items/:id
```

用于保存、删除和更新注册页的邮箱资料。第一版保留当前 alias、selected、expanded 字段。

### 5.9 接码资料维护

```http
POST /v1/sms-targets
DELETE /v1/sms-targets/:id
PATCH /v1/sms-relay
```

`PATCH /v1/sms-relay` 用于更新：

- `selectedTargetId`
- `history`

接码 API URL 仍必须限制为 `http:` 或 `https:`。

## 6. 插件改动

新增模块：

```text
src/features/local-store/
  client.ts
  types.ts
```

`client.ts` 只负责构造消息和解析响应，不直接操作 UI。

`background.ts` 新增消息代理：

```text
opx:local-store-health
opx:local-store-get
opx:local-store-upsert-session
opx:local-store-import-accounts
opx:local-store-update-account
opx:local-store-delete-account
opx:local-store-upsert-register-email-items
opx:local-store-delete-register-email-item
opx:local-store-upsert-sms-targets
opx:local-store-delete-sms-target
opx:local-store-update-sms-relay
```

状态来源调整：

- `chrome.storage.local` 保留：当前 tab、折叠状态、checkout 参数、本地服务地址等 UI 状态。
- 本地服务保存：账号列表、注册邮箱资料、接码目标和接码历史。
- 服务不可用时：UI 显示“本地账号服务未启动”，不清空现有浏览器本地数据。

账号页：

- 从本地服务读取账号。
- 支持从 JSON 文本或文件内容导入账号。
- 保存当前 ChatGPT session 到本地服务。
- 删除账号走本地服务。

注册页：

- 添加邮箱或 Outlook 账号行时，同步写入本地服务。
- 本地服务可用时，加载服务端邮箱资料。
- 本地服务不可用时，保留现有 `chrome.storage.local` 回退数据。

接码页：

- 添加手机号和 API URL 时，同步写入本地服务。
- 轮询结果历史写入本地服务。
- 本地服务不可用时，保留当前浏览器本地状态，不阻断“立即获取”。

## 7. 本地服务实现

目录：

```text
local-service/
  server.mjs
  store.mjs
  normalize.mjs
  README.md
```

脚本：

```json
{
  "local:accounts": "node local-service/server.mjs",
  "native:install": "powershell -NoProfile -ExecutionPolicy Bypass -File native-host/install-native-host.ps1",
  "native:uninstall": "powershell -NoProfile -ExecutionPolicy Bypass -File native-host/uninstall-native-host.ps1"
}
```

实现原则：

- 使用 Node.js 内置 `http`、`fs/promises`、`path`、`os`、`crypto`。
- 不新增运行时依赖。
- 只绑定 `127.0.0.1`。
- 每个响应带 `Content-Type: application/json; charset=utf-8`。
- 对未知路径返回 404。
- 对非 JSON 请求返回 415 或 400。
- 对异常返回 `{ ok: false, message }`，message 不包含敏感 payload。

## 8. 安全与隐私

敏感字段：

- `accessToken`
- `idToken`
- `refreshToken`
- Outlook `accountLine`
- 接码 API URL

要求：

- 日志只打印数量、脱敏 email、操作类型。
- 不把 token 写入 README、测试夹具或错误信息。
- 不支持跨网卡访问，不监听 `0.0.0.0`。
- 不允许任意文件路径读写，服务只操作自己的数据目录。
- JSON 导入只解析账号字段，不执行任何 URL 或脚本。

第一版暂不加鉴权 token，因为服务只监听本机，Native Host 也只允许已注册的扩展 ID 调用。后续如果需要长期后台运行，应增加本地配对 token。

## 9. 错误处理

本地服务不可用：

- 插件显示服务未启动。
- 提供启动命令提示：`pnpm local:accounts`。
- 如果已注册 Native Host，插件会先尝试自动启动服务，再重试原请求。
- 不清空 UI 里已加载的数据。

数据文件损坏：

- 服务尝试从最近的 backup 恢复。
- 恢复失败时返回空 store，并保留损坏文件副本。

导入 JSON 失败：

- 返回可读错误，例如“JSON 格式无效”或“未识别到账号数组”。
- 不改动现有 store。

写入失败：

- 返回错误。
- 插件保持当前 UI 状态，并提示稍后重试。

## 10. 验证计划

命令验证：

```bash
pnpm compile
pnpm build
pnpm verify:sidepanel
pnpm local:accounts
pnpm native:install -- -ExtensionId <chrome-extension-id>
```

本地服务验证：

- `GET /health` 返回 `ok: true`。
- 首次启动会创建 `~/.openai-plus-vxt/store.json`。
- 导入账号 JSON 后，另一个 Chrome Profile 的插件能读取到同一批账号。
- 删除账号后，所有 Profile 刷新后都不再显示。
- 添加邮箱资料和接码 API 后，另一个 Profile 能读取。

手动页面验证：

- 在 ChatGPT 登录状态下读取 session 并保存账号。
- 在注册页添加邮箱和 Outlook 账号行。
- 在接码页添加手机号和 API URL，并确认轮询历史能保存。

## 11. 后续扩展

后续可选能力：

- 增加本地配对 token。
- 增加 Windows 开机自启脚本。
- 将单文件 `store.json` 拆分为索引 + 详情文件。
- 增加数据加密。
- 增加 Cockpit Tools 只读导入器，但不反写 Cockpit Tools。
- 增加账号搜索、标签和批量操作。

## 12. 决策记录

- 账号读写仍选择 HTTP 本地服务。
- Native Messaging Host 只作为自动启动入口，不承载账号存储协议。
- 第一版不做开机自启、Windows 服务或托盘程序。
- 第一版只维护账号和配置资料，不刷新 token。
- 初始账号数据通过 JSON 导入。
- 邮箱资料和接码信息纳入同一份本地 store。
