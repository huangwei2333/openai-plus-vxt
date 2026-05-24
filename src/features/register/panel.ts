import type { FeaturePanelHandle } from '../../app/types';
import type { RegisterController, RegisterEmailItem } from './types';

export function createRegisterPanel(container: HTMLElement, controller: RegisterController): FeaturePanelHandle {
  const accountInput = document.createElement('input');
  accountInput.className = 'opx-input opx-register-email-input';
  accountInput.type = 'text';
  accountInput.placeholder = '输入原邮箱';
  accountInput.autocomplete = 'off';
  accountInput.spellcheck = false;

  const addEmailButton = createButton('添加', 'opx-button opx-button-secondary');
  const refreshEmailButton = createButton('刷新', 'opx-button opx-button-secondary');
  const emailInputRow = document.createElement('div');
  emailInputRow.className = 'opx-register-email-input-row';
  emailInputRow.append(accountInput, addEmailButton, refreshEmailButton);

  const selectedSummary = document.createElement('button');
  selectedSummary.className = 'opx-email-list-summary';
  selectedSummary.type = 'button';
  selectedSummary.setAttribute('aria-expanded', 'false');

  const emailList = document.createElement('div');
  emailList.className = 'opx-email-list';
  emailList.hidden = true;

  const status = document.createElement('div');
  status.className = 'opx-status';
  status.textContent = '等待添加邮箱';

  let expanded = false;

  const update = async () => {
    const saved = await controller.loadState();
    if (accountInput.value !== saved.rawInput) {
      accountInput.value = saved.rawInput;
    }
    renderSelectedSummary(selectedSummary, saved.emailItems, expanded);
    renderEmailList(emailList, saved, controller, update, status);
    addEmailButton.disabled = !saved.rawInput.trim();
    emailList.hidden = !expanded;
    selectedSummary.setAttribute('aria-expanded', String(expanded));
  };

  accountInput.addEventListener('input', async () => {
    await controller.saveInput(accountInput.value);
    await update();
  });

  accountInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    addEmailButton.click();
  });

  addEmailButton.addEventListener('click', async () => {
    setStatus(status, '正在添加邮箱...', 'pending');
    await controller.saveInput(accountInput.value);
    setResult(status, await controller.addInputToEmailList());
    expanded = true;
    await update();
  });

  refreshEmailButton.addEventListener('click', async () => {
    setStatus(status, '正在刷新本地邮箱列表...', 'pending');
    await update();
    setStatus(status, '邮箱列表已刷新', 'ok');
  });

  selectedSummary.addEventListener('click', async () => {
    expanded = !expanded;
    await update();
  });

  container.append(emailInputRow, selectedSummary, emailList, status);
  void update();
  return { update };
}

function renderSelectedSummary(button: HTMLButtonElement, items: RegisterEmailItem[], expanded: boolean): void {
  const selected = items.find((item) => item.selected) || items[0];
  const name = selected ? selected.email : '未选择原邮箱';
  const count = selected ? `${selected.aliases.length}/20` : '0/20';
  button.textContent = `${expanded ? '收起' : '展开'}原邮箱列表 · 当前：${name} · ${count}`;
}

function renderEmailList(
  container: HTMLElement,
  saved: Awaited<ReturnType<RegisterController['loadState']>>,
  controller: RegisterController,
  update: () => Promise<void>,
  status: HTMLElement,
): void {
  container.textContent = '';

  if (saved.emailItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'opx-empty-inline';
    empty.textContent = '暂无可用邮箱，请先输入原邮箱并添加。';
    container.append(empty);
    return;
  }

  for (const item of saved.emailItems) {
    const wrapper = document.createElement('div');
    wrapper.className = 'opx-email-item';

    const row = document.createElement('div');
    row.className = 'opx-email-item-row';

    const radio = document.createElement('input');
    radio.className = 'opx-checkbox';
    radio.type = 'radio';
    radio.name = 'opx-register-email';
    radio.checked = item.selected;
    radio.title = '选择用于注册的原邮箱';
    radio.addEventListener('change', async () => {
      await controller.setEmailSelected(item.id, radio.checked);
      await update();
    });

    const emailButton = document.createElement('button');
    emailButton.className = 'opx-email-toggle';
    emailButton.type = 'button';
    emailButton.textContent = item.email;
    emailButton.addEventListener('click', async () => {
      await controller.setEmailSelected(item.id, true);
      await update();
    });

    const count = document.createElement('span');
    count.className = 'opx-email-count';
    count.textContent = `${item.aliases.length}/20`;

    const deleteButton = createButton('删除', 'opx-mini-button opx-mini-button-danger opx-email-delete');
    deleteButton.title = item.aliases.length
      ? '删除这个原邮箱及其生成邮箱记录'
      : '删除这个原邮箱';
    deleteButton.addEventListener('click', async () => {
      setStatus(status, `正在删除 ${item.email}...`, 'pending');
      await controller.removeEmailItem(item.id);
      setStatus(status, `已删除 ${item.email}`, 'ok');
      await update();
    });

    row.append(radio, emailButton, count, deleteButton);
    wrapper.append(row);
    container.append(wrapper);
  }
}

function createButton(label: string, className = 'opx-button'): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = className;
  button.type = 'button';
  button.textContent = label;
  return button;
}

function setResult(element: HTMLElement, result: { ok: boolean; message: string }): void {
  setStatus(element, result.message, result.ok ? 'ok' : 'error');
}

function setStatus(element: HTMLElement, message: string, type: 'pending' | 'ok' | 'error'): void {
  element.textContent = message;
  element.dataset.type = type;
}
