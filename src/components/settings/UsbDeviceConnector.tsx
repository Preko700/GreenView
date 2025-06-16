
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
    try {
      const deviceDetailsRes = await fetch(`/api/devices?hardwareIdentifier=${hwId}&userId=${authUser.id}`);
      if (!deviceDetailsRes.ok) {
        const errorData = await deviceDetailsRes.json().catch(() => ({message: "Error desconocido obteniendo detalles del dispositivo."}));
        throw new Error(`Error obteniendo detalles del dispositivo (${deviceDetailsRes.status}): ${errorData.message || 'No se pudo encontrar el dispositivo por hardwareId.'}`);
      }
      const device: Device = await deviceDetailsRes.json();
      addLog(`Dispositivo encontrado en DB: ${device.name} (SN: ${device.serialNumber})`);

      const settingsRes = await fetch(`/api/device-settings/${device.serialNumber}?userId=${authUser.id}`);
      if (!settingsRes.ok) {
        const errorData = await settingsRes.json().catch(() => ({message: "Error desconocido obteniendo configuración del dispositivo."}));
        throw new Error(`Error obteniendo configuración del dispositivo (${settingsRes.status}): ${errorData.message}`);
      }
      const settings: DeviceSettings = await settingsRes.json();
      addLog(`Configuración obtenida: Intervalo de Medición = ${settings.measurementInterval} minutos.`);

      const intervalMs = settings.measurementInterval * 60 * 1000;
      await sendCommandToArduino({ command: "set_interval", value_ms: intervalMs });

    } catch (error: any) {
      addLog(`Error al obtener/establecer el intervalo del dispositivo: ${error.message}`);
      toast({ title: "Error de Configuración del Dispositivo", description: error.message, variant: "destructive" });
    }
  }, [authUser, addLog, sendCommandToArduino, toast]);


  const processReceivedData = useCallback(async (jsonData: ArduinoSensorPayload | ArduinoHelloMessage | ArduinoAckIntervalMessage, originalJsonStringForLog: string) => {
    if (!jsonData.hardwareId) {
        addLog(`Dato JSON recibido sin 'hardwareId'. Descartando: ${originalJsonStringForLog.substring(0, 200)}`);
        return;
    }

    // TYPE: hello_arduino
    if (jsonData.type === "hello_arduino") {
        const helloMsg = jsonData as ArduinoHelloMessage;
        addLog(`Mensaje 'hello_arduino' recibido de ${helloMsg.hardwareId}`);
        setConnectedDeviceHardwareId(helloMsg.hardwareId); // Guardar el HWID
        await fetchAndSetDeviceInterval(helloMsg.hardwareId); // Obtener y enviar config
        return; // No enviar "hello" a la API de ingesta
    }

    // TYPE: ack_interval_set
    if (jsonData.type === "ack_interval_set") {
        const ackMsg = jsonData as ArduinoAckIntervalMessage;
        addLog(`ACK de intervalo recibido de ${ackMsg.hardwareId}. Nuevo intervalo: ${ackMsg.new_interval_ms || 'No especificado'} ms`);
        return; // No enviar ACKs a la API de ingesta
    }

    // DEFAULT: SENSOR DATA (no type or unrecognized type, but has hardwareId)
    // Si llega aquí, no es 'hello' ni 'ack'. Asumimos que son datos de sensores si NO tiene 'type'.
    if (jsonData.hardwareId && !jsonData.type) {
        addLog(`Datos de sensores recibidos de ${jsonData.hardwareId}: ${originalJsonStringForLog.substring(0,200)}`);
        const apiPayload: Partial<ArduinoSensorPayload> = { hardwareId: jsonData.hardwareId };
        let sensorDataFound = false;
        // Copiar solo los campos de sensores presentes
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
                if (!response.ok) throw new Error(`Error del servidor (Status: ${response.status}). Respuesta no es JSON.`);
                return;
            }

            if (!response.ok) {
                let errorMsg = resultJson.message || `Error del servidor (Status: ${response.status})`;
                if (resultJson.error) {
                    errorMsg += `. Detalle del Servidor: ${resultJson.error}`;
                } else if (resultJson.errors && Array.isArray(resultJson.errors)){
                    errorMsg += `. Detalles: ${resultJson.errors.join(', ')}`;
                }
                addLog(`Error del servidor (Status: ${response.status}). Respuesta completa: ${JSON.stringify(resultJson).substring(0,500)}`);
                throw new Error(errorMsg);
            }
            addLog(`Datos enviados al servidor para ${jsonData.hardwareId}: ${resultJson.message}`);
        } catch (error: any) {
            addLog(`Error procesando/enviando datos de sensores JSON: ${error.message}. JSON problemático: "${originalJsonStringForLog.substring(0,200)}"`);
        }
    } else if(jsonData.hardwareId && jsonData.type) {
        // Mensaje con 'type' pero no es 'hello' ni 'ack_interval_set'
        addLog(`Mensaje JSON de tipo desconocido '${jsonData.type}' recibido de ${jsonData.hardwareId}. Descartando: ${originalJsonStringForLog.substring(0, 200)}`);
    }
  }, [addLog, fetchAndSetDeviceInterval, setConnectedDeviceHardwareId, toast]);

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
    setConnectedDeviceHardwareId(null);

    if (stringReaderRef.current) {
      try {
        await stringReaderRef.current.cancel("Desconexión por el usuario");
        addLog("Lector de TextDecoderStream cancelado.");
      } catch (e: any) {
        addLog(`Error cancelando lector de TextDecoderStream (puede ser normal): ${e.message}`);
      }
      stringReaderRef.current = null;
    }

    if (textDecoderStreamRef.current?.writable) {
        try {
            if (!textDecoderStreamRef.current.writable.locked){
                 await textDecoderStreamRef.current.writable.abort("Aborting TextDecoderStream writable on disconnect");
                 addLog("TextDecoderStream.writable abortado.");
            } else {
                addLog("TextDecoderStream.writable está bloqueado, el cierre del pipe debería manejarlo.");
            }
        } catch (e: any) {
            addLog(`Error manejando TextDecoderStream.writable (puede ser normal): ${e.message}`);
        }
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
        pipePromiseRef.current = null;
    }

    if (portToClose.readable && portToClose.readable.locked) {
        try {
            addLog("Intentando cancelar SerialPort.readable (puede fallar si el pipe lo controla)...");
            const rawReaderForCancel = portToClose.readable.getReader(); // Intenta obtener un lector para cancelar
            await rawReaderForCancel.cancel("Desconexión por el usuario - cancelando readable del puerto");
            rawReaderForCancel.releaseLock(); // Libera el lector después de cancelar
            addLog("SerialPort.readable cancelado y liberado.");
        } catch (e:any) {
             // Si está bloqueado por pipeTo, esto puede fallar, lo cual es esperado.
            addLog(`Error al cancelar/liberar SerialPort.readable (puede ser esperado): ${e.message}.`);
        }
    }


    try {
      await portToClose.close();
      addLog(`Puerto serial ${portIdentifier} cerrado exitosamente.`);
    } catch (error: any) {
      addLog(`Error al cerrar puerto serial ${portIdentifier} (puede ser que ya estuviera cerrado o en proceso): ${error.message}`);
    }

    // Asegúrate de que portRef.current se establece en null solo si es el mismo puerto que se está cerrando.
    if (portRef.current === portToClose) {
        portRef.current = null;
    }

    setPortInfo(null);
    setIsConnected(false);
    setIsConnecting(false); // Asegurarse de que isConnecting se resetea

    if (showToast) {
        toast({ title: "Dispositivo Desconectado", description: "Conexión serial terminada." });
    }
    addLog("Proceso de desconexión completado.");
  }, [addLog, toast, setPortInfo, setIsConnected, setIsConnecting, setConnectedDeviceHardwareId]); // Añadido setConnectedDeviceHardwareId


  const readLoop = useCallback(async (currentStringReader: ReadableStreamDefaultReader<string>) => {
    addLog("Iniciando bucle de lectura de strings...");
    let lineBuffer = ''; // Buffer para acumular datos hasta encontrar un newline

    try {
      while (keepReadingRef.current) {
        const { value, done } = await currentStringReader.read(); // value es un string aquí

        if (done) {
          addLog("Lector de strings cerrado (done=true).");
          if (keepReadingRef.current && portRef.current) { // Si no fue una desconexión intencional
            addLog("Cierre inesperado del stream, intentando desconectar puerto.");
            await disconnectPort(portRef.current, true); // Pasar el puerto actual
          }
          break; // Salir del bucle de lectura
        }
        
        // 'value' es un chunk de string. Puede contener múltiples líneas o parte de una.
        if (value && typeof value === 'string') {
            // addLog(`DEBUG: Chunk RAW (tipo: string): [${value.substring(0,50).replace(/\n/g, '\\n').replace(/\r/g, '\\r')}${value.length > 50 ? '...' : ''}] (longitud total del chunk: ${value.length})`);
            lineBuffer += value;
            // addLog(`DEBUG: lineBuffer después de añadir chunk (primeros 200 chars): [${lineBuffer.substring(0,200).replace(/\n/g, '\\n').replace(/\r/g, '\\r')}]`);
        }


        // Procesar todas las líneas completas en el buffer
        let newlineIndex;
        while ((newlineIndex = lineBuffer.indexOf('\n')) >= 0) {
          const rawLine = lineBuffer.substring(0, newlineIndex + 1); // Incluye el '\n'
          lineBuffer = lineBuffer.substring(newlineIndex + 1); // Resto para el siguiente ciclo

          // addLog(`DEBUG: Procesando línea del buffer (raw): [${rawLine.substring(0,200).replace(/\r/g, '\\r')}]`);
          const trimmedLineOriginal = rawLine.trim(); // Quita \n, \r, y espacios al inicio/final
          // addLog(`DEBUG: Procesando línea del buffer (trimmed original): [${trimmedLineOriginal.substring(0,200)}] (Longitud: ${trimmedLineOriginal.length})`);

          // Sanitización ligera para remover caracteres de control no imprimibles comunes excepto \t, \n, \r
          const sanitizedLine = trimmedLineOriginal.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
          // addLog(`DEBUG: Procesando línea del buffer (sanitizada): [${sanitizedLine.substring(0,200)}] (Longitud: ${sanitizedLine.length})`);


          if (sanitizedLine.length > 0) { // Solo procesar si hay algo después de trim y sanitizar
            try {
              // addLog(`DEBUG: Intentando JSON.parse en (sanitizada): [${sanitizedLine.substring(0,200)}]`);
              const jsonData = JSON.parse(sanitizedLine);
              addLog(`Línea completa recibida y parseada (desde sanitizada): ${sanitizedLine.substring(0,200)}`);
              await processReceivedData(jsonData, sanitizedLine); // Pasar la línea sanitizada original para logging si hay error de API
            } catch (e: any) {
              // Si falla el parseo JSON, podría ser una línea de debug del Arduino o datos corruptos.
              addLog(`Línea recibida no parece ser JSON válido (error de parseo en sanitizada): ${e.message}. Línea sanitizada: "${sanitizedLine.substring(0,200)}". Línea trimmed original: "${trimmedLineOriginal.substring(0,200)}"`);
            }
          }
        }
        // addLog(`DEBUG: Resto del lineBuffer (primeros 200 chars): [${lineBuffer.substring(0,200).replace(/\n/g, '\\n').replace(/\r/g, '\\r')}]`);
      }
    } catch (error: any) {
      // Este catch es para errores en currentStringReader.read() o errores no capturados dentro del bucle
      if (keepReadingRef.current) { // Si el error no fue por una desconexión iniciada
        addLog(`Error en bucle de lectura de strings: ${error.message}. Stack: ${error.stack}`);
        if (portRef.current) await disconnectPort(portRef.current, true); // Pasar el puerto actual
      } else {
         // Error esperado si la desconexión ya se inició (ej. cancel() fue llamado)
         addLog(`Bucle de lectura (desconexión ya iniciada) encontró error/cierre esperado: ${error.message}`);
      }
    } finally {
      addLog("Bucle de lectura de strings terminado.");
    }
  }, [addLog, processReceivedData, disconnectPort]); // Dependencias correctas


  const handleConnect = useCallback(async () => {
    if (!navigator.serial) {
      addLog("Web Serial API no es soportada por este navegador.");
      toast({ title: "Error de Navegador", description: "La API Web Serial no es compatible. Prueba Chrome o Edge.", variant: "destructive" });
      return;
    }

    if (portRef.current || isConnecting) { // Prevenir múltiples intentos de conexión
        addLog("Conexión activa o en proceso. No se puede iniciar una nueva.");
        toast({ title: "Conexión Existente", description: "Ya hay una conexión activa o en proceso.", variant: "default" });
        return;
    }

    setIsConnecting(true);
    addLog("Solicitando selección de puerto serial...");
    let requestedPort: SerialPort | null = null; // Variable local para el puerto solicitado en esta ejecución

    try {
      requestedPort = await navigator.serial.requestPort();
      if (!requestedPort) { // Usuario canceló la selección
          addLog("Selección de puerto cancelada por el usuario.");
          setIsConnecting(false);
          return;
      }
      portRef.current = requestedPort; // Asignar al ref SOLO después de obtener el puerto

      await requestedPort.open({ baudRate: 9600 });
      const portDetails = requestedPort.getInfo();
      const portIdentifier = portDetails.usbVendorId && portDetails.usbProductId
        ? `VID:0x${portDetails.usbVendorId.toString(16).padStart(4, '0')} PID:0x${portDetails.usbProductId.toString(16).padStart(4, '0')}`
        : "Puerto Genérico";
      setPortInfo(portIdentifier);
      addLog(`Puerto ${portIdentifier} abierto.`);

      keepReadingRef.current = true; // Indicar que el bucle de lectura debe continuar

      // Configurar el TextDecoderStream
      if (!requestedPort.readable) {
        throw new Error("Puerto serial no tiene stream 'readable'.");
      }
      // Ignorar errores de decodificación y reemplazar caracteres inválidos con U+FFFD
      textDecoderStreamRef.current = new TextDecoderStream('utf-8', { fatal: false, ignoreBOM: true }); 
      
      // Pipe de los datos crudos a través del decodificador
      // Manejar el error del pipe para evitar UnhandledPromiseRejection si el pipe falla
      pipePromiseRef.current = requestedPort.readable.pipeTo(textDecoderStreamRef.current.writable)
        .then(() => {
            addLog("Pipe de ReadableStream a TextDecoderStream completado (normalmente porque el readable se cerró).");
        })
        .catch(async (pipeError: any) => {
          // Solo actuar si no estamos ya desconectando
          if (keepReadingRef.current && portRef.current) { 
               addLog(`Error en el 'pipe' del puerto al decodificador: ${pipeError.message}`);
               if (portRef.current) await disconnectPort(portRef.current, true); // Usar el puerto del ref
          } else {
               // Si keepReading es false, es probable que la desconexión ya esté en curso
               addLog(`Error de 'pipe' (desconexión ya iniciada o stream cerrado): ${pipeError.message}`);
          }
        });

      // Obtener el lector del stream decodificado (TextDecoderStream.readable)
      if (!textDecoderStreamRef.current.readable) {
         throw new Error("TextDecoderStream no tiene stream 'readable'.");
      }
      stringReaderRef.current = textDecoderStreamRef.current.readable.getReader();

      setIsConnected(true);
      setIsConnecting(false);
      addLog(`Conectado a puerto: ${portIdentifier}`);
      toast({ title: "Dispositivo Conectado", description: `Conexión serial establecida con ${portIdentifier}.` });

      // Iniciar el bucle de lectura con el lector de strings
      readLoop(stringReaderRef.current); // Pasar el lector correcto

    } catch (error: any) {
      addLog(`Error al conectar: ${error.message}`);
      if (error.name === 'NotFoundError') {
        addLog("Selección de puerto cancelada por el usuario.");
        // No mostrar toast aquí, es una acción normal del usuario
      } else if (error.name === 'SecurityError') {
        addLog("Error de Seguridad: No se pudo acceder al puerto. Error: " + error.message);
        toast({ title: "Error de Permisos", description: "Acceso a Web Serial denegado. Revisa consola y política de permisos (HTTPS/localhost).", variant: "destructive" });
      } else if (error.message.includes("port is already open") || error.name === "InvalidStateError") {
         addLog("El puerto ya está abierto o en estado inválido. Cierra otras apps (ej. Arduino IDE Serial Monitor).");
         toast({ title: "Puerto Ocupado/Error", description: "El puerto ya está en uso o en un estado inválido. Cierra otras aplicaciones (ej. Arduino IDE Serial Monitor) e inténtalo de nuevo.", variant: "destructive" });
      }
      else {
        toast({ title: "Error de Conexión", description: error.message, variant: "destructive" });
      }

      // Limpieza en caso de error durante la conexión
      if (portRef.current) { // Si el puerto llegó a asignarse al ref
        await disconnectPort(portRef.current, false); // Usar el puerto del ref para desconectar
      } else if (requestedPort) { // Si se obtuvo un puerto pero no se asignó al ref (error antes)
        try { await requestedPort.close(); } catch(e) { /* ignorar */ }
      }
      setPortInfo(null);
      setConnectedDeviceHardwareId(null);
      setIsConnected(false);
      setIsConnecting(false);
    }
  }, [addLog, toast, isConnecting, disconnectPort, readLoop, setPortInfo, setIsConnecting, setIsConnected, setConnectedDeviceHardwareId]); // Dependencias

  // Efecto de limpieza para desconectar al desmontar el componente
  useEffect(() => {
    const portInstanceAtEffectTime = portRef.current; // Capturar el valor actual del ref
    return () => {
      // Esta función de limpieza se ejecuta cuando el componente se desmonta,
      // o antes de que el efecto se ejecute de nuevo si las dependencias cambian.
      if (portInstanceAtEffectTime) { // Usar el valor capturado
        addLog("Cleanup de useEffect (desmontaje)... Desconectando puerto si está activo.");
        disconnectPort(portInstanceAtEffectTime, false).catch(e => addLog(`Error en desconexión durante desmontaje (useEffect cleanup): ${e.message}`));
      }
    };
  }, [disconnectPort, addLog]); // Dependencias: disconnectPort y addLog son useCallbacks


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
            <Button onClick={() => { if (portRef.current) disconnectPort(portRef.current, true);}} variant="destructive" disabled={isConnecting && !isConnected}>
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
