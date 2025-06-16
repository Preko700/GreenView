
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

interface SensorPayload {
  hardwareId: string;
  temperature?: number;
  airHumidity?: number;
  soilHumidity?: number;
  lightLevel?: number;
  waterLevel?: number; // 0 for LOW, 1 for HIGH
}

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


export function UsbDeviceConnector() {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [portInfo, setPortInfo] = useState<string | null>(null); // For displaying port info
  const [logMessages, setLogMessages] = useState<string[]>([]);
  
  const portRef = useRef<SerialPort | null>(null);
  const textDecoderStreamRef = useRef<TransformStream<Uint8Array, string> | null>(null);
  const stringReaderRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const keepReadingRef = useRef(true);
  const pipePromiseRef = useRef<Promise<void> | null>(null);


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

    const currentTextDecoderStream = textDecoderStreamRef.current;
    if (currentTextDecoderStream) {
      textDecoderStreamRef.current = null;
      try {
        if (currentTextDecoderStream.writable && !currentTextDecoderStream.writable.locked) {
           await currentTextDecoderStream.writable.abort("Abortando TextDecoderStream.writable");
           addLog("TextDecoderStream.writable abortado.");
        } else if (currentTextDecoderStream.writable?.locked){
            addLog("TextDecoderStream.writable está bloqueado, no se puede abortar directamente.");
        }
        // The readable side of TextDecoderStream is handled by its reader being cancelled.
      } catch (e: any) {
        addLog(`Error al manejar TextDecoderStream.writable en desconexión: ${e.message}`);
      }
    }
    
    if (pipePromiseRef.current) {
        try {
            // Wait for pipe to settle if it hasn't already, or catch its error
            await pipePromiseRef.current; 
        } catch (e: any) {
            addLog(`Error en pipePromise durante desconexión: ${e.message}`);
        }
        pipePromiseRef.current = null;
    }

    // Now handle the port itself
    // Check if port.readable is locked (by pipeTo). If so, pipeTo should have been broken by aborting decoder's writable.
    if (portToClose.readable && portToClose.readable.locked) {
        addLog("SerialPort.readable sigue bloqueado. Intentando cancelarlo (esto podría fallar si el pipe no se liberó).");
        try {
            await portToClose.readable.cancel("Cancelando SerialPort.readable en desconexión final");
            addLog("SerialPort.readable cancelado.");
        } catch (e:any) {
            addLog(`Error al cancelar SerialPort.readable: ${e.message}`);
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
            if (keepReadingRef.current && portRef.current) {
                 disconnectPort(portRef.current, true);
            }
            break; 
        }

        const trimmedValue = value.trim();
        if(trimmedValue.length > 0) {
          addLog(`String recibido: ${trimmedValue}`);
          if (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) {
            processReceivedData(trimmedValue);
          } else {
            addLog("String recibido no parece ser JSON válido. Descartando.");
          }
        }
      }
    } catch (error: any) {
      if (keepReadingRef.current) {
        addLog(`Error en bucle de lectura de strings: ${error.message}`);
        if (portRef.current) {
            disconnectPort(portRef.current, true);
        }
      } else {
        addLog(`Bucle de lectura (desconexión ya iniciada) encontró error: ${error.message}`);
      }
    } finally {
      addLog("Bucle de lectura de strings terminado.");
      // currentStringReader should release lock automatically when loop exits or it's cancelled
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
      await tempPort.open({ baudRate: 9600 });
      const portDetails = tempPort.getInfo();
      addLog(`Puerto ${JSON.stringify(portDetails)} abierto.`);
      
      portRef.current = tempPort;
      setPortInfo(JSON.stringify(portDetails));
      keepReadingRef.current = true; 
      
      if (!tempPort.readable) {
        throw new Error("Puerto serial no tiene stream 'readable'.");
      }
      
      const currentTextDecoder = new TextDecoderStream();
      textDecoderStreamRef.current = currentTextDecoder;
      
      pipePromiseRef.current = tempPort.readable.pipeTo(currentTextDecoder.writable);
      pipePromiseRef.current.catch(pipeError => {
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
        addLog("Error de Seguridad: No se pudo acceder al puerto. Esto puede deberse a una política de permisos (Permissions Policy) restrictiva. Asegúrate de que el entorno (ej. iframe en Cloud Workstations) permita el acceso 'serial'.");
        toast({ title: "Error de Permisos", description: "Acceso a la API Web Serial denegado por política de permisos. Revisa la consola.", variant: "destructive" });
      } else if (error.message.includes("port is already open") || error.name === "InvalidStateError") {
        addLog("El puerto ya está abierto. Otra aplicación podría estar usándolo. O el estado del puerto es inválido.");
        toast({ title: "Puerto Ocupado/Error", description: "El puerto ya está en uso o en un estado inválido. Cierra otras aplicaciones (ej. Arduino IDE Serial Monitor) e inténtalo de nuevo.", variant: "destructive" });
      } else {
        toast({ title: "Error de Conexión", description: error.message, variant: "destructive" });
      }

      if (tempPort) { 
        await disconnectPort(tempPort, false); 
      } else { 
        portRef.current = null;
        setPortInfo(null);
        setIsConnected(false);
      }
    } finally {
       setIsConnecting(false); 
    }
  }, [addLog, toast, readLoop, isConnecting, disconnectPort, processReceivedData]); // Added processReceivedData

  useEffect(() => {
    // No es necesario guardar portInstanceAtMount, portRef.current se actualiza correctamente.
    return () => {
      if (portRef.current) { 
        addLog("Ejecutando cleanup de useEffect (desmontaje)...");
        // keepReadingRef ya debería ser false si el componente se desmonta mientras está conectado
        // o ya se llamó a disconnectPort explícitamente.
        // Para mayor seguridad, nos aseguramos de que el bucle sepa que debe parar.
        keepReadingRef.current = false; 
        disconnectPort(portRef.current, false); // showToast = false
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disconnectPort]); // disconnectPort es estable

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

