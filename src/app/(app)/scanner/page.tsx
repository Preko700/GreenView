"use client";

import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { BarcodeScanner } from '@/components/scanner/BarcodeScanner';
import { ProductCard } from '@/components/products/ProductCard';
import { getProductByBarcode } from '@/data/products';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/contexts/CartContext';
import { ScanLine, Search, ShoppingCart, Package } from 'lucide-react';
import Link from 'next/link';

export default function ScannerPage() {
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scanHistory, setScanHistory] = useState<string[]>([]);
  const { addToCart, getCartItemCount } = useCart();
  const { toast } = useToast();

  const handleBarcodeScanned = (barcode: string) => {
    const product = getProductByBarcode(barcode);
    if (product) {
      setScannedProduct(product);
      setScanHistory(prev => [barcode, ...prev.slice(0, 4)]); // Keep last 5 scans
      toast({
        title: "Product found!",
        description: `Scanned: ${product.name}`,
      });
    } else {
      setScannedProduct(null);
      toast({
        title: "Product not found",
        description: `No product found with barcode ${barcode}`,
        variant: "destructive",
      });
    }
  };

  const handleManualSearch = () => {
    if (manualBarcode.trim()) {
      handleBarcodeScanned(manualBarcode.trim());
    }
  };

  const handleScannerError = (error: string) => {
    toast({
      title: "Scanner error",
      description: error,
      variant: "destructive",
    });
  };

  const cartItemCount = getCartItemCount();

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <PageHeader
        title="Barcode Scanner"
        description="Scan product barcodes or enter them manually"
        action={
          <Button asChild variant="outline">
            <Link href="/cart">
              <ShoppingCart className="mr-2 h-4 w-4" />
              Cart ({cartItemCount})
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scanner Section */}
        <div className="space-y-6">
          {/* Camera Scanner */}
          <BarcodeScanner
            onScan={handleBarcodeScanned}
            onError={handleScannerError}
          />

          {/* Manual Entry */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Manual Barcode Entry
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter barcode manually..."
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleManualSearch()}
                />
                <Button onClick={handleManualSearch}>
                  Search
                </Button>
              </div>
              
              {/* Sample Barcodes for Testing */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Try these sample barcodes:</p>
                <div className="flex flex-wrap gap-2">
                  {['1234567890123', '2345678901234', '3456789012345', '4567890123456'].map((barcode) => (
                    <Button
                      key={barcode}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setManualBarcode(barcode);
                        handleBarcodeScanned(barcode);
                      }}
                    >
                      {barcode}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scan History */}
          {scanHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Scans</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {scanHistory.map((barcode, index) => (
                    <div
                      key={`${barcode}-${index}`}
                      className="flex items-center justify-between p-2 bg-muted rounded-lg"
                    >
                      <span className="font-mono text-sm">{barcode}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleBarcodeScanned(barcode)}
                      >
                        Search Again
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {scannedProduct ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Scanned Product
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProductCard product={scannedProduct} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ScanLine className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No product scanned</h3>
                <p className="text-muted-foreground text-center">
                  Use the camera scanner or enter a barcode manually to find products
                </p>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full" variant="outline">
                <Link href="/products">
                  <Package className="mr-2 h-4 w-4" />
                  Browse All Products
                </Link>
              </Button>
              
              <Button asChild className="w-full" variant="outline">
                <Link href="/cart">
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  View Cart ({cartItemCount})
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Scanner Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Scanner Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Hold the barcode steady in front of your camera</p>
              <p>• Ensure good lighting for better scanning</p>
              <p>• Try entering barcodes manually if scanning fails</p>
              <p>• Use the sample barcodes above to test the scanner</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}