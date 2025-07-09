import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';
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
          <CartProvider>
            <UsbConnectionProvider> {/* ENVOLVER AQUÍ */}
              <AppLayout>
                {children}
              </AppLayout>
            </UsbConnectionProvider>
          </CartProvider>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}