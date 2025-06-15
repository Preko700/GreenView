
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

// Define SerialPort type if not globally available (often needed for Web Serial API)
declare global {
  interface SerialPort extends EventTarget {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    getInfo(): { usbVendorId?: number, usbProductId?: number };
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
  const [port, setPort] = useState<SerialPort | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const keepReadingRef = useRef(true);
  const textDecoderStreamRef = useRef<TransformStream<Uint8Array, string> | null>(null);

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

  const readLoop = useCallback(async (currentPortReader: ReadableStreamDefaultReader<string>) => {
    addLog("Iniciando bucle de lectura...");
    try {
      while (keepReadingRef.current) {
        const { value, done } = await currentPortReader.read();
        if (done) {
          addLog("Lector cerrado (done=true desde readLoop).");
          if (keepReadingRef.current) {
            setIsConnected(false);
          }
          break;
        }
        if (value) {
          const trimmedValue = value.trim();
          if(trimmedValue.length > 0) {
            addLog(`Datos recibidos: ${trimmedValue}`);
            if (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) {
              processReceivedData(trimmedValue);
            } else {
              addLog("Dato recibido no parece ser JSON válido. Descartando.");
            }
          }
        }
      }
    } catch (error: any) {
      if (keepReadingRef.current) {
        addLog(`Error en bucle de lectura: ${error.message}`);
        setIsConnected(false);
      }
    } finally {
      addLog("Bucle de lectura terminado.");
    }
  }, [addLog, processReceivedData]);


  const disconnectPort = useCallback(async (portToClose: SerialPort | null, showToast: boolean = true) => {
    if (!portToClose) {
      addLog("disconnectPort llamado sin puerto válido.");
      return;
    }
    addLog("Iniciando desconexión del puerto...");
    keepReadingRef.current = false;

    if (readerRef.current) {
      try {
        await readerRef.current.cancel("Desconexión por el usuario");
        addLog("Reader cancelado.");
      } catch (e: any) {
        addLog(`Error al cancelar reader: ${e.message}`);
      }
    }
    readerRef.current = null;
    
    if (textDecoderStreamRef.current) {
        if (textDecoderStreamRef.current.readable && textDecoderStreamRef.current.readable.locked) {
            try {
                const internalReader = textDecoderStreamRef.current.readable.getReader();
                await internalReader.cancel();
                internalReader.releaseLock();
                addLog("TextDecoderStream internal reader cancelado y liberado.");
            } catch (e:any) {
                addLog(`Error cancelando TextDecoderStream internal reader: ${e.message}`);
            }
        }
        if (textDecoderStreamRef.current.writable && textDecoderStreamRef.current.writable.locked) {
            try {
                const internalWriter = textDecoderStreamRef.current.writable.getWriter();
                // Check if abort is really needed or if close suffices
                // await internalWriter.abort(); 
                await internalWriter.close(); // Prefer close if no error state
                internalWriter.releaseLock();
                addLog("TextDecoderStream internal writer cerrado y liberado.");
            } catch (e:any) {
                addLog(`Error cerrando/abortando TextDecoderStream internal writer: ${e.message}`);
            }
        }
    }
    textDecoderStreamRef.current = null;


    if (writerRef.current) {
      try {
        await writerRef.current.abort("Desconexión del escritor");
        addLog("Port writer abortado.");
      } catch (e: any) {
        addLog(`Error al abortar port writer: ${e.message}`);
      }
      writerRef.current = null;
    }

    try {
      if (portToClose.readable && portToClose.readable.locked) {
        addLog("Intentando cancelar portToClose.readable...");
        const portReadableStreamReader = portToClose.readable.getReader();
        await portReadableStreamReader.cancel("Cancelando port.readable antes de cerrar").catch(e => addLog(`Error al cancelar port.readable: ${e.message}`));
        portReadableStreamReader.releaseLock();
      }
      
      if (portToClose.writable && portToClose.writable.locked) {
        addLog("Intentando abortar portToClose.writable...");
        const portWritableStreamWriter = portToClose.writable.getWriter();
        await portWritableStreamWriter.abort("Abortando port.writable antes de cerrar").catch(e => addLog(`Error al abortar port.writable: ${e.message}`));
        portWritableStreamWriter.releaseLock();
      }

      await portToClose.close();
      addLog("Puerto serial cerrado exitosamente.");
    } catch (error: any) {
      addLog(`Error al cerrar puerto serial: ${error.message}`);
    }
    
    setPort(null);
    setIsConnected(false);
    setIsConnecting(false); // Ensure connecting flag is reset
    
    if (showToast) {
        toast({ title: "Dispositivo Desconectado", description: "Conexión serial terminada." });
    }
    addLog("Proceso de desconexión completado.");
  }, [addLog, toast]);


  const handleConnect = useCallback(async () => {
    if (!navigator.serial) {
      addLog("Web Serial API no es soportada por este navegador.");
      toast({ title: "Error de Navegador", description: "La API Web Serial no es compatible. Prueba Chrome o Edge.", variant: "destructive" });
      return;
    }

    if (port || isConnecting) {
        addLog("Conexión activa o en proceso.");
        return;
    }

    setIsConnecting(true);
    addLog("Solicitando selección de puerto serial...");
    let requestedPort: SerialPort | null = null; 
    try {
      requestedPort = await navigator.serial.requestPort();
      await requestedPort.open({ baudRate: 9600 });
      
      keepReadingRef.current = true; 
      textDecoderStreamRef.current = new TransformStream(new TextDecoderStream());

      if (!requestedPort.readable) throw new Error("Puerto serial no tiene stream 'readable'.");
      if (!textDecoderStreamRef.current || !textDecoderStreamRef.current.writable) throw new Error("TextDecoderStream no inicializado correctamente para la escritura.");
      
      requestedPort.readable
        .pipeTo(textDecoderStreamRef.current.writable)
        .catch(error => {
            if (keepReadingRef.current) { 
                 addLog(`Error en pipeTo de requestedPort.readable a TextDecoderStream: ${error.message}`);
                 if (requestedPort) disconnectPort(requestedPort, true);
            } else {
                 addLog(`PipeTo error después de iniciar desconexión: ${error.message}`);
            }
         });

      if (!textDecoderStreamRef.current.readable) throw new Error("TextDecoderStream no tiene stream 'readable' (output del decoder).");
      
      readerRef.current = textDecoderStreamRef.current.readable.getReader();
      
      // writerRef.current = requestedPort.writable.getWriter(); // For direct writing if needed

      setPort(requestedPort); 
      setIsConnected(true);
      addLog(`Conectado a puerto: ${JSON.stringify(requestedPort.getInfo())}`);
      toast({ title: "Dispositivo Conectado", description: "Conexión serial establecida." });

      readLoop(readerRef.current);

    } catch (error: any) {
      addLog(`Error al conectar: ${error.message}`);
      if (error.name === 'NotFoundError') {
        addLog("Selección de puerto cancelada por el usuario.");
      } else if (error.name === 'SecurityError') {
        addLog("Error de Seguridad: No se pudo acceder al puerto. Esto puede deberse a una política de permisos (Permissions Policy) restrictiva. Asegúrate de que el entorno (ej. iframe en Cloud Workstations) permita el acceso 'serial'.");
        toast({ title: "Error de Permisos", description: "Acceso a la API Web Serial denegado por política de permisos. Revisa la consola de desarrollo para más detalles y la documentación del entorno de ejecución.", variant: "destructive" });
      } else {
        toast({ title: "Error de Conexión", description: error.message, variant: "destructive" });
      }

      if (requestedPort) {
        await disconnectPort(requestedPort, false);
      }
    } finally {
       setIsConnecting(false); // Ensure connecting is false after attempt
    }
  }, [addLog, toast, readLoop, port, isConnecting, disconnectPort]);

  useEffect(() => {
    const portInstanceAtMount = port; // Capture the port instance at mount
    return () => {
      if (portInstanceAtMount) { // Use the captured instance for cleanup
        addLog("Ejecutando cleanup de useEffect (desmontaje del componente)...");
        disconnectPort(portInstanceAtMount, false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [port, disconnectPort, addLog]); // disconnectPort & addLog are stable due to useCallback. 'port' is the key dependency.


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
          Ej: { "`{\"hardwareId\": \"TU_HW_ID_DE_GREENVIEW\", \"temperature\": 25.5, ...}`" }
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
            <Button onClick={() => disconnectPort(port, true)} variant="destructive">
              <XCircle className="mr-2 h-4 w-4" />
              Desconectar Dispositivo
            </Button>
          )}
          <Badge variant={isConnected ? "default" : "secondary"} className={cn("transition-colors", isConnected && "bg-green-600 hover:bg-green-700 text-white")}>
            {isConnected ? <CheckCircle className="mr-1 h-4 w-4" /> : <XCircle className="mr-1 h-4 w-4" />}
            {isConnecting ? "Conectando..." : isConnected ? "Conectado" : "Desconectado"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
            El `hardwareId` enviado por tu dispositivo USB debe coincidir con el `Hardware Identifier` de un dispositivo registrado en GreenView.
            Este `Hardware Identifier` se genera automáticamente al registrar un dispositivo en la app y se puede encontrar en la base de datos `greenview.db` (tabla `devices`).
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

