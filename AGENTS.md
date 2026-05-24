# openai-plus-vxt - 项目级 Agent 协作指南

生成日期：2026-05-21
当前定位：基于 WXT、TypeScript 与浏览器扩展 API 的 ChatGPT 注册、Checkout 链接、地址资料、接码与支付页自动填充辅助工具。

## 0. 使用说明

本文件是 `openai-plus-vxt` 的仓库操作手册，核心目标是告诉 agent：这个项目是什么、怎么改、改哪里、哪些边界不能破、怎么验证。

创建或修改本文件时，必须围绕以下 7 件事组织信息：

1. **项目定位**：项目做什么、技术栈是什么、当前关键业务链路是什么。
2. **仓库地图**：目录结构、关键模块职责、改什么应该先看哪里。
3. **架构边界**：哪些层不能互相穿透，哪些消息协议、存储字段、权限和页面选择器改动必须同步。
4. **项目级必须做 / 不要做**：把全局硬规则落到本仓库的具体业务、目录、测试和文档约束。
5. **验证方式**：常用命令、最小验证集、不同类型改动必须跑哪些验证。
6. **文档优先级与长期决策**：冲突时听哪个文档，README、AGENTS、源码和后续 docs 的职责边界。
7. **项目专属反模式**：这个项目最容易被 agent 改坏的地方。

优先记录“会导致 agent 改错代码的关键信息”，不要复述 README 已经能清楚表达的普通项目介绍。

## 1. 项目定位

`openai-plus-vxt` 是一个 WXT 浏览器扩展项目，主要面向 Chrome MV3，并保留 Firefox 构建脚本。项目使用 TypeScript、pnpm、WXT 自动生成入口与 manifest，当前没有 React、Vue、RN、原生移动端或后端服务代码。

自动化改造参照关系：

- `openai-plus-vxt` 是原项目，当前定位为半自动化浏览器扩展；所有改造都应在本仓库现有架构、权限边界、状态结构和 UI 入口上渐进完成。
- GitHub 仓库 `suyancc/openai-plus-vxt` / 本地 `origin/main` 是原项目基线；排查原有能力（例如“填入邮箱并继续”）时必须优先对照该基线实现，再分析本地自动化改造引入的差异。
- `D:\ddyk-project\playground\GuJumpgate` 是需要参考的自动化项目；参考它的页面识别、步骤编排、选择器策略、重试等待、支付与 PayPal 自动化经验，但不要把它当作当前仓库的事实来源或直接照搬架构。
- 当两边实现不同步时，以 `openai-plus-vxt` 的源码、消息协议、manifest 权限和项目文档为落地边界；`GuJumpgate` 只作为自动化策略参考。

核心能力包括：

- ChatGPT / OpenAI Auth 注册辅助：填邮箱、等待或手动填验证码、资料页自动填充。
- ChatGPT session 与 checkout 链接提取：读取当前登录 session，生成 checkout 长链或短链。
- 随机地址资料：通过 `meiguodizhi` 抓取或降级生成地址、身份、就业和信用卡展示资料。
- OpenAI Pay 与 PayPal 页面自动填充：在受支持域名内选择支付方式、填写地址资料与必要表单。
- 接码链接轮询：读取外部接码 API 返回内容，解析手机号、验证码和历史记录。
- 版本检查：通过 GitHub Releases API 检查扩展更新。

本项目运行在浏览器扩展权限边界内。任何涉及账号、验证码、支付页、地址资料、session、第三方页面 DOM、host permissions 的改动，都必须优先考虑安全、兼容、失败恢复和选择器漂移。

## 2. 仓库地图

### 2.1 仓库结构

```text
openai-plus-vxt/
├── entrypoints/
│   ├── background.ts            # 后台消息分发、脚本注入、Outlook OTP、session、checkout、地址、接码代理
│   ├── content.ts               # 内容脚本入口，注册页面控制器与支付页自动填充初始化
│   └── sidepanel/               # Chrome side panel 页面入口
├── src/
│   ├── app/                     # 面板挂载、UI 组装、持久化状态、side panel 命令转发、样式
│   └── features/
│       ├── register/            # 注册输入解析、OpenAI 登录/验证码/资料页自动填充
│       ├── link-extractor/      # ChatGPT session 读取、checkout 链接生成与面板
│       ├── address-autofill/    # 地址资料抓取、OpenAI Pay / PayPal 自动填充、地址面板
│       ├── sms/                 # 接码链接轮询、验证码解析、历史记录面板
│       ├── settings/            # 扩展设置、地址自动填充开关与持久化
│       ├── version-check/       # GitHub Release 版本检查与更新提示
│       └── payment/             # 支付相关面板占位或扩展点
├── components/                  # WXT 初始示例组件，非当前主要业务入口
├── public/                      # 扩展静态资源与图标
├── image/                       # README 截图资源
├── scripts/
│   ├── start-debug-chrome.ps1   # 手动调试 Chrome 启动脚本
│   └── verify-sidepanel.mjs     # side panel 构建结果守护测试
├── wxt.config.ts                # WXT 与扩展 manifest 权限配置
├── package.json                 # 脚本、版本号、依赖与包管理事实来源
└── README.md                    # 产品能力、开发命令、发布说明与截图入口
```

