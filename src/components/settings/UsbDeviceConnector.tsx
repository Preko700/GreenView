
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Zap, XCircle, CheckCircle, Usb } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Tipos globales para Web Serial API (asegúrate que estén definidos)
declare global {
  interface SerialPort extends EventTarget {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    getInfo(): { usbVendorId?: number, usbProductId?: number };
    forget?(): Promise<void>; // Optional forget method
  }
  interface SerialOptions { baudRate: number; dataBits?: 7 | 8; stopBits?: 1 | 2; parity?: "none" | "even" | "odd"; bufferSize?: number; flowControl?: "none" | "hardware"; }
  interface Navigator { serial: { requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>; getPorts(): Promise<SerialPort[]>; }; }
  interface SerialPortRequestOptions { filters?: Array<{ usbVendorId?: number; usbProductId?: number; }>; }
}

interface ArduinoSensorPayload {
  hardwareId?: string;
  temperature?: number;
  airHumidity?: number;
  soilHumidity?: number;
  lightLevel?: number;
  waterLevel?: number; // 0 for LOW, 1 for HIGH
  ph?: number;
}

export function UsbDeviceConnector() {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [portInfo, setPortInfo] = useState<string | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  
  const portRef = useRef<SerialPort | null>(null);
  const stringReaderRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const textDecoderStreamRef = useRef<TextDecoderStream | null>(null);
  const pipePromiseRef = useRef<Promise<void> | null>(null);
  const keepReadingRef = useRef(true);

  const addLog = useCallback((message: string) => {
    console.log('[UsbDeviceConnector]', message);
    setLogMessages(prev => [...prev.slice(-100), `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

  const processReceivedData = useCallback(async (jsonDataString: string) => {
    try {
      const data: ArduinoSensorPayload = JSON.parse(jsonDataString);
      const effectiveHardwareId = data.hardwareId;

      if (!effectiveHardwareId) { 
        addLog(`Dato JSON recibido sin 'hardwareId'. Descartando: ${jsonDataString}`);
        return;
      }
      addLog(`Datos JSON parseados para ${effectiveHardwareId}: ${jsonDataString}`);

      const apiPayload: Partial<ArduinoSensorPayload> = { hardwareId: effectiveHardwareId };
      
      if (data.temperature !== undefined) apiPayload.temperature = data.temperature;
      if (data.airHumidity !== undefined) apiPayload.airHumidity = data.airHumidity;
      if (data.soilHumidity !== undefined) apiPayload.soilHumidity = data.soilHumidity;
      if (data.lightLevel !== undefined) apiPayload.lightLevel = data.lightLevel;
      if (data.waterLevel !== undefined) apiPayload.waterLevel = data.waterLevel; // 0 or 1
      if (data.ph !== undefined) apiPayload.ph = data.ph;
      
      console.log('[UsbDeviceConnector] Enviando a /api/ingest-sensor-data:', apiPayload); // Log para ver qué se envía

      const response = await fetch('/api/ingest-sensor-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Error al enviar datos al servidor');
      }
      addLog(`Datos enviados al servidor para ${effectiveHardwareId}: ${result.message}`);

    } catch (error: any) {
      addLog(`Error procesando/enviando datos JSON: ${error.message}. JSON problemático: "${jsonDataString}"`);
    }
  }, [addLog]);

  const disconnectPort = useCallback(async (portToClose: SerialPort | null, showToast: boolean = true) => {
    if (!portToClose) {
      addLog("disconnectPort llamado sin puerto válido.");
      return;
    }
    addLog(`Iniciando desconexión del puerto ${JSON.stringify(portToClose.getInfo())}...`);
    keepReadingRef.current = false;

    if (stringReaderRef.current) {
      try {
        await stringReaderRef.current.cancel("Desconexión por el usuario");
        addLog("Lector de TextDecoderStream cancelado.");
      } catch (e: any) {
        addLog(`Error cancelando lector de TextDecoderStream (puede ser normal si ya estaba cerrado/cancelado): ${e.message}`);
      } finally {
        stringReaderRef.current = null;
      }
    }

    if (textDecoderStreamRef.current?.writable && !textDecoderStreamRef.current.writable.locked) {
        try {
            await textDecoderStreamRef.current.writable.abort("Aborting TextDecoderStream writable on disconnect");
            addLog("TextDecoderStream.writable abortado.");
        } catch (e: any) {
            addLog(`Error abortando TextDecoderStream.writable (puede ser normal si ya estaba cerrado/abortado): ${e.message}`);
        }
    }
    
    if (pipePromiseRef.current) {
        addLog("Esperando que el 'pipe' del puerto al decodificador se complete o falle...");
        try {
            await pipePromiseRef.current; 
            addLog("'Pipe' resuelto o falló como se esperaba durante la desconexión.");
        } catch (e: any) {
            addLog(`Error capturado del 'pipePromise' durante desconexión (puede ser normal): ${e.message}`);
        } finally {
            pipePromiseRef.current = null;
        }
    }
    
    if (portToClose.readable) {
        try {
            // Si readable sigue bloqueado, es probable que el pipeTo aún lo tenga.
            // Cancelar el reader asociado al TextDecoderStream (hecho arriba) debería liberarlo.
            // Si no, un cancel directo aquí puede fallar si el pipe aún no se ha roto por completo.
            // Es una situación compleja, priorizar el cierre del puerto.
            if (portToClose.readable.locked) {
                addLog("SerialPort.readable sigue bloqueado. Se intentará cerrar el puerto de todas formas.");
            }
        } catch (e:any) {
            addLog(`Error al verificar/cancelar SerialPort.readable: ${e.message}.`);
        }
    }
    
    try {
      await portToClose.close();
      addLog("Puerto serial cerrado exitosamente.");
    } catch (error: any) {
      addLog(`Error al cerrar puerto serial (puede ser que ya estuviera cerrado o en proceso): ${error.message}`);
    }
    
    if (portRef.current === portToClose) {
        portRef.current = null;
    }
    textDecoderStreamRef.current = null;

    setPortInfo(null);
    setIsConnected(false);
    setIsConnecting(false);
    
    if (showToast) {
        toast({ title: "Dispositivo Desconectado", description: "Conexión serial terminada." });
    }
    addLog("Proceso de desconexión completado.");
  }, [addLog, toast]);


  const readLoop = useCallback(async (currentStringReader: ReadableStreamDefaultReader<string>) => {
    addLog("Iniciando bucle de lectura de strings...");
    let lineBuffer = '';
    try {
      while (keepReadingRef.current) {
        const { value, done } = await currentStringReader.read();
        
        if (done) {
          addLog("Lector de strings cerrado (done=true). Terminando bucle de lectura.");
          if (keepReadingRef.current && portRef.current) { 
            await disconnectPort(portRef.current, true);
          }
          break;
        }

        if (typeof value !== 'string') {
            addLog(`Error: readLoop esperaba un string pero recibió ${typeof value}. Valor: ${JSON.stringify(value)}`);
            if (portRef.current) await disconnectPort(portRef.current, true);
            break;
        }
        // addLog(`DEBUG: Chunk recibido: [${value}] (longitud: ${value.length})`);
        lineBuffer += value;
        // addLog(`DEBUG: lineBuffer después de añadir chunk: [${lineBuffer}]`);
        
        let newlineIndex;
        while ((newlineIndex = lineBuffer.indexOf('\n')) >= 0) {
          const completeLineRaw = lineBuffer.substring(0, newlineIndex);
          const completeLine = completeLineRaw.trim();
          
          // addLog(`DEBUG: Procesando línea del buffer (raw): [${completeLineRaw}]`);
          // addLog(`DEBUG: Procesando línea del buffer (trimmed): [${completeLine}]`);
          
          lineBuffer = lineBuffer.substring(newlineIndex + 1);
          // addLog(`DEBUG: Resto del lineBuffer: [${lineBuffer}]`);

          if (completeLine.length > 0) {
            if (completeLine.startsWith("{") && completeLine.endsWith("}")) {
              addLog(`Línea completa recibida: ${completeLine}`);
              await processReceivedData(completeLine);
            } else {
              addLog(`Línea recibida no parece ser JSON válido (no empieza/termina con {} o formato incorrecto). Descartando: ${completeLine}`);
            }
          } else {
            // addLog("Línea vacía después de trim, descartando.");
          }
        }
      }
    } catch (error: any) {
      if (keepReadingRef.current) { // Solo loguear como error si no es una desconexión intencional
        addLog(`Error en bucle de lectura de strings: ${error.message}`);
        if (portRef.current) await disconnectPort(portRef.current, true);
      } else {
        addLog(`Bucle de lectura (desconexión ya iniciada) encontró error/cierre esperado: ${error.message}`);
      }
    } finally {
      addLog("Bucle de lectura de strings terminado.");
    }
  }, [addLog, processReceivedData, disconnectPort]);


  const handleConnect = useCallback(async () => {
    if (!navigator.serial) {
      addLog("Web Serial API no es soportada por este navegador.");
      toast({ title: "Error de Navegador", description: "La API Web Serial no es compatible. Prueba Chrome o Edge.", variant: "destructive" });
      return;
    }

    if (portRef.current || isConnecting) {
        addLog("Conexión activa o en proceso. No se puede iniciar una nueva.");
        toast({ title: "Conexión Existente", description: "Ya hay una conexión activa o en proceso.", variant: "default" });
        return;
    }

    setIsConnecting(true);
    addLog("Solicitando selección de puerto serial...");
    let requestedPort: SerialPort | null = null; 
    
    try {
      requestedPort = await navigator.serial.requestPort();
      if (!requestedPort) { // User cancelled port selection
          addLog("Selección de puerto cancelada por el usuario.");
          setIsConnecting(false);
          return;
      }
      portRef.current = requestedPort;
      
      await requestedPort.open({ baudRate: 9600 });
      const portDetails = requestedPort.getInfo();
      const portIdentifier = portDetails.usbVendorId && portDetails.usbProductId 
        ? `VID:0x${portDetails.usbVendorId.toString(16).padStart(4, '0')} PID:0x${portDetails.usbProductId.toString(16).padStart(4, '0')}`
        : "Puerto Genérico";
      setPortInfo(portIdentifier);
      addLog(`Puerto ${portIdentifier} abierto.`);
      
      keepReadingRef.current = true; 
      
      if (!requestedPort.readable) {
        throw new Error("Puerto serial no tiene stream 'readable'.");
      }
      
      const currentTextDecoder = new TextDecoderStream();
      textDecoderStreamRef.current = currentTextDecoder;
      stringReaderRef.current = currentTextDecoder.readable.getReader();

      pipePromiseRef.current = requestedPort.readable.pipeTo(currentTextDecoder.writable)
        .then(() => {
            addLog("Pipe de ReadableStream a TextDecoderStream completado (normalmente porque el readable se cerró).");
        })
        .catch(async (pipeError: any) => {
          if (keepReadingRef.current && portRef.current) { 
               addLog(`Error en el 'pipe' del puerto al decodificador: ${pipeError.message}`);
               if (portRef.current) await disconnectPort(portRef.current, true); 
          } else {
               addLog(`Error de 'pipe' (desconexión ya iniciada o stream cerrado): ${pipeError.message}`);
          }
        });
      
      setIsConnected(true);
      setIsConnecting(false);
      addLog(`Conectado a puerto: ${portIdentifier}`);
      toast({ title: "Dispositivo Conectado", description: `Conexión serial establecida con ${portIdentifier}.` });

      readLoop(stringReaderRef.current);

    } catch (error: any) {
      addLog(`Error al conectar: ${error.message}`);
      if (error.name === 'NotFoundError') {
        addLog("Selección de puerto cancelada por el usuario.");
      } else if (error.name === 'SecurityError') {
        addLog("Error de Seguridad: No se pudo acceder al puerto. Puede ser por política de permisos o puerto no confiable.");
        toast({ title: "Error de Permisos", description: "Acceso a Web Serial denegado. Revisa la consola y la política de permisos.", variant: "destructive" });
      } else if (error.message.includes("port is already open") || error.name === "InvalidStateError") {
        addLog("El puerto ya está abierto o en estado inválido.");
        toast({ title: "Puerto Ocupado/Error", description: "El puerto ya está en uso o en un estado inválido. Cierra otras aplicaciones (ej. Arduino IDE Serial Monitor) e inténtalo de nuevo.", variant: "destructive" });
      } else {
        toast({ title: "Error de Conexión", description: error.message, variant: "destructive" });
      }
      
      if (portRef.current) {
        await disconnectPort(portRef.current, false); 
      } else if (requestedPort) { // If portRef was not set yet but requestPort succeeded
        await disconnectPort(requestedPort, false);
      }
      setPortInfo(null);
      setIsConnected(false);
      setIsConnecting(false); 
    }
  }, [addLog, toast, isConnecting, disconnectPort, readLoop, processReceivedData]); 

  useEffect(() => {
    const portInstanceAtEffectTime = portRef.current; 
    return () => {
      if (portInstanceAtEffectTime) { 
        addLog("Cleanup de useEffect (desmontaje)... Desconectando puerto si está activo.");
        // No await aquí, es un cleanup. La función disconnectPort se encargará.
        disconnectPort(portInstanceAtEffectTime, false).catch(e => addLog(`Error en desconexión durante desmontaje (useEffect cleanup): ${e.message}`)); 
      }
    };
  }, [disconnectPort]); // disconnectPort es estable debido a useCallback

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Usb className="mr-2 h-6 w-6 text-primary" />
          Conectar Dispositivo USB (Experimental)
        </CardTitle>
        <CardDescription>
          Conecta tu Arduino para enviar datos de sensores. Asegúrate que envíe JSON por línea con `hardwareId`.
          Ej: { "`{\"hardwareId\": \"TU_HW_ID\", \"temperature\": 25.5}`" }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-4">
          {!isConnected ? (
            <Button onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Conectar Dispositivo
            </Button>
          ) : (
            <Button onClick={() => { if (portRef.current) disconnectPort(portRef.current, true);}} variant="destructive" disabled={isConnecting}>
              <XCircle className="mr-2 h-4 w-4" />
              Desconectar Dispositivo
            </Button>
          )}
          <Badge variant={isConnected ? "default" : "secondary"} className={cn("transition-colors", isConnected && "bg-green-600 hover:bg-green-700 text-white")}>
            {isConnecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : isConnected ? <CheckCircle className="mr-1 h-4 w-4" /> : <XCircle className="mr-1 h-4 w-4" />}
            {isConnecting ? "Conectando..." : isConnected ? `Conectado a ${portInfo || 'dispositivo'}` : "Desconectado"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
            El `hardwareId` enviado por tu dispositivo USB debe coincidir con el `Hardware Identifier` de un dispositivo registrado en GreenView.
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
