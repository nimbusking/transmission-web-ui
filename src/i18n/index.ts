import { createI18n } from 'vue-i18n';
import { en, zh } from './messages';
export const languages = [
  { label: 'English', value: 'en' },
  { label: '简体中文', value: 'zh-CN' },
  { label: '正體中文', value: 'zh-TW' },
  { label: 'Deutsch', value: 'de' },
  { label: 'Español', value: 'es' },
  { label: 'Français', value: 'fr' },
  { label: 'Italiano', value: 'it' },
  { label: '한국어', value: 'ko' },
  { label: 'Nederlands', value: 'nl' },
  { label: 'Magyar', value: 'hu' },
  { label: 'Polski', value: 'pl' },
  { label: 'Português (Brasil)', value: 'pt-BR' },
  { label: 'Português', value: 'pt-PT' },
  { label: 'Română', value: 'ro' },
  { label: 'Русский', value: 'ru' },
  { label: 'Українська', value: 'uk' },
];
export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, 'zh-CN': zh },
  missingWarn: false,
  fallbackWarn: false,
});
const loaders = import.meta.glob<{ default: Record<string, string> }>('./locales/*.json');
let request = 0;
export async function setLanguage(preferred: string) {
  const seq = ++request;
  let locale = preferred === 'auto' ? navigator.language : preferred;
  locale = locale.replace('_', '-');
  if (!languages.some((x) => x.value === locale))
    locale = locale.startsWith('zh') ? 'zh-CN' : locale.split('-')[0];
  if (!languages.some((x) => x.value === locale)) locale = 'en';
  if (!['en', 'zh-CN'].includes(locale)) {
    try {
      const module = await loaders[`./locales/${locale}.json`]?.();
      if (module) i18n.global.setLocaleMessage(locale as 'en', module.default as typeof en);
    } catch {
      locale = 'en';
    }
  }
  if (seq === request) {
    i18n.global.locale.value = locale as 'en';
    document.documentElement.lang = locale;
  }
}
