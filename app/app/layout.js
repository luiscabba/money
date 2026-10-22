import './globals.css';
import SW from '../components/SW';

export const metadata = {
  title: 'Money',
  description: 'Daily money rings',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Money', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
  robots: { index: false, follow: false }
};

export const viewport = { themeColor: '#0B0D10', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <SW />
        {children}
      </body>
    </html>
  );
}
