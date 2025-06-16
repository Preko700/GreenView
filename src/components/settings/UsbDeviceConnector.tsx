
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

// Declaraciones de tipo global para Web Serial API
declare global {
  interface SerialPort extends EventTarget {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    getInfo(): { usbVendorId?: number, usbProductId?: number };
    forget?(): Promise<void>;
  }

  interface SerialOptions {
    baudRate: number;
    dataBits?: 7 | 8;
    stopBits?: 1 | 2;
    parity?: "none" | "even" | "odd";
    bufferSize?: number;
    flowControl?: "none" | "hardware";
  }

  interface Navigator {
    serial: {
      requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
      getPorts(): Promise<SerialPort[]>;
    };
  }
  interface SerialPortRequestOptions {
    filters?: Array<{
      usbVendorId?: number;
      usbProductId?: number;
    }>;
  }
}

interface ArduinoSensorPayload {
  hardwareId: string; // Changed from 'id' to 'hardwareId'
  temperature?: number;
  airHumidity?: number;
  soilHumidity?: number;
  lightLevel?: number;
  waterLevel?: number; // 0 for LOW, 1 for HIGH
  sensor_u?: boolean; // Keeping this temporarily for your current Arduino code
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
      // Expecting 'hardwareId' from Arduino now, matching backend
      if (!data.hardwareId) { 
        addLog(`Dato JSON recibido sin 'hardwareId'. Descartando: ${jsonDataString}`);
        return;
      }
      addLog(`Datos JSON parseados para ${data.hardwareId}: ${jsonDataString}`);

      // Construct payload for our /api/ingest-sensor-data
      const apiPayload = {
        hardwareId: data.hardwareId,
        temperature: data.temperature,
        airHumidity: data.airHumidity,
        soilHumidity: data.soilHumidity,
        lightLevel: data.lightLevel,
        // Convert sensor_u to waterLevel if it's present, or use waterLevel directly
        waterLevel: data.sensor_u !== undefined ? (data.sensor_u ? 1 : 0) : data.waterLevel,
      };

