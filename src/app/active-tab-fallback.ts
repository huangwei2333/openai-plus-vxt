import type { PageState } from '../features/register/types';
import type { ActionResult } from './types';

export function createNoActiveAssistantPageState(): PageState {
  return {
    kind: 'unknown',
    label: '等待自动打开目标页面',
    canFillEmail: false,
    canFillOtp: false,
    canFillProfile: false,
  };
}

export function createNoActiveAssistantActionResult(): ActionResult {
  return {
    ok: false,
    message: '暂未找到已打开的自动化页面，流程会自动打开目标页面。',
  };
}
