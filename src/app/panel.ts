import { createAddressPanel } from '../features/address-autofill/panel';
import { hasCompleteCreditCardInfo } from '../features/address-autofill/address-source';
import type { AddressProfile, RandomAddressResponse } from '../features/address-autofill/types';
import {
  PAYPAL_SECURITY_CHALLENGE_CODE,
  PAYPAL_SECURITY_CHALLENGE_MESSAGE,
} from '../features/address-autofill/paypal-security-challenge';
import type { PaypalHostedStage } from '../features/address-autofill/paypal-form-utils';
import { createAccountsPanel } from '../features/accounts/panel';
import {
  buildAccountRecordFromSession,
  createAccountsExportFileName,
  normalizeAccountRecords,
  serializeAccountsForExport,
  upsertAccountRecord,
} from '../features/accounts/session';
import type { AccountRecord } from '../features/accounts/types';
import { getChatGptSessionValidationMessage, isUsableChatGptSessionResponse } from '../features/link-extractor/session-validation';
import type { ChatGptSessionResponse, CheckoutLinkResponse, CheckoutOptions } from '../features/link-extractor/types';
import { createRegisterPanel } from '../features/register/panel';
import { recordRegisterEmailSession } from '../features/register/email-alias';
import type { RegisterController } from '../features/register/types';
import {
  REGISTER_WORKFLOW_STEP_GROUPS,
  REGISTER_WORKFLOW_STEPS,
  allowsPaypalManualChallenge,
  appendPaypalCountryUsParam,
  canEnterPaypalSignupStep,
  canCompleteOpenAiPayStep,
  canPreparePaypalRegistrationStep,
  canCompleteSubmitOtpStep,
  canRerunWorkflowStep,
  getExistingSessionWorkflowStatuses,
  getDefaultWorkflowStepSelection,
  getInitialWorkflowStatuses,
  getResumeWorkflowStatuses,
  getWorkflowGroupStatus,
  getWorkflowProgressText,
  getWorkflowStatusLabel,
  getWorkflowStepIndex,
  hasRunnableWorkflowSelection,
  isWorkflowStepSelected,
  parseManualWorkflowSessionInput,
  setWorkflowSectionSelected,
  type RegisterWorkflowSectionId,
  type RegisterWorkflowStepGroup,
  type RegisterWorkflowStepId,
  type RegisterWorkflowStepSelection,
  type RegisterWorkflowStepStatus,
} from '../features/register/workflow';
import { createWorkflowRunControl, getWorkflowPrimaryButtonLabel } from '../features/register/workflow-control';
import { createSettingsDialog } from '../features/settings/panel';
import { loadAddressAutofillSettings } from '../features/settings/state';
import type { AddressAutofillSettings } from '../features/settings/types';
import { createSmsPanel } from '../features/sms/panel';
import { fetchSmsRelayCode } from '../features/sms/poller';
import { getSelectedSmsRelayTarget } from '../features/sms/target-list';
import type { SmsRelayTarget } from '../features/sms/types';
import { createVersionNotice } from '../features/version-check/panel';
import {
  isFeatureTab,
  loadAccountRecords,
  loadAppState,
  loadLinkExtractorState,
  loadRegisterState,
  loadSmsRelayState,
  saveAccountRecords,
  saveActiveTab,
  savePanelCollapsed,
  saveRegisterState,
  saveSmsRelayState,
} from './state';
import { PANEL_STYLES } from './styles';
import type { ActionResult, FeaturePanelHandle, FeatureTab } from './types';

export interface PanelOptions {
  mode?: 'floating' | 'sidepanel';
}

export function createPanel(root: ShadowRoot, registerController: RegisterController, options: PanelOptions = {}): void {
  root.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = PANEL_STYLES;

  const shell = document.createElement('div');
  shell.className = options.mode === 'sidepanel' ? 'opx-shell opx-shell-sidepanel' : 'opx-shell';

  const collapseButton = document.createElement('button');
  collapseButton.className = 'opx-collapse-toggle';
  collapseButton.type = 'button';
  collapseButton.textContent = '收起';
  collapseButton.title = '收起侧边栏';
  collapseButton.setAttribute('aria-expanded', 'true');

  const panel = document.createElement('aside');
  panel.className = 'opx-panel';

  const topbar = document.createElement('div');
  topbar.className = 'opx-topbar';

  const tabs = document.createElement('div');
  tabs.className = 'opx-tabs';

  const registerTab = createTab('register', '注册');
  const subscriptionTab = createTab('subscription', '订阅');
  const configTab = createTab('config', '配置');
  const accountsTab = createTab('accounts', '账号');
  tabs.append(configTab, registerTab, subscriptionTab, accountsTab);

  const settingsButton = document.createElement('button');
  settingsButton.className = 'opx-icon-button';
  settingsButton.type = 'button';
  settingsButton.textContent = '⚙';
  settingsButton.title = '打开设置';
  settingsButton.setAttribute('aria-label', '打开设置');

  const state = document.createElement('div');
  state.className = 'opx-state';

  const registerView = createView();
  const subscriptionView = createView();
  const configView = createView();
  const accountsView = createView();
  const emailSection = createPanelSection('邮箱列表');
  const addressSection = createPanelSection('地址资料');
  const smsSection = createPanelSection('接码维护');
  const registerProgressSection = createPanelSection('注册步骤');
  const subscriptionProgressSection = createPanelSection('订阅步骤');
  registerView.append(registerProgressSection.body);
  subscriptionView.append(subscriptionProgressSection.body);
  configView.append(emailSection.body, smsSection.body, addressSection.body);

  const handles: Record<FeatureTab, FeaturePanelHandle> = {
    register: createNoopPanelHandle(),
    subscription: createRegisterWorkflowPanel(subscriptionProgressSection.content, registerController, 'subscription'),
    config: createNoopPanelHandle(),
    accounts: createAccountsPanel(accountsView),
  };
  const registerEmbeddedHandles = [
    createRegisterWorkflowPanel(registerProgressSection.content, registerController, 'register'),
  ];
  const configEmbeddedHandles = [
    createRegisterPanel(emailSection.content, registerController),
    createSmsPanel(smsSection.content),
    createAddressPanel(addressSection.content),
  ];
  const versionNotice = createVersionNotice();
  const settingsDialog = createSettingsDialog({
    onVersionChecked: () => versionNotice.update(true),
  });

  let activeTab: FeatureTab = 'config';

  const setCollapsed = (collapsed: boolean) => {
    shell.classList.toggle('is-collapsed', collapsed);
    collapseButton.textContent = collapsed ? '展开' : '收起';
    collapseButton.title = collapsed ? '展开侧边栏' : '收起侧边栏';
    collapseButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  };

  const setActiveTab = async (tab: string) => {
    if (!isFeatureTab(tab)) {
      return;
    }
    activeTab = tab;
    await saveActiveTab(tab);
    renderActiveTab();
    await handles[tab].onShow?.();
    await updateState();
  };

  const renderActiveTab = () => {
    for (const item of [registerTab, subscriptionTab, configTab, accountsTab]) {
      item.classList.toggle('is-active', item.dataset.tab === activeTab);
    }
    registerView.hidden = activeTab !== 'register';
    subscriptionView.hidden = activeTab !== 'subscription';
    configView.hidden = activeTab !== 'config';
    accountsView.hidden = activeTab !== 'accounts';
  };

  const updateState = async () => {
    await registerController.refreshPageState?.();
    const saved = await loadAppState();
    activeTab = saved.activeTab;
    setCollapsed(saved.panelCollapsed);
    renderActiveTab();
    state.textContent = getStateLabel(activeTab, registerController);
    await handles[activeTab].update();
    if (activeTab === 'register') {
      for (const handle of registerEmbeddedHandles) {
        await handle.update();
      }
    }
    if (activeTab === 'config') {
      for (const handle of configEmbeddedHandles) {
        await handle.update();
      }
    }
  };

  registerTab.addEventListener('click', () => void setActiveTab('register'));
  subscriptionTab.addEventListener('click', () => void setActiveTab('subscription'));
  configTab.addEventListener('click', () => void setActiveTab('config'));
  accountsTab.addEventListener('click', () => void setActiveTab('accounts'));
  settingsButton.addEventListener('click', () => settingsDialog.open());

  collapseButton.addEventListener('click', () => {
    const collapsed = !shell.classList.contains('is-collapsed');
    setCollapsed(collapsed);
    void savePanelCollapsed(collapsed);
  });

  topbar.append(tabs, settingsButton);
  panel.append(topbar, versionNotice.element, state, registerView, subscriptionView, configView, accountsView, settingsDialog.element);
  shell.append(collapseButton, panel);
  root.append(style, shell);

  window.setInterval(() => void updateState(), 1000);
  window.setTimeout(() => void versionNotice.update(), 800);
  void updateState().then(() => {
    void handles[activeTab].onShow?.();
    if (activeTab === 'register') {
      for (const handle of registerEmbeddedHandles) {
        void handle.update();
      }
    }
    if (activeTab === 'config') {
      for (const handle of configEmbeddedHandles) {
        void handle.update();
      }
    }
  });
}

function getStateLabel(activeTab: FeatureTab, registerController: RegisterController): string {
  if (activeTab === 'register') {
    return '注册：邮箱生成与资料准备';
  }
  if (activeTab === 'subscription') {
    return `订阅：${registerController.getPageState().label}`;
  }
  if (activeTab === 'config') {
    return '配置：邮箱、地址与接码维护';
  }
  return '账号：成功账号与 session';
}

function createView(): HTMLElement {
  const view = document.createElement('section');
  view.className = 'opx-view';
  return view;
}

function createTab(tab: FeatureTab, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'opx-tab';
  button.type = 'button';
  button.dataset.tab = tab;
  button.textContent = label;
  return button;
}

