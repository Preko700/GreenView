"use client";

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Loader2, Zap, XCircle, CheckCircle, Usb, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useUsbConnection } from '@/contexts/UsbConnectionContext';

interface UsbDeviceConnectorProps { // Renamed from UsbDeviceConnectorVisualProps for consistency
  settingsLastUpdatedTimestamp: number | null;
}

export function UsbDeviceConnector({ settingsLastUpdatedTimestamp }: UsbDeviceConnectorProps) {
  const {
    isConnected,
    isConnecting,
    portInfo,
    logMessages,
    connectedDeviceHardwareId,
    connectPort,
    disconnectPort,
    resyncConfiguration,
    // addLog // No longer needed directly here, context handles logging
  } = useUsbConnection();

  useEffect(() => {
    // Only attempt re-sync if timestamp is a number (meaning it changed from initial null)
    if (typeof settingsLastUpdatedTimestamp === 'number' && isConnected && connectedDeviceHardwareId) {
      // The context's addLog will be used internally by resyncConfiguration
      console.log(`[UsbDeviceConnector] Settings changed (ts: ${settingsLastUpdatedTimestamp}), re-syncing for ${connectedDeviceHardwareId}`);
      resyncConfiguration(connectedDeviceHardwareId);
    }
  }, [settingsLastUpdatedTimestamp, isConnected, connectedDeviceHardwareId, resyncConfiguration]);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Usb className="mr-2 h-6 w-6 text-primary" />
          Conexión Dispositivo USB (Global)
        </CardTitle>
        <CardDescription>
          Conecta/Desconecta tu Arduino. La configuración se sincronizará automáticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-4">
          {!isConnected ? (
            <Button onClick={connectPort} disabled={isConnecting}>
              {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Conectar Dispositivo
            </Button>
          ) : (
            <Button
                onClick={() => disconnectPort(true)} // Pass true to show toast from context
                variant="destructive"
                disabled={isConnecting} 
            >
              <XCircle className="mr-2 h-4 w-4" />
              Desconectar Dispositivo
            </Button>
          )}
           <Badge variant={isConnected ? "default" : "secondary"} className={cn(isConnected ? "bg-green-600 hover:bg-green-700" : "bg-destructive hover:bg-destructive/90", "text-white")}>
            {isConnecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : isConnected ? <CheckCircle className="mr-1 h-4 w-4" /> : <XCircle className="mr-1 h-4 w-4" />}
            {isConnecting ? "Conectando..." : isConnected ? `Conectado a ${connectedDeviceHardwareId || portInfo || 'dispositivo'}` : "Desconectado"}
          </Badge>
           {isConnected && connectedDeviceHardwareId && (
            <Button 
              onClick={() => resyncConfiguration(connectedDeviceHardwareId)} 
              variant="outline" 
              size="icon" 
              title="Forzar Re-sincronización de Configuración"
              disabled={isConnecting}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        <div>
          <Label htmlFor="serial-log-global" className="block text-sm font-medium mb-1">Log de Conexión Serial (Global):</Label>
          <ScrollArea id="serial-log-global" className="h-60 w-full rounded-md border bg-muted p-2 text-xs">
            {logMessages.length === 0 && <p className="text-muted-foreground italic">Esperando actividad...</p>}
            {logMessages.map((msg, index) => (
              <div key={index} className="font-mono leading-relaxed whitespace-pre-wrap break-all border-b border-border/50 py-0.5 last:border-b-0">{msg}</div>
            ))}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}