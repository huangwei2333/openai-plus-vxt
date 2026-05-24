export interface PaypalSignupPasswordSource {
  preferredPassword?: string;
  username?: string;
  fullName?: string;
  id?: string;
  fetchedAt?: number;
}

const PAYPAL_PASSWORD_MIN_LENGTH = 8;
const PAYPAL_PASSWORD_MAX_LENGTH = 20;

export function isValidPaypalSignupPassword(value: string): boolean {
  return value.length >= PAYPAL_PASSWORD_MIN_LENGTH &&
    value.length <= PAYPAL_PASSWORD_MAX_LENGTH &&
    !/\s/.test(value) &&
    /(?:\d|[^A-Za-z0-9])/.test(value);
}

export function createPaypalSignupPassword(source: PaypalSignupPasswordSource): string {
  const preferred = cleanPasswordText(source.preferredPassword || '');
  if (isValidPaypalSignupPassword(preferred)) {
    return preferred;
  }

  const base = cleanPasswordText(preferred || source.username || source.fullName || 'paypaluser')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 16) || 'paypaluser';
  const paddedBase = `${base}paypaluser`.slice(0, 16);
  const digit = String(`${source.id || ''}${source.fetchedAt || ''}`).replace(/\D/g, '').slice(-1) || '7';
  const password = `${paddedBase}${digit}!A`;

  return password.slice(0, PAYPAL_PASSWORD_MAX_LENGTH);
}

function cleanPasswordText(value: string): string {
  return value.trim().replace(/[^\x21-\x7E]/g, '');
}
