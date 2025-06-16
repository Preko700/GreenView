
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
  id?: string; // Para retrocompatibilidad si Arduino envía 'id'
  hardwareId?: string;
  temperature?: number;
  airHumidity?: number;
  soilHumidity?: number;
  lightLevel?: number;
  waterLevel?: number; 
  sensor_u?: boolean; // Para retrocompatibilidad
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
      
      const effectiveHardwareId = data.hardwareId || data.id;

      if (!effectiveHardwareId) { 
        addLog(`Dato JSON recibido sin 'hardwareId' o 'id'. Descartando: ${jsonDataString}`);
        return;
      }
      addLog(`Datos JSON parseados para ${effectiveHardwareId}: ${jsonDataString}`);

      const apiPayload: Partial<ArduinoSensorPayload> = {
        hardwareId: effectiveHardwareId,
        temperature: data.temperature,
        airHumidity: data.airHumidity,
        soilHumidity: data.soilHumidity,
        lightLevel: data.lightLevel,
      };
      
      if (data.sensor_u !== undefined) {
        apiPayload.waterLevel = data.sensor_u ? 1 : 0;
      } else if (data.waterLevel !== undefined) {
        apiPayload.waterLevel = data.waterLevel;
      }


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

  
  const readLoop = useCallback(async (currentStringReader: ReadableStreamDefaultReader<string>) => {
    addLog("DEBUG: readLoop iniciado.");
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

        if (value) {
            addLog(`DEBUG: Chunk recibido: [${value}] (tipo: ${typeof value})`);
            if (typeof value !== 'string') {
                addLog(`Error: readLoop esperaba un string pero recibió ${typeof value}. Valor: ${JSON.stringify(value)}`);
                if (portRef.current) {
                    await disconnectPort(portRef.current, true);
                }
                break;
            }
            lineBuffer += value;
            addLog(`DEBUG: lineBuffer después de añadir chunk: [${lineBuffer}]`);
        }
        
        let newlineIndex;
        while ((newlineIndex = lineBuffer.indexOf('\n')) >= 0) {
          addLog(`DEBUG: Encontrado newline. lineBuffer antes de procesar: [${lineBuffer}]`);
          const completeLineRaw = lineBuffer.substring(0, newlineIndex);
          const completeLine = completeLineRaw.trim();
          
          addLog(`DEBUG: Línea a procesar (antes de trim): [${completeLineRaw}]`);
          addLog(`DEBUG: Línea a procesar (después de trim): [${completeLine}]`);
          
          lineBuffer = lineBuffer.substring(newlineIndex + 1);
          addLog(`DEBUG: Resto del lineBuffer después de extraer línea: [${lineBuffer}]`);

          if (completeLine.length > 0) {
            // addLog(`Línea completa recibida: ${completeLine}`); // Log redundante con el de DEBUG
            if (completeLine.startsWith("{") && completeLine.endsWith("}")) {
              await processReceivedData(completeLine);
            } else {
              addLog(`String recibido no parece ser JSON válido (no empieza/termina con {} o formato incorrecto). Descartando: ${completeLine}`);
            }
          } else {
            addLog("Línea vacía después de trim, descartando.");
          }
        }
      }
    } catch (error: any) {
      if (keepReadingRef.current) {
        addLog(`Error en bucle de lectura de strings: ${error.message}`);
        if (portRef.current) {
            await disconnectPort(portRef.current, true);
        }
      } else {
        addLog(`Bucle de lectura (desconexión ya iniciada) encontró error esperado: ${error.message}`);
      }
    } finally {
      addLog("Bucle de lectura de strings terminado.");
    }
  }, [addLog, processReceivedData, disconnectPort]); // disconnectPort es una dependencia


  const disconnectPort = useCallback(async (portToClose: SerialPort | null, showToast: boolean = true) => {
    if (!portToClose) {
      addLog("disconnectPort llamado sin puerto válido.");
      return;
    }
    addLog(`Iniciando desconexión del puerto ${JSON.stringify(portToClose.getInfo())}...`);
    keepReadingRef.current = false; // Señal para detener el readLoop

    const currentStringReader = stringReaderRef.current;
    if (currentStringReader) {
      stringReaderRef.current = null;
      try {
        // No esperar la cancelación si ya está en proceso o el stream está cerrado
        currentStringReader.cancel("Desconexión por el usuario").catch(e => addLog(`Error (ignorado) al cancelar stringReader: ${e.message}`));
        addLog("Solicitud de cancelación para stringReader enviada.");
      } catch (e: any) {
        addLog(`Excepción síncrona al intentar cancelar stringReader: ${e.message}`);
      }
    }
    
    const currentPipePromise = pipePromiseRef.current;
    if (currentPipePromise) {
        pipePromiseRef.current = null;
        addLog("Esperando que el 'pipe' del puerto al decodificador se complete o falle...");
        try {
            await currentPipePromise; 
            addLog("'Pipe' resuelto.");
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
            addLog("TextDecoderStream.writable está bloqueado, el 'pipe' o cancel del lector debería haberlo manejado.");
        }
      } catch (e: any) {
        addLog(`Error al manejar TextDecoderStream.writable en desconexión: ${e.message}`);
      }
    }
    
    // Intentar cancelar streams del puerto si siguen bloqueados
    if (portToClose.readable && portToClose.readable.locked) {
        addLog("SerialPort.readable sigue bloqueado. Intentando cancelarlo...");
        try {
            await portToClose.readable.cancel("Cancelando SerialPort.readable en desconexión");
            addLog("SerialPort.readable cancelado.");
        } catch (e:any) {
            addLog(`Error al cancelar SerialPort.readable: ${e.message}.`);
        }
    }
     if (portToClose.writable && portToClose.writable.locked) {
        addLog("SerialPort.writable sigue bloqueado. Intentando abortarlo...");
        try {
            await portToClose.writable.abort("Abortando SerialPort.writable en desconexión");
            addLog("SerialPort.writable abortado.");
        } catch (e:any) {
            addLog(`Error al abortar SerialPort.writable: ${e.message}.`);
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
    // No resetear isConnecting aquí si la desconexión fue por un error en handleConnect
    
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

    if (portRef.current || isConnecting) {
        addLog("Conexión activa o en proceso.");
        return;
    }

    setIsConnecting(true);
    addLog("Solicitando selección de puerto serial...");
    let tempPort: SerialPort | null = null; 
    
    try {
      tempPort = await navigator.serial.requestPort();
      portRef.current = tempPort; 
      await tempPort.open({ baudRate: 9600 }); // Puedes añadir bufferSize si es necesario: bufferSize: 255
      const portDetails = tempPort.getInfo();
      addLog(`Puerto ${JSON.stringify(portDetails)} abierto.`);
      setPortInfo(JSON.stringify(portDetails));
      
      keepReadingRef.current = true; 
      
      if (!tempPort.readable) {
        throw new Error("Puerto serial no tiene stream 'readable'.");
      }
      
      textDecoderStreamRef.current = new TextDecoderStream();
      stringReaderRef.current = textDecoderStreamRef.current.readable.getReader();

      pipePromiseRef.current = tempPort.readable.pipeTo(textDecoderStreamRef.current.writable)
        .then(() => addLog("Pipe de ReadableStream a TextDecoderStream completado (normalmente porque el readable se cerró)."))
        .catch(async (pipeError: any) => {
          if (keepReadingRef.current) { 
               addLog(`Error en el 'pipe' del puerto al decodificador: ${pipeError.message}`);
               if (portRef.current === tempPort) { 
                  await disconnectPort(tempPort, true); 
               }
          } else {
               addLog(`Error de 'pipe' (desconexión ya iniciada o stream cerrado): ${pipeError.message}`);
          }
        });
      
      setIsConnected(true);
      setIsConnecting(false);
      addLog(`Conectado a puerto: ${JSON.stringify(portDetails)}`);
      toast({ title: "Dispositivo Conectado", description: "Conexión serial establecida." });

      readLoop(stringReaderRef.current);

    } catch (error: any) {
      addLog(`Error al conectar: ${error.message}`);
      if (error.name === 'NotFoundError') {
        addLog("Selección de puerto cancelada por el usuario.");
      } else if (error.name === 'SecurityError') {
        addLog("Error de Seguridad: No se pudo acceder al puerto. Puede ser por política de permisos (Permissions Policy) o puerto no confiable. Asegúrate que el entorno (ej. iframe) permita 'serial'.");
        toast({ title: "Error de Permisos", description: "Acceso a Web Serial denegado. Revisa la consola y la política de permisos del entorno.", variant: "destructive" });
      } else if (error.message.includes("port is already open") || error.name === "InvalidStateError") {
        addLog("El puerto ya está abierto. Otra aplicación podría estar usándolo o el estado es inválido.");
        toast({ title: "Puerto Ocupado/Error", description: "El puerto ya está en uso o en un estado inválido. Cierra otras aplicaciones (ej. Arduino IDE Serial Monitor) e inténtalo de nuevo.", variant: "destructive" });
      } else {
        toast({ title: "Error de Conexión", description: error.message, variant: "destructive" });
      }
      
      if (portRef.current) {
        await disconnectPort(portRef.current, false); 
      }
      // Asegurar que los estados se reseteen si la conexión falla
      portRef.current = null;
      setPortInfo(null);
      setIsConnected(false);
      setIsConnecting(false); 
    }
  }, [addLog, toast, readLoop, isConnecting, disconnectPort, processReceivedData]); // processReceivedData es dependencia de readLoop indirectamente

  useEffect(() => {
    const portInstanceAtEffectTime = portRef.current; // Capturar la instancia actual del puerto
    return () => {
      if (portInstanceAtEffectTime) { 
        addLog("Cleanup de useEffect (desmontaje)... Desconectando puerto si está activo.");
        keepReadingRef.current = false; 
        disconnectPort(portInstanceAtEffectTime, false).catch(e => addLog(`Error en desconexión durante desmontaje: ${e.message}`)); 
      }
    };
  }, [addLog, disconnectPort]); // Solo depende de addLog y disconnectPort


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
            <Button onClick={() => { if (portRef.current) disconnectPort(portRef.current, true);}} variant="destructive" disabled={!portRef.current && !isConnecting}>
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

