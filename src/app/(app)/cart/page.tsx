"use client";

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ShoppingCart, Plus, Minus, X, Trash2, CreditCard } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { sampleProducts } from '@/data/products';
import { Product } from '@/lib/types';
import Image from 'next/image';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

export default function CartPage() {
  const { cartItems, updateQuantity, removeFromCart, clearCart, getCartItemCount } = useCart();
  const { toast } = useToast();

  // Get product details for cart items
  const cartWithProducts = cartItems.map(item => {
    const product = sampleProducts.find(p => p.id === item.productId);
    return {
      ...item,
      product: product!,
      totalPrice: product ? product.price * item.quantity : 0
    };
  }).filter(item => item.product); // Filter out items where product wasn't found

  const subtotal = cartWithProducts.reduce((total, item) => total + item.totalPrice, 0);
  const tax = subtotal * 0.1; // 10% tax
  const total = subtotal + tax;

  const handleQuantityChange = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
    } else {
      updateQuantity(productId, newQuantity);
    }
  };

  const handleCheckout = () => {
    toast({
      title: "Checkout Started",
      description: "Proceeding to payment... (Demo mode)",
    });
    // In a real app, this would navigate to checkout/payment page
  };

  if (cartItems.length === 0) {
    return (
      <div className="container mx-auto px-4 py-6 space-y-6">
        <PageHeader
          title="Shopping Cart"
          description="Review your items before checkout"
        />
        
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ShoppingCart className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Your cart is empty</h3>
            <p className="text-muted-foreground text-center mb-6">
              Add some products to your cart to get started
            </p>
            <Button asChild>
              <Link href="/products">
                Continue Shopping
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <PageHeader
        title={`Shopping Cart (${getCartItemCount()} items)`}
        description="Review your items before checkout"
        action={
          <Button 
            variant="outline" 
            onClick={clearCart}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear Cart
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {cartWithProducts.map((item) => (
            <Card key={item.productId}>
              <CardContent className="p-6">
                <div className="flex gap-4">
                  {/* Product Image */}
                  <div className="relative h-20 w-20 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                    {item.product.imageUrl ? (
                      <Image
                        src={item.product.imageUrl}
                        alt={item.product.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <ShoppingCart className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold">{item.product.name}</h3>
                        {item.product.brand && (
                          <p className="text-sm text-muted-foreground">{item.product.brand}</p>
                        )}
                        <Badge variant="outline" className="mt-1">
                          {item.product.category}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFromCart(item.productId)}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="text-lg font-semibold">
                        ${item.product.price.toFixed(2)} each
                      </div>
                      
                      {/* Quantity Controls */}
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleQuantityChange(item.productId, item.quantity - 1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        
                        <span className="font-semibold min-w-[2rem] text-center">
                          {item.quantity}
                        </span>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleQuantityChange(item.productId, item.quantity + 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-lg font-bold text-primary">
                        ${item.totalPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal ({getCartItemCount()} items)</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Tax</span>
                  <span>${tax.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>

              <Button className="w-full" size="lg" onClick={handleCheckout}>
                <CreditCard className="mr-2 h-5 w-5" />
                Proceed to Checkout
              </Button>

              <Button variant="outline" className="w-full" asChild>
                <Link href="/products">
                  Continue Shopping
                </Link>
              </Button>

              <div className="text-xs text-muted-foreground text-center pt-2">
                Free shipping on orders over $50
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}