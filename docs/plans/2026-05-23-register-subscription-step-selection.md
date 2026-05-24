# 注册订阅步骤选择实施方案

生成日期：2026-05-23

## 目标

将当前“注册与订阅”单条自动化流程拆成“注册流程”和“订阅流程”两个区块。界面默认展开所有小步骤，并通过复选框选择需要执行的步骤；支持失败后继续执行，也支持从任意大步骤或小步骤重新执行。

## 设计原则

- 不重写 PayPal、OpenAI Pay、邮箱验证和 checkout 的底层自动化逻辑。
- 保留现有小步骤作为真实执行单元，避免丢失失败恢复点。
- UI 用大步骤分组降低理解成本，小步骤默认展开用于精确勾选和排错。
- 默认全选，保持当前一键全流程行为。
- 未勾选步骤在运行时标记为 `skipped`，不参与执行。

## 流程结构

### 注册流程

- 准备资料
  - `email`：检查邮箱
  - `address`：检查地址
  - `sms`：验证码准备
- 提交邮箱
  - `open-register`：打开注册页
  - `submit-email`：生成并提交邮箱
- 完成注册
  - `submit-otp`：邮箱验证
  - `fill-profile`：填写资料并创建账号

### 订阅流程

- 准备订阅
  - `read-session`：读取 session
  - `create-checkout`：生成 checkout 长链接
  - `open-checkout`：打开订阅页
- OpenAI 支付
  - `fill-openai-pay`：选择 PayPal 并订阅
- PayPal 注册
  - `register-paypal`：注册 PayPal
  - `fill-paypal-signup`：填写 PayPal 注册页
  - `fill-paypal-code`：填写 PayPal 验证码
- 完成订阅
  - `confirm-paypal-code`：确认 PayPal 验证结果
  - `complete-subscription`：完成订阅并导出账号

## 文件变更范围

- 修改 `src/features/register/workflow.ts`
  - 增加流程分组、默认步骤选择、选择状态工具函数。
- 修改 `src/app/panel.ts`
  - 将订阅 Tab 的流程列表渲染为注册区块和订阅区块。
  - 每个大步骤和小步骤都显示 checkbox。
  - 小步骤默认展开。
  - `shouldRunStep` 同时判断恢复位置和 checkbox 选择状态。
- 修改 `src/app/styles.ts`
  - 增加分组、checkbox、展开小步骤、重新执行按钮样式。
- 新增或修改测试：
  - `tests/register-workflow-selection.test.mjs`
  - 必要时补充 `tests/panel-labels.test.mjs`

## 核心数据结构

在 `src/features/register/workflow.ts` 中增加：

```ts
export type RegisterWorkflowSectionId = 'register' | 'subscription';

export interface RegisterWorkflowStepGroup {
  id: string;
  sectionId: RegisterWorkflowSectionId;
  label: string;
  stepIds: RegisterWorkflowStepId[];
}

export type RegisterWorkflowStepSelection = Record<RegisterWorkflowStepId, boolean>;
```

新增常量：

```ts
export const REGISTER_WORKFLOW_STEP_GROUPS: RegisterWorkflowStepGroup[] = [
  { id: 'register-prep', sectionId: 'register', label: '准备资料', stepIds: ['email', 'address', 'sms'] },
  { id: 'register-submit', sectionId: 'register', label: '提交邮箱', stepIds: ['open-register', 'submit-email'] },
  { id: 'register-complete', sectionId: 'register', label: '完成注册', stepIds: ['submit-otp', 'fill-profile'] },
  { id: 'subscription-prep', sectionId: 'subscription', label: '准备订阅', stepIds: ['read-session', 'create-checkout', 'open-checkout'] },
  { id: 'openai-pay', sectionId: 'subscription', label: 'OpenAI 支付', stepIds: ['fill-openai-pay'] },
  { id: 'paypal-register', sectionId: 'subscription', label: 'PayPal 注册', stepIds: ['register-paypal', 'fill-paypal-signup', 'fill-paypal-code'] },
  { id: 'subscription-complete', sectionId: 'subscription', label: '完成订阅', stepIds: ['confirm-paypal-code', 'complete-subscription'] },
];
```

新增工具函数：

```ts
export function getDefaultWorkflowStepSelection(): RegisterWorkflowStepSelection;
export function isWorkflowStepSelected(selection: RegisterWorkflowStepSelection, stepId: RegisterWorkflowStepId): boolean;
export function setWorkflowGroupSelected(selection: RegisterWorkflowStepSelection, groupId: string, selected: boolean): RegisterWorkflowStepSelection;
export function setWorkflowSectionSelected(selection: RegisterWorkflowStepSelection, sectionId: RegisterWorkflowSectionId, selected: boolean): RegisterWorkflowStepSelection;
export function getWorkflowGroupStatus(statuses: RegisterWorkflowStepStatus[], group: RegisterWorkflowStepGroup): RegisterWorkflowStepStatus;
```

## 执行规则

- 点击“开始执行”时，从第一个小步骤开始扫描。
- 若小步骤未勾选，状态设为 `skipped`。
- 若小步骤已勾选且在恢复位置之后，执行该步骤。
- 若当前是失败后继续，恢复位置之前的状态保持不变。
- 若失败步骤被取消勾选，点击继续时提示“请先勾选失败步骤后再继续”。
- 大步骤 checkbox 切换时，同步切换它包含的全部小步骤。
- 注册流程 checkbox 切换时，同步切换注册流程所有小步骤。
- 订阅流程 checkbox 切换时，同步切换订阅流程所有小步骤。

