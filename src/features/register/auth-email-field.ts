export interface EmailInputMetadata {
  id?: string;
  name?: string;
  type?: string;
  autocomplete?: string;
  placeholder?: string;
  ariaLabel?: string;
  labelText?: string;
  maxLength?: number;
}

const SWITCH_TO_EMAIL_RE =
  /继续使用(?:电子邮件地址|邮箱)(?:登录|注册)?|改用(?:电子邮件地址|邮箱)(?:登录|注册)?|continue\s+(?:using|with)\s+(?:an?\s+)?email(?:\s+address)?|use\s+(?:an?\s+)?email(?:\s+address)?(?:\s+instead)?|sign\s*(?:in|up)\s+with\s+email/i;
const SWITCH_ACTION_RE = /继续使用|改用|continue|use|sign\s*(?:in|up)/i;
const EMAIL_TEXT_RE = /电子邮件|邮箱|email/i;
const WORK_EMAIL_RE = /工作|business|work\s+email/i;

export function isEmailInputMetadata(input: EmailInputMetadata): boolean {
  const type = String(input.type || 'text').trim().toLowerCase();
  if (type === 'hidden' || type === 'password' || type === 'submit' || type === 'button') {
    return false;
  }

  const autocomplete = String(input.autocomplete || '').trim().toLowerCase();
  const haystack = [
    input.id,
    input.name,
    input.placeholder,
    input.ariaLabel,
    input.labelText,
    autocomplete,
  ].join(' ').toLowerCase();

  if (
    autocomplete.includes('one-time-code') ||
    /\b(otp|code|password|passcode)\b/.test(haystack) ||
    (Number(input.maxLength || 0) > 0 && Number(input.maxLength || 0) <= 8 && !haystack.includes('email'))
  ) {
    return false;
  }

  return (
    type === 'email' ||
    autocomplete === 'email' ||
    autocomplete === 'username' ||
    /\b(email|e-mail|username|identifier)\b/.test(haystack) ||
    /邮箱|郵箱|电子邮件|電子郵件|邮件地址|郵件地址/.test(haystack)
  );
}

export function isSwitchToEmailActionText(text: string): boolean {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value || WORK_EMAIL_RE.test(value)) {
    return false;
  }
  const isSignupEntry = /signup-button|免费注册|sign\s*up|register/i.test(value);
  return isSignupEntry ||
    SWITCH_TO_EMAIL_RE.test(value) ||
    (SWITCH_ACTION_RE.test(value) && EMAIL_TEXT_RE.test(value));
}
