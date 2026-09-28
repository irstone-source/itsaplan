import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Providers } from '@/components/providers';
import RuntimeEnvScript from '@/components/runtime-env-script';
import WhatsNew from '@/features/whats-new/WhatsNew';
import { localeDirection, type Locale } from '@/i18n/locales';
import { BrandingProvider } from '@/components/brand/Branding';
import { accentCss, loadBranding } from '@/utils/branding.server';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  const branding = await loadBranding();
  return {
    title: branding.appName ?? t('title'),
    description: t('description'),
    icons: { icon: branding.logo ?? '/icon.svg' },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const branding = await loadBranding();
  const accent = accentCss(branding.accentColor);

  return (
    <html lang={locale} dir={localeDirection(locale as Locale)} suppressHydrationWarning>
      <body className="antialiased">
        <RuntimeEnvScript />
        {accent && <style dangerouslySetInnerHTML={{ __html: accent }} />}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          // A distinct key: next-themes defaults to "theme", which collides with any
          // other app sharing the same localhost origin. A shared key makes two such
          // apps fight over the value through cross-tab storage events.
          storageKey="itsaplan-theme"
        >
          <NextIntlClientProvider>
            <BrandingProvider branding={branding}>
              <Providers>
                {children}
                <WhatsNew />
              </Providers>
            </BrandingProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
