import { extractAccessToken } from '../link-extractor/checkout.js';

export type RegisterWorkflowStepId =
  | 'check-registration'
  | 'open-register'
  | 'submit-email'
  | 'submit-otp'
  | 'fill-profile'
  | 'read-session'
  | 'create-checkout'
  | 'open-checkout'
  | 'fill-openai-pay'
  | 'register-paypal'
  | 'fill-paypal-signup'
  | 'fill-paypal-code'
  | 'confirm-paypal-code'
  | 'complete-subscription';

export type RegisterWorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type RegisterWorkflowSectionId = 'register' | 'subscription';
export type RegisterWorkflowStepSelection = Record<RegisterWorkflowStepId, boolean>;

export interface RegisterWorkflowStep {
  id: RegisterWorkflowStepId;
  label: string;
  automatable: boolean;
}

export interface RegisterWorkflowStepGroup {
  id: string;
  sectionId: RegisterWorkflowSectionId;
  label: string;
  stepIds: RegisterWorkflowStepId[];
}

export interface ManualWorkflowSessionInput {
  accessToken: string;
  sessionClipboardText: string;
  email?: string;
}

export interface SubmitOtpStepPageState {
  canFillOtp?: boolean;
  canFillProfile: boolean;
}

export const REGISTER_WORKFLOW_STEPS: RegisterWorkflowStep[] = [
  { id: 'check-registration', label: '检查注册资料', automatable: true },
  { id: 'open-register', label: '打开注册页', automatable: true },
  { id: 'submit-email', label: '生成并提交邮箱', automatable: true },
  { id: 'submit-otp', label: '输入邮箱验证码', automatable: true },
  { id: 'fill-profile', label: '填写资料并创建', automatable: true },
  { id: 'read-session', label: '读取 session', automatable: true },
  { id: 'create-checkout', label: '生成长链接', automatable: true },
  { id: 'open-checkout', label: '打开订阅页', automatable: true },
  { id: 'fill-openai-pay', label: '选择 PayPal 并订阅', automatable: true },
  { id: 'register-paypal', label: '注册 PayPal', automatable: true },
  { id: 'fill-paypal-signup', label: '填写 PayPal 注册页', automatable: true },
  { id: 'fill-paypal-code', label: '填写 PayPal 验证码', automatable: true },
  { id: 'confirm-paypal-code', label: '确认 PayPal 验证结果', automatable: true },
  { id: 'complete-subscription', label: '完成订阅并导出账号', automatable: true },
];

export const REGISTER_WORKFLOW_STEP_GROUPS: RegisterWorkflowStepGroup[] = [
  { id: 'register-prep', sectionId: 'register', label: '准备资料', stepIds: ['check-registration'] },
  { id: 'register-submit', sectionId: 'register', label: '提交邮箱', stepIds: ['open-register', 'submit-email'] },
  { id: 'register-complete', sectionId: 'register', label: '完成注册', stepIds: ['submit-otp', 'fill-profile', 'read-session'] },
  { id: 'subscription-prep', sectionId: 'subscription', label: '准备订阅', stepIds: ['create-checkout', 'open-checkout'] },
  { id: 'openai-pay', sectionId: 'subscription', label: 'OpenAI 支付', stepIds: ['fill-openai-pay'] },
  { id: 'paypal-register', sectionId: 'subscription', label: 'PayPal 注册', stepIds: ['register-paypal', 'fill-paypal-signup', 'fill-paypal-code'] },
  { id: 'subscription-complete', sectionId: 'subscription', label: '完成订阅', stepIds: ['confirm-paypal-code', 'complete-subscription'] },
];

const EXISTING_SESSION_SKIPPED_STEPS: RegisterWorkflowStepId[] = [
  'check-registration',
  'open-register',
  'submit-email',
  'submit-otp',
  'fill-profile',
];

export function getInitialWorkflowStatuses(): RegisterWorkflowStepStatus[] {
  return REGISTER_WORKFLOW_STEPS.map(() => 'pending');
}

export function getDefaultWorkflowStepSelection(): RegisterWorkflowStepSelection {
  return REGISTER_WORKFLOW_STEPS.reduce((selection, step) => {
    selection[step.id] = true;
    return selection;
  }, {} as RegisterWorkflowStepSelection);
}

export function isWorkflowStepSelected(
  selection: RegisterWorkflowStepSelection,
  stepId: RegisterWorkflowStepId,
): boolean {
  return selection[stepId] !== false;
}

export function canRerunWorkflowStep(status: RegisterWorkflowStepStatus, running: boolean): boolean {
  return !running && (status === 'completed' || status === 'failed');
}

export function hasRunnableWorkflowSelection(selection: RegisterWorkflowStepSelection): boolean {
  return REGISTER_WORKFLOW_STEPS.some((step) => isWorkflowStepSelected(selection, step.id));
}

export function setWorkflowSectionSelected(
  selection: RegisterWorkflowStepSelection,
  sectionId: RegisterWorkflowSectionId,
  selected: boolean,
): RegisterWorkflowStepSelection {
  const stepIds = REGISTER_WORKFLOW_STEP_GROUPS
    .filter((group) => group.sectionId === sectionId)
    .flatMap((group) => group.stepIds);
  return setWorkflowStepsSelected(selection, stepIds, selected);
}

