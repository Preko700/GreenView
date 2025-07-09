import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { UsbConnectionProvider } from '@/contexts/UsbConnectionContext'; // NUEVA IMPORTACIÓN

export const metadata: Metadata = {
  title: 'SuperScan - Supermarket Shopping App',
  description: 'Shop smarter with barcode scanning and easy checkout.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
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