import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

const sans = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'Meu Gestor',
  description: 'Finanças, contas e planos da família, com o Jarbas.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Meu Gestor', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/favicon.png', sizes: '48x48', type: 'image/png' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0a0f1c',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={sans.variable}>
      <body>
        <div className="statusbar" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
