import { loadSmsRelayState, saveSmsRelayState } from '../../app/state';
import type { FeaturePanelHandle } from '../../app/types';
import { ensureSmsRelayHostPermissions, fetchSmsRelayCode } from './poller';
import {
  addSmsRelayTargetsToList,
  getCompatibleSmsRelayTargetIds,
  getSelectedSmsRelayTarget,
  normalizeSelectedSmsRelayTargetId,
} from './target-list';
import { formatSmsRelayRegion } from './phone-region.js';
import type { SmsRelayState, SmsRelayTarget } from './types';

interface TargetRuntime {
  target: SmsRelayTarget;
  status: 'waiting' | 'found' | 'error';
  message: string;
  code: string;
  inFlight: boolean;
}

export function createSmsPanel(container: HTMLElement): FeaturePanelHandle {
  const summary = document.createElement('div');
  summary.className = 'opx-summary';

  const input = document.createElement('textarea');
  input.className = 'opx-textarea opx-sms-input';
  input.rows = 2;
  input.placeholder = '+14642649811----https://xxxx.com/xxx';
  input.autocomplete = 'off';
  input.spellcheck = false;

  const addButton = createButton('添加', 'opx-button opx-button-secondary');
  const inputRow = document.createElement('div');
  inputRow.className = 'opx-sms-input-row';
  inputRow.append(input, addButton);

  const targetList = document.createElement('div');
  targetList.className = 'opx-sms-targets';

  const status = document.createElement('div');
  status.className = 'opx-status';
  status.textContent = '添加号码后，可在列表中选择、立即获取验证码或删除。';

  const runtimeById = new Map<string, TargetRuntime>();
  let currentState: SmsRelayState | null = null;
  let lastSavedInput = '';
  let inputSaveTimer: number | null = null;
  let inputFocused = false;

  container.append(summary, inputRow, targetList, status);

  input.addEventListener('input', () => {
    scheduleInputSave();
    renderSummary();
  });
  input.addEventListener('focus', () => {
    inputFocused = true;
  });
  input.addEventListener('blur', () => {
    inputFocused = false;
    void persistInputNow();
  });
  addButton.addEventListener('click', async () => {
    await persistInputNow();
    await addTargetsFromInput();
  });

  const update = async () => {
    const state = await loadSharedSmsRelayState();
    currentState = state;
    if (!inputFocused && input.value !== state.rawInput) {
      input.value = state.rawInput;
      lastSavedInput = state.rawInput;
    }
    renderTargetsFromState();
    renderSummary();
  };

  void update();
  return { update, onShow: update };

  function scheduleInputSave(): void {
    if (inputSaveTimer) {
      window.clearTimeout(inputSaveTimer);
    }
    inputSaveTimer = window.setTimeout(() => void persistInputNow(), 450);
  }

  async function persistInputNow(): Promise<void> {
    if (inputSaveTimer) {
      window.clearTimeout(inputSaveTimer);
      inputSaveTimer = null;
    }
    const rawInput = input.value;
    if (rawInput === lastSavedInput) {
      return;
    }
    currentState = await saveSharedSmsRelayState({ rawInput });
    lastSavedInput = rawInput;
    renderSummary();
  }

  async function addTargetsFromInput(): Promise<void> {
    const state = currentState || await loadSmsRelayState();
    const result = addSmsRelayTargetsToList(state.targets, state.selectedTargetId, input.value);

    if (result.errors.length) {
      setStatus(status, result.errors.join('；'), 'error');
      return;
    }
    if (!result.addedCount) {
      setStatus(status, result.targets.length ? '号码已在列表中，无需重复添加。' : '请先输入号码和 API。', 'pending');
      return;
    }

    setStatus(status, '正在准备接码 API 域名权限...', 'pending');
    const permission = await ensureSmsRelayHostPermissions(result.targets.map((target) => target.url));
    if (!permission.ok) {
      setStatus(status, permission.message, 'error');
      return;
    }

    input.value = '';
    lastSavedInput = '';
    currentState = await saveSharedSmsRelayState({
      rawInput: '',
      targets: result.targets,
      selectedTargetId: result.selectedTargetId,
    });
    renderTargetsFromState();
    renderSummary();
    setStatus(status, `已添加 ${result.addedCount} 个号码。`, 'ok');
  }

  function renderTargetsFromState(): void {
    const state = currentState;
    const targets = state?.targets || [];
    const selectedTargetId = state?.selectedTargetId || '';
    const nextIds = new Set(targets.map((target) => target.id));

    for (const [id] of runtimeById) {
      if (!nextIds.has(id)) {
        runtimeById.delete(id);
      }
    }

    for (const target of targets) {
      const current = runtimeById.get(target.id);
      if (current) {
        current.target = target;
      } else {
        runtimeById.set(target.id, {
          target,
          status: 'waiting',
          message: '未获取',
          code: '',
          inFlight: false,
        });
      }
    }

    targetList.textContent = '';
    if (!targets.length) {
      targetList.append(createEmpty('暂无号码，请输入后点击添加。'));
      return;
    }

    for (const target of targets) {
      const runtime = runtimeById.get(target.id);
      if (runtime) {
        targetList.append(createTargetRow(runtime, runtime.target.id === selectedTargetId));
      }
    }
  }

  function renderSummary(): void {
    const targetCount = currentState?.targets.length || 0;
    const selected = getSelectedSmsRelayTarget(currentState?.targets || [], currentState?.selectedTargetId || '');
    const selectedRegion = selected ? formatSmsRelayRegion(selected.dialCode, selected.countryName) : '';
    const selectedText = selected ? [selected.phone, selectedRegion].filter(Boolean).join(' · ') : '';
    summary.textContent = selected ? `${targetCount} 个号码 · 当前：${selectedText}` : `${targetCount} 个号码 · 未选择`;
  }

  function createTargetRow(runtime: TargetRuntime, selected: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'opx-sms-target-row';
    row.dataset.status = runtime.status;
    row.dataset.selected = String(selected);
    row.addEventListener('click', () => void selectTarget(runtime.target));

    const radio = document.createElement('input');
    radio.className = 'opx-sms-target-radio';
    radio.type = 'radio';
    radio.name = 'opx-sms-target';
    radio.checked = selected;
    radio.setAttribute('aria-label', `选择 ${runtime.target.phone}`);
    radio.addEventListener('click', (event) => {
      event.stopPropagation();
      void selectTarget(runtime.target);
    });

    const main = document.createElement('div');
    main.className = 'opx-sms-target-main';
    const phone = document.createElement('strong');
    phone.textContent = runtime.target.phone;
    const detail = document.createElement('span');
    const region = formatSmsRelayRegion(runtime.target.dialCode, runtime.target.countryName);
    detail.textContent = [region, runtime.code ? `验证码：${runtime.code}` : runtime.message]
      .filter(Boolean)
      .join(' · ');
    main.append(phone, detail);

    const actions = document.createElement('div');
    actions.className = 'opx-sms-target-actions';
    const fetchButton = createMiniButton(runtime.inFlight ? '获取中' : '立即获取');
    fetchButton.disabled = runtime.inFlight;
    fetchButton.addEventListener('click', (event) => {
      event.stopPropagation();
      void fetchTarget(runtime.target);
    });
    const deleteButton = createMiniButton('删除', 'opx-mini-button opx-mini-button-danger');
    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      void deleteTarget(runtime.target);
    });
    actions.append(fetchButton, deleteButton);

    row.append(radio, main, actions);
    return row;
  }

  async function selectTarget(target: SmsRelayTarget): Promise<void> {
    const targetId = target.id;
    const state = currentState || await loadSmsRelayState();
    if (state.selectedTargetId === targetId) {
      return;
    }
    currentState = await saveSharedSmsRelayState(
      { selectedTargetId: targetId },
      { remoteSelectedTargetId: getPreferredRemoteSmsTargetId(target) },
    );
    renderTargetsFromState();
    renderSummary();
    setStatus(status, '已选择号码。', 'ok');
  }

  async function fetchTarget(target: SmsRelayTarget): Promise<void> {
    const runtime = runtimeById.get(target.id);
    if (!runtime || runtime.inFlight) {
      return;
    }

    runtime.inFlight = true;
    runtime.status = 'waiting';
    runtime.message = '正在获取...';
    renderTargetsFromState();
    setStatus(status, `正在获取 ${target.phone} 的验证码...`, 'pending');

    const result = await fetchSmsRelayCode(target);
    runtime.inFlight = false;
    if (result.kind === 'code') {
      runtime.status = 'found';
      runtime.code = result.code;
      runtime.message = result.message;
      const history = [
        ...(currentState?.history || []),
        {
          id: `${target.phone}-${result.code}-${Date.now()}`,
          phone: target.phone,
          code: result.code,
          message: result.message,
          receivedAt: Date.now(),
        },
      ].slice(-50);
      currentState = await saveSharedSmsRelayState({ history });
      setStatus(status, `${target.phone} 已获取验证码 ${result.code}`, 'ok');
    } else if (result.kind === 'error') {
      runtime.status = 'error';
      runtime.message = result.message;
      setStatus(status, `${target.phone} 获取失败：${result.message}`, 'error');
    } else {
      runtime.status = 'waiting';
      runtime.message = result.message || '暂未收到短信';
      setStatus(status, `${target.phone} 暂未收到短信。`, 'ok');
    }
    renderTargetsFromState();
  }

  async function deleteTarget(target: SmsRelayTarget): Promise<void> {
    const state = currentState || await loadSmsRelayState();
    const targets = state.targets.filter((item) => item.id !== target.id);
    const selectedTargetId = normalizeSelectedSmsRelayTargetId(targets, state.selectedTargetId);
    runtimeById.delete(target.id);
    const response = await deleteSharedSmsRelayTarget(target);
    if (isLocalStoreResponse(response) && response.ok && response.store) {
      currentState = await saveSmsRelayState({
        targets: response.store.smsRelay.targets,
        selectedTargetId: response.store.smsRelay.selectedTargetId,
        history: response.store.smsRelay.history,
      });
    } else {
      currentState = await saveSharedSmsRelayState({ targets, selectedTargetId });
    }
    renderTargetsFromState();
    renderSummary();
    setStatus(status, `已删除 ${target.phone}。`, 'ok');
  }
}

