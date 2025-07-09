"use client";

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, ShoppingCart, ScanLine, Filter } from 'lucide-react';
import { ProductCard } from '@/components/products/ProductCard';
import { BarcodeScanner } from '@/components/scanner/BarcodeScanner';
import { sampleProducts, sampleCategories, searchProducts, getProductsByCategory, getProductByBarcode } from '@/data/products';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ProductsPage() {
  const { user } = useAuth();
  const { getCartItemCount } = useCart();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [products, setProducts] = useState(sampleProducts);
  const [isSearching, setIsSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Filter products based on search and category
  useEffect(() => {
    let filtered = sampleProducts;

    if (searchQuery.trim()) {
      filtered = searchProducts(searchQuery);
      setIsSearching(true);
    } else {
      setIsSearching(false);
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(product => 
        product.category.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    setProducts(filtered);
  }, [searchQuery, selectedCategory]);

  const handleBarcodeScanned = (barcode: string) => {
    const product = getProductByBarcode(barcode);
    if (product) {
      setSearchQuery(product.barcode);
      toast({
        title: "Product found!",
        description: `Found ${product.name} - ${product.barcode}`,
      });
    } else {
      toast({
        title: "Product not found",
        description: `No product found with barcode ${barcode}`,
        variant: "destructive",
      });
    }
    setShowScanner(false);
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
      {/* Header */}
      <PageHeader
        title={`Welcome back, ${user?.name || 'Shopper'}!`}
        description="Discover great products and scan barcodes for quick shopping"
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center p-6">
            <ShoppingCart className="h-8 w-8 text-primary" />
            <div className="ml-4">
              <p className="text-sm font-medium text-muted-foreground">Items in Cart</p>
              <p className="text-2xl font-bold">{cartItemCount}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-6">
            <Filter className="h-8 w-8 text-primary" />
            <div className="ml-4">
              <p className="text-sm font-medium text-muted-foreground">Available Products</p>
              <p className="text-2xl font-bold">{products.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-6">
            <ScanLine className="h-8 w-8 text-primary" />
            <div className="ml-4">
              <p className="text-sm font-medium text-muted-foreground">Categories</p>
              <p className="text-2xl font-bold">{sampleCategories.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Find Products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products, brands, or scan barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {sampleCategories.map((category) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Dialog open={showScanner} onOpenChange={setShowScanner}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <ScanLine className="mr-2 h-4 w-4" />
                  Scan Barcode
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Scan Product Barcode</DialogTitle>
                </DialogHeader>
                <BarcodeScanner
                  onScan={handleBarcodeScanned}
                  onError={handleScannerError}
                />
              </DialogContent>
            </Dialog>
          </div>

          {/* Category Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge 
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedCategory('all')}
            >
              All Products
            </Badge>
            {sampleCategories.map((category) => (
              <Badge
                key={category.id}
                variant={selectedCategory === category.name ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setSelectedCategory(category.name)}
              >
                {category.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Products Grid */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">
            {isSearching ? `Search Results (${products.length})` : 
             selectedCategory === 'all' ? 'All Products' : selectedCategory}
          </h2>
          {searchQuery && (
            <Button 
              variant="outline" 
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>

        {products.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No products found</h3>
              <p className="text-muted-foreground text-center">
                Try adjusting your search terms or category filter
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}