function createNoopPanelHandle(): FeaturePanelHandle {
  return {
    update: () => {},
  };
}

function createWorkflowSelection(visibleSection?: RegisterWorkflowSectionId): RegisterWorkflowStepSelection {
  let selection = getDefaultWorkflowStepSelection();
  if (!visibleSection) {
    return selection;
  }
  selection = setWorkflowSectionSelected(selection, 'register', visibleSection === 'register');
  selection = setWorkflowSectionSelected(selection, 'subscription', visibleSection === 'subscription');
  if (visibleSection === 'subscription') {
    selection = {
      ...selection,
      'read-session': false,
      'create-checkout': false,
      'open-checkout': false,
    };
  }
  return selection;
}

function createWorkflowTinyButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'opx-workflow-tiny-button';
  button.type = 'button';
  button.textContent = label;
  return button;
}

function createWorkflowCheckbox(checked: boolean, onChange: (checked: boolean) => void): HTMLInputElement {
  const checkbox = document.createElement('input');
  checkbox.className = 'opx-workflow-checkbox';
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.addEventListener('change', () => onChange(checkbox.checked));
  return checkbox;
}

function createPanelSection(title: string): { body: HTMLElement; content: HTMLElement } {
  const body = document.createElement('section');
  body.className = 'opx-flow-section';
  const heading = document.createElement('div');
  heading.className = 'opx-flow-section-title';
  heading.textContent = title;
  const content = document.createElement('div');
  content.className = 'opx-flow-section-content';
  body.append(heading, content);
  return { body, content };
}

