
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
            // For active state, check if the pathname starts with the item's base href (before any [deviceId])
            // This handles cases like /monitoring/[deviceId] being active for href /monitoring or /monitoring/[id]
            const baseItemHref = item.href.includes('[deviceId]') ? item.href.split('/[deviceId]')[0] : item.href.split('/:')[0];
            const isActive = item.href === '/' ? pathname === item.href : pathname?.startsWith(baseItemHref) && (item.href === '/dashboard' || item.href === '/settings' || item.href === '/support' || item.href === '/ai-assistant' || !item.disabled);


            const linkContent = (
              <>
                <Icon className={cn("h-5 w-5", isCollapsed ? "mx-auto" : "mr-3")} />
                {!isCollapsed && (
                  <span className={cn("truncate", isCollapsed && "hidden")}>
                    {item.title}
                  </span>
                )}
              </>
            );
            
            const tooltipText = item.disabled && item.description ? item.description : item.title;

            return (
              <Tooltip key={index}>
                <TooltipTrigger asChild>
                  <Button
                    variant={isActive && !item.disabled ? "default" : "ghost"}
                    className={cn(
                      "w-full justify-start",
                      isCollapsed && "justify-center px-2"
                    )}
                    disabled={item.disabled}
                    asChild={!item.disabled} // Only use asChild if not disabled
                  >
                    {item.disabled ? (
                      <div className={cn( // Mimic button style for disabled state
                        "inline-flex items-center justify-start gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors",
                        "h-10 px-4 py-2 w-full", // default size
                        isCollapsed && "justify-center px-2",
                        "opacity-50 cursor-not-allowed"
                      )}>
                        {linkContent}
                      </div>
                    ) : (
                      <Link href={item.href} aria-disabled={item.disabled}>
                        {linkContent}
                      </Link>
                    )}
                  </Button>
                </TooltipTrigger>
                {isCollapsed && (
                  <TooltipContent side="right" className="flex items-center gap-4">
                    {tooltipText}
                    {item.label && !item.disabled && (
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

