
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
import { useAuth } from '@/contexts/AuthContext';
import type { Device, DeviceSettings } from '@/lib/types';

// Global types for Web Serial API
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

interface ArduinoMessageBase {
  type?: string;
  hardwareId?: string;
}

interface ArduinoSensorPayload extends ArduinoMessageBase {
  temperature?: number;
  airHumidity?: number;
  soilHumidity?: number;
  lightLevel?: number;
  waterLevel?: number;
  ph?: number;
}

interface ArduinoHelloMessage extends ArduinoMessageBase {
  type: "hello_arduino";
  hardwareId: string;
}

interface ArduinoAckIntervalMessage extends ArduinoMessageBase {
  type: "ack_interval_set";
  new_interval_ms?: number;
  hardwareId: string;
}


export function UsbDeviceConnector() {
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [portInfo, setPortInfo] = useState<string | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [connectedDeviceHardwareId, setConnectedDeviceHardwareId] = useState<string | null>(null);

  const portRef = useRef<SerialPort | null>(null);
  const stringReaderRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const textDecoderStreamRef = useRef<TextDecoderStream | null>(null);
  const pipePromiseRef = useRef<Promise<void> | null>(null);
  const keepReadingRef = useRef(true);

  const addLog = useCallback((message: string) => {
    console.log('[UsbDeviceConnector]', message);
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [...prev.slice(-200), `${timestamp}: ${message}`]);
  }, []);

  const sendCommandToArduino = useCallback(async (command: object) => {
    if (!portRef.current || !portRef.current.writable) {
      addLog("Error: Puerto no conectado o no escribible para enviar comando.");
      return;
    }
    const writer = portRef.current.writable.getWriter();
    try {
      const commandJson = JSON.stringify(command);
      addLog(`Enviando comando al Arduino: ${commandJson}`);
      await writer.write(new TextEncoder().encode(commandJson + '\n'));
    } catch (error: any) {
      addLog(`Error enviando comando al Arduino: ${error.message}`);
    } finally {
      if (writer) {
        writer.releaseLock();
      }
    }
  }, [addLog]);

  const fetchAndSetDeviceInterval = useCallback(async (hwId: string) => {
    if (!authUser) {
      addLog("Usuario no autenticado. No se puede obtener la configuración del dispositivo.");
      return;
    }
    addLog(`Dispositivo Arduino conectado con hardwareId: ${hwId}. Obteniendo configuración...`);
    setConnectedDeviceHardwareId(hwId);
    try {
      const deviceDetailsRes = await fetch(`/api/devices?hardwareIdentifier=${hwId}&userId=${authUser.id}`);
      if (!deviceDetailsRes.ok) {
        const errorText = await deviceDetailsRes.text();
        let errorMessage = `Error obteniendo detalles del dispositivo (${deviceDetailsRes.status}).`;
        try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorMessage;
        } catch(e){
            errorMessage = `${errorMessage} Respuesta no JSON: ${errorText.substring(0,100)}`;
        }
        throw new Error(errorMessage);
      }
      const device: Device = await deviceDetailsRes.json();
      addLog(`Dispositivo encontrado en DB: ${device.name} (SN: ${device.serialNumber})`);

      const settingsRes = await fetch(`/api/device-settings/${device.serialNumber}?userId=${authUser.id}`);
      if (!settingsRes.ok) {
        const errorText = await settingsRes.text();
        let errorMessage = `Error obteniendo configuración del dispositivo (${settingsRes.status}).`;
         try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorMessage;
        } catch(e){
            errorMessage = `${errorMessage} Respuesta no JSON: ${errorText.substring(0,100)}`;
        }
        throw new Error(errorMessage);
      }
      const settings: DeviceSettings = await settingsRes.json();
      addLog(`Configuración obtenida: Intervalo de Medición = ${settings.measurementInterval} minutos.`);

      const intervalMs = settings.measurementInterval * 60 * 1000;
      await sendCommandToArduino({ command: "set_interval", value_ms: intervalMs });

    } catch (error: any) {
      addLog(`Error al obtener/establecer el intervalo del dispositivo: ${error.message}`);
      toast({ title: "Error de Configuración del Dispositivo", description: error.message, variant: "destructive" });
    }
  }, [authUser, addLog, sendCommandToArduino, toast, setConnectedDeviceHardwareId]);


  const processReceivedData = useCallback(async (jsonData: ArduinoSensorPayload | ArduinoHelloMessage | ArduinoAckIntervalMessage, originalJsonStringForLog: string) => {
    addLog(`Datos JSON parseados para ${jsonData.hardwareId || 'ID_DESCONOCIDO'}: ${JSON.stringify(jsonData).substring(0, 200)}`);

    if (!jsonData.hardwareId) {
        addLog(`Dato JSON recibido sin 'hardwareId'. Descartando: ${originalJsonStringForLog.substring(0, 200)}`);
        return;
    }

    if (jsonData.type === "hello_arduino") {
        const helloMsg = jsonData as ArduinoHelloMessage;
        addLog(`Mensaje 'hello_arduino' recibido de ${helloMsg.hardwareId}`);
        await fetchAndSetDeviceInterval(helloMsg.hardwareId);
        return;
    }

    if (jsonData.type === "ack_interval_set") {
        const ackMsg = jsonData as ArduinoAckIntervalMessage;
        addLog(`ACK de intervalo recibido de ${ackMsg.hardwareId}. Nuevo intervalo: ${ackMsg.new_interval_ms || 'No especificado'} ms`);
        return;
    }

    if (jsonData.hardwareId && !jsonData.type) {
        addLog(`Datos de sensores recibidos de ${jsonData.hardwareId}: ${originalJsonStringForLog.substring(0,200)}`);
        const apiPayload: Partial<ArduinoSensorPayload> = { hardwareId: jsonData.hardwareId };
        let sensorDataFound = false;
        if (jsonData.temperature !== undefined) { apiPayload.temperature = jsonData.temperature; sensorDataFound = true; }
        if (jsonData.airHumidity !== undefined) { apiPayload.airHumidity = jsonData.airHumidity; sensorDataFound = true; }
        if (jsonData.soilHumidity !== undefined) { apiPayload.soilHumidity = jsonData.soilHumidity; sensorDataFound = true; }
        if (jsonData.lightLevel !== undefined) { apiPayload.lightLevel = jsonData.lightLevel; sensorDataFound = true; }
        if (jsonData.waterLevel !== undefined) { apiPayload.waterLevel = jsonData.waterLevel; sensorDataFound = true; }
        if (jsonData.ph !== undefined) { apiPayload.ph = jsonData.ph; sensorDataFound = true; }

        if (!sensorDataFound) {
            addLog(`JSON de ${jsonData.hardwareId} no contiene datos de sensores reconocibles. Descartando para API ingest.`);
            return;
        }

        addLog(`[ApiClient] Enviando a /api/ingest-sensor-data: ${JSON.stringify(apiPayload).substring(0,200)}`);
        try {
            const response = await fetch('/api/ingest-sensor-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(apiPayload),
            });
            const resultText = await response.text();
            let resultJson;
            try {
                resultJson = JSON.parse(resultText);
            } catch(e) {
                addLog(`Respuesta del servidor no es JSON válido (Status: ${response.status}). Texto: ${resultText.substring(0, 300)}`);
                if (!response.ok) {
                  throw new Error(`Error del servidor (Status: ${response.status}). Respuesta no es JSON.`);
                }
                return;
            }

            if (!response.ok) {
                let errorMsg = resultJson.message || `Error del servidor (Status: ${response.status})`;
                if (resultJson.error) {
                    errorMsg += `. Detalle del Servidor: ${resultJson.error}`;
                } else if (resultJson.errors && Array.isArray(resultJson.errors)){
                     errorMsg += `. Detalles: ${resultJson.errors.map((err: any) => typeof err === 'string' ? err : JSON.stringify(err)).join(', ')}`;
                }
                addLog(`Error del servidor (Status: ${response.status}). Respuesta completa: ${JSON.stringify(resultJson).substring(0,500)}`);
                throw new Error(errorMsg);
            }
            addLog(`Datos enviados al servidor para ${jsonData.hardwareId}: ${resultJson.message}`);
        } catch (error: any) {
            addLog(`Error procesando/enviando datos de sensores JSON: ${error.message}. JSON problemático: "${originalJsonStringForLog.substring(0,200)}"`);
        }
    } else if(jsonData.hardwareId && jsonData.type) {
        addLog(`Mensaje JSON de tipo desconocido '${jsonData.type}' recibido de ${jsonData.hardwareId}. Descartando: ${originalJsonStringForLog.substring(0, 200)}`);
    }
  }, [addLog, fetchAndSetDeviceInterval, toast]);


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
        addLog("stringReaderRef cancelado.");
      } catch (e: any) {
        addLog(`Error cancelando stringReaderRef (puede ser normal): ${e.message}`);
      }
      stringReaderRef.current = null;
    }

    if (textDecoderStreamRef.current?.writable && !textDecoderStreamRef.current.writable.locked) {
      try {
        await textDecoderStreamRef.current.writable.abort("Aborting TextDecoderStream writable on disconnect");
        addLog("TextDecoderStream.writable abortado.");
      } catch (e: any) {
        addLog(`Error abortando TextDecoderStream.writable (puede ser normal): ${e.message}`);
      }
    }

    if (portToClose.readable && portToClose.readable.locked) {
        try {
            const rawReaderForCancel = portToClose.readable.getReader();
            await rawReaderForCancel.cancel("Desconexión por el usuario - cancelando readable del puerto");
            rawReaderForCancel.releaseLock();
            addLog("SerialPort.readable cancelado y liberado.");
        } catch (e:any) {
            addLog(`Error al cancelar/liberar SerialPort.readable (puede ser esperado): ${e.message}.`);
        }
    }
    
    if (pipePromiseRef.current) {
        try {
            await pipePromiseRef.current;
            addLog("'pipePromiseRef' resuelto o falló como se esperaba durante la desconexión.");
        } catch (e: any) {
            addLog(`Error capturado del 'pipePromiseRef' durante desconexión (puede ser normal): ${e.message}`);
        }
        pipePromiseRef.current = null;
    }
    
    textDecoderStreamRef.current = null;

    try {
      await portToClose.close();
      addLog(`Puerto serial ${portIdentifier} cerrado exitosamente.`);
    } catch (error: any) {
      addLog(`Error al cerrar puerto serial ${portIdentifier}: ${error.message}`);
    }

    if (portRef.current === portToClose) {
        portRef.current = null;
    }
    
    setConnectedDeviceHardwareId(null);
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
        
        if (value && typeof value === 'string') {
            lineBuffer += value;
        }

        let newlineIndex;
        while ((newlineIndex = lineBuffer.indexOf('\n')) >= 0) {
          const rawLine = lineBuffer.substring(0, newlineIndex + 1); 
          lineBuffer = lineBuffer.substring(newlineIndex + 1); 

          const trimmedLineOriginal = rawLine.trim();
          const sanitizedLine = trimmedLineOriginal.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

          if (sanitizedLine.length > 0) {
            try {
              const jsonData = JSON.parse(sanitizedLine);
              addLog(`Línea completa recibida y parseada: ${sanitizedLine.substring(0,200)}`);
              await processReceivedData(jsonData, sanitizedLine);
            } catch (e: any) {
              addLog(`Línea recibida no parece ser JSON válido: ${e.message}. Línea: "${sanitizedLine.substring(0,200)}"`);
            }
          }
        }
      }
    } catch (error: any) {
      if (keepReadingRef.current) { 
        addLog(`Error en bucle de lectura de strings: ${error.message}. Stack: ${error.stack}`);
        if (portRef.current) {
          await disconnectPort(portRef.current, true);
        }
      } else { 
         addLog(`Bucle de lectura (desconexión iniciada) encontró error/cierre esperado: ${error.message}`);
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
        toast({ title: "Conexión Existente", description: "Ya hay una conexión activa o en proceso.", variant: "default" });
        return;
    }
     if (!authUser) {
        addLog("Usuario no autenticado.");
        toast({ title: "Autenticación Requerida", description: "Debes iniciar sesión para conectar un dispositivo.", variant: "destructive" });
        return;
    }

    setIsConnecting(true);
    addLog("Solicitando selección de puerto serial...");
    let requestedPort: SerialPort | null = null;

    try {
      requestedPort = await navigator.serial.requestPort();
      if (!requestedPort) {
          addLog("Selección de puerto cancelada.");
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
      
      textDecoderStreamRef.current = new TextDecoderStream('utf-8', { fatal: false, ignoreBOM: true });
      
      pipePromiseRef.current = requestedPort.readable.pipeTo(textDecoderStreamRef.current.writable)
        .then(() => { addLog("Pipe de ReadableStream a TextDecoderStream completado."); })
        .catch(async (pipeError: any) => {
          if (keepReadingRef.current && portRef.current) { 
               addLog(`Error en el 'pipe' del puerto al decodificador: ${pipeError.message}`);
               if (portRef.current) {
                 await disconnectPort(portRef.current, true);
               }
          } else {
               addLog(`Error de 'pipe' (desconexión iniciada): ${pipeError.message}`);
          }
        });

      if (!textDecoderStreamRef.current.readable) {
        throw new Error("TextDecoderStream no tiene stream 'readable'.");
      }
      
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
        addLog("Error de Seguridad: " + error.message);
        toast({ title: "Error de Permisos", description: "Acceso a Web Serial denegado.", variant: "destructive" });
      } else if (error.message.includes("port is already open") || error.name === "InvalidStateError") {
         addLog("El puerto ya está abierto o en estado inválido: " + error.message);
         toast({ title: "Puerto Ocupado/Error", description: "El puerto ya está en uso o en estado inválido.", variant: "destructive" });
      }
      else {
        toast({ title: "Error de Conexión", description: error.message, variant: "destructive" });
      }

      if (portRef.current) {
        await disconnectPort(portRef.current, false);
      } else if (requestedPort) {
        try { await requestedPort.close(); } catch(e) { /* ignore */ }
      }
      setPortInfo(null);
      setConnectedDeviceHardwareId(null);
      setIsConnected(false);
      setIsConnecting(false);
    }
  }, [authUser, addLog, toast, isConnecting, disconnectPort, readLoop, fetchAndSetDeviceInterval]);


  useEffect(() => {
    const portInstanceAtEffectTime = portRef.current; 
    return () => {
      if (portInstanceAtEffectTime) {
        addLog("Cleanup de useEffect (desmontaje)... Desconectando puerto.");
        disconnectPort(portInstanceAtEffectTime, false)
          .catch((e: any) => addLog(`Error en desconexión durante desmontaje: ${e.message}`));
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
          Conecta tu Arduino para enviar datos de sensores y recibir configuración.
          El Arduino debe enviar `{"type":"hello_arduino", "hardwareId":"SU_HW_ID"}` al conectar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-4">
          {!isConnected ? (
            <Button onClick={handleConnect} disabled={isConnecting || !authUser}>
              {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Conectar Dispositivo
            </Button>
          ) : (
            <Button onClick={() => { if (portRef.current) {disconnectPort(portRef.current, true);} }} variant="destructive" disabled={isConnecting && !isConnected}>
              <XCircle className="mr-2 h-4 w-4" />
              Desconectar Dispositivo
            </Button>
          )}
          <Badge variant={isConnected ? "default" : "secondary"} className={cn("transition-colors", isConnected && "bg-green-600 hover:bg-green-700 text-white")}>
            {isConnecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : isConnected ? <CheckCircle className="mr-1 h-4 w-4" /> : <XCircle className="mr-1 h-4 w-4" />}
            {isConnecting ? "Conectando..." : isConnected ? `Conectado a ${connectedDeviceHardwareId || portInfo || 'dispositivo'}` : "Desconectado"}
          </Badge>
        </div>
        {!authUser && <p className="text-sm text-destructive">Debes iniciar sesión para conectar un dispositivo.</p>}
        <p className="text-sm text-muted-foreground">
            El `hardwareId` enviado por tu dispositivo USB debe coincidir con el `Hardware Identifier` de un dispositivo registrado en GreenView.
            El intervalo de medición se configurará automáticamente al conectar.
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

    