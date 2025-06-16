
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
    setConnectedDeviceHardwareId(hwId); // Guardar el hwId del dispositivo conectado
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
        await fetchAndSetDeviceInterval(helloMsg.hardwareId); // Configurar intervalo cuando se recibe el "hola"
        return; // No enviar "hello" a la API de ingesta
    }

    if (jsonData.type === "ack_interval_set") {
        const ackMsg = jsonData as ArduinoAckIntervalMessage;
        addLog(`ACK de intervalo recibido de ${ackMsg.hardwareId}. Nuevo intervalo: ${ackMsg.new_interval_ms || 'No especificado'} ms`);
        return; // No enviar ACK a la API de ingesta
    }

    // Si llega aquí, se asume que es un payload de datos de sensores (no tiene 'type')
    if (jsonData.hardwareId && !jsonData.type) { 
        addLog(`Datos de sensores recibidos de ${jsonData.hardwareId}: ${originalJsonStringForLog.substring(0,200)}`);
        const apiPayload: Partial<ArduinoSensorPayload> = { hardwareId: jsonData.hardwareId };
        let sensorDataFound = false;
        // Validar y añadir cada sensor individualmente
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
                body: JSON.stringify(apiPayload), // Enviar solo el payload de sensores
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
                return; // Evitar error si el response no es JSON pero es OK (ej. 204 No Content)
            }

            if (!response.ok) {
                // Construir un mensaje de error más detallado
                let errorMsg = resultJson.message || `Error del servidor (Status: ${response.status})`;
                if (resultJson.error) {
                    errorMsg += `. Detalle del Servidor: ${resultJson.error}`;
                } else if (resultJson.errors && Array.isArray(resultJson.errors)){
                     errorMsg += `. Detalles: ${resultJson.errors.map((err: any) => typeof err === 'string' ? err : JSON.stringify(err)).join(', ')}`;
                } else if (typeof resultJson.errors === 'object' && resultJson.errors !== null) {
                    errorMsg += `. Detalles: ${JSON.stringify(resultJson.errors)}`;
                }
                addLog(`Error del servidor (Status: ${response.status}). Respuesta completa: ${JSON.stringify(resultJson).substring(0,500)}`);
                throw new Error(errorMsg);
            }
            addLog(`Datos enviados al servidor para ${jsonData.hardwareId}: ${resultJson.message}`);
        } catch (error: any) {
            addLog(`Error procesando/enviando datos de sensores JSON: ${error.message}. JSON problemático: "${originalJsonStringForLog.substring(0,200)}"`);
            toast({ title: "Error enviando datos", description: `Fallo al enviar datos de ${jsonData.hardwareId}: ${error.message}`, variant: "destructive"});
        }
    } else if(jsonData.hardwareId && jsonData.type) {
        // Captura otros tipos de mensajes JSON con 'type' que no son 'hello' ni 'ack'
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

    keepReadingRef.current = false; // Señal para detener el bucle de lectura

    if (stringReaderRef.current) {
      try {
        // No esperar indefinidamente, pero dar tiempo a que se libere.
        const cancelPromise = stringReaderRef.current.cancel("Desconexión por el usuario");
        await Promise.race([cancelPromise, new Promise(resolve => setTimeout(resolve, 500))]); // Timeout de 500ms
        addLog("stringReaderRef cancelado o timeout.");
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
    
    // Esperar a que el pipe termine si está activo
    if (pipePromiseRef.current) {
        try {
            await Promise.race([pipePromiseRef.current, new Promise(resolve => setTimeout(resolve, 500))]); // Timeout
            addLog("'pipePromiseRef' resuelto o falló/timeout como se esperaba durante la desconexión.");
        } catch (e: any) {
            addLog(`Error capturado del 'pipePromiseRef' durante desconexión (puede ser normal): ${e.message}`);
        }
        pipePromiseRef.current = null;
    }
    
    // Si el readable del puerto está bloqueado, intentar liberarlo.
    if (portToClose.readable && portToClose.readable.locked) {
        try {
            const rawReaderForCancel = portToClose.readable.getReader();
            const cancelPromise = rawReaderForCancel.cancel("Desconexión por el usuario - cancelando readable del puerto");
            await Promise.race([cancelPromise, new Promise(resolve => setTimeout(resolve, 500))]); // Timeout
            rawReaderForCancel.releaseLock(); // Intentar liberar incluso si cancel falla o hace timeout
            addLog("SerialPort.readable cancelado/timeout y liberado (o intento).");
        } catch (e:any) {
            addLog(`Error al cancelar/liberar SerialPort.readable (puede ser esperado): ${e.message}.`);
        }
    }
    
    textDecoderStreamRef.current = null; // Asegurar que se limpia

    try {
      await portToClose.close();
      addLog(`Puerto serial ${portIdentifier} cerrado exitosamente.`);
    } catch (error: any) {
      addLog(`Error al cerrar puerto serial ${portIdentifier}: ${error.message}`);
      // No mostrar toast de error aquí si la desconexión fue iniciada por el usuario
    }

    if (portRef.current === portToClose) { // Solo resetear si es el puerto activo
        portRef.current = null;
    }
    
    setConnectedDeviceHardwareId(null); // Limpiar el ID del dispositivo conectado
    setPortInfo(null);
    setIsConnected(false);
    setIsConnecting(false); // Asegurar que isConnecting también se resetea

    if (showToast) { // Solo mostrar toast si la desconexión no fue silenciosa
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
          if (keepReadingRef.current && portRef.current) { // Si no fue una desconexión intencional
            addLog("Cierre inesperado del stream, intentando desconectar puerto.");
            await disconnectPort(portRef.current, true); // Desconectar y mostrar toast
          }
          break; // Salir del bucle si 'done' es true
        }
        
        if (value && typeof value === 'string') { // Asegurarse que 'value' es un string
            lineBuffer += value;
        }

        let newlineIndex;
        // Procesar todas las líneas completas en el buffer
        while ((newlineIndex = lineBuffer.indexOf('\n')) >= 0) {
          const rawLine = lineBuffer.substring(0, newlineIndex + 1); // Incluir el \n para el log original
          lineBuffer = lineBuffer.substring(newlineIndex + 1); // Resto para el siguiente ciclo

          const trimmedLineOriginal = rawLine.trim(); // Quitar \n y \r
          // Sanitizar caracteres de control excepto tab, newline, carriage return
          const sanitizedLine = trimmedLineOriginal.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');


          if (sanitizedLine.length > 0) {
            // addLog(`DEBUG: Procesando línea del buffer (sanitizada): [${sanitizedLine.substring(0,200)}]`);
            try {
              const jsonData = JSON.parse(sanitizedLine);
              addLog(`Línea completa recibida y parseada (desde sanitizada): ${sanitizedLine.substring(0,200)}`);
              await processReceivedData(jsonData, sanitizedLine); // Pasar el string sanitizado para el log de error
            } catch (e: any) {
              addLog(`Línea recibida no parece ser JSON válido: ${e.message}. Línea: "${sanitizedLine.substring(0,200)}"`);
            }
          }
        }
        // addLog(`DEBUG: Resto del lineBuffer (primeros 200 chars): [${lineBuffer.substring(0,200)}]`);
      }
    } catch (error: any) {
      if (keepReadingRef.current) { // Si el error no fue causado por una desconexión intencional
        addLog(`Error en bucle de lectura de strings: ${error.message}. Stack: ${error.stack}`);
        if (portRef.current) {
          await disconnectPort(portRef.current, true); // Desconectar y mostrar toast
        }
      } else { // Desconexión intencional, el error puede ser normal (ej. "The read operation was cancelled.")
         addLog(`Bucle de lectura (desconexión iniciada) encontró error/cierre esperado: ${error.message}`);
      }
    } finally {
      addLog("Bucle de lectura de strings terminado.");
      // No cerrar el reader aquí, se maneja en disconnectPort
    }
  }, [addLog, processReceivedData, disconnectPort]);


  const handleConnect = useCallback(async () => {
    if (!navigator.serial) {
      addLog("Web Serial API no es soportada por este navegador.");
      toast({ title: "Error de Navegador", description: "La API Web Serial no es compatible. Prueba Chrome o Edge.", variant: "destructive" });
      return;
    }

    if (portRef.current || isConnecting) { // Prevenir múltiples conexiones
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
    let requestedPort: SerialPort | null = null; // Variable local para el puerto solicitado

    try {
      requestedPort = await navigator.serial.requestPort();
      if (!requestedPort) { // Usuario canceló la selección
          addLog("Selección de puerto cancelada.");
          setIsConnecting(false);
          return;
      }
      portRef.current = requestedPort; // Asignar a la ref SOLO después de una solicitud exitosa

      await requestedPort.open({ baudRate: 9600 }); // Usar siempre el puerto solicitado localmente
      const portDetails = requestedPort.getInfo();
      const portIdentifier = portDetails.usbVendorId && portDetails.usbProductId
        ? `VID:0x${portDetails.usbVendorId.toString(16).padStart(4, '0')} PID:0x${portDetails.usbProductId.toString(16).padStart(4, '0')}`
        : "Puerto Genérico";
      
      setPortInfo(portIdentifier);
      addLog(`Puerto ${portIdentifier} abierto.`);
      keepReadingRef.current = true; // Permitir que el bucle de lectura se ejecute

      // Configurar el stream de lectura
      if (!requestedPort.readable) {
        throw new Error("Puerto serial no tiene stream 'readable'.");
      }
      
      textDecoderStreamRef.current = new TextDecoderStream('utf-8', { fatal: false, ignoreBOM: true });
      
      // `pipeTo` devuelve una promesa que se resuelve cuando el stream destino se cierra o se aborta.
      pipePromiseRef.current = requestedPort.readable.pipeTo(textDecoderStreamRef.current.writable)
        .then(() => {
          addLog("Pipe de ReadableStream a TextDecoderStream completado (normalmente indica cierre).");
        })
        .catch(async (pipeError: any) => {
          // Este catch se activa si hay un error en el pipe, o si el readable se cancela.
          if (keepReadingRef.current && portRef.current) { // Si no es una desconexión intencional
               addLog(`Error en el 'pipe' del puerto al decodificador: ${pipeError.message}`);
               if (portRef.current) { // Comprobar de nuevo antes de desconectar
                 await disconnectPort(portRef.current, true); // Desconectar y mostrar toast
               }
          } else { // Desconexión intencional o el puerto ya no está en la ref
               addLog(`Error de 'pipe' (desconexión iniciada o puerto ya no es el mismo): ${pipeError.message}`);
          }
        });

      if (!textDecoderStreamRef.current.readable) {
        throw new Error("TextDecoderStream no tiene stream 'readable'.");
      }
      
      stringReaderRef.current = textDecoderStreamRef.current.readable.getReader();

      setIsConnected(true);
      setIsConnecting(false);
      addLog(`Conectado a puerto: ${portIdentifier}`);
      toast({ title: "Dispositivo Conectado", description: `Conexión serial establecida con ${portIdentifier}. Esperando 'hello' del Arduino.` });

      // El bucle de lectura comenzará a procesar datos.
      // `fetchAndSetDeviceInterval` será llamado desde `processReceivedData` cuando llegue el "hello_arduino".
      readLoop(stringReaderRef.current);

    } catch (error: any) {
      addLog(`Error al conectar: ${error.message}`);
      if (error.name === 'NotFoundError') {
        addLog("Selección de puerto cancelada por el usuario.");
        // No es necesario toast aquí, el usuario lo hizo intencionalmente.
      } else if (error.name === 'SecurityError') {
        addLog("Error de Seguridad: " + error.message);
        toast({ title: "Error de Permisos", description: "Acceso a Web Serial denegado. Asegúrate de estar en un contexto seguro (HTTPS) y que el navegador lo permita.", variant: "destructive" });
      } else if (error.message.includes("port is already open") || error.name === "InvalidStateError") {
         addLog("El puerto ya está abierto o en estado inválido: " + error.message);
         toast({ title: "Puerto Ocupado/Error", description: "El puerto ya está en uso o en estado inválido. Intenta desconectar primero si hay una conexión previa.", variant: "destructive" });
      }
      else {
        toast({ title: "Error de Conexión", description: error.message, variant: "destructive" });
      }

      // Limpieza en caso de error durante la conexión
      if (portRef.current) { // Si la ref se asignó
        await disconnectPort(portRef.current, false); // Desconectar silenciosamente
      } else if (requestedPort) { // Si la ref no se asignó pero se obtuvo el puerto
        try { await requestedPort.close(); } catch(e) { /* ignorar error si falla al cerrar un puerto que no se pudo abrir completamente */ }
      }
      portRef.current = null; // Asegurarse de que la ref está limpia
      setPortInfo(null);
      setConnectedDeviceHardwareId(null);
      setIsConnected(false);
      setIsConnecting(false);
    }
  }, [authUser, addLog, toast, isConnecting, disconnectPort, readLoop]);


  // Cleanup effect para desconectar el puerto al desmontar el componente
  useEffect(() => {
    const portInstanceAtEffectTime = portRef.current; // Capturar la instancia actual de la ref
    return () => {
      if (portInstanceAtEffectTime) { // Usar la instancia capturada
        addLog("Cleanup de useEffect (desmontaje)... Desconectando puerto.");
        // Llamar a disconnectPort con la instancia capturada
        disconnectPort(portInstanceAtEffectTime, false) // Desconectar silenciosamente
          .catch((e: any) => addLog(`Error en desconexión durante desmontaje: ${e.message}`));
      }
    };
  }, [addLog, disconnectPort]); // Las dependencias son estables

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
            <Button 
                onClick={() => { if (portRef.current) {disconnectPort(portRef.current, true);} }} 
                variant="destructive" 
                disabled={isConnecting && !isConnected} /* Evitar desconectar si se está conectando y aún no está isConnected */
            >
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
