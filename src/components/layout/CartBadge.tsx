"use client";

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import Link from 'next/link';

export function CartBadge() {
  const { getCartItemCount } = useCart();
  const itemCount = getCartItemCount();

  return (
    <Button asChild variant="ghost" size="sm" className="relative">
      <Link href="/cart">
        <ShoppingCart className="h-5 w-5" />
        {itemCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
          >
            {itemCount > 99 ? '99+' : itemCount}
          </Badge>
        )}
      </Link>
    </Button>
  );
}