function createButton(label: string, className = 'opx-button'): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = className;
  button.type = 'button';
  button.textContent = label;
  return button;
}

function createMiniButton(label: string, className = 'opx-mini-button opx-mini-button-secondary'): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = className;
  button.type = 'button';
  button.textContent = label;
  return button;
}

function createEmpty(text: string): HTMLElement {
  const item = document.createElement('div');
  item.className = 'opx-empty-inline';
  item.textContent = text;
  return item;
}

function setStatus(element: HTMLElement, message: string, type: 'pending' | 'ok' | 'error'): void {
  element.textContent = message;
  element.dataset.type = type;
}

async function loadSharedSmsRelayState(): Promise<SmsRelayState> {
  const state = await loadSmsRelayState();
  const response = await browser.runtime.sendMessage({ type: 'opx:local-store-get' }).catch(() => null);
  if (!isLocalStoreResponse(response) || !response.ok || !response.store) {
    return state;
  }
  return saveSmsRelayState({
    targets: response.store.smsRelay.targets,
    selectedTargetId: response.store.smsRelay.selectedTargetId,
    history: response.store.smsRelay.history,
  });
}

async function saveSharedSmsRelayState(
  patch: Partial<SmsRelayState>,
  options: { remoteSelectedTargetId?: string } = {},
): Promise<SmsRelayState> {
  let next = await saveSmsRelayState(patch);
  if (patch.targets) {
    const response = await browser.runtime.sendMessage({
      type: 'opx:local-store-upsert-sms-targets',
      targets: patch.targets,
    }).catch(() => null);
    if (isLocalStoreResponse(response) && response.ok && response.store) {
      next = await saveSmsRelayState({
        targets: response.store.smsRelay.targets,
        selectedTargetId: response.store.smsRelay.selectedTargetId,
        history: response.store.smsRelay.history,
      });
    }
  }
  if (patch.selectedTargetId !== undefined || patch.history !== undefined) {
    const response = await browser.runtime.sendMessage({
      type: 'opx:local-store-update-sms-relay',
      patch: {
        selectedTargetId: options.remoteSelectedTargetId || patch.selectedTargetId,
        history: patch.history,
      },
    }).catch(() => null);
    if (isLocalStoreResponse(response) && response.ok && response.store) {
      next = await saveSmsRelayState({
        targets: response.store.smsRelay.targets,
        selectedTargetId: response.store.smsRelay.selectedTargetId,
        history: response.store.smsRelay.history,
      });
    }
  }
  return next;
}