export function getWorkflowGroupStatus(
  statuses: RegisterWorkflowStepStatus[],
  group: RegisterWorkflowStepGroup,
): RegisterWorkflowStepStatus {
  const groupStatuses = group.stepIds.map((stepId) => statuses[getWorkflowStepIndex(stepId)] || 'pending');
  if (groupStatuses.some((status) => status === 'running')) {
    return 'running';
  }
  if (groupStatuses.some((status) => status === 'failed')) {
    return 'failed';
  }
  if (groupStatuses.every((status) => status === 'skipped')) {
    return 'skipped';
  }
  if (groupStatuses.every((status) => status === 'completed' || status === 'skipped')) {
    return 'completed';
  }
  return 'pending';
}

function setWorkflowStepsSelected(
  selection: RegisterWorkflowStepSelection,
  stepIds: RegisterWorkflowStepId[],
  selected: boolean,
): RegisterWorkflowStepSelection {
  const next = { ...selection };
  for (const stepId of stepIds) {
    next[stepId] = selected;
  }
  return next;
}

export function getExistingSessionWorkflowStatuses(): RegisterWorkflowStepStatus[] {
  const statuses = getInitialWorkflowStatuses();
  for (const stepId of EXISTING_SESSION_SKIPPED_STEPS) {
    statuses[getWorkflowStepIndex(stepId)] = 'skipped';
  }
  return statuses;
}

export function getResumeWorkflowStatuses(
  currentStatuses: RegisterWorkflowStepStatus[],
  stepId: RegisterWorkflowStepId,
): RegisterWorkflowStepStatus[] {
  const resumeIndex = getWorkflowStepIndex(stepId);
  return REGISTER_WORKFLOW_STEPS.map((_, index) => (
    index < resumeIndex ? currentStatuses[index] || 'pending' : 'pending'
  ));
}

export function getWorkflowProgressText(statuses: RegisterWorkflowStepStatus[]): string {
  const completed = statuses.filter((status) => status === 'completed' || status === 'skipped').length;
  return `${completed} / ${REGISTER_WORKFLOW_STEPS.length}`;
}

export function getWorkflowStatusLabel(status: RegisterWorkflowStepStatus): string {
  if (status === 'completed') {
    return '完成';
  }
  if (status === 'running') {
    return '执行中';
  }
  if (status === 'failed') {
    return '失败';
  }
  if (status === 'skipped') {
    return '跳过';
  }
  return '等待';
}

export function canCompleteSubmitOtpStep(page: SubmitOtpStepPageState): boolean {
  return page.canFillProfile;
}

export function parseManualWorkflowSessionInput(raw: string): ManualWorkflowSessionInput {
  const text = String(raw || '').trim();
  if (!text) {
    throw new Error('session 输入为空');
  }
  const email = extractEmailFromSessionText(text);
  return {
    accessToken: extractAccessToken(text),
    sessionClipboardText: text,
    ...(email ? { email } : {}),
  };
}

function extractEmailFromSessionText(text: string): string {
  try {
    return findEmail(JSON.parse(text) as unknown);
  } catch {
    return '';
  }
}

function findEmail(value: unknown, depth = 0): string {
  if (!value || typeof value !== 'object' || depth > 5) {
    return '';
  }
  const record = value as Record<string, unknown>;
  const direct = stringValue(record.email);
  if (isEmail(direct)) {
    return direct;
  }
  for (const child of Object.values(record)) {
    const found = findEmail(child, depth + 1);
    if (found) {
      return found;
    }
  }
  return '';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function canCompleteOpenAiPayStep(url: string): boolean {
  try {
    const parsed = new URL(url);
    return isPaypalRegistrationEntryUrl(parsed);
  } catch {
    return false;
  }
}

export function appendPaypalCountryUsParam(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('paypal.com')) {
      return url;
    }
    if (parsed.searchParams.get('country.x') === 'US') {
      return parsed.toString();
    }
    parsed.searchParams.set('country.x', 'US');
    return parsed.toString();
  } catch {
    return url;
  }
}

export function canEnterPaypalSignupStep(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('paypal.com') && parsed.pathname.startsWith('/checkoutweb/signup');
  } catch {
    return false;
  }
}

export function canPreparePaypalRegistrationStep(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('paypal.com') && (
      parsed.pathname === '/pay' ||
      parsed.pathname === '/pay/'
    );
  } catch {
    return false;
  }
}

export function allowsPaypalManualChallenge(stepId: RegisterWorkflowStepId): boolean {
  return stepId === 'register-paypal' ||
    stepId === 'fill-paypal-signup' ||
    stepId === 'fill-paypal-code' ||
    stepId === 'confirm-paypal-code' ||
    stepId === 'complete-subscription';
}

function isPaypalRegistrationEntryUrl(parsed: URL): boolean {
  return parsed.hostname.endsWith('paypal.com');
}

export function getWorkflowStepIndex(stepId: RegisterWorkflowStepId): number {
  const index = REGISTER_WORKFLOW_STEPS.findIndex((step) => step.id === stepId);
  if (index < 0) {
    throw new Error(`未知流程步骤：${stepId}`);
  }
  return index;
}

export function isAuthEmailPageUrl(hostname: string, pathname: string): boolean {
  if (hostname === 'chatgpt.com') {
    return pathname === '/' || pathname.startsWith('/auth/login') || pathname.startsWith('/auth/signup');
  }
  if (hostname !== 'auth.openai.com') {
    return false;
  }
  if (pathname.startsWith('/email-verification') || pathname.startsWith('/about-you')) {
    return false;
  }
  return true;
}
