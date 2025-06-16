
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Device, DeviceSettings } from '@/lib/types'; // Assuming Device is needed for API response types
// Removed SensorType import as it's not directly used here for new logic, but processReceivedData might need it if specific sensor types are checked
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
  releaseLock: () => void; // Typically called by the stream consumer (reader)
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
    if (disconnectInitiatedRef.current && !isConnected && !isConnecting) {
      // addLog("DISC WARN: Disconnect already in progress or completed.");
      // return; // Early exit if already disconnecting/disconnected
    }
    addLog("DISC: Iniciando proceso de desconexión...");
    disconnectInitiatedRef.current = true;
    keepReading.current = false; // Signal to stop read loop

    if (readableStreamClosedRef.current) {
      try {
        await readableStreamClosedRef.current.cancel();
        // readableStreamClosedRef.current.releaseLock(); // cancel() should release the lock
      } catch (error: any) {
        // addLog(`DISC WARN: Error durante cancelación del lector: ${error.message}`);
      }
      readableStreamClosedRef.current = null;
    }
    
    const currentWriter = writer; // Capture current writer state
    if (currentWriter) {
      try {
        // Calling writer.close() is the correct way to signal no more data and release its lock.
        await currentWriter.close();
        addLog("DISC: Escritor cerrado.");
      } catch (error: any) {
        // addLog(`DISC WARN: Error cerrando escritor: ${error.message}`);
      }
      setWriter(null); // Clear writer state
    }

    const currentPort = port; // Capture current port state
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
      setPort(null); // Clear port state
    }

    setIsConnected(false);
    setIsConnecting(false); // Ensure connecting state is reset
    setPortInfo(null);
    setConnectedDeviceHardwareId(null);
    lineBufferRef.current = ''; // Explicitly clear line buffer on disconnect
    addLog("DISC: Estado de conexión reseteado post-desconexión.");
    // Reset disconnectInitiatedRef only after the entire disconnect process is truly finished
    // or when a new connection attempt starts.
    // For safety, reset it here if we are sure everything is cleaned up.
    disconnectInitiatedRef.current = false;

  }, [addLog, toast, port, writer, isConnected, isConnecting]); // Added isConnected, isConnecting to dependencies


  const internalDisconnectPortRef = useRef(_internalDisconnectPort);
  useEffect(() => {
    internalDisconnectPortRef.current = _internalDisconnectPort;
  }, [_internalDisconnectPort]);

  const disconnectPort = useCallback((showToastUserInitiated = true) => {
    internalDisconnectPortRef.current(showToastUserInitiated);
  }, []);


  const sendSerialCommand = useCallback(async (command: Record<string, any>) => {
    const currentWriter = writer; // Use the state variable directly
    addLog(`CMD_INTERNAL: Attempting to send. isConnected: ${isConnected}, writer available: ${!!currentWriter}`);
    if (currentWriter && isConnected) {
      try {
        const commandString = JSON.stringify(command) + '\n'; // Ensure newline termination
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
      const device: Device = await deviceRes.json(); // Asegúrate que Device esté bien definida en types.ts
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
      
      if (data.hardwareId && data.hardwareId !== connectedDeviceHardwareId) {
        addLog(`PARSE: Datos JSON para nuevo ${data.hardwareId}: ${jsonString}`);
        setConnectedDeviceHardwareId(data.hardwareId); // This will trigger the useEffect for sync
      } else if (data.hardwareId && data.hardwareId === connectedDeviceHardwareId) {
         addLog(`PARSE: Datos JSON para ${connectedDeviceHardwareId}: ${jsonString}`);
      } else if (data.hardwareId && data.hardwareId !== connectedDeviceHardwareId && connectedDeviceHardwareId) {
        addLog(`PARSE WARN: ID de hardware recibido (${data.hardwareId}) no coincide con el conectado (${connectedDeviceHardwareId}).`);
        // Decide si quieres actualizar o no. Por ahora, no actualizamos si ya hay uno conectado.
      } else {
         addLog(`PARSE: Datos JSON parseados (ID desconocido o sin ID en mensaje): ${jsonString}`);
      }

      // Specific message handling
      if (data.type === "hello_arduino" && data.hardwareId) {
        addLog(`MSG: 'hello_arduino' recibido de ${data.hardwareId}`);
        // Initial sync is now handled by the useEffect watching connectedDeviceHardwareId, writer, isConnected
      } else if (data.type === "ack_interval_set" && data.hardwareId) {
        addLog(`MSG: ACK de intervalo recibido de ${data.hardwareId}. Nuevo intervalo: ${data.new_interval_ms} ms`);
      } else if (data.type === "ack_photo_interval_set" && data.hardwareId) {
        addLog(`MSG: ACK de intervalo de foto recibido de ${data.hardwareId}. Nuevo intervalo: ${data.new_interval_hours} horas`);
      } else if (data.type === "ack_temp_unit_set" && data.hardwareId) {
        addLog(`MSG: ACK de unidad de temperatura recibido de ${data.hardwareId}. Nueva unidad: ${data.new_unit}`);
      } else if (data.type === "ack_auto_irrigation_set" && data.hardwareId) {
        addLog(`MSG: ACK de auto riego recibido de ${data.hardwareId}. Habilitado: ${data.enabled}, Umbral: ${data.threshold}%`);
      } else if (data.type === "ack_auto_ventilation_set" && data.hardwareId) {
        addLog(`MSG: ACK de auto ventilación recibido de ${data.hardwareId}. Habilitado: ${data.enabled}, Temp On: ${data.temp_on}, Temp Off: ${data.temp_off}`);
      } else if (data.hardwareId) { // Generic sensor data processing
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
        addLog(`MSG WARN: Tipo de mensaje desconocido o hardwareId faltante: ${jsonString}`);
      }
    } catch (error) {
      addLog(`PARSE ERR: Error parseando JSON o procesando datos: '${jsonString}'. Error: ${(error as Error).message}`);
    }
  }, [addLog, connectedDeviceHardwareId]);

  const readLoop = useCallback(async (currentPortInstance: SerialPort) => {
    addLog("RL: Iniciando bucle de lectura de strings...");
    textDecoder.current = new TextDecoderStream(); // Re-initialize for new connection
    lineBufferRef.current = ''; // Clear buffer for new connection

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
          addLog(`RL: Datos RAW recibidos: "${value.replace(/\n/g, '\\n')}"`);
          lineBufferRef.current += value;
          addLog(`RL: Buffer actual: "${lineBufferRef.current.replace(/\n/g, '\\n')}"`);
          
          let newlineIndex;
          while ((newlineIndex = lineBufferRef.current.indexOf('\n')) >= 0) {
            const line = lineBufferRef.current.substring(0, newlineIndex).trim();
            lineBufferRef.current = lineBufferRef.current.substring(newlineIndex + 1);
            addLog(`RL: Línea extraída para procesar: "${line}"`);
            addLog(`RL: Buffer restante post-extracción: "${lineBufferRef.current.replace(/\n/g, '\\n')}"`);
            if (line) {
              await processReceivedData(line);
            } else {
              addLog("RL: Línea extraída vacía, ignorando.");
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
            await readableStreamClosedRef.current.cancel(); // Ensure cancel is awaited
            // readableStreamClosedRef.current.releaseLock(); // releaseLock() is often not needed or can error if stream already closed/cancelled
        } catch (releaseError: any) {
             // addLog(`RL WARN: Error en finally al manejar lector: ${releaseError.message}`);
        }
        readableStreamClosedRef.current = null;
      }
      addLog("RL: Bucle de lectura detenido completamente (finally ejecutado).");
    }
  }, [addLog, processReceivedData]);

  const connectPort = useCallback(async () => {
    if (typeof window === 'undefined' || !("serial" in navigator)) {
      addLog("CONN ERR: API Web Serial no soportada o no es entorno de cliente.");
      toast({ title: "Error de Navegador", description: "Tu navegador no soporta la API Web Serial.", variant: "destructive" });
      return;
    }
    if (isConnected || isConnecting) {
      addLog("CONN WARN: Conexión ya en progreso o establecida.");
      return;
    }

    setIsConnecting(true);
    disconnectInitiatedRef.current = false; // Reset for new connection attempt
    lineBufferRef.current = ''; // Clear buffer before new connection
    addLog("CONN: Solicitando selección de puerto serial...");

    try {
      const selectedPort = await (navigator.serial as any).requestPort();
      await selectedPort.open({ baudRate: 9600 });

      setPort(selectedPort);
      const portInformation = selectedPort.getInfo();
      const vid = portInformation.usbVendorId ? `0x${portInformation.usbVendorId.toString(16).padStart(4, '0')}` : 'N/A';
      const pid = portInformation.usbProductId ? `0x${portInformation.usbProductId.toString(16).padStart(4, '0')}` : 'N/A';
      const portLabel = `VID:${vid} PID:${pid}`;
      setPortInfo(portLabel);
      addLog(`CONN: Puerto ${portLabel} abierto.`);

      keepReading.current = true; // Set flag to true to start/continue reading
      const currentWriter = selectedPort.writable.getWriter(); // Must be done after port.open
      setWriter(currentWriter); // State update is async
      setIsConnected(true);   // State update is async
      addLog(`CONN: Conectado a puerto: ${portLabel}. Writer y estado de conexión establecidos.`);
      
      readLoop(selectedPort); // Starts reading

      selectedPort.addEventListener('disconnect', () => {
        addLog(`EVT: Puerto ${portLabel} desconectado externamente.`);
        toast({ title: "Dispositivo Desconectado", description: `El dispositivo ${portLabel} se ha desconectado.`, variant: "destructive"});
        internalDisconnectPortRef.current(false); // Use the ref for disconnect logic
      });

    } catch (error: any) {
      if (error.name === 'NotFoundError' || error.name === 'AbortError') {
        addLog("CONN: Selección de puerto cancelada.");
      } else {
        addLog(`CONN ERR: Error al abrir puerto: ${error.message}`);
        console.error("CONN ERR: Error opening port:", error);
        toast({ title: "Error de Conexión", description: `No se pudo conectar: ${error.message}`, variant: "destructive" });
      }
      // Cleanup in case of error during connection
      setPort(null);
      setWriter(null);
      setIsConnected(false);
      setConnectedDeviceHardwareId(null);
      // No need to call disconnectPort here as full cleanup happens
    } finally {
      setIsConnecting(false);
      // disconnectInitiatedRef.current should be false if connection succeeded or fully failed before disconnect
    }
  }, [addLog, toast, readLoop, isConnected, isConnecting]); // Added isConnected, isConnecting

  // Effect for initial configuration sync when device connects and identifies
  useEffect(() => {
    addLog(`SYNC_EFFECT: Triggered. hwId: ${connectedDeviceHardwareId}, writer: ${!!writer}, connected: ${isConnected}`);
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


  // Effect for re-syncing configuration when settings change in the app
  const resyncConfiguration = useCallback(async (hardwareId: string) => {
    if (isConnected && writer && hardwareId && user) {
      addLog(`RESYNC: Solicitado para ${hardwareId}...`);
      await fetchAndSyncDeviceConfiguration(hardwareId);
    } else {
      let reason = "";
      if(!isConnected) reason += "no conectado; ";
      if(!writer) reason += "sin escritor; ";
      if(!hardwareId) reason += "sin hardwareId; ";
      if(!user) reason += "sin usuario; ";
      addLog(`RESYNC WARN: No se puede re-sincronizar. Razón: ${reason}`);
    }
  }, [isConnected, writer, user, fetchAndSyncDeviceConfiguration, addLog]); // Ensure all dependencies are listed


  // Cleanup on component unmount or when port/isAuthenticated changes
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (port) { // Check if port exists (was connected)
        addLog("UNLOAD: Descarga de página detectada, desconectando puerto...");
        internalDisconnectPortRef.current(false); // Use the ref for disconnect logic
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      if (port) { // Check if port exists before trying to disconnect on unmount
        addLog("UNMOUNT: Desmontando componente, desconectando puerto...");
        internalDisconnectPortRef.current(false); // Use the ref for disconnect logic
      }
    };
  }, [port, addLog]); // Dependency on port ensures cleanup if port changes

  useEffect(() => {
    if (!isAuthenticated && port) { // If not authenticated AND a port is connected
        addLog("AUTH: Usuario desautenticado, desconectando puerto...");
        disconnectPort(false); // Use the stable disconnectPort
    }
  }, [isAuthenticated, port, disconnectPort, addLog]); // Added port and disconnectPort

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
        disconnectPort, // Expose the stable disconnectPort
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
    