function createRegisterWorkflowPanel(
  container: HTMLElement,
  controller: RegisterController,
  visibleSection?: RegisterWorkflowSectionId,
): FeaturePanelHandle {
  const isSubscriptionPanel = visibleSection === 'subscription';
  const sessionField = document.createElement('label');
  sessionField.className = 'opx-field opx-workflow-session-field';
  const sessionLabel = document.createElement('span');
  sessionLabel.className = 'opx-label';
  sessionLabel.textContent = isSubscriptionPanel ? '账号信息' : 'ChatGPT session / accessToken';
  const sessionInput = document.createElement('textarea');
  sessionInput.className = isSubscriptionPanel
    ? 'opx-textarea opx-workflow-session-input opx-workflow-account-input'
    : 'opx-textarea opx-workflow-session-input';
  sessionInput.placeholder = isSubscriptionPanel
    ? '粘贴账号页面复制的账号信息，格式同 codex_accounts.json'
    : '留空时自动读取当前 ChatGPT session；也可粘贴 session JSON 或 accessToken';
  sessionInput.spellcheck = false;
  sessionInput.rows = isSubscriptionPanel ? 4 : 2;
  sessionField.append(sessionLabel, sessionInput);
  const selectedPhone = document.createElement('div');
  selectedPhone.className = 'opx-workflow-phone';
  selectedPhone.hidden = !isSubscriptionPanel;
  const startButton = document.createElement('button');
  startButton.className = 'opx-button';
  startButton.type = 'button';
  const actionRow = document.createElement('div');
  actionRow.className = 'opx-workflow-actions';
  actionRow.append(startButton);
  const progress = document.createElement('div');
  progress.className = 'opx-workflow-progress';
  const list = document.createElement('div');
  list.className = 'opx-workflow-list';
  const status = document.createElement('div');
  status.className = 'opx-status';
  status.textContent = '点击开始后会按顺序处理当前页面中的流程步骤。';
  const otpDialog = createOtpDialog();

  let statuses = getInitialWorkflowStatuses();
  let stepSelection = createWorkflowSelection(visibleSection);
  let workflowContext = createWorkflowContext();
  const runControl = createWorkflowRunControl();
  let manualContinueStepIndex: number | null = null;
  let manualContinueStepId: RegisterWorkflowStepId | null = null;
  let manualContinueResolver: (() => void) | null = null;
  let failedContinueStepIndex: number | null = null;
  let paypalVerificationCode = '';
  let currentWorkflowEmail = '';
  let selectedSmsRelayTarget: SmsRelayTarget | null = null;
  syncSkippedSteps(0);
  container.append(sessionField, selectedPhone, actionRow, progress, list, status, otpDialog.element);
  render();

  sessionInput.addEventListener('input', () => {
    if (isSubscriptionPanel) {
      currentWorkflowEmail = readManualWorkflowAccountInput().data?.email || '';
      render();
    }
  });

  startButton.addEventListener('click', () => {
    if (runControl.running) {
      requestStop();
      return;
    }
    void start();
  });
  return {
    update: async () => {
      await updateSelectedSmsRelayTarget();
      await updateCurrentWorkflowEmail();
      render();
    },
  };

  async function start(): Promise<void> {
    if (!hasRunnableWorkflowSelection(stepSelection)) {
      setStatus(status, '请至少勾选一个流程后再开始。', 'error');
      render();
      return;
    }
    if (!isSubscriptionPanel) {
      const localStoreReady = await ensureLocalStoreReadyForRegistration();
      if (!localStoreReady.ok) {
        setStatus(status, localStoreReady.message, 'error');
        render();
        return;
      }
    }
    if (isSubscriptionPanel && !readManualWorkflowAccountInput().ok) {
      setStatus(status, '请先粘贴账号页面复制的账号信息。', 'error');
      render();
      return;
    }
    return startFromStep();
  }

  async function startFromStep(resumeStepId?: RegisterWorkflowStepId): Promise<void> {
    if (!runControl.start()) {
      return;
    }
    const resumeIndex = resumeStepId ? getStepIndex(resumeStepId) : 0;
    if (resumeStepId) {
      statuses = getResumeWorkflowStatuses(statuses, resumeStepId);
      setStatus(status, `正在从第 ${resumeIndex + 1} 步继续自动化流程...`, 'pending');
    } else {
      workflowContext = createWorkflowContext();
      statuses = getInitialWorkflowStatuses();
      paypalVerificationCode = '';
      setStatus(status, '正在启动自动化流程...', 'pending');
    }
    failedContinueStepIndex = null;
    syncSkippedSteps(resumeIndex);
    render();
    const context = workflowContext;
    const shouldRunStep = (stepId: RegisterWorkflowStepId) => {
      return getStepIndex(stepId) >= resumeIndex && isWorkflowStepSelected(stepSelection, stepId);
    };
    try {
      if (isSubscriptionPanel) {
        const account = readManualWorkflowAccountInput();
        if (!account.ok || !account.data) {
          setStatus(status, account.message || '请先粘贴账号页面复制的账号信息。', 'error');
          return;
        }
        context.existingSession = account.data;
        context.session = account.data;
        context.checkoutUrl = account.data.record?.checkoutUrl || '';
        currentWorkflowEmail = account.data.email || '';
      } else {
        const manualSession = readManualWorkflowSessionInput();
        if (!manualSession.ok) {
          setStatus(status, manualSession.message, 'error');
          return;
        }
        context.existingSession = context.existingSession ?? manualSession.data ?? await tryReadExistingSession(isStopRequested);
      }
      currentWorkflowEmail = resolveWorkflowEmail(context) || currentWorkflowEmail;

      if (context.existingSession && shouldRunStep('email')) {
        statuses = getExistingSessionWorkflowStatuses();
        syncSkippedSteps(resumeIndex);
        setStatus(
          status,
          context.existingSession.source === 'manual'
            ? '已使用输入框中的 session / accessToken，已跳过注册步骤。'
            : '检测到当前已登录 ChatGPT 账号，已跳过注册步骤。',
          'ok',
        );
        render();
      } else if (!context.existingSession) {
        if (shouldRunStep('email')) await runStep('email', async () => {
          const state = await controller.loadState();
          const selected = state.emailItems.find((item) => item.selected);
          if (!selected) {
            return fail('请先添加并选择一个原邮箱。');
          }
          currentWorkflowEmail = selected.email;
          render();
          return ok(`已选择邮箱：${selected.email}`, state);
        });

        if (shouldRunStep('address')) context.addressSettings = await runStep('address', loadWorkflowAddressSettings);

        if (shouldRunStep('sms')) await runStep('sms', async () => {
          return ok('Email OTP will be entered manually.', null);
        });

        if (shouldRunStep('open-register')) await runStep('open-register', async () => {
          const openResult = await controller.openRegisterPage();
          if (!openResult.ok) {
            return openResult;
          }
          const ready = await waitForPageState((page) => page.canFillEmail, 45_000, 'Register email page is not ready.');
          return ready.ok ? ok('Register page is ready.') : ready;
        });
        if (shouldRunStep('submit-email')) await runStep('submit-email', () => controller.generateAliasAndFillEmail());
        if (shouldRunStep('submit-otp')) await runStep('submit-otp', async () => {
          const ready = await waitForPageState((page) => page.canFillOtp, 180_000, 'Email OTP page timed out.');
          if (!ready.ok) {
            return ready;
          }
          const otp = await otpDialog.open();
          if (otp.confirmed) {
            const result = await controller.fillOtp(otp.code);
            if (!result.ok) {
              return result;
            }
            return waitForProfileAfterOtp();
          }
          await waitForManualContinue('请在验证码页面手动输入并继续，完成后点击进度栏右侧继续。');
          return waitForProfileAfterOtp();
        });
        if (shouldRunStep('fill-profile')) await runStep('fill-profile', async () => {
          const ready = await waitForPageState((page) => page.canFillProfile, 120_000, '等待资料填写页超时。');
          if (!ready.ok) {
            return ready;
          }
          return controller.fillProfileAndCreate();
        });
      }

      if (shouldRunStep('read-session')) {
        context.session = await runStep('read-session', () => (
          context.existingSession
            ? Promise.resolve(ok(
              context.existingSession.source === 'manual'
                ? '已使用输入框中的 session / accessToken。'
                : '已使用当前登录 ChatGPT session。',
              context.existingSession,
            ))
            : readChatGptSessionWithRetry(90_000, isStopRequested)
        ));
      }
      if (shouldRunStep('create-checkout')) {
        context.checkoutUrl = await runStep('create-checkout', () => {
          if (!context.session?.accessToken) {
            return Promise.resolve(fail('缺少 ChatGPT session，请勾选并执行“读取 session”或粘贴 accessToken。'));
          }
          return createHostedCheckoutLink(context.session.accessToken);
        });
        if (context.checkoutUrl && context.session?.record) {
          context.session.record = await saveWorkflowCheckoutUrl(context.session.record, context.checkoutUrl);
        }
      }
      if (shouldRunStep('open-checkout')) await runStep('open-checkout', async () => {
        if (!context.checkoutUrl) {
          return fail('缺少 checkout 长链接，请先勾选并执行“生成 checkout 长链接”。');
        }
        await browser.tabs.create({ url: context.checkoutUrl, active: true });
        const url = await waitForActiveTabUrl(isPayOpenAiUrl, 60_000, isStopRequested);
        return url ? ok('已打开 OpenAI hosted checkout。') : fail('已打开订阅链接，但未检测到 pay.openai.com 页面。');
      });

      if (shouldRunStep('fill-openai-pay')) await runStep('fill-openai-pay', async () => {
        if (isSubscriptionPanel && !resumeStepId) {
          const openResult = await openManualCheckoutUrl(context, isStopRequested);
          if (!openResult.ok) {
            return openResult;
          }
        }
        const settings = await resolveAddressSettings();
        context.paymentAddress = await fetchWorkflowAddress(settings.city);
        const result = await fillPaymentPageWithRetry(context.paymentAddress, isPayOpenAiUrl, 60_000, isStopRequested);
        if (!result.ok) {
          return result;
        }
        const url = await waitForActiveTabUrl(canCompleteOpenAiPayStep, 180_000, isStopRequested);
        if (!url) {
          return fail('已选择 PayPal 并尝试点击订阅，但未检测到 PayPal 注册页，请确认页面是否拦截或表单仍有错误。');
        }
        const normalizedUrl = await appendPaypalCountryUsToActiveTab(url);
        if (normalizedUrl !== url) {
          await waitForActiveTabUrl((currentUrl) => currentUrl === normalizedUrl, 15_000, isStopRequested);
        }
        return ok(result.message + '; redirected to PayPal signup page.');
      });
      if (shouldRunStep('register-paypal')) await runStep('register-paypal', async () => {
        const url = await waitForActiveTabUrl(canCompleteOpenAiPayStep, 180_000, isStopRequested);
        if (!url) {
          return fail('PayPal page was not detected after OpenAI Pay submit.');
        }
        const stage = await waitForPaypalHostedStageWithManualChallenge(
          'register-paypal',
          ['signup', 'verification', 'review', 'approval'],
          180_000,
          true,
          waitForManualContinue,
          isStopRequested,
        );
        return stage.ok ? ok(stage.message) : fail(stage.message);
      });
      if (shouldRunStep('fill-paypal-signup')) await runStep('fill-paypal-signup', async () => {
        const listenResult = await ensurePaypalSmsListening(context);
        if (!listenResult.ok) {
          return listenResult;
        }
        const stage = await waitForPaypalHostedStageWithManualChallenge(
          'fill-paypal-signup',
          ['signup', 'verification', 'review', 'approval'],
          90_000,
          false,
          waitForManualContinue,
          isStopRequested,
        );
        if (!stage.ok) {
          return stage;
        }
        if (stage.data && stage.data !== 'signup') {
          return ok(stage.message);
        }
        const ready = await waitForPaypalSignupFormWithManualChallenge('fill-paypal-signup', 60_000);
        if (!ready.ok) {
          return ready;
        }
        if (!context.paymentAddress) {
          const settings = await resolveAddressSettings();
          context.paymentAddress = await fetchWorkflowAddress(settings.city);
        }
        const fillResult = await fillPaypalSignupFormWithoutSubmit(context.paymentAddress, 60_000, waitForManualContinue, isStopRequested);
        if (!fillResult.ok) {
          return fillResult;
        }
        const clickResult = await runPaypalActionWithManualChallenge(
          'fill-paypal-signup',
          { mode: 'click-paypal-create-account' },
          90_000,
          waitForManualContinue,
          isStopRequested,
        );
        if (!clickResult.ok) {
          return clickResult;
        }
        const submittedGate = await waitForPaypalHostedStageWithManualChallenge(
          'fill-paypal-signup',
          ['verification', 'review', 'approval', 'outside_paypal'],
          120_000,
          false,
          waitForManualContinue,
          isStopRequested,
        );
        return submittedGate.ok
          ? ok((listenResult.data?.message || listenResult.message) + '; ' + fillResult.message + '; ' + clickResult.message + '; ' + submittedGate.message)
          : fail(submittedGate.message);
      });
      if (shouldRunStep('fill-paypal-code')) await runStep('fill-paypal-code', async () => {
        const fillCodeResult = await waitForAndFillPaypalVerificationCode(context, 120_000, waitForManualContinue, isStopRequested);
        if (!fillCodeResult.ok) {
          return fillCodeResult;
        }
        const verifiedGate = await waitForPaypalHostedStageWithManualChallenge(
          'fill-paypal-code',
          ['review', 'approval', 'outside_paypal'],
          120_000,
          false,
          waitForManualContinue,
          isStopRequested,
        );
        return verifiedGate.ok
          ? ok(fillCodeResult.message + '; ' + verifiedGate.message)
          : fail(verifiedGate.message);
      });
      if (shouldRunStep('confirm-paypal-code')) await runStep('confirm-paypal-code', async () => {
        return waitForPaypalVerificationResultWithRetry(120_000, waitForManualContinue, isStopRequested);
      });
      if (shouldRunStep('complete-subscription')) await runStep('complete-subscription', async () => {
        const completeResult = await completePaypalSubscriptionWithRetry(180_000, waitForManualContinue, isStopRequested);
        if (!completeResult.ok) {
          return completeResult;
        }
        const exitGate = await waitForPaypalExitAfterCompletion(90_000, isStopRequested);
        if (!exitGate.ok) {
          return exitGate;
        }
        const refreshed = await readChatGptSessionWithRetry(90_000, isStopRequested);
        if (!refreshed.ok || !refreshed.data?.record) {
          return refreshed;
        }
        const fileName = exportWorkflowAccount(refreshed.data.record);
        return ok(`${completeResult.message}；账号已保存并导出：${fileName}`);
      });

      setStatus(status, 'Workflow completed. Please confirm the final payment state.', 'ok');
    } catch (error) {
      if (!(error instanceof WorkflowStop)) {
        setStatus(status, errorMessage(error), 'error');
      }
    } finally {
      runControl.finish();
      manualContinueStepIndex = null;
      manualContinueResolver = null;
      render();
    }

    async function resolveAddressSettings(): Promise<AddressAutofillSettings> {
      if (context.addressSettings) {
        return context.addressSettings;
      }
      const result = await loadWorkflowAddressSettings();
      if (!result.ok || !result.data) {
        throw new Error(result.message);
      }
      context.addressSettings = result.data;
      return context.addressSettings;
    }
  }

  function readManualWorkflowSessionInput(): StepResult<WorkflowSessionData | null> {
    const raw = sessionInput.value.trim();
    if (!raw) {
      return ok('', null);
    }
    try {
      return ok('Read manual session.', {
        ...parseManualWorkflowSessionInput(raw),
        source: 'manual',
      });
    } catch (error) {
      return fail('session parse failed: ' + errorMessage(error));
    }
  }

  function readManualWorkflowAccountInput(): StepResult<WorkflowSessionData> {
    const raw = sessionInput.value.trim();
    if (!raw) {
      return fail('请先粘贴账号页面复制的账号信息。');
    }
    try {
      const record = parseManualWorkflowAccountRecord(raw);
      if (!record.email) {
        return fail('账号信息中没有邮箱。');
      }
      if (!record.accessToken) {
        return fail('账号信息中没有 access_token / accessToken。');
      }
      if (!record.checkoutUrl) {
        return fail('账号信息中没有 checkout_url / checkoutUrl。');
      }
      return ok('已读取账号信息。', {
        accessToken: record.accessToken,
        sessionClipboardText: raw,
        email: record.email,
        record,
        source: 'manual',
      });
    } catch (error) {
      return fail('账号信息解析失败：' + errorMessage(error));
    }
  }

  function parseManualWorkflowAccountRecord(raw: string): AccountRecord {
    const parsed = JSON.parse(raw) as unknown;
    const records = normalizeAccountRecords(extractManualAccountRecords(parsed));
    const record = records.find((item) => item.selected) || records[0];
    if (!record) {
      throw new Error('没有找到 codex_accounts.json 格式的账号记录。');
    }
    return record;
  }

  function extractManualAccountRecords(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === 'object') {
      const record = value as { accounts?: unknown };
      if (Array.isArray(record.accounts)) {
        return record.accounts;
      }
      return [value];
    }
    return [];
  }

  async function openManualCheckoutUrl(
    context: WorkflowContext,
    shouldStop?: () => boolean,
  ): Promise<StepResult<void>> {
    if (!context.checkoutUrl) {
      return fail('账号信息中没有 checkout_url / checkoutUrl。');
    }
    await browser.tabs.create({ url: context.checkoutUrl, active: true });
    const url = await waitForActiveTabUrl(isPayOpenAiUrl, 60_000, shouldStop);
    return url
      ? ok('已打开 OpenAI 支付页。')
      : fail('已打开 checkout 长链接，但未检测到 pay.openai.com 页面。');
  }

  function requestStop(): void {
    if (!runControl.requestStop()) {
      return;
    }
    manualContinueStepIndex = null;
    manualContinueStepId = null;
    const resolve = manualContinueResolver;
    manualContinueResolver = null;
    resolve?.();
    setStatus(status, '正在停止自动化流程...', 'pending');
    render();
  }

  function resumeFromFailedStep(index: number): void {
    if (runControl.running) {
      return;
    }
    const step = REGISTER_WORKFLOW_STEPS[index];
    if (!step) {
      return;
    }
    if (!isWorkflowStepSelected(stepSelection, step.id)) {
      setStatus(status, '请先勾选失败步骤后再继续。', 'error');
      render();
      return;
    }
    void startFromStep(step.id);
  }

  function restartFromStep(stepId: RegisterWorkflowStepId): void {
    if (runControl.running) {
      return;
    }
    stepSelection = { ...stepSelection, [stepId]: true };
    const stepIndex = getStepIndex(stepId);
    if (stepId === 'fill-paypal-signup' || stepId === 'fill-paypal-code') {
      resetPaypalSmsListening(workflowContext);
    }
    statuses = getResumeWorkflowStatuses(statuses, stepId);
    syncSkippedSteps(stepIndex);
    void startFromStep(stepId);
  }

  function syncSkippedSteps(fromIndex: number): void {
    statuses = statuses.map((currentStatus, index) => {
      if (index < fromIndex) {
        return currentStatus;
      }
      const step = REGISTER_WORKFLOW_STEPS[index];
      if (!step) {
        return currentStatus;
      }
      return isWorkflowStepSelected(stepSelection, step.id) ? currentStatus : 'skipped';
    });
  }

  function ensureNotStopped(): void {
    if (runControl.stopRequested) {
      setStatus(status, '已停止自动化流程。', 'error');
      throw new WorkflowStop();
    }
  }

  function isStopRequested(): boolean {
    return runControl.stopRequested;
  }

  async function runStep<T>(
    stepId: RegisterWorkflowStepId,
    action: () => Promise<StepResult<T>>,
  ): Promise<T> {
    ensureNotStopped();
    const index = getStepIndex(stepId);
    setStep(index, 'running');
    let result: StepResult<T>;
    try {
      result = await action();
      ensureNotStopped();
    } catch (error) {
      if (error instanceof WorkflowStop) {
        setStep(index, 'failed');
        throw error;
      }
      failStep(index, errorMessage(error));
      throw new WorkflowStop();
    }
    if (!result.ok) {
      failStep(index, result.message);
      throw new WorkflowStop();
    }
    completeStep(index);
    if (result.message) {
      setStatus(status, result.message, 'ok');
    }
    return result.data as T;
  }

  function setStep(index: number, nextStatus: RegisterWorkflowStepStatus): void {
    statuses[index] = nextStatus;
    render();
  }

  function completeStep(index: number): void {
    setStep(index, 'completed');
  }

  function failStep(index: number, message: string): void {
    failedContinueStepIndex = runControl.stopRequested ? null : index;
    setStep(index, 'failed');
    setStatus(status, message, 'error');
  }

  function render(): void {
    startButton.textContent = getWorkflowPrimaryButtonLabel(runControl);
    startButton.classList.toggle('opx-button-danger', runControl.running);
    startButton.disabled = (runControl.running && runControl.stopRequested) ||
      (!runControl.running && !hasRunnableWorkflowSelection(stepSelection));
    sessionInput.disabled = runControl.running;
    renderSelectedSmsRelayTarget();
    progress.textContent = '';
    const progressText = document.createElement('span');
    progressText.textContent = getVisibleWorkflowProgressText();
    progress.append(progressText);
    const currentEmail = resolveWorkflowEmail(workflowContext) || currentWorkflowEmail;
    if (currentEmail) {
      const emailButton = document.createElement('button');
      emailButton.className = 'opx-workflow-email-copy';
      emailButton.type = 'button';
      emailButton.textContent = currentEmail;
      emailButton.title = '点击复制当前邮箱';
      emailButton.addEventListener('click', () => {
        void copyWorkflowEmail(emailButton, currentEmail);
      });
      progress.append(emailButton);
    }
    list.textContent = '';
    if (!visibleSection || visibleSection === 'register') {
      renderWorkflowSection('register', '注册流程');
    }
    if (!visibleSection || visibleSection === 'subscription') {
      renderWorkflowSection('subscription', '订阅流程');
    }
    return;
    REGISTER_WORKFLOW_STEPS.forEach((step, index) => {
      const row = document.createElement('div');
      row.className = 'opx-workflow-step';
      row.dataset.status = statuses[index];
      const number = document.createElement('span');
      number.className = 'opx-workflow-step-num';
      number.textContent = String(index + 1);
      const label = document.createElement('span');
      label.className = 'opx-workflow-step-label';
      label.textContent = step.label;
      const state = document.createElement('span');
      state.className = 'opx-workflow-step-state';
      if (manualContinueStepIndex === index) {
        const continueButton = document.createElement('button');
        continueButton.className = 'opx-workflow-continue';
        continueButton.type = 'button';
        continueButton.textContent = '继续';
        continueButton.addEventListener('click', () => {
          void handleManualContinueClick(index, continueButton);
        });
        state.append(continueButton);
      } else if (!runControl.running && failedContinueStepIndex === index && statuses[index] === 'failed') {
        const continueButton = document.createElement('button');
        continueButton.className = 'opx-workflow-continue';
        continueButton.type = 'button';
        continueButton.textContent = '缁х画';
        continueButton.addEventListener('click', () => {
          const failedStep = REGISTER_WORKFLOW_STEPS[index];
          if (failedStep && shouldRestartPaypalSmsOnFailedResume(failedStep.id)) {
            resetPaypalSmsListening(workflowContext);
          }
          resumeFromFailedStep(index);
        });
        state.append(continueButton);
      } else {
        state.textContent = getWorkflowStatusLabel(statuses[index]);
      }
      if (step.id === 'fill-paypal-code' && paypalVerificationCode && !state.querySelector('.opx-workflow-continue')) {
        state.textContent = '';
        const codeButton = document.createElement('button');
        codeButton.className = 'opx-workflow-code-copy';
        codeButton.type = 'button';
        codeButton.textContent = paypalVerificationCode;
        codeButton.title = '点击复制 PayPal 验证码';
        codeButton.addEventListener('click', () => {
          void copyPaypalVerificationCode(codeButton);
        });
        state.append(codeButton);
      }
      row.append(number, label, state);
      list.append(row);
    });
  }

  function renderSelectedSmsRelayTarget(): void {
    if (!isSubscriptionPanel) {
      return;
    }
    selectedPhone.hidden = false;
    selectedPhone.textContent = selectedSmsRelayTarget
      ? `当前接码手机号：${formatSmsRelayTargetLabel(selectedSmsRelayTarget)}`
      : '当前接码手机号：未选择';
  }

  function renderWorkflowSection(sectionId: RegisterWorkflowSectionId, title: string): void {
    const groups = REGISTER_WORKFLOW_STEP_GROUPS.filter((group) => (
      group.sectionId === sectionId &&
      !(isSubscriptionPanel && group.id === 'subscription-prep')
    ));
    const section = document.createElement('section');
    section.className = 'opx-workflow-section';
    const header = document.createElement('div');
    header.className = 'opx-workflow-section-header';
    const checkbox = createWorkflowCheckbox(areSectionStepsSelected(sectionId), (checked) => {
      stepSelection = setVisibleWorkflowSectionSelected(stepSelection, sectionId, checked);
      syncSkippedSteps(0);
      render();
    });
    checkbox.disabled = runControl.running;
    checkbox.indeterminate = isSectionSelectionIndeterminate(sectionId);
    const label = document.createElement('span');
    label.className = 'opx-workflow-section-title';
    label.textContent = title;
    const state = document.createElement('span');
    state.className = 'opx-workflow-section-state';
    state.textContent = getSectionSummary(groups);
    header.append(checkbox, label, state);
    section.append(header);
    for (const group of groups) {
      section.append(renderWorkflowGroup(group));
    }
    list.append(section);
  }

  function renderWorkflowGroup(group: RegisterWorkflowStepGroup): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'opx-workflow-group';
    wrapper.dataset.status = getWorkflowGroupStatus(statuses, group);
    const row = document.createElement('div');
    row.className = 'opx-workflow-group-row';
    const label = document.createElement('span');
    label.className = 'opx-workflow-group-label';
    label.textContent = group.label;
    const state = document.createElement('span');
    state.className = 'opx-workflow-group-state';
    state.textContent = getWorkflowStatusLabel(getWorkflowGroupStatus(statuses, group));
    row.append(label, state);
    wrapper.append(row);
    for (const stepId of group.stepIds) {
      wrapper.append(renderWorkflowStep(stepId));
    }
    return wrapper;
  }

  function renderWorkflowStep(stepId: RegisterWorkflowStepId): HTMLElement {
    const index = getStepIndex(stepId);
    const step = REGISTER_WORKFLOW_STEPS[index];
    const row = document.createElement('div');
    row.className = 'opx-workflow-step';
    row.dataset.status = statuses[index];
    row.dataset.selected = String(isWorkflowStepSelected(stepSelection, stepId));
    const number = document.createElement('span');
    number.className = 'opx-workflow-step-num';
    number.textContent = String(getWorkflowStepDisplayNumber(stepId, index));
    const label = document.createElement('span');
    label.className = 'opx-workflow-step-label';
    label.textContent = step.label;
    const state = document.createElement('span');
    state.className = 'opx-workflow-step-state';
    renderWorkflowStepState(index, stepId, state);
    row.append(number, label, state);
    if (canRerunWorkflowStep(statuses[index], runControl.running)) {
      const restartButton = createWorkflowTinyButton('閲嶈窇');
      restartButton.addEventListener('click', () => restartFromStep(stepId));
      row.append(restartButton);
    }
    return row;
  }

  function renderWorkflowStepState(index: number, stepId: RegisterWorkflowStepId, state: HTMLElement): void {
    if (manualContinueStepIndex === index) {
      const continueButton = document.createElement('button');
      continueButton.className = 'opx-workflow-continue';
      continueButton.type = 'button';
      continueButton.textContent = '继续';
      continueButton.addEventListener('click', () => {
        void handleManualContinueClick(index, continueButton);
      });
      state.append(continueButton);
    } else if (!runControl.running && failedContinueStepIndex === index && statuses[index] === 'failed') {
      const continueButton = document.createElement('button');
      continueButton.className = 'opx-workflow-continue';
      continueButton.type = 'button';
      continueButton.textContent = '缁х画';
      continueButton.addEventListener('click', () => {
        const failedStep = REGISTER_WORKFLOW_STEPS[index];
        if (failedStep && shouldRestartPaypalSmsOnFailedResume(failedStep.id)) {
          resetPaypalSmsListening(workflowContext);
        }
        resumeFromFailedStep(index);
      });
      state.append(continueButton);
    } else {
      state.textContent = getWorkflowStatusLabel(statuses[index]);
    }
    if (stepId === 'fill-paypal-code' && paypalVerificationCode && !state.querySelector('.opx-workflow-continue')) {
      state.textContent = '';
      const codeButton = document.createElement('button');
      codeButton.className = 'opx-workflow-code-copy';
      codeButton.type = 'button';
      codeButton.textContent = paypalVerificationCode;
      codeButton.title = '点击复制 PayPal 验证码';
      codeButton.addEventListener('click', () => {
        void copyPaypalVerificationCode(codeButton);
      });
      state.append(codeButton);
    }
  }

  function areSectionStepsSelected(sectionId: RegisterWorkflowSectionId): boolean {
    return getVisibleWorkflowSectionStepIds(sectionId)
      .every((stepId) => isWorkflowStepSelected(stepSelection, stepId));
  }

  function isSectionSelectionIndeterminate(sectionId: RegisterWorkflowSectionId): boolean {
    const stepIds = getVisibleWorkflowSectionStepIds(sectionId);
    return stepIds.some((stepId) => isWorkflowStepSelected(stepSelection, stepId)) &&
      !stepIds.every((stepId) => isWorkflowStepSelected(stepSelection, stepId));
  }

  function getVisibleWorkflowSectionStepIds(sectionId: RegisterWorkflowSectionId): RegisterWorkflowStepId[] {
    return REGISTER_WORKFLOW_STEP_GROUPS
      .filter((group) => (
        group.sectionId === sectionId &&
        !(isSubscriptionPanel && group.id === 'subscription-prep')
      ))
      .flatMap((group) => group.stepIds);
  }

  function getVisibleWorkflowStepIds(): RegisterWorkflowStepId[] {
    if (!visibleSection) {
      return REGISTER_WORKFLOW_STEPS.map((step) => step.id);
    }
    return getVisibleWorkflowSectionStepIds(visibleSection);
  }

  function getWorkflowStepDisplayNumber(stepId: RegisterWorkflowStepId, fallbackIndex: number): number {
    if (!visibleSection) {
      return fallbackIndex + 1;
    }
    const visibleIndex = getVisibleWorkflowStepIds().indexOf(stepId);
    return visibleIndex >= 0 ? visibleIndex + 1 : fallbackIndex + 1;
  }

  function getVisibleWorkflowProgressText(): string {
    if (!visibleSection) {
      return getWorkflowProgressText(statuses);
    }
    const stepIds = getVisibleWorkflowStepIds();
    const completed = stepIds.filter((stepId) => {
      const status = statuses[getStepIndex(stepId)];
      return status === 'completed' || status === 'skipped';
    }).length;
    return `${completed} / ${stepIds.length}`;
  }

  function setVisibleWorkflowSectionSelected(
    selection: RegisterWorkflowStepSelection,
    sectionId: RegisterWorkflowSectionId,
    selected: boolean,
  ): RegisterWorkflowStepSelection {
    const next = { ...selection };
    for (const stepId of getVisibleWorkflowSectionStepIds(sectionId)) {
      next[stepId] = selected;
    }
    return next;
  }

  function getSectionSummary(groups: RegisterWorkflowStepGroup[]): string {
    const sectionStatuses = groups.map((group) => getWorkflowGroupStatus(statuses, group));
    if (sectionStatuses.some((item) => item === 'running')) {
      return getWorkflowStatusLabel('running');
    }
    if (sectionStatuses.some((item) => item === 'failed')) {
      return getWorkflowStatusLabel('failed');
    }
    if (sectionStatuses.every((item) => item === 'skipped')) {
      return getWorkflowStatusLabel('skipped');
    }
    if (sectionStatuses.every((item) => item === 'completed' || item === 'skipped')) {
      return getWorkflowStatusLabel('completed');
    }
    return getWorkflowStatusLabel('pending');
  }

  async function updateCurrentWorkflowEmail(): Promise<void> {
    if (isSubscriptionPanel) {
      currentWorkflowEmail = readManualWorkflowAccountInput().data?.email || '';
      return;
    }
    const fromContext = resolveWorkflowEmail(workflowContext);
    if (fromContext) {
      currentWorkflowEmail = fromContext;
      return;
    }
    const state = await controller.loadState();
    currentWorkflowEmail = state.emailItems.find((item) => item.selected)?.email || state.email || '';
  }

  async function updateSelectedSmsRelayTarget(): Promise<void> {
    if (!isSubscriptionPanel) {
      selectedSmsRelayTarget = null;
      return;
    }
    const state = await loadSmsRelayState();
    selectedSmsRelayTarget = getSelectedSmsRelayTarget(state.targets, state.selectedTargetId) || null;
  }

  function resolveWorkflowEmail(context: WorkflowContext): string {
    return context.session?.email ||
      context.session?.record?.email ||
      context.existingSession?.email ||
      context.existingSession?.record?.email ||
      '';
  }

  async function copyWorkflowEmail(button: HTMLButtonElement, email: string): Promise<void> {
    if (!email) {
      return;
    }
    try {
      await navigator.clipboard.writeText(email);
      button.classList.add('is-copied');
      button.textContent = '已复制';
      window.setTimeout(() => {
        button.classList.remove('is-copied');
        button.textContent = email;
      }, 1200);
      setStatus(status, `已复制当前邮箱：${email}`, 'ok');
    } catch (error) {
      setStatus(status, `复制当前邮箱失败：${errorMessage(error)}`, 'error');
    }
  }

  async function copyPaypalVerificationCode(button: HTMLButtonElement): Promise<void> {
    if (!paypalVerificationCode) {
      return;
    }
    try {
      await navigator.clipboard.writeText(paypalVerificationCode);
      button.classList.add('is-copied');
      setStatus(status, `已复制 PayPal 验证码：${paypalVerificationCode}`, 'ok');
      window.setTimeout(() => {
        button.classList.remove('is-copied');
      }, 1200);
    } catch (error) {
      setStatus(status, `复制 PayPal 验证码失败：${errorMessage(error)}`, 'error');
    }
  }

  async function handleManualContinueClick(index: number, button: HTMLButtonElement): Promise<void> {
    const resolve = manualContinueResolver;
    const stepId = manualContinueStepId;
    manualContinueStepIndex = null;
    manualContinueStepId = null;
    manualContinueResolver = null;
    button.disabled = true;

    if (stepId && shouldRestartPaypalSmsOnManualContinue(stepId)) {
      const restarted = await restartPaypalSmsListening(workflowContext);
      if (!restarted.ok) {
        manualContinueStepIndex = index;
        manualContinueStepId = stepId;
        manualContinueResolver = resolve;
        setStatus(status, restarted.message, 'error');
        render();
        return;
      }
    }

    render();
    resolve?.();
  }

  async function ensurePaypalSmsListening(context: WorkflowContext): Promise<StepResult<PaypalSmsListeningSession>> {
    if (context.paypalSmsListening && context.paypalSmsCodePromise) {
      return ok(context.paypalSmsListening.message, context.paypalSmsListening);
    }

    const listenResult = await startPaypalSmsListening();
    if (!listenResult.ok || !listenResult.data) {
      return listenResult;
    }
    context.paypalSmsListening = listenResult.data;
    startPaypalSmsPolling(context);
    return listenResult;
  }

  async function restartPaypalSmsListening(context: WorkflowContext): Promise<StepResult<PaypalSmsListeningSession>> {
    resetPaypalSmsListening(context);
    const listenResult = await startPaypalSmsListening();
    if (!listenResult.ok || !listenResult.data) {
      return listenResult;
    }
    context.paypalSmsListening = listenResult.data;
    startPaypalSmsPolling(context);
    setStatus(status, listenResult.message, 'pending');
    return listenResult;
  }

  function resetPaypalSmsListening(context: WorkflowContext): void {
    context.paypalSmsListening = null;
    context.paypalSmsCodePromise = null;
    paypalVerificationCode = '';
  }

  function startPaypalSmsPolling(context: WorkflowContext): void {
    if (!context.paypalSmsListening) {
      return;
    }
    context.paypalSmsCodePromise = waitForPaypalSmsCode(
      context.paypalSmsListening,
      PAYPAL_SMS_LISTEN_TIMEOUT_MS,
      isStopRequested,
      (code) => {
        paypalVerificationCode = code;
        render();
      },
    );
  }

  async function waitForAndFillPaypalVerificationCode(
    context: WorkflowContext,
    timeoutMs: number,
    waitForManualContinue: (message: string, stepId: RegisterWorkflowStepId) => Promise<void>,
    shouldStop?: () => boolean,
  ): Promise<ActionResult> {
    const startedAt = Date.now();
    let lastMessage = 'PayPal registration code has not arrived yet.';
    while (Date.now() - startedAt < timeoutMs) {
      const listenResult = await ensurePaypalSmsListening(context);
      if (!listenResult.ok) {
        return listenResult;
      }
      const codeResult = await context.paypalSmsCodePromise;
      if (!codeResult?.ok || !codeResult.data) {
        return codeResult || fail(lastMessage);
      }
      paypalVerificationCode = codeResult.data.code;
      render();
      const fillCodeResult = await fillPaypalVerificationCodeWithRetry(
        codeResult.data.code,
        Math.max(10_000, timeoutMs - (Date.now() - startedAt)),
        waitForManualContinue,
        shouldStop,
      );
      return fillCodeResult.ok
        ? ok(codeResult.message + '; ' + fillCodeResult.message)
        : fillCodeResult;
    }
    return fail(lastMessage);
  }

  function shouldRestartPaypalSmsOnManualContinue(stepId: RegisterWorkflowStepId): boolean {
    return stepId === 'fill-paypal-signup';
  }

  function shouldRestartPaypalSmsOnFailedResume(stepId: RegisterWorkflowStepId): boolean {
    return stepId === 'fill-paypal-signup' || stepId === 'fill-paypal-code';
  }

  function waitForManualContinue(message: string, stepId: RegisterWorkflowStepId = 'submit-otp'): Promise<void> {
    ensureNotStopped();
    setStatus(status, message, 'pending');
    manualContinueStepIndex = getStepIndex(stepId);
    manualContinueStepId = stepId;
    render();
    return new Promise((resolve) => {
      manualContinueResolver = resolve;
    });
  }

  async function waitForPaypalSignupFormWithManualChallenge(
    stepId: RegisterWorkflowStepId,
    timeoutMs: number,
    prepareWhileWaiting = false,
  ): Promise<ActionResult> {
    while (runControl.running && !runControl.stopRequested) {
      const result = await waitForPaypalSignupForm(timeoutMs, prepareWhileWaiting, isStopRequested);
      if (runControl.stopRequested) {
        return fail('Workflow stopped.');
      }
      if (!isPaypalSecurityChallengeResult(result)) {
        return result;
      }
      if (!allowsPaypalManualChallenge(stepId)) {
        return fail(result.message || PAYPAL_SECURITY_CHALLENGE_MESSAGE);
      }
      await waitForManualContinue(result.message || PAYPAL_SECURITY_CHALLENGE_MESSAGE, stepId);
    }
    return fail('Workflow stopped.');
  }

  async function waitForPageState(
    predicate: (page: ReturnType<RegisterController['getPageState']>) => boolean,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<ActionResult> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (runControl.stopRequested) {
        return fail('Workflow stopped.');
      }
      await controller.refreshPageState?.();
      if (predicate(controller.getPageState())) {
        return { ok: true, message: 'Page ready.' };
      }
      await delay(1_000);
    }
    return fail(timeoutMessage);
  }

  function waitForProfileAfterOtp(): Promise<ActionResult> {
    return waitForPageState(
      canCompleteSubmitOtpStep,
      180_000,
      'Profile page did not become ready after OTP submit.',
    ).then((ready) => (ready.ok ? ok('OTP accepted and profile page is ready.') : ready));
  }

}

