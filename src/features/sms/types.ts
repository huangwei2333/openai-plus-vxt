export interface SmsRelayTarget {
  id: string;
  phone: string;
  url: string;
  dialCode?: string;
  countryName?: string;
}

export interface SmsCodeRecord {
  id: string;
  phone: string;
  code: string;
  message: string;
  receivedAt: number;
}

export interface SmsRelayState {
  rawInput: string;
  targets: SmsRelayTarget[];
  selectedTargetId: string;
  history: SmsCodeRecord[];
  updatedAt: number;
}

export interface SmsRelayFetchMessage {
  type: 'opx:fetch-sms-relay';
  url: string;
}

export interface SmsRelayFetchResponse {
  ok: boolean;
  message: string;
  code?: string;
  redirectUrl?: string;
  data?: string;
  status?: number;
  text?: string;
  raw?: unknown;
}