## UI 方案

- 顶部按钮保留：
  - 开始执行 / 停止
  - 刷新
- 新增快捷按钮：
  - 全选
  - 只注册
  - 只订阅
- 列表结构：
  - 注册流程标题 + section checkbox
  - 大步骤行 + group checkbox + 状态 + 重新执行
  - 小步骤行 + step checkbox + 状态 + 继续或验证码复制
  - 订阅流程同上

小步骤默认展开，不做折叠状态持久化。后续如需要，可再加“收起详情”。

## 重新执行与继续执行

- 小步骤失败后：
  - 保留现有“继续”按钮。
  - 继续从失败小步骤开始。
  - 若失败小步骤未勾选，先提示勾选。
- 大步骤“重新执行”：
  - 从该大步骤的第一个小步骤开始。
  - 自动勾选该大步骤内全部小步骤。
  - 大步骤之前状态保留，大步骤及之后被重置为 `pending` 或按选择状态 `skipped`。
- 小步骤“重新执行”：
  - 从该小步骤开始。
  - 自动勾选该小步骤。
  - 该小步骤及之后按选择状态重新计算。

## 实施步骤

### 任务 1：补充 workflow 选择模型测试

文件：

- 新增 `tests/register-workflow-selection.test.mjs`
- 修改 `src/features/register/workflow.ts`

步骤：

- 先写失败测试，覆盖默认全选、只注册、只订阅、大步骤汇总状态。
- 编译 `.tmp-test` 后运行：

```bash
node --test tests/register-workflow-selection.test.mjs
```

预期：新增函数不存在或行为不匹配，测试失败。

### 任务 2：实现 workflow 选择模型

文件：

- 修改 `src/features/register/workflow.ts`

步骤：

- 增加 section、group、selection 类型。
- 增加 `REGISTER_WORKFLOW_STEP_GROUPS`。
- 增加选择和状态汇总函数。
- 重新编译 `.tmp-test` 并运行选择模型测试。

验收：

```bash
node --test tests/register-workflow-selection.test.mjs tests/register-workflow.test.mjs
```

通过。

### 任务 3：改造面板渲染结构

文件：

- 修改 `src/app/panel.ts`
- 修改 `src/app/styles.ts`
- 可选修改 `tests/panel-labels.test.mjs`

步骤：

- 在 `createRegisterWorkflowPanel` 中增加 `stepSelection` 状态。
- 用 `REGISTER_WORKFLOW_STEP_GROUPS` 渲染两个 section。
- 每个 section、group、step 都渲染 checkbox。
- 小步骤默认直接显示。
- 保留现有状态、继续按钮、失败恢复、PayPal 验证码复制按钮。

验收：

```bash
pnpm compile
```

通过。

### 任务 4：接入选择状态到执行逻辑

文件：

- 修改 `src/app/panel.ts`

步骤：

- 将 `shouldRunStep(stepId)` 改为同时判断：
  - 步骤 index 大于等于 resumeIndex。
  - `stepSelection[stepId] === true`。
- 未勾选步骤在执行前设置为 `skipped`。
- `getWorkflowProgressText` 继续按 completed + skipped 统计。
- 失败继续时，如果失败小步骤未勾选，阻止继续并提示。

验收：

```bash
pnpm compile
pnpm build
```

通过。

### 任务 5：实现快捷选择和重新执行

文件：

- 修改 `src/app/panel.ts`
- 修改 `src/app/styles.ts`

步骤：

- 新增“全选”“只注册”“只订阅”按钮。
- 新增大步骤“重新执行”按钮。
- 新增小步骤“重新执行”按钮。
- 重新执行前自动勾选目标大步骤或目标小步骤。

验收：

```bash
pnpm compile
pnpm build
pnpm verify:sidepanel
```

通过。

### 任务 6：最终验证

命令：

```bash
node --test tests/register-workflow-selection.test.mjs tests/register-workflow.test.mjs
pnpm compile
pnpm build
pnpm verify:sidepanel
```

手动验证：

- 打开 side panel。
- 确认“注册流程”和“订阅流程”分开展示。
- 确认小步骤默认展开。
- 确认取消勾选的小步骤会跳过。
- 确认“只注册”“只订阅”“全选”生效。
- 确认失败小步骤可继续执行。
- 确认大步骤和小步骤可重新执行。

## 风险与边界

- 第一版不持久化勾选状态，刷新 side panel 后恢复默认全选。
- 第一版不改第三方页面选择器。
- 第一版不调整 manifest 权限。
- 由于当前部分中文文案存在编码显示问题，本次只修改新增文案，不做全量编码修复。

## 完成标准

- UI 上注册和订阅流程分开。
- 小步骤默认展开。
- 每个大步骤和小步骤都能通过 checkbox 控制执行。
- 未勾选步骤显示跳过。
- 支持失败后继续执行。
- 支持重新执行大步骤或小步骤。
- `pnpm compile`、`pnpm build`、`pnpm verify:sidepanel` 全部通过。