function createOtpDialog(): {
  element: HTMLElement;
  open(): Promise<{ confirmed: true; code: string } | { confirmed: false }>;
} {
  const element = document.createElement('div');
  element.className = 'opx-otp-dialog';
  element.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'opx-otp-dialog-panel';

  const title = document.createElement('div');
  title.className = 'opx-otp-dialog-title';
  title.textContent = '输入邮箱验证码';

  const input = document.createElement('input');
  input.className = 'opx-input';
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'one-time-code';
  input.maxLength = 6;
  input.pattern = '\\d{6}';
  input.placeholder = '输入收到的验证码';

  const message = document.createElement('div');
  message.className = 'opx-hint';
  message.textContent = '确认后会自动填入验证码并点击继续；取消后可在页面手动处理。';

  const actions = document.createElement('div');
  actions.className = 'opx-otp-dialog-actions';
  const cancelButton = document.createElement('button');
  cancelButton.className = 'opx-button opx-button-secondary';
  cancelButton.type = 'button';
  cancelButton.textContent = '鍙栨秷';
  const confirmButton = document.createElement('button');
  confirmButton.className = 'opx-button';
  confirmButton.type = 'button';
  confirmButton.textContent = '纭';
  actions.append(cancelButton, confirmButton);
  panel.append(title, input, message, actions);
  element.append(panel);

  let resolver: ((value: { confirmed: true; code: string } | { confirmed: false }) => void) | null = null;

  const close = (value: { confirmed: true; code: string } | { confirmed: false }) => {
    element.hidden = true;
    const resolve = resolver;
    resolver = null;
    resolve?.(value);
  };

  confirmButton.addEventListener('click', () => {
    const code = input.value.replace(/\D/g, '');
    if (code.length !== 6) {
      message.textContent = '验证码必须是 6 位数字。';
      return;
    }
    close({ confirmed: true, code });
  });

  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    message.textContent = '确认后会自动填入验证码并点击继续；取消后可在页面手动处理。';
  });

  cancelButton.addEventListener('click', () => close({ confirmed: false }));
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    confirmButton.click();
  });

  return {
    element,
    open: () => {
      element.hidden = false;
      input.value = '';
      message.textContent = '确认后会自动填入验证码并点击继续；取消后可在页面手动处理。';
      window.setTimeout(() => input.focus(), 50);
      return new Promise((resolve) => {
        resolver = resolve;
      });
    },
  };
}

