
"use client";

import type { Device } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Smartphone, Battery, Wifi, WifiOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DeviceSelectorProps {
  devices: Device[];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  isLoading?: boolean;
}

export function DeviceSelector({ devices, selectedDeviceId, onSelectDevice, isLoading = false }: DeviceSelectorProps) {
  if (isLoading) {
    return (
      <ScrollArea className="w-full whitespace-nowrap pb-4">
        <div className="flex w-max space-x-4 p-1">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="w-64 min-w-[250px]">
              <CardHeader><Skeleton className="h-5 w-3/4" /></CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </CardContent>
            </Card>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    );
  }
  
  if (!devices.length) {
    return (
      <Card className="text-center py-8 text-muted-foreground">
        <CardHeader><CardTitle>No Devices Found</CardTitle></CardHeader>
        <CardContent>
            <p>Register a new device in Settings to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ScrollArea className="w-full whitespace-nowrap pb-4">
      <div className="flex w-max space-x-4 p-1">
        {devices.map((device) => (
          <Card
            key={device.serialNumber}
            className={cn(
              "w-64 min-w-[250px] cursor-pointer transition-all hover:shadow-lg",
              selectedDeviceId === device.serialNumber
                ? "ring-2 ring-primary shadow-xl"
                : "border-border",
              !device.isActive && "opacity-60 bg-muted/50"
            )}
            onClick={() => onSelectDevice(device.serialNumber)}
          >
            <CardHeader>
              <CardTitle className="text-lg truncate">{device.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center text-muted-foreground">
                <Smartphone className="mr-2 h-4 w-4" />
                <span>{device.serialNumber}</span>
              </div>
              <div className="flex items-center text-muted-foreground">
                {device.isPoweredByBattery ? (
                  <Battery className="mr-2 h-4 w-4" />
                ) : (
                  <PowerIcon className="mr-2 h-4 w-4" />
                )}
                <span>{device.isPoweredByBattery ? "Battery" : "AC Power"}</span>
              </div>
               <div className="flex items-center">
                {device.isActive ? (
                  <Wifi className="mr-2 h-4 w-4 text-green-500" />
                ) : (
                  <WifiOff className="mr-2 h-4 w-4 text-red-500" />
                )}
                <span className={cn(device.isActive ? "text-green-600" : "text-red-600")}>
                  {device.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

// Custom PowerIcon as Lucide doesn't have a direct AC power equivalent.
function PowerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
    </svg>
  );
}
