
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

// Tipos globales para Web Serial API
declare global {
  interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
  }
  interface SerialPort extends EventTarget {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    getInfo(): SerialPortInfo;
    forget?(): Promise<void>;
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
  waterLevel?: number; // 0 LOW, 1 HIGH, or percentage
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
    setLogMessages(prev => [...prev.slice(-200), `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

  const processReceivedData = useCallback(async (jsonData: ArduinoSensorPayload, originalJsonString: string) => {
    try {
      if (!jsonData.hardwareId) { 
        addLog(`Dato JSON recibido sin 'hardwareId'. Descartando: ${originalJsonString}`);
        return;
      }
      addLog(`Datos JSON parseados para ${jsonData.hardwareId}: ${originalJsonString}`);

      const apiPayload: Partial<ArduinoSensorPayload> = { hardwareId: jsonData.hardwareId };
      if (jsonData.temperature !== undefined) apiPayload.temperature = jsonData.temperature;
      if (jsonData.airHumidity !== undefined) apiPayload.airHumidity = jsonData.airHumidity;
      if (jsonData.soilHumidity !== undefined) apiPayload.soilHumidity = jsonData.soilHumidity;
      if (jsonData.lightLevel !== undefined) apiPayload.lightLevel = jsonData.lightLevel;
      if (jsonData.waterLevel !== undefined) apiPayload.waterLevel = jsonData.waterLevel;
      if (jsonData.ph !== undefined) apiPayload.ph = jsonData.ph;
      
      console.log('[UsbDeviceConnector] Enviando a /api/ingest-sensor-data:', apiPayload);

      const response = await fetch('/api/ingest-sensor-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload),
      });

      const result = await response.json();
      
      if (!response.ok) {
        addLog(`Error del servidor (Status: ${response.status}). Respuesta completa: ${JSON.stringify(result)}`);
        let errorMessageFromServer = result.message || 'Error al enviar datos al servidor';
        if (result.error) { // El backend ahora envía el error de DB en result.error
            errorMessageFromServer += `. Detalle del Servidor: ${result.error}`;
        }
        throw new Error(errorMessageFromServer);
      }
      addLog(`Datos enviados al servidor para ${jsonData.hardwareId}: ${result.message}`);

    } catch (error: any) {
      addLog(`Error procesando/enviando datos JSON: ${error.message}. JSON problemático: "${originalJsonString}"`);
    }
  }, [addLog, toast]);

  const disconnectPort = useCallback(async (portToClose: SerialPort | null, showToast: boolean = true) => {
    if (!portToClose) {
      addLog("disconnectPort llamado sin puerto válido.");
      return;
    }
    const portDetails = portToClose.getInfo();
    const portIdentifier = portDetails.usbVendorId && portDetails.usbProductId 
        ? `VID:0x${portDetails.usbVendorId.toString(16).padStart(4, '0')} PID:0x${portDetails.usbProductId.toString(16).padStart(4, '0')}`
        : "Puerto Genérico";
    addLog(`Iniciando desconexión del puerto ${portIdentifier}...`);
    
    keepReadingRef.current = false;

    if (stringReaderRef.current) {
      try {
        await stringReaderRef.current.cancel("Desconexión por el usuario");
        addLog("Lector de TextDecoderStream cancelado.");
      } catch (e: any) {
        addLog(`Error cancelando lector de TextDecoderStream (puede ser normal si ya estaba cerrado o bloqueado): ${e.message}`);
      }
      stringReaderRef.current = null;
    }

    if (textDecoderStreamRef.current?.writable && textDecoderStreamRef.current.writable.locked === false) {
        try {
            await textDecoderStreamRef.current.writable.abort("Aborting TextDecoderStream writable on disconnect");
            addLog("TextDecoderStream.writable abortado.");
        } catch (e: any) {
            addLog(`Error abortando TextDecoderStream.writable (puede ser normal): ${e.message}`);
        }
    } else if (textDecoderStreamRef.current?.writable && textDecoderStreamRef.current.writable.locked === true) {
        addLog("TextDecoderStream.writable está bloqueado, no se puede abortar directamente. El cierre del pipe debería manejarlo.");
    }
    textDecoderStreamRef.current = null;

    if (pipePromiseRef.current) {
        addLog("Esperando que el 'pipe' del puerto al decodificador se complete o falle...");
        try {
            await pipePromiseRef.current; 
            addLog("'Pipe' resuelto o falló como se esperaba durante la desconexión.");
        } catch (e: any) {
            addLog(`Error capturado del 'pipePromise' durante desconexión (puede ser normal): ${e.message}`);
        }
    }
    pipePromiseRef.current = null;
    
    if (portToClose.readable && portToClose.readable.locked) {
        try {
            addLog("Intentando cancelar SerialPort.readable (puede fallar si el pipe lo controla)...");
            const rawReader = portToClose.readable.getReader(); // Obtener el lector para cancelarlo
            await rawReader.cancel("Desconexión por el usuario - cancelando readable del puerto");
            rawReader.releaseLock(); // Importante liberar el lock después de cancelar
            addLog("SerialPort.readable cancelado y liberado.");
        } catch (e:any) {
            addLog(`Error al cancelar/liberar SerialPort.readable (puede ser esperado si el pipe falló): ${e.message}.`);
        }
    }
    
    try {
      await portToClose.close();
      addLog(`Puerto serial ${portIdentifier} cerrado exitosamente.`);
    } catch (error: any)      {
      addLog(`Error al cerrar puerto serial ${portIdentifier} (puede ser que ya estuviera cerrado o en proceso): ${error.message}`);
    }
    
    if (portRef.current === portToClose) {
        portRef.current = null;
    }

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
          addLog("Lector de strings cerrado (done=true).");
          if (keepReadingRef.current && portRef.current) { 
            addLog("Cierre inesperado del stream, intentando desconectar puerto.");
            await disconnectPort(portRef.current, true);
          }
          break;
        }

        if (typeof value !== 'string') {
            addLog(`Error: readLoop esperaba un string pero recibió ${typeof value}. Valor: ${JSON.stringify(value)}`);
            if (portRef.current) await disconnectPort(portRef.current, true);
            break;
        }
        
        addLog(`DEBUG: Chunk recibido: [${value.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}] (longitud: ${value.length})`);
        lineBuffer += value;
        addLog(`DEBUG: lineBuffer después de añadir chunk: [${lineBuffer.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}]`);
        
        let newlineIndex;
        while ((newlineIndex = lineBuffer.indexOf('\n')) >= 0) {
          const rawLine = lineBuffer.substring(0, newlineIndex);
          lineBuffer = lineBuffer.substring(newlineIndex + 1);
          
          const trimmedLine = rawLine.trim();
          addLog(`DEBUG: Procesando línea del buffer (raw): [${rawLine.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}]`);
          addLog(`DEBUG: Procesando línea del buffer (trimmed): [${trimmedLine}]`);

          if (trimmedLine.length > 0) {
            try {
              addLog(`DEBUG: Intentando JSON.parse en: [${trimmedLine}] (Longitud: ${trimmedLine.length})`);
              const jsonData = JSON.parse(trimmedLine); 
              addLog(`Línea completa recibida y parseada: ${trimmedLine}`);
              await processReceivedData(jsonData, trimmedLine); 
            } catch (e: any) {
              addLog(`Línea recibida no parece ser JSON válido (error de parseo): ${e.message}. Línea: "${trimmedLine}"`);
            }
          } else {
            addLog(`DEBUG: Línea vacía después de trim. Descartando. Raw: [${rawLine.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}]`);
          }
          addLog(`DEBUG: Resto del lineBuffer: [${lineBuffer.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}]`);
        }
      }
    } catch (error: any) {
      if (keepReadingRef.current) {
        addLog(`Error en bucle de lectura de strings: ${error.message}. Stack: ${error.stack}`);
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
      if (!requestedPort) {
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
      
      textDecoderStreamRef.current = new TextDecoderStream(); // Nueva instancia para cada conexión
      
      pipePromiseRef.current = requestedPort.readable.pipeTo(textDecoderStreamRef.current.writable)
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
      
      stringReaderRef.current = textDecoderStreamRef.current.readable.getReader();
      
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
        addLog("Error de Seguridad: No se pudo acceder al puerto. Política de permisos o HTTPS/localhost. Error completo: " + error.message);
        toast({ title: "Error de Permisos", description: "Acceso a Web Serial denegado. Revisa consola y política de permisos (HTTPS/localhost).", variant: "destructive" });
      } else if (error.message.includes("port is already open") || error.name === "InvalidStateError") {
        addLog("El puerto ya está abierto o en estado inválido. Cierra otras apps (ej. Arduino IDE Serial Monitor).");
        toast({ title: "Puerto Ocupado/Error", description: "El puerto ya está en uso o en un estado inválido. Cierra otras aplicaciones (ej. Arduino IDE Serial Monitor) e inténtalo de nuevo.", variant: "destructive" });
      } else {
        toast({ title: "Error de Conexión", description: error.message, variant: "destructive" });
      }
      
      if (portRef.current) { // Si se asignó un puerto antes del error
        await disconnectPort(portRef.current, false); 
      } else if (requestedPort) { // Si se obtuvo un puerto pero no se asignó a portRef (error muy temprano)
        try { await requestedPort.close(); } catch(e) { /* ignorar error de cierre aquí */ }
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
        disconnectPort(portInstanceAtEffectTime, false).catch(e => addLog(`Error en desconexión durante desmontaje (useEffect cleanup): ${e.message}`)); 
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <Button onClick={() => { if (portRef.current) disconnectPort(portRef.current, true);}} variant="destructive" disabled={isConnecting && !isConnected}>
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
        <ScrollArea id="serial-log" className="h-60 w-full rounded-md border bg-muted/20 p-2 text-xs">
          {logMessages.length === 0 && <p className="text-muted-foreground italic">Esperando actividad...</p>}
          {logMessages.map((msg, index) => (
            <div key={index} className="font-mono leading-relaxed whitespace-pre-wrap break-all border-b border-border/50 py-0.5">{msg}</div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
    

    