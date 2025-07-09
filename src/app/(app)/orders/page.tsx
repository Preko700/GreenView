"use client";

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard, Package, Calendar, MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

// Sample order data
const sampleOrders = [
  {
    id: 'ORD-001',
    date: '2024-01-15',
    status: 'delivered',
    total: 47.92,
    itemCount: 5,
    deliveryMethod: 'delivery',
    items: [
      { name: 'Organic Bananas', quantity: 2, price: 2.99 },
      { name: 'Whole Wheat Bread', quantity: 1, price: 3.49 },
      { name: 'Greek Yogurt', quantity: 3, price: 1.99 },
    ]
  },
  {
    id: 'ORD-002', 
    date: '2024-01-12',
    status: 'preparing',
    total: 23.45,
    itemCount: 3,
    deliveryMethod: 'pickup',
    items: [
      { name: 'Free-Range Eggs', quantity: 1, price: 4.99 },
      { name: 'Organic Apples', quantity: 1, price: 5.99 },
      { name: 'Pasta Sauce', quantity: 2, price: 2.49 },
    ]
  },
];

export default function OrdersPage() {
  const { user } = useAuth();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'default';
      case 'preparing': return 'secondary';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'delivered': return 'Delivered';
      case 'preparing': return 'Preparing';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <PageHeader
        title="My Orders"
        description="Track your past and current orders"
        action={
          <Button asChild>
            <Link href="/products">
              <Package className="mr-2 h-4 w-4" />
              Continue Shopping
            </Link>
          </Button>
        }
      />

      {sampleOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCard className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No orders yet</h3>
            <p className="text-muted-foreground text-center mb-6">
              You haven't placed any orders yet. Start shopping to see your orders here.
            </p>
            <Button asChild>
              <Link href="/products">
                Start Shopping
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sampleOrders.map((order) => (
            <Card key={order.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Order #{order.id}
                      <Badge variant={getStatusColor(order.status)}>
                        {getStatusText(order.status)}
                      </Badge>
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {new Date(order.date).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {order.deliveryMethod === 'delivery' ? 'Home Delivery' : 'Store Pickup'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">
                      ${order.total.toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {order.itemCount} items
                    </div>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-3">
                  <h4 className="font-medium">Order Items</h4>
                  <div className="grid gap-2">
                    {order.items.map((item, index) => (
                      <div key={index} className="flex justify-between items-center py-2 border-b last:border-0">
                        <div>
                          <span className="font-medium">{item.name}</span>
                          <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                        </div>
                        <span className="font-medium">
                          ${(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex justify-between items-center pt-3 border-t">
                    <div className="space-x-2">
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                      {order.status === 'delivered' && (
                        <Button variant="outline" size="sm">
                          Reorder
                        </Button>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold">
                        Total: ${order.total.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Order Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center p-6">
            <CreditCard className="h-8 w-8 text-primary" />
            <div className="ml-4">
              <p className="text-sm font-medium text-muted-foreground">Total Orders</p>
              <p className="text-2xl font-bold">{sampleOrders.length}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-6">
            <Package className="h-8 w-8 text-primary" />
            <div className="ml-4">
              <p className="text-sm font-medium text-muted-foreground">Total Spent</p>
              <p className="text-2xl font-bold">
                ${sampleOrders.reduce((sum, order) => sum + order.total, 0).toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-6">
            <MapPin className="h-8 w-8 text-primary" />
            <div className="ml-4">
              <p className="text-sm font-medium text-muted-foreground">Favorite Method</p>
              <p className="text-2xl font-bold">Delivery</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}