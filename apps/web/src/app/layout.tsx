import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'COOMBIE — 8 kişilik co-op zombi hayatta kalma',
  description: 'Tarayıcıda ve Dracord içinde oynanan co-op zombi hayatta kalma oyunu. 8 operatör, 10 harita, 10 mod, 1–8 oyuncu.',
  openGraph: {
    title: 'COOMBIE — co-op zombi hayatta kalma',
    description: '8 operatör, 10 harita, 10 mod. Arkadaşlarınla 8 kişiye kadar, kurulum yok.',
    images: ['/ui/maps/city.jpg'],
  },
};

export const viewport: Viewport = { themeColor: '#07090c' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