function setStatus(element: HTMLElement, message: string, type: 'pending' | 'ok' | 'error'): void {
  element.textContent = message;
  element.dataset.type = type;
}

interface StepResult<T = void> extends ActionResult {
  data?: T;
}

interface WorkflowSessionData {
  accessToken: string;
  sessionClipboardText: string;
  email?: string;
  record?: AccountRecord;
  source?: 'manual' | 'current';
}

interface PaypalSmsListeningSession {
  target: SmsRelayTarget;
  baselineCode: string;
  startedAt: number;
  message: string;
}

interface WorkflowContext {
  addressSettings: AddressAutofillSettings | null;
  existingSession: WorkflowSessionData | null;
  session: WorkflowSessionData | null;
  checkoutUrl: string;
  paymentAddress: AddressProfile | null;
  paypalSmsListening: PaypalSmsListeningSession | null;
  paypalSmsCodePromise: Promise<StepResult<{ code: string; target: SmsRelayTarget; message: string }>> | null;
}

function createWorkflowContext(): WorkflowContext {
  return {
    addressSettings: null,
    existingSession: null,
    session: null,
    checkoutUrl: '',
    paymentAddress: null,
    paypalSmsListening: null,
    paypalSmsCodePromise: null,
  };
}

class WorkflowStop extends Error {}

