import './globals.css';
import type { Metadata } from 'next';
import { Navigation } from '@/components/Navigation';
import { defaultConfig } from '@/config/org-config';

export const metadata: Metadata = {
  title: `${defaultConfig.ORG_NAME} - VC Interface`,
  description: 'Verifiable Credentials Interface for Prisma DIDs',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Navigation config={defaultConfig} />
        <main style={{ minHeight: 'calc(100vh - 60px)', padding: '2rem 1rem' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