### 2.2 工作入口

| 任务 | 优先查看 | 说明 |
| --- | --- | --- |
| 改扩展权限、匹配域名、manifest | `wxt.config.ts`、`entrypoints/content.ts`、`entrypoints/background.ts` | host permissions、content matches、后台注入白名单必须同步 |
| 改后台消息能力 | `entrypoints/background.ts`、对应 `src/features/*/types.ts` | 新增消息要补类型守卫、失败返回和调用方处理 |
| 改内容脚本自动执行 | `entrypoints/content.ts` | 保持幂等加载，避免重复挂载、重复填表、重复监听 |
| 改 side panel 行为 | `entrypoints/sidepanel/`、`src/app/sidepanel-controller.ts`、`scripts/verify-sidepanel.mjs` | side panel 是当前主入口，构建后要跑守护验证 |
| 改面板 UI 或 tab | `src/app/panel.ts`、`src/app/styles.ts`、`src/app/types.ts`、对应 feature `panel.ts` | 新 tab 要同步 `FeatureTab`、状态持久化和渲染入口 |
| 改持久化状态 | `src/app/state.ts`、`src/features/settings/state.ts` | 必须写 normalize 逻辑，兼容旧本地存储 |
| 改注册辅助 | `src/features/register/` | 页面识别、邮箱/验证码/资料填充要分别维护，避免一个选择器影响多页 |
| 改 checkout 链接 | `src/features/link-extractor/` | 保持 session 读取、checkout 参数、错误信息和面板展示一致 |
| 改地址抓取或支付页填充 | `src/features/address-autofill/` | 选择器易失效，必须保留可见性检查、敏感字段保护和降级结果 |
| 改接码能力 | `src/features/sms/`、`entrypoints/background.ts` | API URL 要校验协议，解析器要兼容不同返回格式 |
| 改版本检查 | `src/features/version-check/`、`package.json` | 当前 GitHub Release API 地址、版本比较和扩展版本要同步 |
| 改调试启动 | `scripts/start-debug-chrome.ps1` | Windows PowerShell 脚本，注意路径和 Chrome 用户数据目录 |

## 3. 架构边界

### 3.1 当前关键链路

#### Side panel 主链路

```text
Chrome extension action
  -> background 设置 openPanelOnActionClick
  -> entrypoints/sidepanel/main.ts
  -> mountSidePanel
  -> createSidePanelRegisterController
  -> panel 渲染 feature tabs
  -> browser.runtime.sendMessage(opx:active-tab-command)
  -> background 查找当前受支持 tab 并注入 content script
  -> content command handler 调用 register / payment 能力
  -> 返回 ActionResult 或 PageState 给面板
```

#### 注册辅助链路

```text
面板输入 email 或 Outlook account line
  -> parseAccountInput
  -> saveRegisterState
  -> fill-email 命令进入当前 tab
  -> chatgpt-auth-page 填邮箱并继续
  -> OpenAI 邮箱验证码页
  -> 手动填码或 background 轮询本地 Outlook API
  -> openai-email-verification-page 填码并继续
  -> about-you 页面自动填资料并创建
```

#### 支付页自动填充链路

```text
content script 进入 pay.openai.com / paypal.com
  -> 初始化 OpenAI Pay 或 PayPal autofill
  -> 读取 settings 开关
  -> background 获取随机地址资料
  -> 保存 lastAddress
  -> DOM 可见性检查
  -> 避开敏感支付字段
  -> 选择 PayPal / 填写地址 / 勾选必要条款
  -> 返回 filled 数量和用户可理解的 message
```

#### Checkout 链接提取链路

