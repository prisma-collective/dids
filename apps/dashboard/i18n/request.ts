import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

const supportedLocales = ['en', 'pt-BR', 'es'] as const;
type SupportedLocale = (typeof supportedLocales)[number];

function isSupportedLocale(value: string): value is SupportedLocale {
  return (supportedLocales as readonly string[]).includes(value);
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get('locale')?.value;
  const locale = raw && isSupportedLocale(raw) ? raw : 'en';

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