      const response = await fetch('/api/ingest-sensor-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Error al enviar datos al servidor');
      }
      addLog(`Datos enviados al servidor para ${data.hardwareId}: ${result.message}`);

    } catch (error: any) {
      addLog(`Error procesando datos JSON: ${error.message}. Datos recibidos: "${jsonDataString}"`);
    }
  }, [addLog]);

  const disconnectPort = useCallback(async (portToClose: SerialPort | null, showToast: boolean = true) => {
    if (!portToClose) {
      addLog("disconnectPort llamado sin puerto válido.");
      return;
    }
    addLog(`Iniciando desconexión del puerto ${JSON.stringify(portToClose.getInfo())}...`);
    keepReadingRef.current = false;

    const currentStringReader = stringReaderRef.current;
    if (currentStringReader) {
      stringReaderRef.current = null;
      try {
        await currentStringReader.cancel("Desconexión por el usuario");
        addLog("Lector de TextDecoderStream (stringReader) cancelado.");
      } catch (e: any) {
        addLog(`Error al cancelar stringReader: ${e.message}`);
      }
    }
    
    const currentPipePromise = pipePromiseRef.current;
    if (currentPipePromise) {
        pipePromiseRef.current = null; // Avoid re-entry
        addLog("Esperando que el 'pipe' del puerto al decodificador se complete o falle...");
        try {
            await currentPipePromise; 
            addLog("'Pipe' resuelto o ya fallido.");
        } catch (e: any) {
            addLog(`Error capturado del 'pipePromise' durante desconexión: ${e.message}`);
        }
    }

    const currentTextDecoderStream = textDecoderStreamRef.current;
    if (currentTextDecoderStream) {
      textDecoderStreamRef.current = null;
      try {
        if (currentTextDecoderStream.writable && !currentTextDecoderStream.writable.locked) {
           await currentTextDecoderStream.writable.abort("Abortando TextDecoderStream.writable");
           addLog("TextDecoderStream.writable abortado.");
        } else if (currentTextDecoderStream.writable?.locked){
            addLog("TextDecoderStream.writable está bloqueado, el 'pipe' debería haberlo liberado o cancelado el lector.");
        }
      } catch (e: any) {
        addLog(`Error al manejar TextDecoderStream.writable en desconexión: ${e.message}`);
      }
    }
    
    if (portToClose.readable && portToClose.readable.locked) {
        addLog("SerialPort.readable sigue bloqueado. Intentando cancelarlo...");
        try {
            await portToClose.readable.cancel("Cancelando SerialPort.readable en desconexión final");
            addLog("SerialPort.readable cancelado.");
        } catch (e:any) {
            addLog(`Error al cancelar SerialPort.readable: ${e.message}. Esto puede ser normal si el 'pipe' ya lo hizo.`);
        }
    }

    try {
      await portToClose.close();
      addLog("Puerto serial cerrado exitosamente.");
    } catch (error: any) {
      addLog(`Error al cerrar puerto serial: ${error.message}`);
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
            disconnectPort(portRef.current, true);
          }
          break;
        }

        if (value === undefined || value === null) {
            addLog("Valor nulo o indefinido recibido del lector de strings.");
            continue;
        }
        
        if (typeof value !== 'string') {
            addLog(`Error: readLoop esperaba un string pero recibió ${typeof value}. Valor: ${JSON.stringify(value)}`);
            if (portRef.current) { // No usar keepReadingRef aquí, si hay error, desconectar
                 disconnectPort(portRef.current, true);
            }
            break; 
        }

        lineBuffer += value;
        let newlineIndex;
        while ((newlineIndex = lineBuffer.indexOf('\n')) >= 0) {
          const completeLine = lineBuffer.substring(0, newlineIndex).trim();
          lineBuffer = lineBuffer.substring(newlineIndex + 1);

          if (completeLine.length > 0) {
            addLog(`Línea completa recibida: ${completeLine}`);
            if (completeLine.startsWith("{") && completeLine.endsWith("}")) {
              processReceivedData(completeLine);
            } else {
              addLog("Línea recibida no parece ser JSON válido. Descartando.");
            }
          }
        }
      }
    } catch (error: any) {
      if (keepReadingRef.current) { // Solo si no fue una desconexión intencional
        addLog(`Error en bucle de lectura de strings: ${error.message}`);
        if (portRef.current) {
            disconnectPort(portRef.current, true);
        }
      } else {
        addLog(`Bucle de lectura (desconexión ya iniciada) encontró error esperado: ${error.message}`);
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
        addLog("Conexión activa o en proceso.");
        return;
    }

    setIsConnecting(true);
    addLog("Solicitando selección de puerto serial...");
    let tempPort: SerialPort | null = null; 
    
    try {
      tempPort = await navigator.serial.requestPort();
      portRef.current = tempPort; // Store immediately
      await tempPort.open({ baudRate: 9600 });
      const portDetails = tempPort.getInfo();
      addLog(`Puerto ${JSON.stringify(portDetails)} abierto.`);
      
      setPortInfo(JSON.stringify(portDetails));
      keepReadingRef.current = true; 
      
      if (!tempPort.readable) {
        throw new Error("Puerto serial no tiene stream 'readable'.");
      }
      
      const currentTextDecoder = new TextDecoderStream();
      textDecoderStreamRef.current = currentTextDecoder;
      
      pipePromiseRef.current = tempPort.readable.pipeTo(currentTextDecoder.writable)
        .catch(pipeError => {
          if (keepReadingRef.current) { 
               addLog(`Error en el 'pipe' del puerto al decodificador: ${pipeError.message}`);
               if (portRef.current === tempPort) { 
                  disconnectPort(tempPort, true); 
               }
          } else {
               addLog(`Error de 'pipe' (desconexión ya iniciada): ${pipeError.message}`);
          }
        });

      stringReaderRef.current = currentTextDecoder.readable.getReader();
      
      setIsConnected(true);
      addLog(`Conectado a puerto: ${JSON.stringify(portDetails)}`);
      toast({ title: "Dispositivo Conectado", description: "Conexión serial establecida." });

      readLoop(stringReaderRef.current);

    } catch (error: any) {
      addLog(`Error al conectar: ${error.message}`);
      if (error.name === 'NotFoundError') {
        addLog("Selección de puerto cancelada por el usuario.");
      } else if (error.name === 'SecurityError') {
        addLog("Error de Seguridad: No se pudo acceder al puerto. Esto puede deberse a una política de permisos (Permissions Policy) restrictiva o a que el puerto no es de confianza. Asegúrate de que el entorno (ej. iframe en Cloud Workstations) permita el acceso 'serial'.");
        toast({ title: "Error de Permisos", description: "Acceso a la API Web Serial denegado por política de permisos o seguridad. Revisa la consola.", variant: "destructive" });
      } else if (error.message.includes("port is already open") || error.name === "InvalidStateError") {
        addLog("El puerto ya está abierto. Otra aplicación podría estar usándolo o el estado del puerto es inválido.");
        toast({ title: "Puerto Ocupado/Error", description: "El puerto ya está en uso o en un estado inválido. Cierra otras aplicaciones (ej. Arduino IDE Serial Monitor) e inténtalo de nuevo.", variant: "destructive" });
      } else {
        toast({ title: "Error de Conexión", description: error.message, variant: "destructive" });
      }
      
      // Ensure cleanup if connection failed partway
      if (portRef.current) { // Use portRef.current as tempPort might be out of scope or stale
        await disconnectPort(portRef.current, false); 
      } else {
        // Reset states if portRef.current was never set (e.g., requestPort failed)
        setIsConnected(false);
        setPortInfo(null);
      }
    } finally {
       setIsConnecting(false); 
    }
  }, [addLog, toast, readLoop, isConnecting, disconnectPort, processReceivedData]);

  useEffect(() => {
    const portInstanceAtEffectTime = portRef.current;
    return () => {
      if (portInstanceAtEffectTime) { 
        addLog("Ejecutando cleanup de useEffect (desmontaje)...");
        keepReadingRef.current = false; 
        disconnectPort(portInstanceAtEffectTime, false); 
      }
    };
  }, [addLog, disconnectPort]);


  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Usb className="mr-2 h-6 w-6 text-primary" />
          Conectar Dispositivo USB (Experimental)
        </CardTitle>
        <CardDescription>
          Conecta tu Arduino u otro dispositivo serial para enviar datos de sensores directamente.
          Asegúrate que tu dispositivo envíe datos JSON por línea (terminados con newline), incluyendo un `hardwareId`.
          Ej: { "`{\"hardwareId\": \"TU_HW_ID\", \"temperature\": 25.5}`" }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-4">
          {!isConnected ? (
            <Button onClick={handleConnect} disabled={isConnecting || !!portRef.current}>
              {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Conectar Dispositivo
            </Button>
          ) : (
            <Button onClick={() => { if (portRef.current) disconnectPort(portRef.current, true);}} variant="destructive" disabled={!portRef.current}>
              <XCircle className="mr-2 h-4 w-4" />
              Desconectar Dispositivo
            </Button>
          )}
          <Badge variant={isConnected ? "default" : "secondary"} className={cn("transition-colors", isConnected && "bg-green-600 hover:bg-green-700 text-white")}>
            {isConnected ? <CheckCircle className="mr-1 h-4 w-4" /> : <XCircle className="mr-1 h-4 w-4" />}
            {isConnecting ? "Conectando..." : isConnected ? `Conectado a ${portInfo || 'dispositivo'}` : "Desconectado"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
            El `hardwareId` enviado por tu dispositivo USB debe coincidir con el `Hardware Identifier` de un dispositivo registrado en GreenView.
            Este `Hardware Identifier` se genera automáticamente al registrar un dispositivo.
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

