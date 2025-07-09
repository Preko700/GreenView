"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product, CartItem } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getCartItemCount: () => number;
  isInCart: (productId: string) => boolean;
  getCartItem: (productId: string) => CartItem | undefined;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const { toast } = useToast();

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('superscan-cart');
    if (savedCart) {
      try {
        setCartItems(JSON.parse(savedCart));
      } catch (error) {
        console.error('Failed to parse saved cart:', error);
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('superscan-cart', JSON.stringify(cartItems));
  }, [cartItems]);

  const addToCart = (product: Product, quantity = 1) => {
    setCartItems(prev => {
      const existingItem = prev.find(item => item.productId === product.id);
      
      if (existingItem) {
        toast({
          title: "Updated cart",
          description: `Updated ${product.name} quantity to ${existingItem.quantity + quantity}`,
        });
        return prev.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      } else {
        toast({
          title: "Added to cart",
          description: `${product.name} has been added to your cart`,
        });
        return [...prev, {
          productId: product.id,
          quantity,
          addedAt: Date.now()
        }];
      }
    });
  };

  const removeFromCart = (productId: string) => {
    setCartItems(prev => prev.filter(item => item.productId !== productId));
    toast({
      title: "Removed from cart",
      description: "Item has been removed from your cart",
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setCartItems(prev =>
      prev.map(item =>
        item.productId === productId
          ? { ...item, quantity }
          : item
      )
    );
  };

  const clearCart = () => {
    setCartItems([]);
    toast({
      title: "Cart cleared",
      description: "All items have been removed from your cart",
    });
  };

  const getCartTotal = () => {
    // Note: This would need product prices to calculate actual total
    // For now, return item count as placeholder
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  };

  const getCartItemCount = () => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  };

  const isInCart = (productId: string) => {
    return cartItems.some(item => item.productId === productId);
  };

  const getCartItem = (productId: string) => {
    return cartItems.find(item => item.productId === productId);
  };

  return (
    <CartContext.Provider value={{
      cartItems,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      getCartTotal,
      getCartItemCount,
      isInCart,
      getCartItem,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}