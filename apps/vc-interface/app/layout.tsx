import './globals.css';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { ThemeProvider, Footer } from '@prisma-dids/ui';
import { Navigation } from '@/components/Navigation';
import { defaultConfig } from '@/config/org-config';

export const metadata: Metadata = {
  title: `${defaultConfig.ORG_NAME} - VC Interface`,
  description: 'Verifiable Credentials Interface for Prisma DIDs',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations('common');

  return (
    <html lang={locale}>
      <body className="min-h-screen flex flex-col bg-background text-text-primary">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:outline-none"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider theme={defaultConfig.THEME}>
            <Navigation config={defaultConfig} />
            <main id="main-content" className="flex-1 py-8 px-4">
              {children}
            </main>
            <Footer
              network={defaultConfig.NETWORK}
              extra={
                <p className="mt-1">
                  VC Indexer: <code className="text-xs">{defaultConfig.INDEXER_ENDPOINT}</code>
                </p>
              }
            />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
