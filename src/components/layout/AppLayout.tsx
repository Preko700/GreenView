
"use client";

import type { ReactNode } from 'react';
import React, { useState, useEffect } from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from '@/components/ui/sidebar';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { UserNav } from '@/components/layout/UserNav';
import { CartBadge } from '@/components/layout/CartBadge';
import { Logo } from '@/components/Logo';
import type { NavItem } from '@/lib/types';
import { LayoutDashboard, ShoppingCart, Package, ScanLine, CreditCard, Settings, LifeBuoy, Bot } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const SELECTED_DEVICE_ID_LS_KEY = 'selectedDashboardDeviceId';

const generateBaseNavItems = (): NavItem[] => {
  return [
    { title: 'Products', href: '/products', icon: Package },
    { title: 'Scanner', href: '/scanner', icon: ScanLine },
    { title: 'Cart', href: '/cart', icon: ShoppingCart },
    { title: 'Orders', href: '/orders', icon: CreditCard },
    { title: 'Settings', href: '/settings', icon: Settings },
    { title: 'Support', href: '/support', icon: LifeBuoy },
  ];
};

interface AppLayoutProps {
  children: ReactNode;
}

function CollapsibleSidebar() {
  const { open, setOpen, isMobile } = useSidebar();
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(!open);
  const [currentNavItems, setCurrentNavItems] = useState<NavItem[]>([]);

  useEffect(() => {
    if (!isMobile) {
      setIsCollapsed(!open);
    }
  }, [open, isMobile]);
  
  const toggleSidebar = () => {
    setOpen(!open);
    if (!isMobile) {
      setIsCollapsed(open); 
    }
  };

  useEffect(() => {
    const updateNavItems = () => {
      const baseItems = generateBaseNavItems();
      setCurrentNavItems(baseItems);
    };

    updateNavItems();
  }, [user]);

  return (
    <Sidebar collapsible="icon" side="left" variant="sidebar">
      <SidebarHeader className="p-4 flex items-center justify-between">
        {!isCollapsed && <Logo />}
        <div className="flex items-center gap-2">
          {!isCollapsed && <CartBadge />}
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="hidden md:flex">
            {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            <span className="sr-only">Toggle Sidebar</span>
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav items={currentNavItems} isCollapsed={isCollapsed} />
      </SidebarContent>
      <SidebarFooter className="p-4">
        {!isCollapsed && <UserNav />}
        {isCollapsed && 
          <div className="flex justify-center">
            <UserNav />
          </div>
        }
      </SidebarFooter>
    </Sidebar>
  );
}


export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/register';

  const [defaultOpen, setDefaultOpen] = useState(true);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cookieValue = document.cookie
        .split('; ')
        .find(row => row.startsWith('sidebar_state='))
        ?.split('=')[1];
      if (cookieValue) {
        setDefaultOpen(cookieValue === 'true');
      }
    }
  }, []);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <CollapsibleSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-[57px] items-center gap-1 border-b bg-background px-4 md:hidden">
            <SidebarTrigger />
            <div className="ml-auto flex items-center gap-2">
              <CartBadge />
              <UserNav />
            </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
