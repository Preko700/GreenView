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

const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'AI Assistant', href: '/ai-assistant', icon: Bot },
  { title: 'Monitoring', href: '/monitoring', icon: BarChart3 }, // Base path, specific device ID will be appended
  { title: 'Control', href: '/control', icon: ToggleLeft },
  { title: 'Media', href: '/media', icon: ImageIcon },
  { title: 'Settings', href: '/settings', icon: Settings },
  { title: 'Support', href: '/support', icon: LifeBuoy },
];

interface AppLayoutProps {
  children: ReactNode;
}

function CollapsibleSidebar() {
  const { open, setOpen, isMobile } = useSidebar();
  const [isCollapsed, setIsCollapsed] = useState(!open);

  useEffect(() => {
    if (!isMobile) {
      setIsCollapsed(!open);
    }
  }, [open, isMobile]);
  
  const toggleSidebar = () => {
    setOpen(!open);
    if (!isMobile) {
      setIsCollapsed(open); // if open is true, it means it was open, now it's closed -> collapsed
    }
  };


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
        <SidebarNav items={navItems} isCollapsed={isCollapsed} />
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

  // Load sidebar state from cookie or default to open
  const [defaultOpen, setDefaultOpen] = useState(true);
  useEffect(() => {
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith('sidebar_state='))
      ?.split('=')[1];
    if (cookieValue) {
      setDefaultOpen(cookieValue === 'true');
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
