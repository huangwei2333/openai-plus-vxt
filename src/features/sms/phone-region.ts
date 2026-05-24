export interface SmsPhoneRegion {
  phone: string;
  dialCode: string;
  countryName: string;
}

const DIAL_CODE_REGIONS = [
  ['1', '美国/加拿大'],
  ['7', '俄罗斯/哈萨克斯坦'],
  ['20', '埃及'],
  ['27', '南非'],
  ['30', '希腊'],
  ['31', '荷兰'],
  ['32', '比利时'],
  ['33', '法国'],
  ['34', '西班牙'],
  ['36', '匈牙利'],
  ['39', '意大利'],
  ['40', '罗马尼亚'],
  ['41', '瑞士'],
  ['43', '奥地利'],
  ['44', '英国'],
  ['45', '丹麦'],
  ['46', '瑞典'],
  ['47', '挪威'],
  ['48', '波兰'],
  ['49', '德国'],
  ['52', '墨西哥'],
  ['55', '巴西'],
  ['60', '马来西亚'],
  ['61', '澳大利亚'],
  ['62', '印度尼西亚'],
  ['63', '菲律宾'],
  ['64', '新西兰'],
  ['65', '新加坡'],
  ['66', '泰国'],
  ['81', '日本'],
  ['82', '韩国'],
  ['84', '越南'],
  ['86', '中国大陆'],
  ['90', '土耳其'],
  ['91', '印度'],
  ['92', '巴基斯坦'],
  ['93', '阿富汗'],
  ['94', '斯里兰卡'],
  ['95', '缅甸'],
  ['98', '伊朗'],
  ['212', '摩洛哥'],
  ['213', '阿尔及利亚'],
  ['216', '突尼斯'],
  ['218', '利比亚'],
  ['234', '尼日利亚'],
  ['254', '肯尼亚'],
  ['351', '葡萄牙'],
  ['352', '卢森堡'],
  ['353', '爱尔兰'],
  ['354', '冰岛'],
  ['358', '芬兰'],
  ['380', '乌克兰'],
  ['420', '捷克'],
  ['852', '中国香港'],
  ['853', '中国澳门'],
  ['855', '柬埔寨'],
  ['856', '老挝'],
  ['880', '孟加拉国'],
  ['886', '中国台湾'],
  ['971', '阿联酋'],
  ['972', '以色列'],
  ['966', '沙特阿拉伯'],
] as const;

const SORTED_DIAL_CODE_REGIONS = [...DIAL_CODE_REGIONS].sort((left, right) => right[0].length - left[0].length);

export function normalizeSmsRelayPhone(value: string): SmsPhoneRegion {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    return { phone: '', dialCode: '', countryName: '' };
  }

  const compact = raw.replace(/[\s().-]/g, '');
  const internationalDigits = raw.startsWith('+')
    ? digits
    : compact.startsWith('00')
      ? digits.slice(2)
      : inferBareInternationalDigits(digits);
  if (!internationalDigits) {
    return { phone: digits, dialCode: '', countryName: '' };
  }

  const region = SORTED_DIAL_CODE_REGIONS.find(([dialCode]) => internationalDigits.startsWith(dialCode));
  if (!region) {
    return { phone: internationalDigits, dialCode: '', countryName: '' };
  }

  const [dialCode, countryName] = region;
  const phone = internationalDigits.slice(dialCode.length);
  return {
    phone: phone || internationalDigits,
    dialCode: `+${dialCode}`,
    countryName,
  };
}

export function createSmsRelayTargetId(phone: string, url: string, dialCode = ''): string {
  return `${dialCode ? `${dialCode}:` : ''}${phone}|${url}`;
}

export function formatSmsRelayRegion(dialCode?: string, countryName?: string): string {
  if (dialCode && countryName) {
    return `${countryName} ${dialCode}`;
  }
  return countryName || dialCode || '';
}

function inferBareInternationalDigits(digits: string): string {
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits;
  }
  if (digits.length === 10) {
    return `1${digits}`;
  }
  return '';
}
