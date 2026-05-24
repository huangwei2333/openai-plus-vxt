import type { ActionResult } from '../../app/types';

export type { ActionResult } from '../../app/types';

export interface PageState {
  kind: 'login' | 'email-verification' | 'about-you' | 'unknown';
  label: string;
  canFillEmail: boolean;
  canFillOtp: boolean;
  canFillProfile: boolean;
}

export interface RegisterController {
  refreshPageState?(): Promise<void>;
  getPageState(): PageState;
  loadState(): Promise<RegisterState>;
  saveInput(rawInput: string): Promise<RegisterState>;
  openRegisterPage(): Promise<ActionResult>;
  addInputToEmailList(): Promise<ActionResult>;
  setEmailSelected(emailItemId: string, selected: boolean): Promise<RegisterState>;
  toggleEmailExpanded(emailItemId: string): Promise<RegisterState>;
  removeEmailItem(emailItemId: string): Promise<RegisterState>;
  generateAliasAndFillEmail(): Promise<ActionResult>;
  fillEmailFromInput(): Promise<ActionResult>;
  fillOtp(code: string): Promise<ActionResult>;
  waitForOutlookOtp(): Promise<ActionResult>;
  fillProfileAndCreate(): Promise<ActionResult>;
  autoRunForCurrentPage(): Promise<void>;
}

export interface RegisterState {
  rawInput: string;
  email: string;
  accountLine: string;
  inputMode: AccountInputMode;
  emailItems: RegisterEmailItem[];
  autoOtp: boolean;
  apiBase: string;
  otpRequestedAt: number;
  updatedAt: number;
}

export type AccountInputMode = 'empty' | 'email' | 'outlook-line' | 'invalid';

export type RegisterEmailAliasCategory =
  | 'plus-gmail'
  | 'dotted-plus-gmail'
  | 'plus-googlemail'
  | 'dotted-plus-googlemail';

export interface RegisterEmailAlias {
  id: string;
  email: string;
  category: RegisterEmailAliasCategory;
  createdAt: number;
}

export interface RegisterEmailItem {
  id: string;
  email: string;
  accountLine: string;
  inputMode: Exclude<AccountInputMode, 'empty' | 'invalid'>;
  selected: boolean;
  expanded: boolean;
  aliases: RegisterEmailAlias[];
}

export interface ParsedAccountInput {
  ok: boolean;
  mode: AccountInputMode;
  email: string;
  accountLine: string;
  message: string;
}

export interface OutlookOtpMessage {
  type: 'opx:wait-outlook-otp';
  accountLine: string;
  apiBase?: string;
  timeoutMs?: number;
  intervalMs?: number;
  since?: number;
}

export interface OutlookOtpResponse {
  ok: boolean;
  message: string;
  code?: string;
}