```text
面板切换到 link tab
  -> 请求 chatgpt.com/api/auth/session
  -> 提取 accessToken / email / planType
  -> 根据 checkoutOptions 生成 checkout 链接
  -> 保存参数与结果到 browser.storage.local
```

### 3.2 关键边界

- `entrypoints/background.ts` 是跨权限能力的集中出口：读 session、访问本地 Outlook API、抓取地址、接码代理、注入脚本和转发 active tab 命令都在这里收口。
- `entrypoints/content.ts` 只做页面内初始化和命令分发，不应承载后台网络代理、跨域权限判断或长期状态结构。
- `src/app/` 负责面板外壳、状态和渲染装配；具体业务逻辑默认放进 `src/features/<domain>/`。
- 页面 DOM 自动填充逻辑必须留在对应 feature 中，不要把选择器散落到面板 UI 或 background。
- 所有 `browser.runtime.sendMessage` 消息必须有稳定 `type` 字段、调用方类型定义、接收方类型守卫和失败返回。
- 新增 host permissions 时，必须同步检查 `wxt.config.ts`、`content.ts` 的 `matches`、`background.ts` 的 `ASSISTANT_URL_PREFIXES` 或相关白名单。
- `browser.storage.local` 中已有用户状态要向后兼容；新增字段必须在 normalize 函数中兜底，不能假设旧用户已经有新结构。
- 支付页自动填充不能填写或覆盖 CVC、完整卡号、密码等敏感支付字段，除非当前模块已有明确业务规则且选择器保护到位。
- 第三方页面选择器随时可能变化；选择器更新要尽量使用多策略匹配、可见性检查、不会误点隐藏元素的保护逻辑。
- ChatGPT session、accessToken、邮箱、验证码、地址资料、接码结果都属于敏感信息；不要写入日志、README、测试夹具或错误上报。
- `README.md` 中的开发命令和产品说明是用户入口；如果脚本、权限、主入口或发布流程变化，README 要同步更新。

## 4. 项目级必须做 / 不要做

### 4.1 开发约定

- 默认使用 `pnpm`，不要引入 `npm lockfile`、`yarn.lock` 或 Bun 工作流。
- TypeScript 保持严格类型思路，优先补 `types.ts` 和类型守卫，不用 `any`、`@ts-ignore` 或静默 `catch` 掩盖问题。
- UI 当前是原生 DOM + shadow DOM + 手写 CSS，不要无明确需求引入 React、Vue、Tamagui、Tailwind 或大型 UI 框架。
- 新增 feature 默认放到 `src/features/<domain>/`，并按 `types.ts`、`state.ts`、`panel.ts`、业务文件拆分。
- 面板状态统一走 `src/app/state.ts` 或 `src/features/settings/state.ts`，不要让各面板各自散落 storage key。
- 用户可见提示默认中文；代码标识符、类型名、消息 `type` 使用英文。
- 注释只解释浏览器兼容、权限边界、第三方页面坑点、选择器策略和安全约束。
- 保持 content script 幂等：重复注入、tab 更新、side panel 多次发命令时不能重复挂载或重复触发危险动作。
- 网络请求必须有明确错误信息；跨域请求优先经 background 代理，不要在内容脚本里绕权限。
- 版本号以 `package.json` 为准；发布相关变更要同步检查 GitHub Release 版本检查逻辑。

### 4.2 安全与兼容约定

- 不要提交真实账号、邮箱、token、refresh_token、验证码、手机号、完整信用卡号、密码或地址个人资料。
- 不要在 `console.log` / `console.warn` 中打印完整敏感 payload；必要日志只保留状态、来源、城市、国家、最后四位等低风险摘要。
- Outlook 本地 API 默认地址是 `http://127.0.0.1:8787`；改默认值时同步 `src/app/state.ts`、README 和相关 UI 文案。
- 接码 API URL 必须限制为 `http:` 或 `https:`；不要支持 `javascript:`、`file:`、`data:` 等危险协议。
- 接码 API 域名由用户输入，默认不放入固定 `host_permissions`；通过 `optional_host_permissions` 在添加号码时为号码 API 对应域名单独授权，“立即获取”时只做历史数据兜底检查，避免默认宽权限。
- 自动填充前必须确认当前 `location.hostname` 和页面类型；不能把 OpenAI Pay 的逻辑应用到 PayPal，反之亦然。
- 对第三方页面的点击和输入必须优先检查元素可见、可交互、非敏感字段。
- 修改权限时遵循最小权限原则；不要为了临时调试添加 `<all_urls>` 或宽泛 host permissions。
- Firefox 构建脚本存在，但主链路以 Chrome MV3 和 side panel 为准；涉及 side panel 的能力要考虑 Firefox 不支持时的降级或说明。

