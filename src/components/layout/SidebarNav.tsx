"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarNavProps {
  items: NavItem[];
  isCollapsed: boolean;
}

export function SidebarNav({ items, isCollapsed }: SidebarNavProps) {
  const pathname = usePathname();

  if (!items?.length) {
    return null;
  }

  return (
    <ScrollArea className="h-full">
      <nav className="grid items-start gap-1 px-2 py-4">
        <TooltipProvider delayDuration={0}>
          {items.map((item, index) => {
            const Icon = item.icon;
            const isActive = item.href === '/' ? pathname === item.href : pathname?.startsWith(item.href);
            
            return (
              <Tooltip key={index}>
                <TooltipTrigger asChild>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    className={cn(
                      "w-full justify-start",
                      isCollapsed && "justify-center px-2"
                    )}
                    asChild
                  >
                    <Link href={item.href} aria-disabled={item.disabled}>
                      <Icon className={cn("h-5 w-5", isCollapsed ? "mx-auto" : "mr-3")} />
                      {!isCollapsed && (
                        <span className={cn("truncate", isCollapsed && "hidden")}>
                          {item.title}
                        </span>
                      )}
                    </Link>
                  </Button>
                </TooltipTrigger>
                {isCollapsed && (
                  <TooltipContent side="right" className="flex items-center gap-4">
                    {item.title}
                    {item.label && (
                      <span className="ml-auto text-muted-foreground">
                        {item.label}
                      </span>
                    )}
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </nav>
    </ScrollArea>
  );
}