const PAYPAL_SMS_LISTEN_TIMEOUT_MS = 10 * 60_000;

function getStepIndex(stepId: RegisterWorkflowStepId): number {
  return getWorkflowStepIndex(stepId);
}

async function tryReadExistingSession(shouldStop?: () => boolean): Promise<WorkflowSessionData | null> {
  const result = await readChatGptSessionWithRetry(4_000, shouldStop);
  return result.ok && result.data?.accessToken ? result.data : null;
}

async function loadWorkflowAddressSettings(): Promise<StepResult<AddressAutofillSettings>> {
  const settings = await loadAddressAutofillSettings();
  if (!settings.payOpenAiEnabled || !settings.payPalSignupEnabled) {
    return fail('Enable OpenAI Pay and PayPal signup autofill in settings first.');
  }
  return ok('Address autofill is enabled.', settings);
}

async function ensureLocalStoreReadyForRegistration(): Promise<StepResult> {
  const response = await browser.runtime.sendMessage({ type: 'opx:local-store-health' }).catch((error) => ({
    ok: false,
    message: String(error),
  }));
  if (isLocalStoreResponse(response) && response.ok) {
    return ok('本地账号服务已启动。');
  }
  const message = isLocalStoreResponse(response) && response.message
    ? response.message
    : '本地账号服务不可用，请先启动本地账号服务后再注册。';
  return fail(`本地账号服务不可用，注册已停止：${message}`);
}

function ok<T = void>(message: string, data?: T): StepResult<T> {
  return { ok: true, message, data };
}

function fail<T = never>(message: string): StepResult<T> {
  return { ok: false, message };
}

async function readChatGptSessionWithRetry(
  timeoutMs: number,
  shouldStop?: () => boolean,
): Promise<StepResult<WorkflowSessionData>> {
  const startedAt = Date.now();
  let lastMessage = 'ChatGPT session not available yet.';
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    try {
      const response: ChatGptSessionResponse = await browser.runtime.sendMessage({ type: 'opx:fetch-chatgpt-session' });
      if (shouldStop?.()) {
        return fail('Workflow stopped.');
      }
      if (isUsableChatGptSessionResponse(response)) {
        const record = await saveSuccessfulSession(response);
        return ok('Read ChatGPT session.', {
          accessToken: response.session.accessToken,
          sessionClipboardText: serializeSessionForClipboard(response.raw, response.session),
          email: response.session.email || record?.email,
          record,
          source: 'current',
        });
      }
      lastMessage = getChatGptSessionValidationMessage(response) || lastMessage;
    } catch (error) {
      lastMessage = 'read session failed: ' + errorMessage(error);
    }
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    await delay(2_000);
  }
  return fail(lastMessage);
}

