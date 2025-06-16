import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { UsbConnectionProvider } from '@/contexts/UsbConnectionContext'; // NUEVA IMPORTACIÓN

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'GreenView - Portable Greenhouse Control',
  description: 'Monitor and control your portable greenhouse with GreenView.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <UsbConnectionProvider> {/* ENVOLVER AQUÍ */}
            <AppLayout>
              {children}
            </AppLayout>
          </UsbConnectionProvider>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}