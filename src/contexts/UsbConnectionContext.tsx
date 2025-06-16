
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Device, DeviceSettings } from '@/lib/types'; // Asegúrate que Device y DeviceSettings estén aquí
import { useAuth } from './AuthContext';

interface SerialPort {
  getInfo: () => { usbVendorId?: number; usbProductId?: number };
  open: (options: { baudRate: number }) => Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close: () => Promise<void>;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
}

interface SerialWriter {
  write: (data: Uint8Array) => Promise<void>;
  releaseLock: () => void;
  close: () => Promise<void>;
}

interface UsbConnectionContextType {
  port: SerialPort | null;
  writer: SerialWriter | null;
  isConnecting: boolean;
  isConnected: boolean;
  portInfo: string | null;
  logMessages: string[];
  connectedDeviceHardwareId: string | null;
  connectPort: () => Promise<void>;
  disconnectPort: (showToast?: boolean) => void;
  sendSerialCommand: (command: Record<string, any>) => Promise<void>;
  resyncConfiguration: (hardwareId: string) => Promise<void>;
  addLog: (message: string) => void;
}

const UsbConnectionContext = createContext<UsbConnectionContextType | undefined>(undefined);

export function UsbConnectionProvider({ children }: { children: ReactNode }) {
  const [port, setPort] = useState<SerialPort | null>(null);
  const [writer, setWriter] = useState<SerialWriter | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [portInfo, setPortInfo] = useState<string | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [connectedDeviceHardwareId, setConnectedDeviceHardwareId] = useState<string | null>(null);

  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();

  const keepReading = useRef(true);
  const disconnectInitiatedRef = useRef(false);
  const textDecoder = useRef(new TextDecoderStream());
  const readableStreamClosedRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const lineBufferRef = useRef('');

  const addLog = useCallback((message: string) => {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    const finalMessage = `${timeString}: ${message}`;
    setLogMessages(prev => [finalMessage, ...prev.slice(0, 199)]);
    // console.log(`[USB LOG CLIENT] ${finalMessage}`);
  }, []);

  const _internalDisconnectPort = useCallback(async (showToastUserInitiated = true) => {
    if (disconnectInitiatedRef.current && !isConnected && !isConnecting && !port) {
      // addLog("DISC WARN: Desconexión ya en progreso o completada, o nada que desconectar.");
      // return; // Puede ser muy agresivo, mejor dejar que continúe y limpie lo que pueda
    }
    addLog("DISC: Iniciando proceso de desconexión...");
    disconnectInitiatedRef.current = true;
    keepReading.current = false;
    lineBufferRef.current = ''; // Limpiar buffer explícitamente

    if (readableStreamClosedRef.current) {
      try {
        await readableStreamClosedRef.current.cancel();
        addLog("DISC: Lector del TextDecoderStream cancelado.");
      } catch (error: any) {
        addLog(`DISC WARN: Error durante cancelación del lector: ${error.message}`);
      }
      readableStreamClosedRef.current = null;
    }
    
    const currentWriter = writer; // Usar la copia del estado en el momento de la llamada
    if (currentWriter) {
      try {
        // No es necesario llamar a releaseLock() explícitamente si se llama a close().
        await currentWriter.close();
        addLog("DISC: Escritor cerrado.");
      } catch (error: any) {
        addLog(`DISC WARN: Error cerrando escritor: ${error.message}`);
      }
      setWriter(null); // Actualizar estado de React
    }

    const currentPort = port; // Usar la copia del estado
    if (currentPort) {
      try {
        await currentPort.close();
        addLog("DISC: Puerto cerrado exitosamente.");
        if (showToastUserInitiated) {
          toast({ title: "Desconectado", description: "Puerto serial desconectado." });
        }
      } catch (error: any) {
        addLog(`DISC ERR: Error al cerrar puerto: ${error.message}`);
        console.error("DISC ERR: Error closing port:", error);
        if (showToastUserInitiated) {
           toast({ title: "Error al Desconectar", description: error.message, variant: "destructive" });
        }
      }
      setPort(null); // Actualizar estado de React
    }

    setIsConnected(false);
    setIsConnecting(false); 
    setPortInfo(null);
    setConnectedDeviceHardwareId(null); // Asegurar que el ID de hardware se limpie
    // No resetear disconnectInitiatedRef.current aquí, se hará al inicio de connectPort
    addLog("DISC: Estado de conexión reseteado post-desconexión.");
  }, [addLog, toast, port, writer, isConnected, isConnecting]); // Asegurar todas las dependencias correctas

  const internalDisconnectPortRef = useRef(_internalDisconnectPort);
  useEffect(() => {
    internalDisconnectPortRef.current = _internalDisconnectPort;
  }, [_internalDisconnectPort]);

  const disconnectPort = useCallback((showToastUserInitiated = true) => {
    internalDisconnectPortRef.current(showToastUserInitiated);
  }, []);

  const sendSerialCommand = useCallback(async (command: Record<string, any>) => {
    const currentWriter = writer; 
    addLog(`CMD_INTERNAL: Attempting to send. isConnected: ${isConnected}, writer available: ${!!currentWriter}`);
    if (currentWriter && isConnected) {
      try {
        const commandString = JSON.stringify(command) + '\n';
        const encoder = new TextEncoder();
        await currentWriter.write(encoder.encode(commandString));
        addLog(`CMD: Comando enviado: ${JSON.stringify(command)}`);
      } catch (error: any) {
        addLog(`CMD ERR: Error enviando comando: ${error.message}`);
        console.error("Error sending serial command:", error);
      }
    } else {
      addLog(`CMD WARN: No se pudo enviar comando: Puerto no conectado o escritor no disponible.`);
    }
  }, [writer, isConnected, addLog]);

  const fetchAndSyncDeviceConfiguration = useCallback(async (hardwareId: string) => {
    if (!user) {
        addLog("SYNC ERR: No se puede sincronizar configuración: usuario no autenticado.");
        return;
    }
    addLog(`SYNC: Dispositivo Arduino (${hardwareId}). Obteniendo configuración completa...`);
    try {
      const deviceRes = await fetch(`/api/devices?userId=${user.id}&hardwareIdentifier=${hardwareId}`, { cache: 'no-store' });
      if (!deviceRes.ok) {
        const errorData = await deviceRes.json().catch(() => ({ message: `Error ${deviceRes.status} buscando dispositivo.`}));
        throw new Error(`Dispositivo no encontrado en DB (ID: ${hardwareId}): ${errorData.message}`);
      }
      const device: Device = await deviceRes.json(); 
      addLog(`SYNC: Dispositivo encontrado en DB: ${device.name} (SN: ${device.serialNumber})`);

      const settingsRes = await fetch(`/api/device-settings/${device.serialNumber}?userId=${user.id}`, { cache: 'no-store' });
      if (!settingsRes.ok) {
        const errorData = await settingsRes.json().catch(() => ({ message: `Error ${settingsRes.status} obteniendo config.`}));
        throw new Error(`Configuración no encontrada para ${device.name}: ${errorData.message}`);
      }
      const settings: DeviceSettings = await settingsRes.json();

      addLog(`SYNC: Config Intervalo Medición = ${settings.measurementInterval} min.`);
      await sendSerialCommand({ command: "set_interval", value_ms: settings.measurementInterval * 60 * 1000 });
      
      addLog(`SYNC: Config Intervalo Foto = ${settings.photoCaptureInterval} hrs.`);
      await sendSerialCommand({ command: "set_photo_interval", value_hours: settings.photoCaptureInterval });

      addLog(`SYNC: Config Unidad Temp = ${settings.temperatureUnit}.`);
      await sendSerialCommand({ command: "set_temp_unit", unit: settings.temperatureUnit });
      
      addLog(`SYNC: Config Auto Riego = ${settings.autoIrrigation}, Umbral = ${settings.irrigationThreshold}%.`);
      await sendSerialCommand({ command: "set_auto_irrigation", enabled: settings.autoIrrigation, threshold: settings.irrigationThreshold });
      
      addLog(`SYNC: Config Auto Vent. = ${settings.autoVentilation}, Temp On = ${settings.temperatureThreshold}, Temp Off = ${settings.temperatureFanOffThreshold}.`);
      await sendSerialCommand({ command: "set_auto_ventilation", enabled: settings.autoVentilation, temp_on: settings.temperatureThreshold, temp_off: settings.temperatureFanOffThreshold });

    } catch (error: any) {
      addLog(`SYNC ERR: Error al obtener/aplicar config completa: ${error.message}`);
      console.error("SYNC ERR: Error fetching/applying device config:", error);
    }
  }, [sendSerialCommand, addLog, user]);
  
  const processReceivedData = useCallback(async (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      
      if (data.hardwareId && !connectedDeviceHardwareId) { // Solo setear si no hay uno ya o es diferente
        addLog(`PARSE: Datos JSON para nuevo ${data.hardwareId}: ${jsonString}`);
        setConnectedDeviceHardwareId(data.hardwareId); 
      } else if (data.hardwareId && data.hardwareId === connectedDeviceHardwareId) {
         // addLog(`PARSE: Datos JSON para ${connectedDeviceHardwareId}: ${jsonString}`); 
      } else if (data.hardwareId && data.hardwareId !== connectedDeviceHardwareId && connectedDeviceHardwareId) {
        addLog(`PARSE WARN: ID de hardware recibido (${data.hardwareId}) no coincide con el conectado (${connectedDeviceHardwareId}). Datos ignorados.`);
        return; 
      } else if (!data.hardwareId && jsonString.includes("type")) { // Mensaje de ACK sin hardwareId (algunos Arduinos podrían no incluirlo en ACKs)
         addLog(`PARSE: Datos JSON parseados (sin ID de hardware explícito en mensaje, usando el conectado ${connectedDeviceHardwareId}): ${jsonString}`);
      } else {
         addLog(`PARSE: Datos JSON parseados (estructura desconocida o hardwareId faltante): ${jsonString}`);
      }

      if (data.type === "hello_arduino" && data.hardwareId) {
        addLog(`MSG: 'hello_arduino' recibido de ${data.hardwareId}`);
        // SYNC_EFFECT se encargará de llamar a fetchAndSyncDeviceConfiguration
      } else if (data.type === "ack_interval_set") {
        addLog(`MSG: ACK de intervalo recibido de ${data.hardwareId || connectedDeviceHardwareId}. Nuevo intervalo: ${data.new_interval_ms} ms`);
      } else if (data.type === "ack_photo_interval_set") {
        addLog(`MSG: ACK de intervalo de foto recibido de ${data.hardwareId || connectedDeviceHardwareId}. Nuevo intervalo: ${data.new_interval_hours} horas`);
      } else if (data.type === "ack_temp_unit_set") {
        addLog(`MSG: ACK de unidad de temperatura recibido de ${data.hardwareId || connectedDeviceHardwareId}. Nueva unidad: ${data.new_unit}`);
      } else if (data.type === "ack_auto_irrigation_set") {
        addLog(`MSG: ACK de auto riego recibido de ${data.hardwareId || connectedDeviceHardwareId}. Habilitado: ${data.enabled}, Umbral: ${data.threshold}%`);
      } else if (data.type === "ack_auto_ventilation_set") {
        addLog(`MSG: ACK de auto ventilación recibido de ${data.hardwareId || connectedDeviceHardwareId}. Habilitado: ${data.enabled}, Temp On: ${data.temp_on}, Temp Off: ${data.temp_off}`);
      } else if (data.hardwareId && (data.temperature !== undefined || data.airHumidity !== undefined)) { // Es un mensaje de datos de sensores
        addLog(`MSG: Datos de sensores recibidos de ${data.hardwareId}: ${jsonString}`);
        try {
            addLog(`API: Enviando a /api/ingest-sensor-data: ${JSON.stringify(data)}`);
            const response = await fetch('/api/ingest-sensor-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || `Error ${response.status}`);
            addLog(`API: Datos de ${data.hardwareId} enviados al servidor: ${result.message}`);
        } catch (apiError: any) {
            addLog(`API ERR: Error enviando datos de ${data.hardwareId}: ${apiError.message}`);
            console.error("API Ingest Error:", apiError);
        }
      } else {
        // addLog(`MSG WARN: Tipo de mensaje desconocido o hardwareId faltante en un mensaje no de sensor: ${jsonString}`);
      }
    } catch (error) {
      addLog(`PARSE ERR: Error parseando JSON o procesando datos: '${jsonString}'. Error: ${(error as Error).message}`);
    }
  }, [addLog, connectedDeviceHardwareId, setConnectedDeviceHardwareId]);

  const readLoop = useCallback(async (currentPortInstance: SerialPort) => {
    // Reiniciar el decodificador y el buffer de línea para CADA nueva sesión de lectura
    textDecoder.current = new TextDecoderStream(); 
    lineBufferRef.current = ''; 
    addLog("RL: Iniciando bucle de lectura de strings...");

    const readableStream = currentPortInstance.readable.pipeThrough(textDecoder.current);
    readableStreamClosedRef.current = readableStream.getReader();
    addLog("RL: Lector obtenido del TextDecoderStream.");

    try {
      while (keepReading.current) {
        const { value, done } = await readableStreamClosedRef.current.read();
        if (done) {
          if (!disconnectInitiatedRef.current) addLog("RL: Bucle finalizado (stream cerrado por 'done').");
          break;
        }
        if (value) {
          // addLog(\`RL: Datos RAW recibidos: "\${value.replace(/\n/g, '\\\\n')}"\`); 
          lineBufferRef.current += value;
          // addLog(\`RL: Buffer actual: "\${lineBufferRef.current.replace(/\n/g, '\\\\n')}"\`);
          
          let newlineIndex;
          while ((newlineIndex = lineBufferRef.current.indexOf('\n')) >= 0) {
            const line = lineBufferRef.current.substring(0, newlineIndex).trim();
            lineBufferRef.current = lineBufferRef.current.substring(newlineIndex + 1);
            // addLog(\`RL: Línea extraída para procesar: "\${line}"\`);
            // addLog(\`RL: Buffer restante post-extracción: "\${lineBufferRef.current.replace(/\n/g, '\\\\n')}"\`);
            if (line) {
              await processReceivedData(line);
            } else {
              // addLog("RL: Línea extraída vacía, ignorando.");
            }
          }
        }
      }
    } catch (error: any) {
      if (!disconnectInitiatedRef.current) {
        addLog(`RL ERR: Error en el bucle de lectura: ${error.message}`);
        console.error("RL ERR: Read loop error:", error);
      }
    } finally {
      addLog("RL: Ejecutando bloque finally del bucle de lectura.");
      if (readableStreamClosedRef.current) {
        try {
            // No es necesario cancelar explícitamente aquí si el bucle terminó por 'done'
            // o si la desconexión ya lo manejó. Solo liberar el bloqueo.
            readableStreamClosedRef.current.releaseLock();
        } catch (releaseError: any) {
             addLog(`RL WARN: Error en finally al liberar lector: ${releaseError.message}`);
        }
        readableStreamClosedRef.current = null;
        addLog("RL: lector del TextDecoderStream liberado y reseteado en finally.");
      }
      addLog("RL: Bucle de lectura detenido completamente (finally ejecutado).");
    }
  }, [addLog, processReceivedData]);

  const connectPort = useCallback(async () => {
    // Limpieza rigurosa al inicio absoluto del intento de conexión
    disconnectInitiatedRef.current = false;
    keepReading.current = true; // Permitir que el nuevo bucle de lectura se ejecute
    lineBufferRef.current = ''; // Limpiar buffer
    // Si hay un puerto antiguo, intentar cerrarlo antes de abrir uno nuevo.
    if (port) {
        addLog("CONN: Puerto anterior existente detectado. Intentando desconexión silenciosa primero.");
        await internalDisconnectPortRef.current(false); // Desconexión silenciosa
    }
    
    if (typeof window === 'undefined' || !("serial" in navigator)) {
      addLog("CONN ERR: API Web Serial no soportada o no es entorno de cliente.");
      toast({ title: "Error de Navegador", description: "Tu navegador no soporta la API Web Serial.", variant: "destructive" });
      return;
    }
    if (isConnecting) { // Evitar múltiples intentos de conexión simultáneos
      addLog("CONN WARN: Conexión ya en progreso.");
      return;
    }

    setIsConnecting(true);
    addLog("CONN: Solicitando selección de puerto serial...");

    try {
      const selectedPort = await (navigator.serial as any).requestPort();
      await selectedPort.open({ baudRate: 9600 });

      setPort(selectedPort); // Estado React para el puerto
      const portInformation = selectedPort.getInfo();
      const vid = portInformation.usbVendorId ? `0x${portInformation.usbVendorId.toString(16).padStart(4, '0')}` : 'N/A';
      const pid = portInformation.usbProductId ? `0x${portInformation.usbProductId.toString(16).padStart(4, '0')}` : 'N/A';
      const portLabel = `VID:${vid} PID:${pid}`;
      setPortInfo(portLabel);
      addLog(`CONN: Puerto ${portLabel} abierto.`);
      
      const currentWriter = selectedPort.writable.getWriter();
      setWriter(currentWriter); // Estado React para el escritor
      setIsConnected(true);   
      addLog(`CONN: Conectado a puerto: ${portLabel}. Writer y estado de conexión establecidos.`);
      
      readLoop(selectedPort); // Iniciar el bucle de lectura con el nuevo puerto

      selectedPort.addEventListener('disconnect', () => {
        addLog(`EVT: Puerto ${portLabel} desconectado externamente.`);
        toast({ title: "Dispositivo Desconectado", description: `El dispositivo ${portLabel} se ha desconectado.`, variant: "destructive"});
        internalDisconnectPortRef.current(false); // Usar la referencia para la desconexión interna
      });

    } catch (error: any) {
      if (error.name === 'NotFoundError' || error.name === 'AbortError') {
        addLog("CONN: Selección de puerto cancelada por usuario.");
      } else {
        addLog(`CONN ERR: Error al abrir puerto: ${error.message}`);
        console.error("CONN ERR: Error opening port:", error);
        toast({ title: "Error de Conexión", description: `No se pudo conectar: ${error.message}`, variant: "destructive" });
      }
      // Asegurar limpieza completa en caso de error durante la conexión
      await internalDisconnectPortRef.current(false); 
      
    } finally {
      setIsConnecting(false); // La conexión ha terminado (exitosa o no)
    }
  }, [addLog, toast, readLoop, port, isConnecting, _internalDisconnectPort]); // Añadido _internalDisconnectPort

  useEffect(() => {
    addLog(`SYNC_EFFECT: Triggered. hwId: ${connectedDeviceHardwareId}, writer: ${!!writer}, connected: ${isConnected}, user: ${!!user}`);
    if (connectedDeviceHardwareId && writer && isConnected && user) {
      addLog(`SYNC_EFFECT: Condiciones cumplidas para ${connectedDeviceHardwareId}. Llamando a fetchAndSyncDeviceConfiguration.`);
      fetchAndSyncDeviceConfiguration(connectedDeviceHardwareId);
    } else {
      let reason = "";
      if (!connectedDeviceHardwareId) reason += "no hardwareId; ";
      if (!writer) reason += "no writer; ";
      if (!isConnected) reason += "not connected; ";
      if (!user) reason += "no user; ";
      if (reason) addLog(`SYNC_EFFECT: Condiciones NO cumplidas. Razón: ${reason}`);
    }
  }, [connectedDeviceHardwareId, writer, isConnected, user, fetchAndSyncDeviceConfiguration, addLog]);


  const resyncConfiguration = useCallback(async (hardwareId: string) => {
    addLog(`RESYNC: Solicitado para ${hardwareId}. writer: ${!!writer}, connected: ${isConnected}, user: ${!!user}`);
    if (isConnected && writer && hardwareId && user) {
      await fetchAndSyncDeviceConfiguration(hardwareId);
    } else {
      let reason = "";
      if(!isConnected) reason += "no conectado; ";
      if(!writer) reason += "sin escritor; ";
      if(!hardwareId) reason += "sin hardwareId; ";
      if(!user) reason += "sin usuario; ";
      addLog(`RESYNC WARN: No se puede re-sincronizar. Razón: ${reason}`);
    }
  }, [isConnected, writer, user, fetchAndSyncDeviceConfiguration, addLog]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (port) { 
        addLog("UNLOAD: Descarga de página detectada, desconectando puerto...");
        internalDisconnectPortRef.current(false); // Usar la ref aquí
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      // La desconexión al desmontar el componente principal (RootLayout) es más compleja
      // y puede que no sea necesaria si beforeunload ya lo maneja.
      // Si es estrictamente necesario, podría considerarse, pero con cuidado.
    };
  }, [port, addLog]); // port y addLog son dependencias estables o referenciadas

  useEffect(() => {
    if (!isAuthenticated && port) { 
        addLog("AUTH: Usuario desautenticado, desconectando puerto...");
        disconnectPort(false); 
    }
  }, [isAuthenticated, port, disconnectPort, addLog]);

  return (
    <UsbConnectionContext.Provider
      value={{
        port,
        writer,
        isConnecting,
        isConnected,
        portInfo,
        logMessages,
        connectedDeviceHardwareId,
        connectPort,
        disconnectPort,
        sendSerialCommand,
        resyncConfiguration,
        addLog,
      }}
    >
      {children}
    </UsbConnectionContext.Provider>
  );
}

export function useUsbConnection() {
  const context = useContext(UsbConnectionContext);
  if (context === undefined) {
    throw new Error('useUsbConnection must be used within a UsbConnectionProvider');
  }
  return context;
}

    