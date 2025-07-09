import { Product, Category } from '@/lib/types';

// Sample product data for the supermarket
export const sampleProducts: Product[] = [
  {
    id: '1',
    name: 'Organic Bananas',
    description: 'Fresh organic bananas, perfect for snacking or smoothies',
    barcode: '1234567890123',
    price: 2.99,
    category: 'Fruits',
    brand: 'Organic Valley',
    imageUrl: '/images/bananas.jpg',
    stock: 50,
    isActive: true,
    createdAt: Date.now(),
  },
  {
    id: '2',
    name: 'Whole Wheat Bread',
    description: 'Freshly baked whole wheat bread, rich in fiber',
    barcode: '2345678901234',
    price: 3.49,
    category: 'Bakery',
    brand: 'Fresh Bake',
    imageUrl: '/images/bread.jpg',
    stock: 25,
    isActive: true,
    createdAt: Date.now(),
  },
  {
    id: '3',
    name: 'Greek Yogurt',
    description: 'Creamy Greek yogurt with probiotics',
    barcode: '3456789012345',
    price: 1.99,
    category: 'Dairy',
    brand: 'Mountain Fresh',
    imageUrl: '/images/yogurt.jpg',
    stock: 30,
    isActive: true,
    createdAt: Date.now(),
  },
  {
    id: '4',
    name: 'Free-Range Eggs',
    description: 'Farm fresh free-range eggs, dozen pack',
    barcode: '4567890123456',
    price: 4.99,
    category: 'Dairy',
    brand: 'Happy Farm',
    imageUrl: '/images/eggs.jpg',
    stock: 20,
    isActive: true,
    createdAt: Date.now(),
  },
  {
    id: '5',
    name: 'Organic Apples',
    description: 'Crisp and sweet organic apples, 3lb bag',
    barcode: '5678901234567',
    price: 5.99,
    category: 'Fruits',
    brand: 'Organic Valley',
    imageUrl: '/images/apples.jpg',
    stock: 35,
    isActive: true,
    createdAt: Date.now(),
  },
  {
    id: '6',
    name: 'Pasta Sauce',
    description: 'Traditional marinara pasta sauce',
    barcode: '6789012345678',
    price: 2.49,
    category: 'Pantry',
    brand: 'Bella Vista',
    imageUrl: '/images/sauce.jpg',
    stock: 40,
    isActive: true,
    createdAt: Date.now(),
  },
];

export const sampleCategories: Category[] = [
  {
    id: 'fruits',
    name: 'Fruits',
    description: 'Fresh fruits and organic produce',
  },
  {
    id: 'dairy',
    name: 'Dairy',
    description: 'Milk, cheese, eggs and dairy products',
  },
  {
    id: 'bakery',
    name: 'Bakery',
    description: 'Fresh bread, pastries and baked goods',
  },
  {
    id: 'pantry',
    name: 'Pantry',
    description: 'Shelf-stable ingredients and essentials',
  },
  {
    id: 'meat',
    name: 'Meat & Seafood',
    description: 'Fresh meat, poultry and seafood',
  },
  {
    id: 'beverages',
    name: 'Beverages',
    description: 'Drinks, juices and refreshments',
  },
];

// Helper function to get products by category
export function getProductsByCategory(category: string): Product[] {
  return sampleProducts.filter(product => 
    product.category.toLowerCase() === category.toLowerCase()
  );
}

// Helper function to search products
export function searchProducts(query: string): Product[] {
  const searchLower = query.toLowerCase();
  return sampleProducts.filter(product => 
    product.name.toLowerCase().includes(searchLower) ||
    product.description?.toLowerCase().includes(searchLower) ||
    product.brand?.toLowerCase().includes(searchLower) ||
    product.category.toLowerCase().includes(searchLower) ||
    product.barcode.includes(query)
  );
}

// Helper function to get product by barcode
export function getProductByBarcode(barcode: string): Product | undefined {
  return sampleProducts.find(product => product.barcode === barcode);
}