
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Device, DeviceSettings } from '@/lib/types'; // Assuming Device is needed for fetchAndSync
import { SensorType } from '@/lib/types'; // Assuming SensorType is used if processReceivedData ingests specific types
import { useAuth } from './AuthContext';

// Typings for SerialPort (basic)
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
  disconnectPort: (showToast?: boolean) => void; // Changed to void as it calls an async ref
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
    // console.log(`[USB LOG] ${finalMessage}`);
  }, []);

  const _internalDisconnectPort = useCallback(async (showToastUserInitiated = true) => {
    if (disconnectInitiatedRef.current && !isConnecting && !isConnected) {
        // Already disconnecting or disconnected, prevent multiple calls if rapidly triggered
        // addLog("DISC WARN: Disconnect already in progress or completed.");
        // return; 
    }
    addLog("DISC: Iniciando proceso de desconexión...");
    disconnectInitiatedRef.current = true;
    keepReading.current = false;

    if (readableStreamClosedRef.current) {
      try {
        // addLog("DISC: Cancelando lector (readableStreamClosedRef)...");
        await readableStreamClosedRef.current.cancel();
        // addLog("DISC: Lector (readableStreamClosedRef) cancelado.");
        readableStreamClosedRef.current.releaseLock();
        // addLog("DISC: Lock del lector (readableStreamClosedRef) liberado.");
      } catch (error: any) {
        // addLog(`DISC WARN: Error durante cancelación/liberación del lector: ${error.message}`);
      }
      readableStreamClosedRef.current = null;
    }

    // Use functional updates for setWriter and setPort if their closing depends on current value
    // However, we are setting them to null, so direct set is fine.
    // We need to ensure writer.close() and port.close() are called on the actual instances.
    
    const currentWriter = writer; // Capture current writer state for closure
    if (currentWriter) {
      try {
        // addLog("DISC: Cerrando escritor...");
        await currentWriter.close();
        // addLog("DISC: Escritor cerrado.");
      } catch (error: any) {
        // addLog(`DISC WARN: Error cerrando escritor: ${error.message}`);
      }
      setWriter(null);
    }

    const currentPort = port; // Capture current port state for closure
    if (currentPort) {
      try {
        // addLog("DISC: Cerrando puerto...");
        await currentPort.close();
        addLog("DISC: Puerto cerrado exitosamente.");
        if (showToastUserInitiated) {
          toast({ title: "Desconectado", description: "Puerto serial desconectado." });
        }
      } catch (error: any)        {
        addLog(`DISC ERR: Error al cerrar puerto: ${error.message}`);
        console.error("DISC ERR: Error closing port:", error);
        if (showToastUserInitiated) {
           toast({ title: "Error al Desconectar", description: error.message, variant: "destructive" });
        }
      }
      setPort(null);
    }

    setIsConnected(false);
    setIsConnecting(false); // Ensure connecting is also false
    setPortInfo(null);
    setConnectedDeviceHardwareId(null);
    lineBufferRef.current = '';
    addLog("DISC: Estado de conexión reseteado post-desconexión.");
    // disconnectInitiatedRef.current = false; // Reset for next potential disconnect
  }, [addLog, toast, port, writer, isConnected, isConnecting]); // Added isConnected, isConnecting to deps

  const internalDisconnectPortRef = useRef(_internalDisconnectPort);
  useEffect(() => {
    internalDisconnectPortRef.current = _internalDisconnectPort;
  }, [_internalDisconnectPort]);

  const disconnectPort = useCallback((showToastUserInitiated = true) => {
    internalDisconnectPortRef.current(showToastUserInitiated);
  }, []); // Stable: No dependencies

  const sendSerialCommand = useCallback(async (command: Record<string, any>) => {
    const currentWriter = writer; // Use the state variable
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
      addLog("CMD WARN: No se pudo enviar comando: Puerto no conectado o escritor no disponible.");
    }
  }, [writer, isConnected, addLog]);

  const fetchAndSyncDeviceConfiguration = useCallback(async (hardwareId: string) => {
    if (!user) {
        addLog("SYNC ERR: No se puede sincronizar configuración: usuario no autenticado.");
        return;
    }
    addLog(`SYNC: Dispositivo Arduino conectado con hardwareId: ${hardwareId}. Obteniendo configuración completa...`);
    try {
      const deviceRes = await fetch(`/api/devices?userId=${user.id}&hardwareIdentifier=${hardwareId}`, { cache: 'no-store' });
      if (!deviceRes.ok) {
        const errorData = await deviceRes.json().catch(() => ({ message: `Error ${deviceRes.status} buscando dispositivo.`}));
        throw new Error(`Dispositivo no encontrado en DB (ID: ${hardwareId}): ${errorData.message}`);
      }
      const device: Device = await deviceRes.json(); // Ensure Device type is correctly imported
      addLog(`SYNC: Dispositivo encontrado en DB: ${device.name} (SN: ${device.serialNumber})`);

      const settingsRes = await fetch(`/api/device-settings/${device.serialNumber}?userId=${user.id}`, { cache: 'no-store' });
      if (!settingsRes.ok) {
        const errorData = await settingsRes.json().catch(() => ({ message: `Error ${settingsRes.status} obteniendo config.`}));
        throw new Error(`Configuración no encontrada para ${device.name}: ${errorData.message}`);
      }
      const settings: DeviceSettings = await settingsRes.json(); // Ensure DeviceSettings type

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
    let currentHwId = connectedDeviceHardwareId;
    try {
      const data = JSON.parse(jsonString);
      
      if (data.hardwareId && data.hardwareId !== currentHwId && !currentHwId) {
        addLog(`PARSE: Datos JSON para nuevo ${data.hardwareId}: ${jsonString}`);
        setConnectedDeviceHardwareId(data.hardwareId); // State update
        currentHwId = data.hardwareId;
      } else if (data.hardwareId && data.hardwareId === currentHwId) {
         addLog(`PARSE: Datos JSON para ${currentHwId}: ${jsonString}`);
      } else if (data.hardwareId && data.hardwareId !== currentHwId && currentHwId) {
        addLog(`PARSE WARN: ID de hardware recibido (${data.hardwareId}) no coincide con el conectado (${currentHwId}). Parseando de todas formas.`);
      } else {
         addLog(`PARSE: Datos JSON parseados (ID desconocido o sin ID): ${jsonString}`);
      }

      if (data.type === "hello_arduino" && data.hardwareId) {
        addLog(`MSG: 'hello_arduino' recibido de ${data.hardwareId}`);
        if (data.hardwareId !== currentHwId) {
             setConnectedDeviceHardwareId(data.hardwareId); // State update
        }
        await fetchAndSyncDeviceConfiguration(data.hardwareId);
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
      } else if (data.hardwareId) {
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
  }, [addLog, fetchAndSyncDeviceConfiguration, connectedDeviceHardwareId]);

  const readLoop = useCallback(async (currentPortInstance: SerialPort) => {
    addLog("RL: Iniciando bucle de lectura de strings...");
    textDecoder.current = new TextDecoderStream();
    lineBufferRef.current = '';

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
            await readableStreamClosedRef.current.cancel();
            readableStreamClosedRef.current.releaseLock();
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

    setIsConnecting(true); // State update
    disconnectInitiatedRef.current = false;
    addLog("CONN: Solicitando selección de puerto serial...");

    try {
      const selectedPort = await (navigator.serial as any).requestPort();
      await selectedPort.open({ baudRate: 9600 });

      setPort(selectedPort); // State update
      const portInformation = selectedPort.getInfo();
      const vid = portInformation.usbVendorId ? `0x${portInformation.usbVendorId.toString(16).padStart(4, '0')}` : 'N/A';
      const pid = portInformation.usbProductId ? `0x${portInformation.usbProductId.toString(16).padStart(4, '0')}` : 'N/A';
      const portLabel = `VID:${vid} PID:${pid}`;
      setPortInfo(portLabel); // State update
      addLog(`CONN: Puerto ${portLabel} abierto.`);

      keepReading.current = true;
      const currentWriter = selectedPort.writable.getWriter();
      setWriter(currentWriter); // State update
      setIsConnected(true); // State update
      addLog(`CONN: Conectado a puerto: ${portLabel}`);
      
      readLoop(selectedPort);

      selectedPort.addEventListener('disconnect', () => {
        addLog(`EVT: Puerto ${portLabel} desconectado externamente.`);
        toast({ title: "Dispositivo Desconectado", description: `El dispositivo ${portLabel} se ha desconectado.`, variant: "destructive"});
        internalDisconnectPortRef.current(false); // Use ref for internal calls from event handlers
      });

    } catch (error: any) {
      if (error.name === 'NotFoundError' || error.name === 'AbortError') {
        addLog("CONN: Selección de puerto cancelada.");
      } else {
        addLog(`CONN ERR: Error al abrir puerto: ${error.message}`);
        console.error("CONN ERR: Error opening port:", error);
        toast({ title: "Error de Conexión", description: `No se pudo conectar: ${error.message}`, variant: "destructive" });
      }
      setPort(null); // State update
      setWriter(null); // State update
      setIsConnected(false); // State update
      setConnectedDeviceHardwareId(null); // State update
    } finally {
      setIsConnecting(false); // State update
    }
  }, [addLog, toast, readLoop, isConnected, isConnecting, internalDisconnectPortRef]); // internalDisconnectPortRef is stable

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isConnected && port) { // port is state
        addLog("UNLOAD: Descarga de página detectada, desconectando puerto...");
        internalDisconnectPortRef.current(false);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        if (isConnected && port) { // port is state
            addLog("UNMOUNT: Desmontando componente, desconectando puerto...");
            internalDisconnectPortRef.current(false);
        }
      };
    }
    return () => {}; // No-op if not in browser
  }, [isConnected, port, addLog]); // internalDisconnectPortRef is stable

  useEffect(() => {
    if (!isAuthenticated && (isConnected && port)) { // port is state
        addLog("AUTH: Usuario desautenticado, desconectando puerto...");
        disconnectPort(false); // Use stable disconnectPort for direct calls
    }
  }, [isAuthenticated, isConnected, port, disconnectPort, addLog]); // Use stable disconnectPort

  const resyncConfiguration = useCallback(async (hardwareId: string) => {
    if (isConnected && hardwareId) {
      addLog(`RESYNC: Solicitado para ${hardwareId}...`);
      await fetchAndSyncDeviceConfiguration(hardwareId);
    } else {
      addLog(`RESYNC WARN: No se puede re-sincronizar: ${!isConnected ? "no conectado" : "sin hardwareId"}`);
    }
  }, [isConnected, fetchAndSyncDeviceConfiguration, addLog, connectedDeviceHardwareId]); // Added connectedDeviceHardwareId as it's related

  return (
    <UsbConnectionContext.Provider
      value={{
        port, // state
        writer, // state
        isConnecting, // state
        isConnected, // state
        portInfo, // state
        logMessages, // state
        connectedDeviceHardwareId, // state
        connectPort, // useCallback
        disconnectPort, // useCallback (stable wrapper)
        sendSerialCommand, // useCallback
        resyncConfiguration, // useCallback
        addLog, // useCallback (stable)
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

    