async function saveSuccessfulSession(response: ChatGptSessionResponse): Promise<AccountRecord | undefined> {
  const record = buildAccountRecordFromSession(response);
  if (!record.email || !record.accessToken) {
    return undefined;
  }

  const accounts = await loadAccountRecords();
  await saveAccountRecords(upsertAccountRecord(accounts, record));
  const responseFromLocalStore = await browser.runtime.sendMessage({
    type: 'opx:local-store-upsert-session',
    account: record,
  }).catch((error) => ({
    ok: false,
    message: String(error),
  }));
  if (!isLocalStoreResponse(responseFromLocalStore) || !responseFromLocalStore.ok) {
    throw new Error(responseFromLocalStore?.message || '本地账号服务未确认写入账号文件');
  }
  if (responseFromLocalStore.store?.accounts) {
    await saveAccountRecords(responseFromLocalStore.store.accounts);
  }

  const register = await loadRegisterState();
  const nextRegister = recordRegisterEmailSession(register, record.email);
  if (nextRegister.emailItems !== register.emailItems) {
    await saveRegisterState({ emailItems: nextRegister.emailItems });
  }
  return record;
}

async function saveWorkflowCheckoutUrl(record: AccountRecord, checkoutUrl: string): Promise<AccountRecord> {
  const nextRecord = { ...record, checkoutUrl, updatedAt: Date.now() };
  const accounts = await loadAccountRecords();
  await saveAccountRecords(upsertAccountRecord(accounts, nextRecord));
  await browser.runtime.sendMessage({
    type: 'opx:local-store-update-account',
    accountId: nextRecord.id,
    patch: { checkoutUrl },
  }).catch(async () => {
    await browser.runtime.sendMessage({
      type: 'opx:local-store-upsert-session',
      account: nextRecord,
    }).catch(() => undefined);
  });
  return nextRecord;
}

async function createHostedCheckoutLink(accessToken: string): Promise<StepResult<string>> {
  const saved = await loadLinkExtractorState();
  const options: CheckoutOptions = {
    ...saved.checkoutOptions,
    uiMode: 'hosted',
    region: 'US',
  };
  const response: CheckoutLinkResponse = await browser.runtime.sendMessage({
    type: 'opx:create-checkout-link',
    raw: accessToken,
    options,
  });
  const link = response?.link || response?.url || '';
  if (!isCheckoutLinkResponse(response) || !response.ok || !link) {
    return fail(response?.message || 'Failed to create hosted checkout link.');
  }
  return ok('Created hosted checkout link.', link);
}

async function fetchWorkflowAddress(city: string): Promise<AddressProfile> {
  const response: RandomAddressResponse = await browser.runtime.sendMessage({
    type: 'opx:fetch-random-address',
    countryCode: 'US',
    city,
  });
  if (!response?.ok || !response.address) {
    throw new Error(response?.message || 'Failed to fetch US address profile.');
  }
  if (!hasCompleteCreditCardInfo(response.address.creditCard)) {
    throw new Error('第 11 步获取的资料缺少完整信用卡号、CVV 或有效期，已停止后续 PayPal 填写。');
  }
  return response.address;
}

async function fillPaymentPageWithRetry(
  address: AddressProfile,
  urlPredicate: (url: string) => boolean,
  timeoutMs: number,
  shouldStop?: () => boolean,
): Promise<ActionResult> {
  const startedAt = Date.now();
  let lastMessage = 'Page is not ready yet.';
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    const url = await readActiveTabUrl();
    if (!url || !urlPredicate(url)) {
      await delay(1_000);
      continue;
    }
    try {
      const result = toActionResult(await sendContentCommand('fill-current-payment-page', { address }));
      if (result.ok) {
        return result;
      }
      if (isPaypalSecurityChallengeResult(result)) {
        return result;
      }
      lastMessage = result.message;
    } catch (error) {
      lastMessage = errorMessage(error);
    }
    await delay(2_000);
  }
  return fail(lastMessage);
}

async function fillPaymentPageWithManualChallenge(
  stepId: RegisterWorkflowStepId,
  address: AddressProfile,
  urlPredicate: (url: string) => boolean,
  timeoutMs: number,
  waitForManualContinue: (message: string, stepId: RegisterWorkflowStepId) => Promise<void>,
  shouldStop?: () => boolean,
): Promise<ActionResult> {
  while (!shouldStop?.()) {
    const result = await fillPaymentPageWithRetry(address, urlPredicate, timeoutMs, shouldStop);
    if (!isPaypalSecurityChallengeResult(result)) {
      return result;
    }
    if (!allowsPaypalManualChallenge(stepId)) {
      return fail(result.message || PAYPAL_SECURITY_CHALLENGE_MESSAGE);
    }
    await waitForManualContinue(result.message || PAYPAL_SECURITY_CHALLENGE_MESSAGE, stepId);
  }
  return fail('Workflow stopped.');
}

async function fillPaypalSignupFormWithoutSubmit(
  address: AddressProfile,
  timeoutMs: number,
  waitForManualContinue: (message: string, stepId: RegisterWorkflowStepId) => Promise<void>,
  shouldStop?: () => boolean,
): Promise<ActionResult> {
  const startedAt = Date.now();
  let lastMessage = 'PayPal signup page is not ready yet.';
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    const url = await readActiveTabUrl();
    if (!url || !canCompleteOpenAiPayStep(url)) {
      await delay(1_000);
      continue;
    }
    try {
      const result = toActionResult(await sendContentCommand('fill-current-payment-page', {
        address,
        mode: 'fill-paypal-signup-form',
      }));
      if (result.ok) {
        return result;
      }
      if (isPaypalSecurityChallengeResult(result)) {
        await waitForManualContinue(result.message || PAYPAL_SECURITY_CHALLENGE_MESSAGE, 'fill-paypal-signup');
        continue;
      }
      lastMessage = result.message;
    } catch (error) {
      lastMessage = errorMessage(error);
    }
    await delay(2_000);
  }
  return fail(lastMessage);
}

async function runPaypalActionWithManualChallenge(
  stepId: RegisterWorkflowStepId,
  payload: Record<string, unknown>,
  timeoutMs: number,
  waitForManualContinue: (message: string, stepId: RegisterWorkflowStepId) => Promise<void>,
  shouldStop?: () => boolean,
): Promise<ActionResult> {
  const startedAt = Date.now();
  let lastMessage = 'PayPal page is not ready yet.';
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    const url = await readActiveTabUrl();
    if (!url || !canCompleteOpenAiPayStep(url)) {
      await delay(1_000);
      continue;
    }
    try {
      const result = toActionResult(await sendContentCommand('fill-current-payment-page', payload));
      if (result.ok) {
        return result;
      }
      if (isPaypalSecurityChallengeResult(result)) {
        await waitForManualContinue(result.message || PAYPAL_SECURITY_CHALLENGE_MESSAGE, stepId);
        continue;
      }
      lastMessage = result.message;
    } catch (error) {
      lastMessage = errorMessage(error);
    }
    await delay(1_000);
  }
  return fail(lastMessage);
}

async function fillPaypalVerificationCodeWithRetry(
  code: string,
  timeoutMs: number,
  waitForManualContinue: (message: string, stepId: RegisterWorkflowStepId) => Promise<void>,
  shouldStop?: () => boolean,
): Promise<ActionResult> {
  const startedAt = Date.now();
  let lastMessage = 'PayPal verification input is not ready yet.';
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    const result = await runPaypalActionWithManualChallenge(
      'fill-paypal-code',
      { mode: 'fill-paypal-verification-code', code },
      8_000,
      waitForManualContinue,
      shouldStop,
    );
    if (result.ok) {
      return result;
    }
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    lastMessage = result.message || lastMessage;
    await delay(2_000);
  }
  return fail(lastMessage);
}

async function waitForPaypalVerificationResultWithRetry(
  timeoutMs: number,
  waitForManualContinue: (message: string, stepId: RegisterWorkflowStepId) => Promise<void>,
  shouldStop?: () => boolean,
): Promise<ActionResult> {
  const startedAt = Date.now();
  let lastMessage = 'PayPal verification result is not confirmed yet.';
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    const result = await runPaypalActionWithManualChallenge(
      'confirm-paypal-code',
      { mode: 'confirm-paypal-verification-result' },
      8_000,
      waitForManualContinue,
      shouldStop,
    );
    if (result.ok) {
      return result;
    }
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    lastMessage = result.message || lastMessage;
    await delay(2_000);
  }
  return fail(lastMessage);
}

async function completePaypalSubscriptionWithRetry(
  timeoutMs: number,
  waitForManualContinue: (message: string, stepId: RegisterWorkflowStepId) => Promise<void>,
  shouldStop?: () => boolean,
): Promise<ActionResult> {
  const startedAt = Date.now();
  let lastMessage = 'PayPal subscription completion page is not ready yet.';
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    const url = await readActiveTabUrl();
    if (url && !canCompleteOpenAiPayStep(url)) {
      return ok('PayPal left the page; waiting for subscription result sync.');
    }
    const result = await runPaypalActionWithManualChallenge(
      'complete-subscription',
      { mode: 'complete-paypal-subscription' },
      8_000,
      waitForManualContinue,
      shouldStop,
    );
    if (result.ok) {
      if (shouldStop?.()) {
        return fail('Workflow stopped.');
      }
      await delay(2_000);
      return result;
    }
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    lastMessage = result.message || lastMessage;
    await delay(2_000);
  }
  return fail(lastMessage);
}

