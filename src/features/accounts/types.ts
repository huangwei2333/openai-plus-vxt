export interface AccountRecord {
  id: string;
  email: string;
  selected: boolean;
  idToken: string;
  accessToken: string;
  refreshToken: string;
  accountId: string;
  planType: string;
  checkoutUrl?: string;
  subscriptionStatus?: 'unknown' | 'not_subscribed' | 'active' | 'expired' | 'failed';
  subscriptionType?: string;
  planExpiresAt: string;
  sessionExpiredAt: string;
  lastRefreshAt: string;
  createdAt: number;
  updatedAt: number;
}

export interface AccountRuntimeStatus {
  planExpired: boolean;
  sessionExpired: boolean;
  planRemainingText: string;
  sessionRemainingText: string;
}
