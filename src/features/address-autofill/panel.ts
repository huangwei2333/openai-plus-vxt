import type { FeaturePanelHandle } from '../../app/types';
import { loadAddressAutofillSettings, saveAddressAutofillSettings } from '../settings/state';
import type { AddressAutofillSettings } from '../settings/types';
import { ADDRESS_COUNTRY_OPTIONS } from './address-source';

export function createAddressPanel(container: HTMLElement): FeaturePanelHandle {
  const countrySelect = createCountrySelect();
  const reminder = document.createElement('div');
  reminder.className = 'opx-summary opx-address-random-city';
  reminder.textContent = '城市将随机生成；开始流程后会自动获取地址。';

  const formGrid = document.createElement('div');
  formGrid.className = 'opx-grid opx-address-country-grid';
  formGrid.append(createField('地址国家', countrySelect));

  container.append(formGrid, reminder);

  countrySelect.addEventListener('change', () => void saveCountry());

  const update = async () => {
    renderSettings(await loadAddressAutofillSettings());
  };

  void update();
  return { update };

  async function saveCountry(): Promise<void> {
    const current = await loadAddressAutofillSettings();
    const countryCode = countrySelect.value;
    const settings = await saveAddressAutofillSettings({
      countryCode,
      city: '',
      lastAddress: current.countryCode === countryCode ? current.lastAddress : null,
    });
    renderSettings(settings);
  }

  function renderSettings(settings: AddressAutofillSettings): void {
    countrySelect.value = settings.countryCode;
    const countryLabel = countrySelect.selectedOptions[0]?.textContent || settings.countryCode;
    reminder.textContent = `${countryLabel} · 随机城市 · 开始流程后自动获取`;
  }
}

function createCountrySelect(): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'opx-select';
  const randomCountryOption = document.createElement('option');
  randomCountryOption.value = 'RANDOM';
  randomCountryOption.textContent = '随机国家';
  select.append(randomCountryOption);
  for (const country of ADDRESS_COUNTRY_OPTIONS) {
    const option = document.createElement('option');
    option.value = country.code;
    option.textContent = `${country.label} / ${country.code}`;
    select.append(option);
  }
  return select;
}

function createField(label: string, control: HTMLElement): HTMLElement {
  const field = document.createElement('label');
  field.className = 'opx-field';
  const caption = document.createElement('span');
  caption.className = 'opx-label';
  caption.textContent = label;
  field.append(caption, control);
  return field;
}
