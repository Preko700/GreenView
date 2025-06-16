
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
    // Añadir métodos adicionales si son necesarios y están disponibles en la especificación
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
  const [port, setPort] = useState<SerialPort | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const textDecoderStreamRef = useRef<TransformStream<Uint8Array, string> | null>(null);
  const keepReadingRef = useRef(true);
  const portRef = useRef<SerialPort | null>(null); // Usar ref para el puerto en callbacks

  const addLog = useCallback((message: string) => {
    console.log('[UsbDeviceConnector]', message);
    setLogMessages(prev => [...prev.slice(-100), `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

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
        addLog("Lector de TextDecoderStream cancelado.");
      } catch (e: any) {
        addLog(`Error al cancelar lector de TextDecoderStream: ${e.message}`);
      } finally {
        readerRef.current = null;
      }
    }
    
    if (textDecoderStreamRef.current) {
      try {
        if (textDecoderStreamRef.current.readable && textDecoderStreamRef.current.readable.locked) {
          await textDecoderStreamRef.current.readable.cancel("Cancelando readable del TextDecoderStream");
        }
        if (textDecoderStreamRef.current.writable && textDecoderStreamRef.current.writable.locked) {
          await textDecoderStreamRef.current.writable.abort("Abortando writable del TextDecoderStream");
        }
        addLog("TextDecoderStream desconectado (readable cancelado, writable abortado si estaban bloqueados).");
      } catch(e: any) {
        addLog(`Error manejando TextDecoderStream: ${e.message}`);
      } finally {
        textDecoderStreamRef.current = null;
      }
    }

    try {
      if (portToClose.readable) {
         if (portToClose.readable.locked) {
            await portToClose.readable.cancel("Cancelando SerialPort.readable antes de cerrar").catch(e => addLog(`Error al cancelar SerialPort.readable: ${e.message}`));
         }
      } else {
        addLog("portToClose.readable no existe al intentar desconectar.");
      }
      
      if (portToClose.writable) {
        if (portToClose.writable.locked) {
            const writer = portToClose.writable.getWriter();
            await writer.abort("Abortando SerialPort.writable antes de cerrar").catch(e => addLog(`Error al abortar SerialPort.writable: ${e.message}`));
            writer.releaseLock();
        }
      } else {
        addLog("portToClose.writable no existe al intentar desconectar.");
      }

      await portToClose.close();
      addLog("Puerto serial cerrado exitosamente.");
    } catch (error: any) {
      addLog(`Error al cerrar puerto serial: ${error.message}`);
    }
    
    portRef.current = null;
    setPort(null);
    setIsConnected(false);
    setIsConnecting(false);
    
    if (showToast) {
        toast({ title: "Dispositivo Desconectado", description: "Conexión serial terminada." });
    }
    addLog("Proceso de desconexión completado.");
  }, [addLog, toast]);

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


  const readLoop = useCallback(async (currentStringReader: ReadableStreamDefaultReader<string>) => {
    addLog("Iniciando bucle de lectura de strings...");
    try {
      while (keepReadingRef.current) {
        const { value, done } = await currentStringReader.read();
        if (done) {
          addLog("Lector de strings cerrado (done=true).");
          if (keepReadingRef.current && portRef.current) { // Solo desconectar si no fue intencional
            disconnectPort(portRef.current, true);
          }
          break;
        }

        if (value === undefined || value === null) { // Chequeo adicional
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
        addLog(`Error en bucle de lectura (desconexión ya iniciada): ${error.message}`);
      }
    } finally {
      addLog("Bucle de lectura de strings terminado.");
      // Asegurar que el lector se libere si el bucle termina inesperadamente
      if (currentStringReader && keepReadingRef.current) { // Evitar liberar si ya se desconectó
        try {
            currentStringReader.releaseLock();
        } catch (e) {
            // Silenciar errores de liberación si el stream ya no es usable
        }
      }
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
    let requestedPort: SerialPort | null = null; 
    try {
      requestedPort = await navigator.serial.requestPort();
      portRef.current = requestedPort; // Guardar referencia inmediatamente
      setPort(requestedPort); 

      await requestedPort.open({ baudRate: 9600 });
      addLog(`Puerto ${JSON.stringify(requestedPort.getInfo())} abierto.`);
      
      keepReadingRef.current = true; 
      
      if (!requestedPort.readable) {
        throw new Error("Puerto serial no tiene stream 'readable'.");
      }
      
      textDecoderStreamRef.current = new TransformStream(new TextDecoderStream());
      if (!textDecoderStreamRef.current.writable || !textDecoderStreamRef.current.readable) {
        throw new Error("TextDecoderStream no inicializado correctamente.");
      }
      
      // Pipear el stream de bytes del puerto al TextDecoderStream
      // La promesa pipePromise maneja la vida del pipe. Si se rechaza, es un error crítico del stream.
      const pipePromise = requestedPort.readable.pipeTo(textDecoderStreamRef.current.writable);
      pipePromise.catch(error => {
        if (keepReadingRef.current) { 
             addLog(`Error en el 'pipe' del puerto al decodificador: ${error.message}`);
             if (portRef.current === requestedPort) { // Solo desconectar si es el puerto activo
                disconnectPort(requestedPort, true); // Esto limpiará todo
             }
        } else {
             addLog(`Error de 'pipe' (desconexión ya iniciada): ${error.message}`);
        }
      });

      // Obtener el lector para los strings decodificados
      readerRef.current = textDecoderStreamRef.current.readable.getReader();
      
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
        toast({ title: "Error de Permisos", description: "Acceso a la API Web Serial denegado por política de permisos. Revisa la consola.", variant: "destructive" });
      } else if (error.message.includes("port is already open")) {
        addLog("El puerto ya está abierto. Otra aplicación podría estar usándolo. Intentando desconectar y limpiar...");
        toast({ title: "Puerto Ocupado", description: "El puerto ya está en uso. Cierra otras aplicaciones (ej. Arduino IDE Serial Monitor) e inténtalo de nuevo.", variant: "destructive" });
      } else {
        toast({ title: "Error de Conexión", description: error.message, variant: "destructive" });
      }

      if (requestedPort) { // Si se obtuvo un puerto, intentar desconectarlo
        await disconnectPort(requestedPort, false); // No mostrar toast de desconexión si la conexión falló
      } else { // Si requestPort falló (ej. NotFoundError), asegurarse que el estado se limpie
        portRef.current = null;
        setPort(null);
        setIsConnected(false);
      }
    } finally {
       setIsConnecting(false); 
    }
  }, [addLog, toast, readLoop, isConnecting, disconnectPort]);

  useEffect(() => {
    // Capturar la instancia actual del puerto al montar/actualizar
    const portInstanceAtEffectTime = portRef.current; 
    return () => {
      if (portInstanceAtEffectTime) { 
        addLog("Ejecutando cleanup de useEffect (desmontaje o cambio de puerto)...");
        disconnectPort(portInstanceAtEffectTime, false);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo se ejecuta al montar y desmontar. disconnectPort y addLog son estables.

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
            <Button onClick={handleConnect} disabled={isConnecting || !!port}>
              {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Conectar Dispositivo
            </Button>
          ) : (
            <Button onClick={() => { if (port) disconnectPort(port, true);}} variant="destructive" disabled={!port}>
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