async function waitForPaypalExitAfterCompletion(timeoutMs: number, shouldStop?: () => boolean): Promise<ActionResult> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    const url = await readActiveTabUrl();
    if (url && !canCompleteOpenAiPayStep(url)) {
      return ok('PayPal left the checkout page after completion.');
    }
    await delay(1_000);
  }
  return fail('Clicked PayPal completion button, but the page did not leave PayPal checkout.');
}

async function startPaypalSmsListening(): Promise<StepResult<PaypalSmsListeningSession>> {
  const state = await loadSmsRelayState();
  const target = getSelectedSmsRelayTarget(state.targets, state.selectedTargetId);
  if (!target) {
    return fail('Select a PayPal signup phone number in the SMS panel first.');
  }

  const first = await fetchSmsRelayCode(target);
  if (first.kind === 'error') {
    return fail(first.message);
  }

  return ok(
    'Started PayPal SMS listening for ' + target.phone,
    {
      target,
      baselineCode: first.kind === 'code' ? first.code : '',
      startedAt: Date.now(),
      message: 'Started PayPal SMS listening for ' + target.phone,
    },
  );
}

async function waitForPaypalSmsCode(
  listening: PaypalSmsListeningSession,
  timeoutMs: number,
  shouldStop?: () => boolean,
  onCode?: (code: string) => void,
): Promise<StepResult<{ code: string; target: SmsRelayTarget; message: string }>> {
  const startedAt = Date.now();
  let lastMessage = 'PayPal registration code has not arrived yet.';
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    const result = await fetchSmsRelayCode(listening.target);
    if (result.kind === 'error') {
      lastMessage = result.message;
    } else if (result.kind === 'code') {
      if (!listening.baselineCode || result.code !== listening.baselineCode) {
        await rememberPaypalSmsCode(listening.target, result.code, result.message);
        onCode?.(result.code);
        return ok('Received PayPal verification code ' + result.code + ' from ' + listening.target.phone, {
          code: result.code,
          target: listening.target,
          message: result.message,
        });
      }
      lastMessage = 'SMS API returned the same historical PayPal code; waiting for a new one.';
    } else {
      lastMessage = result.message || lastMessage;
    }
    await delay(3_000);
  }
  return fail(lastMessage);
}

async function rememberPaypalSmsCode(target: SmsRelayTarget, code: string, message: string): Promise<void> {
  const state = await loadSmsRelayState();
  await saveSmsRelayState({
    history: [
      ...state.history,
      {
        id: `${target.phone}-${code}-${Date.now()}`,
        phone: target.phone,
        code,
        message,
        receivedAt: Date.now(),
      },
    ].slice(-30),
  });
}

function exportWorkflowAccount(record: AccountRecord): string {
  const json = serializeAccountsForExport([record], new Set([record.id]));
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fileName = createAccountsExportFileName(1);
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}

async function waitForActiveTabUrl(
  predicate: (url: string) => boolean,
  timeoutMs: number,
  shouldStop?: () => boolean,
): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldStop?.()) {
      return '';
    }
    const url = await readActiveTabUrl();
    if (url && predicate(url)) {
      return url;
    }
    await delay(1_000);
  }
  return '';
}

async function readActiveTabUrl(): Promise<string> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.url || '';
}

async function appendPaypalCountryUsToActiveTab(url: string): Promise<string> {
  const nextUrl = appendPaypalCountryUsParam(url);
  if (nextUrl === url) {
    return url;
  }
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (!tabId) {
    return url;
  }
  await browser.tabs.update(tabId, { url: nextUrl });
  return nextUrl;
}

function isPayOpenAiUrl(url: string): boolean {
  try {
    return new URL(url).hostname === 'pay.openai.com';
  } catch {
    return false;
  }
}

function formatSmsRelayTargetLabel(target: SmsRelayTarget): string {
  return [
    target.phone,
    target.countryName,
    target.dialCode,
  ].filter(Boolean).join(' · ');
}

function isPaypalSignupUrl(url: string): boolean {
  return canEnterPaypalSignupStep(url);
}

async function waitForPaypalSignupForm(
  timeoutMs: number,
  prepareWhileWaiting = false,
  shouldStop?: () => boolean,
): Promise<ActionResult> {
  const startedAt = Date.now();
  let lastMessage = 'PayPal signup form is not ready yet.';
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    const url = await readActiveTabUrl();
    if (!url || !canCompleteOpenAiPayStep(url)) {
      await delay(1_000);
      continue;
    }
    try {
      if (prepareWhileWaiting && canPreparePaypalRegistrationStep(url)) {
        const prepareResult = toActionResult(await sendContentCommand('fill-current-payment-page', { mode: 'prepare-paypal-registration' }));
        lastMessage = prepareResult.message || lastMessage;
        if (!prepareResult.ok) {
          return prepareResult;
        }
        await delay(1_000);
        continue;
      }
      const response = await sendContentCommand('fill-current-payment-page', { mode: 'inspect-paypal-signup-form' });
      if (isPaypalSignupFormResponse(response) && response.ok && response.ready) {
        return ok('PayPal signup form is ready.');
      }
      if (isPaypalSignupFormResponse(response) && response.challenge) {
        return {
          ok: false,
          message: response.message || PAYPAL_SECURITY_CHALLENGE_MESSAGE,
          code: PAYPAL_SECURITY_CHALLENGE_CODE,
        };
      }
      if (isPaypalSignupFormResponse(response)) {
        lastMessage = response.message || lastMessage;
      }
    } catch (error) {
      lastMessage = errorMessage(error);
    }
    await delay(1_000);
  }
  return fail(lastMessage);
}

async function waitForPaypalHostedStageWithManualChallenge(
  stepId: RegisterWorkflowStepId,
  targetStages: PaypalHostedStage[],
  timeoutMs: number,
  prepareWhileWaiting: boolean,
  waitForManualContinue: (message: string, stepId: RegisterWorkflowStepId) => Promise<void>,
  shouldStop?: () => boolean,
): Promise<StepResult<PaypalHostedStage>> {
  const startedAt = Date.now();
  let lastMessage = 'PayPal page stage is not ready yet.';
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldStop?.()) {
      return fail('Workflow stopped.');
    }
    const url = await readActiveTabUrl();
    if (url && !canCompleteOpenAiPayStep(url) && targetStages.includes('outside_paypal')) {
      return ok('PayPal left the page; waiting for subscription result sync.', 'outside_paypal');
    }
    if (!url || !canCompleteOpenAiPayStep(url)) {
      await delay(1_000);
      continue;
    }
    try {
      const response = await sendContentCommand('fill-current-payment-page', { mode: 'inspect-paypal-stage' });
      if (isPaypalHostedStageResponse(response)) {
        if (response.challenge) {
          await waitForManualContinue(response.message || PAYPAL_SECURITY_CHALLENGE_MESSAGE, stepId);
          continue;
        }
        if (targetStages.includes(response.stage)) {
          return ok(response.message || ('PayPal current stage: ' + response.stage), response.stage);
        }
        lastMessage = response.message || lastMessage;
        if (prepareWhileWaiting && response.stage === 'login') {
          const prepareResult = toActionResult(await sendContentCommand('fill-current-payment-page', { mode: 'prepare-paypal-registration' }));
          if (isPaypalSecurityChallengeResult(prepareResult)) {
            await waitForManualContinue(prepareResult.message || PAYPAL_SECURITY_CHALLENGE_MESSAGE, stepId);
          } else if (!prepareResult.ok) {
            return fail(prepareResult.message);
          } else {
            lastMessage = prepareResult.message || lastMessage;
          }
        }
      }
    } catch (error) {
      lastMessage = errorMessage(error);
    }
    await delay(1_000);
  }
  return fail(lastMessage);
}

function isPaypalSecurityChallengeResult(value: ActionResult): boolean {
  return value.code === PAYPAL_SECURITY_CHALLENGE_CODE;
}

function isPaypalSignupFormResponse(value: unknown): value is { ok: boolean; ready: boolean; challenge?: boolean; message: string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { ok?: unknown }).ok === 'boolean' &&
      typeof (value as { ready?: unknown }).ready === 'boolean' &&
      typeof (value as { message?: unknown }).message === 'string',
  );
}

function isPaypalHostedStageResponse(value: unknown): value is {
  ok: boolean;
  stage: PaypalHostedStage;
  challenge?: boolean;
  ready?: boolean;
  message: string;
} {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { ok?: unknown }).ok === 'boolean' &&
      isPaypalHostedStageValue((value as { stage?: unknown }).stage) &&
      typeof (value as { message?: unknown }).message === 'string',
  );
}

function isPaypalHostedStageValue(value: unknown): value is PaypalHostedStage {
  return value === 'outside_paypal' ||
    value === 'login' ||
    value === 'signup' ||
    value === 'verification' ||
    value === 'review' ||
    value === 'approval' ||
    value === 'unknown';
}

function isCheckoutLinkResponse(value: unknown): value is CheckoutLinkResponse {
  return Boolean(value && typeof value === 'object' && typeof (value as CheckoutLinkResponse).ok === 'boolean');
}

function isLocalStoreResponse(value: unknown): value is { ok: boolean; message?: string; store?: { accounts?: AccountRecord[] } } {
  return Boolean(value && typeof value === 'object' && typeof (value as { ok?: unknown }).ok === 'boolean');
}

function toActionResult(value: unknown): ActionResult {
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as ActionResult).ok === 'boolean' &&
    typeof (value as ActionResult).message === 'string'
  ) {
    return value as ActionResult;
  }
  return fail('Page did not return a valid result.');
}

function serializeSessionForClipboard(raw: unknown, session: unknown): string {
  const value = raw === undefined ? session : raw;
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

async function sendContentCommand(command: string, payload?: unknown): Promise<unknown> {
  return browser.runtime.sendMessage({
    type: 'opx:active-tab-command',
    command,
    payload,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
