
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

interface UsbDeviceConnectorProps {
  settingsLastUpdatedTimestamp: number | null;
}

export function UsbDeviceConnector({ settingsLastUpdatedTimestamp }: UsbDeviceConnectorProps) {
  const {
    isConnected,
    isConnecting,
    isHandshakeComplete,
    portInfo,
    logMessages,
    connectedDeviceHardwareId,
    connectPort,
    disconnectPort,
    resyncConfiguration,
  } = useUsbConnection();

  useEffect(() => {
    if (typeof settingsLastUpdatedTimestamp === 'number' && isConnected && isHandshakeComplete && connectedDeviceHardwareId) {
      console.log(`[UsbDeviceConnector] Settings changed (ts: ${settingsLastUpdatedTimestamp}), re-syncing for ${connectedDeviceHardwareId}`);
      resyncConfiguration(connectedDeviceHardwareId);
    }
  }, [settingsLastUpdatedTimestamp, isConnected, isHandshakeComplete, connectedDeviceHardwareId, resyncConfiguration]);

  const getStatusBadge = () => {
    if (isConnecting) {
      return <Badge variant="secondary"><Loader2 className="mr-1 h-4 w-4 animate-spin" />Conectando...</Badge>;
    }
    if (isConnected) {
      if (isHandshakeComplete && connectedDeviceHardwareId) {
        return <Badge className="bg-green-600 hover:bg-green-700 text-white"><CheckCircle className="mr-1 h-4 w-4" />Conectado a {connectedDeviceHardwareId}</Badge>;
      }
      return <Badge variant="secondary"><Loader2 className="mr-1 h-4 w-4 animate-spin" />Estableciendo comunicación...</Badge>;
    }
    return <Badge variant="destructive"><XCircle className="mr-1 h-4 w-4" />Desconectado</Badge>;
  };


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
                onClick={() => disconnectPort(true)}
                variant="destructive"
                disabled={isConnecting} 
            >
              <XCircle className="mr-2 h-4 w-4" />
              Desconectar Dispositivo
            </Button>
          )}
          {getStatusBadge()}
          {isConnected && isHandshakeComplete && connectedDeviceHardwareId && (
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