async function deleteSharedSmsRelayTarget(target: SmsRelayTarget): Promise<unknown> {
  const targetIds = getCompatibleSmsRelayTargetIds(target);
  let latestResponse: unknown = null;
  for (const targetId of targetIds) {
    latestResponse = await browser.runtime.sendMessage({
      type: 'opx:local-store-delete-sms-target',
      targetId,
    }).catch(() => null);
    if (!isLocalStoreResponse(latestResponse) || !latestResponse.ok || !latestResponse.store) {
      continue;
    }
    if (!hasAnySmsTargetId(latestResponse.store.smsRelay.targets, targetIds)) {
      break;
    }
  }
  return latestResponse;
}

function getPreferredRemoteSmsTargetId(target: SmsRelayTarget): string {
  return getCompatibleSmsRelayTargetIds(target)[1] || target.id;
}

function hasAnySmsTargetId(targets: SmsRelayTarget[], targetIds: string[]): boolean {
  return targets.some((target) => targetIds.includes(target.id));
}

function isLocalStoreResponse(value: unknown): value is {
  ok: boolean;
  store?: {
    smsRelay: {
      targets: SmsRelayTarget[];
      selectedTargetId: string;
      history: SmsRelayState['history'];
    };
  };
} {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { ok?: unknown }).ok === 'boolean',
  );
}