### 4.3 Agent 工作守则

- 修改前先读相关入口、feature、类型和状态 normalize 逻辑；优先用 `rg` / `rg --files` 搜索。
- 保留主人已有改动，不回退、不覆盖无关文件，不顺手格式化全仓库。
- 改消息协议时，同步更新发送方、接收方、类型定义、类型守卫、错误返回和 UI 展示。
- 改扩展权限或匹配域名时，同步更新 `wxt.config.ts`、content matches、background 注入白名单和 README 权限说明。
- 改 side panel 默认行为时，必须同步维护 `scripts/verify-sidepanel.mjs`。
- 改页面自动填充选择器时，至少本地构建和类型检查；能验证页面时说明验证页面和结果，不能验证时明确风险。
- 完成任何代码或界面修改后，必须运行 `pnpm build` 更新 `.output/chrome-mv3` 产物，避免浏览器重新加载扩展后仍看到旧界面；类型风险较高时同时运行 `pnpm compile`。
- 改用户可见中文文案时，注意当前仓库部分历史文件可能存在编码显示异常；不要扩大无关编码修复范围。
- 不主动提交、推送或删除文件，除非主人明确要求。

## 5. 验证方式

常用命令：

```bash
pnpm install
pnpm dev
pnpm dev:manual
pnpm compile
pnpm build
pnpm verify:sidepanel
pnpm zip
pnpm dev:firefox
pnpm build:firefox
pnpm zip:firefox
```

最小验证集：

```bash
pnpm compile
pnpm build
```

涉及入口、manifest、side panel、content script 注入或 action 行为时运行：

```bash
pnpm verify:sidepanel
```

涉及发布、zip 产物、权限、host permissions 或跨浏览器构建时运行：

```bash
pnpm build
pnpm zip
pnpm build:firefox
pnpm zip:firefox
```

涉及第三方页面自动填充时，命令行验证只能覆盖编译与构建；还需要在目标页面手动确认选择器、可见性、按钮点击和字段填充行为。无法手动验证时，最终回复必须说明未覆盖的页面风险。

## 6. 文档优先级与长期决策

### 6.1 文档优先级

当文档口径冲突时，按以下顺序处理，并同步修正低优先级文档：

1. 主人当前明确指令
2. 本文件 `AGENTS.md`
3. `package.json`、`wxt.config.ts` 和源码中的实际入口、权限、脚本
4. `README.md`
5. 未来新增的 `docs/plans/`、`docs/decisions.md` 或临时草稿

说明：

- `package.json` 是脚本、版本号和包管理方式的事实来源。
- `wxt.config.ts` 是 manifest 权限的事实来源。
- `README.md` 是用户入口和发布说明，能力变化后要同步维护。
- 若后续新增长期技术决策，放入 `docs/decisions.md`；若新增正式实施方案，放入 `docs/plans/`，不要散落在临时文件。

## 7. 项目专属反模式

- 不要把业务逻辑继续堆进 `entrypoints/background.ts`；能收束到 feature 的逻辑要放回 `src/features/<domain>/`。
- 不要让面板 UI 直接操作第三方页面 DOM，统一通过 active tab command 和 content script。
- 不要新增宽泛权限、全站匹配或 `<all_urls>` 来图省事。
- 不要让 content script 默认挂载旧浮动面板；当前主入口是 side panel，`verify:sidepanel` 会守护这一点。
- 不要破坏 `opx:*` 消息协议的稳定性；改名、删字段、变返回结构都要同步全链路。
- 不要在 storage 里直接保存无法 normalize 的新结构，避免老用户升级后面板崩溃。
- 不要把真实 token、验证码、账号行、接码链接、完整支付资料写入日志、截图、文档或测试产物。
- 不要依赖单一 DOM 选择器完成关键填表；第三方页面经常改版，要保留多策略和失败提示。
- 不要把 PayPal、OpenAI Pay、ChatGPT Auth 的页面判断混在一起。
- 不要为了一个小 UI 改动引入大型框架或构建体系。
- 不要提交 `.output/`、`.wxt/`、`node_modules/`、`.chrome-debug/` 或 zip 构建产物。
- 不要只改代码不跑验证；至少运行 `pnpm compile`，side panel 或 manifest 改动还要运行 `pnpm verify:sidepanel`。
