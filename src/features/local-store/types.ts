import type { AccountRecord } from '../accounts/types';
import type { RegisterEmailItem } from '../register/types';
import type { SmsCodeRecord, SmsRelayTarget } from '../sms/types';

export interface LocalStore {
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

export interface LocalStoreResponse {
  ok: boolean;
  message?: string;
  store?: LocalStore;
  account?: AccountRecord | null;
  deleted?: boolean;
  importedCount?: number;
  skippedCount?: number;
}

export interface NativeLocalStoreLaunchResponse {
  ok: boolean;
  message?: string;
  started?: boolean;
}

export type LocalStoreMessage =
  | { type: 'opx:local-store-health' }
  | { type: 'opx:local-store-get' }
  | { type: 'opx:local-store-upsert-session'; account: AccountRecord }
  | { type: 'opx:local-store-import-accounts'; payload: unknown }
  | { type: 'opx:local-store-update-account'; accountId: string; patch: Partial<AccountRecord> }
  | { type: 'opx:local-store-delete-account'; accountId: string }
  | { type: 'opx:local-store-upsert-register-email-items'; items: RegisterEmailItem[] }
  | { type: 'opx:local-store-delete-register-email-item'; itemId: string }
  | { type: 'opx:local-store-upsert-sms-targets'; targets: SmsRelayTarget[] }
  | { type: 'opx:local-store-delete-sms-target'; targetId: string }
  | { type: 'opx:local-store-update-sms-relay'; patch: { selectedTargetId?: string; history?: SmsCodeRecord[] } };

export function isLocalStoreMessage(message: unknown): message is LocalStoreMessage {
  return Boolean(
    message &&
      typeof message === 'object' &&
      typeof (message as { type?: unknown }).type === 'string' &&
      String((message as { type: string }).type).startsWith('opx:local-store-'),
  );
}
