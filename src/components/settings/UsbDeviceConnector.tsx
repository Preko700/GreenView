
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Zap, XCircle, CheckCircle, Usb } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

interface SensorPayload {
  hardwareId: string;
  temperature?: number;
  airHumidity?: number;
  soilHumidity?: number;
  lightLevel?: number;
  waterLevel?: number; // 0 for LOW, 1 for HIGH
}

export function UsbDeviceConnector() {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [port, setPort] = useState<SerialPort | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<string> | null>(null);
  const keepReadingRef = useRef(true);

  const textDecoderStreamRef = useRef<TextDecoderStream | null>(null);
  const textEncoderStreamRef = useRef<TextEncoderStream | null>(null);

  const addLog = useCallback((message: string) => {
    console.log('[UsbDeviceConnector]', message);
    setLogMessages(prev => [...prev.slice(-100), `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

  const processReceivedData = useCallback(async (jsonData: string) => {
    try {
      const data: SensorPayload = JSON.parse(jsonData);
      if (!data.hardwareId) {
        addLog("Dato JSON recibido sin hardwareId. Descartando.");
        return;
      }
      addLog(`Datos parseados para ${data.hardwareId}: Temp=${data.temperature}, AirHum=${data.airHumidity}, SoilHum=${data.soilHumidity}, Light=${data.lightLevel}, WaterLvl=${data.waterLevel}`);

      const response = await fetch('/api/ingest-sensor-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Error al enviar datos al servidor');
      }
      addLog(`Datos enviados al servidor para ${data.hardwareId}: ${result.message}`);

    } catch (error: any) {
      addLog(`Error procesando datos JSON: ${error.message}. Datos recibidos: "${jsonData}"`);
    }
  }, [addLog]);

  const readLoop = useCallback(async (currentReader: ReadableStreamDefaultReader<string>) => {
    addLog("Iniciando bucle de lectura...");
    try {
      while (keepReadingRef.current) {
        const { value, done } = await currentReader.read();
        if (done) {
          addLog("Lector cerrado (done=true desde readLoop).");
          break;
        }
        if (value) {
          // Ensure value is trimmed before processing
          const trimmedValue = value.trim();
          if(trimmedValue.length > 0) {
            addLog(`Datos recibidos: ${trimmedValue}`);
            processReceivedData(trimmedValue);
          }
        }
      }
    } catch (error: any) {
      // Only log error if not an intentional stop (keepReadingRef is true)
      if (keepReadingRef.current) {
        addLog(`Error en bucle de lectura: ${error.message}`);
      }
    } finally {
      addLog("Bucle de lectura terminado.");
    }
  }, [addLog, processReceivedData]);

  const handleDisconnect = useCallback(async (showToastNotification = true) => {
    addLog("Iniciando desconexión...");
    keepReadingRef.current = false; // Signal readLoop to stop

    if (readerRef.current) {
      try {
        await readerRef.current.cancel("Desconexión por el usuario");
        addLog("Reader cancelado.");
      } catch (error: any) {
        addLog(`Error al cancelar reader: ${error.message}`);
      }
      readerRef.current = null;
    }
    
    // For TextDecoderStream, cancelling the reader of its readable part should suffice.
    // If textDecoderStreamRef.current?.writable is piped from port.readable,
    // closing the port or cancelling the reader should handle its lifecycle.
    // Explicitly trying to close/abort its internal streams can be complex.

    if (writerRef.current) {
      try {
        await writerRef.current.abort("Desconexión del escritor");
        addLog("Writer abortado.");
      } catch (error: any) {
        addLog(`Error al abortar writer: ${error.message}`);
      }
      writerRef.current = null;
    }

    // Similar logic for TextEncoderStream as for TextDecoderStream.

    if (port) {
      try {
        // Before closing the port, ensure its streams are no longer in use.
        // The readable stream might still be locked by the pipe if not cancelled properly.
        if (port.readable && port.readable.locked) {
             addLog("Intentando cancelar port.readable debido a bloqueo...");
             await port.readable.cancel("Cancelación previa al cierre del puerto").catch(e => addLog(`Error al cancelar port.readable: ${e.message}`));
        }
         // Writable stream pipe might also need to be broken
        if (port.writable && port.writable.locked) {
            addLog("Intentando abortar port.writable debido a bloqueo...");
            const portWriter = port.writable.getWriter();
            await portWriter.abort("Aborto previo al cierre del puerto").catch(e => addLog(`Error al abortar port.writable: ${e.message}`));
            try { portWriter.releaseLock(); } catch(e) {/*ignore*/}
        }

        await port.close();
        addLog("Puerto serial cerrado.");
      } catch (error: any) {
        addLog(`Error al cerrar puerto serial: ${error.message}`);
      }
    }
    
    setPort(null);
    setIsConnected(false);
    setIsConnecting(false);
    textDecoderStreamRef.current = null;
    textEncoderStreamRef.current = null;
    
    if (showToastNotification) {
        toast({ title: "Dispositivo Desconectado", description: "Conexión serial terminada." });
    }
    addLog("Proceso de desconexión completado.");
  }, [port, addLog, toast]);


  const handleConnect = useCallback(async () => {
    if (!navigator.serial) {
      addLog("Web Serial API no es soportada por este navegador.");
      toast({ title: "Error de Navegador", description: "La API Web Serial no es compatible con tu navegador. Prueba con Chrome o Edge.", variant: "destructive" });
      return;
    }

    if (port || isConnecting) {
        addLog("Ya existe una conexión activa o se está intentando conectar.");
        return;
    }

    setIsConnecting(true);
    addLog("Solicitando selección de puerto serial...");
    let serialPort: SerialPort | null = null; 
    try {
      serialPort = await navigator.serial.requestPort();
      await serialPort.open({ baudRate: 9600 });

      setPort(serialPort); 
      
      textDecoderStreamRef.current = new TextDecoderStream();
      textEncoderStreamRef.current = new TextEncoderStream();

      keepReadingRef.current = true; 

      // Pipe the port's readable stream through the decoder
      // Errors in piping should ideally be caught to prevent unhandled rejections
      serialPort.readable
        .pipeTo(textDecoderStreamRef.current.writable)
        .catch(error => {
            if (keepReadingRef.current) { // Only log if not intentionally stopping
                 addLog(`Error en pipeTo de serialPort.readable: ${error.message}`);
                 // Consider a gentle disconnect here if piping fails critically
                 // handleDisconnect(false); 
            }
         });

      // Pipe the encoder's readable stream to the port's writable stream (for sending data in future)
      textEncoderStreamRef.current.readable
        .pipeTo(serialPort.writable)
        .catch(error => {
            if (keepReadingRef.current) {
                addLog(`Error en pipeTo de textEncoderStream.readable: ${error.message}`);
            }
        });
      
      readerRef.current = textDecoderStreamRef.current.readable.getReader();
      // writerRef.current = textEncoderStreamRef.current.writable.getWriter(); // Get writer for future use

      setIsConnected(true);
      addLog(`Conectado a puerto: ${serialPort.getInfo().usbVendorId}:${serialPort.getInfo().usbProductId}`);
      toast({ title: "Dispositivo Conectado", description: "Conexión serial establecida." });

      readLoop(readerRef.current);

    } catch (error: any) {
      addLog(`Error al conectar: ${error.message}`);
      if (error.name !== 'NotFoundError') { // NotFoundError means user cancelled port selection
        toast({ title: "Error de Conexión", description: error.message, variant: "destructive" });
      }
      
      // Cleanup if connection failed
      if (serialPort && serialPort.readable) { // if port was opened or partially
        try {
            if (readerRef.current) {
                await readerRef.current.cancel().catch(e => addLog(`Cleanup cancel reader error: ${e.message}`));
                readerRef.current = null;
            }
            // It's possible the pipeTo operations might still hold locks if they didn't complete/error out cleanly.
            if (serialPort.readable.locked) {
                await serialPort.readable.cancel().catch(e => addLog(`Cleanup cancel port readable error: ${e.message}`));
            }
            await serialPort.close().catch(e => addLog(`Cleanup close port error: ${e.message}`));
        } catch(cleanupError: any) {
            addLog(`Error durante la limpieza de conexión fallida: ${cleanupError.message}`);
        }
      }
      setPort(null);
      setIsConnected(false);
    } finally {
        setIsConnecting(false); // Ensure this is always reset
    }
  }, [addLog, toast, readLoop, handleDisconnect, port, isConnecting]);

  useEffect(() => {
    const currentPortState = port; // Capture port state for cleanup
    const currentIsConnected = isConnected;
    return () => {
      if (currentPortState || currentIsConnected) { // Check captured state
        addLog("Ejecutando cleanup de useEffect (desmontaje del componente)...");
        handleDisconnect(false);
      }
    };
  }, [port, isConnected, handleDisconnect, addLog]); // Dependencies should be stable

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Usb className="mr-2 h-6 w-6 text-primary" />
          Conectar Dispositivo USB (Experimental)
        </CardTitle>
        <CardDescription>
          Conecta tu Arduino u otro dispositivo serial para enviar datos de sensores directamente.
          Asegúrate que tu dispositivo envíe datos JSON por línea, incluyendo un `hardwareId`.
          Ej: `{"hardwareId": "TU_HW_ID", "temperature": 25.5, ...}`
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-4">
          {!isConnected ? (
            <Button onClick={handleConnect} disabled={isConnecting || !!port}>
              {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Conectar Dispositivo
            </Button>
          ) : (
            <Button onClick={() => handleDisconnect(true)} variant="destructive">
              <XCircle className="mr-2 h-4 w-4" />
              Desconectar Dispositivo
            </Button>
          )}
          <Badge variant={isConnected ? "default" : "secondary"} className={cn("transition-colors", isConnected ? "bg-green-600 hover:bg-green-700 text-white" : "")}>
            {isConnected ? <CheckCircle className="mr-1 h-4 w-4" /> : <XCircle className="mr-1 h-4 w-4" />}
            {isConnecting ? "Conectando..." : isConnected ? "Conectado" : "Desconectado"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
            El `hardwareId` enviado por tu dispositivo USB debe coincidir con el `Hardware Identifier` de un dispositivo registrado en GreenView.
            Puedes ver el `Hardware Identifier` en la base de datos (`greenview.db`, tabla `devices`) después de registrar un dispositivo en la app.
        </p>

        <Label htmlFor="serial-log">Log de Conexión Serial:</Label>
        <ScrollArea id="serial-log" className="h-40 w-full rounded-md border bg-muted/10 p-2 text-xs">
          {logMessages.length === 0 && <p className="text-muted-foreground italic">Esperando actividad...</p>}
          {logMessages.map((msg, index) => (
            <div key={index} className="font-mono leading-relaxed whitespace-pre-wrap break-all">{msg}</div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
