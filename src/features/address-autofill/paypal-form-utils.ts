export interface PaypalButtonMetadata {
  text?: string;
  dataTestId?: string;
  dataAtomicWaitIntent?: string;
  className?: string;
}

export type PaypalHostedStage =
  | 'outside_paypal'
  | 'login'
  | 'signup'
  | 'verification'
  | 'review'
  | 'approval'
  | 'unknown';

export interface PaypalHostedStageSnapshot {
  isPaypalHost: boolean;
  pathname: string;
  hasVerificationInputs?: boolean;
  hasSignupFields?: boolean;
  hasReviewConsent?: boolean;
  hasApprovalButton?: boolean;
  hasEmailInput?: boolean;
}

export interface PaypalSignupFieldStatus {
  key: string;
  label: string;
  required?: boolean;
  present: boolean;
  filled: boolean;
}

export interface PaypalSignupReadiness {
  ready: boolean;
  missing: string[];
}

export function normalizePaypalSignupPhone(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

export function normalizePaypalVerificationCode(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 6 ? digits.slice(0, 6) : '';
}

export function evaluatePaypalSignupReadiness(
  fields: PaypalSignupFieldStatus[],
  hasEnabledCreateAccountButton: boolean,
): PaypalSignupReadiness {
  const requiredFields = fields.filter((field) => field.required !== false && field.present);
  const missing = requiredFields
    .filter((field) => !field.filled)
    .map((field) => field.label);

  if (requiredFields.length === 0) {
    missing.push('PayPal 注册表单');
  }
  if (!hasEnabledCreateAccountButton) {
    missing.push('创建账号按钮');
  }

  return {
    ready: missing.length === 0,
    missing,
  };
}

export function isPaypalHostedSubmitButtonMetadata(metadata: PaypalButtonMetadata): boolean {
  const text = normalizedText(metadata.text);
  const dataTestId = normalizedText(metadata.dataTestId);
  const dataAtomicWaitIntent = normalizedText(metadata.dataAtomicWaitIntent);
  const className = normalizedText(metadata.className);
  return dataTestId === 'submit-button' ||
    dataTestId === 'hosted-payment-submit-button' ||
    dataAtomicWaitIntent === 'submit_email' ||
    className.split(/\s+/).includes('submitbutton--complete') ||
    /\b(pay|continue|next|agree|subscribe)\b/i.test(text);
}

export function detectPaypalHostedStage(snapshot: PaypalHostedStageSnapshot): PaypalHostedStage {
  if (!snapshot.isPaypalHost) {
    return 'outside_paypal';
  }
  if (snapshot.hasVerificationInputs) {
    return 'verification';
  }
  if (snapshot.pathname.startsWith('/checkoutweb/') || snapshot.hasSignupFields) {
    return 'signup';
  }
  if (snapshot.pathname.startsWith('/webapps/hermes') || snapshot.hasReviewConsent) {
    return 'review';
  }
  if (snapshot.hasEmailInput || snapshot.pathname === '/pay' || snapshot.pathname === '/pay/') {
    return 'login';
  }
  if (snapshot.hasApprovalButton) {
    return 'approval';
  }
  return 'unknown';
}

function normalizedText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}
