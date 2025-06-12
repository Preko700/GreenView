
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
import { Logo } from '@/components/Logo';
import type { NavItem } from '@/lib/types';
import { LayoutDashboard, BarChart3, ToggleLeft, Image as ImageIcon, Settings, LifeBuoy, Bot } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const SELECTED_DEVICE_ID_LS_KEY = 'selectedDashboardDeviceId'; // Debe coincidir con la clave en DashboardPage

// Función para generar los items de navegación dinámicamente
const generateNavItems = (deviceId: string | null): NavItem[] => {
  const baseHref = (path: string) => deviceId ? `${path}/${deviceId}` : '/dashboard';
  const isActionDisabled = !deviceId;
  // El tooltip se puede manejar directamente en SidebarNav si es necesario, basado en item.disabled

  return [
    { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { title: 'AI Assistant', href: '/ai-assistant', icon: Bot },
    { title: 'Monitoring', href: baseHref('/monitoring'), icon: BarChart3, disabled: isActionDisabled, description: isActionDisabled ? "Select a device" : undefined },
    { title: 'Control', href: baseHref('/control'), icon: ToggleLeft, disabled: isActionDisabled, description: isActionDisabled ? "Select a device" : undefined },
    { title: 'Media', href: baseHref('/media'), icon: ImageIcon, disabled: isActionDisabled, description: isActionDisabled ? "Select a device" : undefined },
    { title: 'Settings', href: '/settings', icon: Settings },
    { title: 'Support', href: '/support', icon: LifeBuoy },
  ];
};


interface AppLayoutProps {
  children: ReactNode;
}

function CollapsibleSidebar() {
  const { open, setOpen, isMobile } = useSidebar();
  const [isCollapsed, setIsCollapsed] = useState(!open);
  const [currentNavItems, setCurrentNavItems] = useState<NavItem[]>(generateNavItems(null));

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
      const storedDeviceId = typeof window !== 'undefined' ? localStorage.getItem(SELECTED_DEVICE_ID_LS_KEY) : null;
      setCurrentNavItems(generateNavItems(storedDeviceId));
    };

    updateNavItems(); // Initial update

    // Listen for custom event from Dashboard when deviceId changes
    const handleDeviceChange = () => updateNavItems();
    window.addEventListener('selectedDeviceChanged', handleDeviceChange);
    
    // Listen for direct storage changes (e.g., from other tabs, or if Dashboard uses direct localStorage.setItem)
    window.addEventListener('storage', (event) => {
        if (event.key === SELECTED_DEVICE_ID_LS_KEY) {
            updateNavItems();
        }
    });


    return () => {
      window.removeEventListener('selectedDeviceChanged', handleDeviceChange);
      window.removeEventListener('storage', (event) => {
        if (event.key === SELECTED_DEVICE_ID_LS_KEY) {
            updateNavItems();
        }
    });
    };
  }, []);


  return (
    <Sidebar collapsible="icon" side="left" variant="sidebar">
      <SidebarHeader className="p-4 flex items-center justify-between">
        {!isCollapsed && <Logo />}
         <Button variant="ghost" size="icon" onClick={toggleSidebar} className="hidden md:flex">
            {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            <span className="sr-only">Toggle Sidebar</span>
          </Button>
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
            <div className="ml-auto">
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

