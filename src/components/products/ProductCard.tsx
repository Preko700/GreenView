"use client";

import { Product } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCart } from '@/contexts/CartContext';
import Image from 'next/image';

interface ProductCardProps {
  product: Product;
  className?: string;
}

export function ProductCard({ product, className }: ProductCardProps) {
  const { addToCart, getCartItem, updateQuantity, isInCart } = useCart();
  const cartItem = getCartItem(product.id);
  const inCart = isInCart(product.id);

  const handleAddToCart = () => {
    addToCart(product, 1);
  };

  const handleIncrement = () => {
    if (cartItem) {
      updateQuantity(product.id, cartItem.quantity + 1);
    } else {
      addToCart(product, 1);
    }
  };

  const handleDecrement = () => {
    if (cartItem && cartItem.quantity > 1) {
      updateQuantity(product.id, cartItem.quantity - 1);
    } else if (cartItem) {
      updateQuantity(product.id, 0); // This will remove it
    }
  };

  return (
    <Card className={cn("shadow-lg hover:shadow-xl transition-all duration-200", className)}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg leading-tight">{product.name}</CardTitle>
            {product.brand && (
              <p className="text-sm text-muted-foreground mt-1">{product.brand}</p>
            )}
          </div>
          <Badge variant={product.stock > 0 ? "default" : "destructive"}>
            {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Product Image */}
        <div className="relative h-32 bg-muted rounded-lg overflow-hidden">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <ShoppingCart className="h-8 w-8" />
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-2xl font-bold text-primary">
              ${product.price.toFixed(2)}
            </span>
            <Badge variant="outline">{product.category}</Badge>
          </div>
          
          {product.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {product.description}
            </p>
          )}
          
          <div className="text-xs text-muted-foreground">
            Barcode: {product.barcode}
          </div>
        </div>

        {/* Cart Controls */}
        <div className="space-y-2">
          {!inCart ? (
            <Button 
              onClick={handleAddToCart} 
              className="w-full"
              disabled={product.stock === 0}
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              Add to Cart
            </Button>
          ) : (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="icon"
                onClick={handleDecrement}
              >
                <Minus className="h-4 w-4" />
              </Button>
              
              <div className="flex-1 text-center">
                <span className="text-lg font-semibold">{cartItem?.quantity || 0}</span>
                <span className="text-sm text-muted-foreground block">in cart</span>
              </div>
              
              <Button
                variant="outline"
                size="icon"
                onClick={handleIncrement}
                disabled={product.stock === 0}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}