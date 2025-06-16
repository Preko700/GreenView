
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Device, DeviceSettings } from '@/lib/types';
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
  // readonly readableStreamClosed: Promise<void>; // Not directly used, but part of spec
  // readonly writableStreamClosed: Promise<void>; // Not directly used, but part of spec
}

// SerialReader and SerialWriter types are simplified as we manage them internally
// interface SerialReader { /* ... */ } // No longer needed as separate state
interface SerialWriter {
  write: (data: Uint8Array) => Promise<void>;
  releaseLock: () => void; // Standard WritableStreamDefaultWriter method
  close: () => Promise<void>; // Standard WritableStreamDefaultWriter method
}

interface UsbConnectionContextType {
  port: SerialPort | null;
  // reader: SerialReader | null; // REMOVED
  writer: SerialWriter | null;
  isConnecting: boolean;
  isConnected: boolean;
  portInfo: string | null;
  logMessages: string[];
  connectedDeviceHardwareId: string | null;
  connectPort: () => Promise<void>;
  disconnectPort: (showToast?: boolean) => Promise<void>;
  sendSerialCommand: (command: Record<string, any>) => Promise<void>;
  resyncConfiguration: (hardwareId: string) => Promise<void>;
  addLog: (message: string) => void;
}

const UsbConnectionContext = createContext<UsbConnectionContextType | undefined>(undefined);

export function UsbConnectionProvider({ children }: { children: ReactNode }) {
  const [port, setPort] = useState<SerialPort | null>(null);
  // const [reader, setReader] = useState<SerialReader | null>(null); // REMOVED
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
    setLogMessages(prev => [`${timeString}: ${message}`, ...prev.slice(0, 199)]);
  }, []);

  const sendSerialCommand = useCallback(async (command: Record<string, any>) => {
    if (writer && isConnected) {
      try {
        const commandString = JSON.stringify(command) + '\\n';
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(commandString));
        // addLog(`Comando enviado: ${JSON.stringify(command)}`);
      } catch (error: any) {
        addLog(`Error enviando comando: ${error.message}`);
        console.error("Error sending serial command:", error);
      }
    } else {
      addLog("No se pudo enviar comando: Puerto no conectado o escritor no disponible.");
    }
  }, [writer, isConnected, addLog]);

  const fetchAndSyncDeviceConfiguration = useCallback(async (hardwareId: string) => {
    if (!user) {
        addLog("No se puede sincronizar configuración: usuario no autenticado.");
        return;
    }
    addLog(`Dispositivo Arduino conectado con hardwareId: ${hardwareId}. Obteniendo configuración completa...`);
    try {
      const deviceRes = await fetch(`/api/devices?userId=${user.id}&hardwareIdentifier=${hardwareId}`, { cache: 'no-store' });
      if (!deviceRes.ok) {
        const errorData = await deviceRes.json().catch(() => ({ message: `Error ${deviceRes.status} buscando dispositivo.`}));
        throw new Error(`Dispositivo no encontrado en DB (ID: ${hardwareId}): ${errorData.message}`);
      }
      const device: Device = await deviceRes.json();
      addLog(`Dispositivo encontrado en DB: ${device.name} (SN: ${device.serialNumber})`);

      const settingsRes = await fetch(`/api/device-settings/${device.serialNumber}?userId=${user.id}`, { cache: 'no-store' });
      if (!settingsRes.ok) {
        const errorData = await settingsRes.json().catch(() => ({ message: `Error ${settingsRes.status} obteniendo config.`}));
        throw new Error(`Configuración no encontrada para ${device.name}: ${errorData.message}`);
      }
      const settings: DeviceSettings = await settingsRes.json();
      
      addLog(`Config: Intervalo Medición = ${settings.measurementInterval} min.`);
      await sendSerialCommand({ command: "set_interval", value_ms: settings.measurementInterval * 60 * 1000 });

      addLog(`Config: Intervalo Foto = ${settings.photoCaptureInterval} hrs.`);
      await sendSerialCommand({ command: "set_photo_interval", value_hours: settings.photoCaptureInterval });
      
      addLog(`Config: Unidad Temp = ${settings.temperatureUnit}.`);
      await sendSerialCommand({ command: "set_temp_unit", unit: settings.temperatureUnit });

      addLog(`Config: Auto Riego = ${settings.autoIrrigation}, Umbral = ${settings.irrigationThreshold}%.`);
      await sendSerialCommand({ command: "set_auto_irrigation", enabled: settings.autoIrrigation, threshold: settings.irrigationThreshold });
      
      addLog(`Config: Auto Vent. = ${settings.autoVentilation}, Temp On = ${settings.temperatureThreshold}, Temp Off = ${settings.temperatureFanOffThreshold}.`);
      await sendSerialCommand({ 
          command: "set_auto_ventilation", 
          enabled: settings.autoVentilation, 
          temp_on: settings.temperatureThreshold, 
          temp_off: settings.temperatureFanOffThreshold 
      });

    } catch (error: any) {
      addLog(`Error al obtener/aplicar configuración completa: ${error.message}`);
      console.error("Error fetching/applying device config:", error);
    }
  }, [sendSerialCommand, addLog, user]);

  const processReceivedData = useCallback(async (jsonString: string) => {
    let currentHwId = connectedDeviceHardwareId; // Use state for consistency
    try {
      const data = JSON.parse(jsonString);
      if (data.hardwareId && data.hardwareId !== currentHwId && !currentHwId) {
        addLog(`Datos JSON parseados para nuevo ${data.hardwareId}: ${jsonString}`);
        setConnectedDeviceHardwareId(data.hardwareId);
        currentHwId = data.hardwareId;
      } else {
         addLog(`Datos JSON parseados para ${currentHwId || 'desconocido'}: ${jsonString}`);
      }

      if (data.type === "hello_arduino" && data.hardwareId) {
        addLog(`Mensaje 'hello_arduino' recibido de ${data.hardwareId}`);
        if (data.hardwareId !== currentHwId) { // If it's a new or different hardware ID
             setConnectedDeviceHardwareId(data.hardwareId);
        }
        await fetchAndSyncDeviceConfiguration(data.hardwareId);
      } else if (data.type === "ack_interval_set" && data.hardwareId) {
        addLog(`ACK de intervalo recibido de ${data.hardwareId}. Nuevo intervalo: ${data.new_interval_ms} ms`);
      } else if (data.type === "ack_photo_interval_set" && data.hardwareId) {
        addLog(`ACK de intervalo de foto recibido de ${data.hardwareId}. Nuevo intervalo: ${data.new_interval_hours} horas`);
      } else if (data.type === "ack_temp_unit_set" && data.hardwareId) {
        addLog(`ACK de unidad de temperatura recibido de ${data.hardwareId}. Nueva unidad: ${data.new_unit}`);
      } else if (data.type === "ack_auto_irrigation_set" && data.hardwareId) {
        addLog(`ACK de auto riego recibido de ${data.hardwareId}. Habilitado: ${data.enabled}, Umbral: ${data.threshold}%`);
      } else if (data.type === "ack_auto_ventilation_set" && data.hardwareId) {
        addLog(`ACK de auto ventilación recibido de ${data.hardwareId}. Habilitado: ${data.enabled}, Temp On: ${data.temp_on}, Temp Off: ${data.temp_off}`);
      } else if (data.hardwareId) { // Generic sensor data
        // addLog(`Datos de sensores recibidos de ${data.hardwareId}: ${jsonString}`);
        try {
            // addLog(`[ApiClient] Enviando a /api/ingest-sensor-data: ${JSON.stringify(data)}`);
            const response = await fetch('/api/ingest-sensor-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data), // data already includes hardwareId
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || `Error ${response.status}`);
            addLog(`Datos de ${data.hardwareId} enviados al servidor: ${result.message}`);
        } catch (apiError: any) {
            addLog(`Error enviando datos de ${data.hardwareId} a la API: ${apiError.message}`);
            console.error("API Ingest Error:", apiError);
        }
      } else {
        addLog(`Tipo de mensaje desconocido o hardwareId faltante: ${jsonString}`);
      }
    } catch (error) {
      addLog(`Error parseando JSON o procesando datos: ${jsonString}. Error: ${(error as Error).message}`);
    }
  }, [addLog, fetchAndSyncDeviceConfiguration, connectedDeviceHardwareId]);

  const readLoop = useCallback(async (currentPort: SerialPort) => {
    addLog("Iniciando bucle de lectura de strings...");
    textDecoder.current = new TextDecoderStream();
    const readableStream = currentPort.readable.pipeThrough(textDecoder.current);
    readableStreamClosedRef.current = readableStream.getReader();

    try {
      while (keepReading.current) {
        const { value, done } = await readableStreamClosedRef.current.read();
        if (done) {
          if (!disconnectInitiatedRef.current) addLog("Bucle de lectura finalizado (stream cerrado).");
          break;
        }
        if (value) {
          lineBufferRef.current += value;
          let newlineIndex;
          while ((newlineIndex = lineBufferRef.current.indexOf('\\n')) >= 0) {
            const line = lineBufferRef.current.substring(0, newlineIndex).trim();
            lineBufferRef.current = lineBufferRef.current.substring(newlineIndex + 1);
            if (line) {
              // addLog(`Línea RAW recibida: ${line}`);
              await processReceivedData(line);
            }
          }
        }
      }
    } catch (error: any) {
      if (!disconnectInitiatedRef.current) {
        addLog(`Error en el bucle de lectura: ${error.message}`);
        console.error("Read loop error:", error);
      }
    } finally {
      if (readableStreamClosedRef.current) {
        try {
            await readableStreamClosedRef.current.cancel();
            // addLog("Lector del TextDecoderStream cancelado en finally de readLoop.");
            readableStreamClosedRef.current.releaseLock(); // Release lock on the reader from the TextDecoderStream
            // addLog("Lock del lector del TextDecoderStream liberado en finally de readLoop.");
        } catch (releaseError: any) {
            // addLog(`Error en finally de readLoop al manejar readableStreamClosedRef: ${releaseError.message}`);
        }
        readableStreamClosedRef.current = null;
      }
      // addLog("Bucle de lectura detenido (finally ejecutado).");
    }
  }, [addLog, processReceivedData]);

  const connectPort = useCallback(async () => {
    if (!("serial" in navigator)) {
      addLog("API Web Serial no soportada en este navegador.");
      toast({ title: "Error de Navegador", description: "Tu navegador no soporta la API Web Serial.", variant: "destructive" });
      return;
    }

    if (isConnected || isConnecting) {
      addLog("Conexión ya en progreso o establecida.");
      return;
    }

    setIsConnecting(true);
    disconnectInitiatedRef.current = false;
    addLog("Solicitando selección de puerto serial...");

    try {
      const selectedPort = await (navigator.serial as any).requestPort();
      await selectedPort.open({ baudRate: 9600 });

      setPort(selectedPort);
      const portInformation = selectedPort.getInfo();
      const vid = portInformation.usbVendorId ? `0x${portInformation.usbVendorId.toString(16).padStart(4, '0')}` : 'N/A';
      const pid = portInformation.usbProductId ? `0x${portInformation.usbProductId.toString(16).padStart(4, '0')}` : 'N/A';
      const portLabel = `VID:${vid} PID:${pid}`;
      setPortInfo(portLabel);
      addLog(`Puerto ${portLabel} abierto.`);

      keepReading.current = true;

      const currentWriter = selectedPort.writable.getWriter();
      setWriter(currentWriter);

      setIsConnected(true); // Set connected before starting read loop
      addLog(`Conectado a puerto: ${portLabel}`);
      
      readLoop(selectedPort); // Start reading

      selectedPort.addEventListener('disconnect', () => {
        addLog(`Puerto ${portLabel} desconectado externamente.`);
        toast({ title: "Dispositivo Desconectado", description: `El dispositivo ${portLabel} se ha desconectado.`, variant: "destructive"});
        // No need to await here, just trigger the cleanup
        disconnectPort(false);
      });

    } catch (error: any) {
      if (error.name === 'NotFoundError' || error.name === 'AbortError') {
        addLog("Selección de puerto cancelada por el usuario.");
      } else {
        addLog(`Error al abrir puerto: ${error.message}`);
        console.error("Error opening port:", error);
        toast({ title: "Error de Conexión", description: `No se pudo conectar: ${error.message}`, variant: "destructive" });
      }
      setPort(null);
      setWriter(null);
      setIsConnected(false);
      setConnectedDeviceHardwareId(null);
    } finally {
      setIsConnecting(false);
    }
  }, [addLog, toast, readLoop, isConnected, isConnecting]);


  const disconnectPort = useCallback(async (showToastUserInitiated = true) => {
    if (!port && !isConnected && !isConnecting) {
        addLog("Intento de desconexión sin puerto activo o conexión.")
        return;
    }
    addLog("Iniciando proceso de desconexión...");
    disconnectInitiatedRef.current = true;
    keepReading.current = false;

    if (readableStreamClosedRef.current) {
      try {
        await readableStreamClosedRef.current.cancel(); // Cancel the reader from TextDecoderStream
        // addLog("Lector (readableStreamClosedRef) cancelado.");
        // The lock is on the reader instance itself.
        readableStreamClosedRef.current.releaseLock();
        // addLog("Lock del lector (readableStreamClosedRef) liberado.");
      } catch (error: any) {
        // addLog(`Error durante cancelación/liberación del lector: ${error.message}`);
      }
      readableStreamClosedRef.current = null;
    }
    
    if (writer) {
      try {
        // Closing the writer might throw if the port is already gone.
        // writer.releaseLock(); // Release lock first
        await writer.close(); 
        // addLog("Escritor cerrado.");
      } catch (error: any) {
        // addLog(`Error cerrando escritor: ${error.message}`);
      }
      setWriter(null);
    }

    if (port) {
      try {
        await port.close();
        addLog("Puerto cerrado exitosamente.");
        if (showToastUserInitiated) {
          toast({ title: "Desconectado", description: "Puerto serial desconectado." });
        }
      } catch (error: any) {
        addLog(`Error al cerrar puerto: ${error.message}`);
        console.error("Error closing port:", error);
        if (showToastUserInitiated) {
           toast({ title: "Error al Desconectar", description: error.message, variant: "destructive" });
        }
      }
    }

    setPort(null);
    setIsConnected(false);
    setPortInfo(null);
    setConnectedDeviceHardwareId(null); // Reset hardware ID on disconnect
    lineBufferRef.current = '';
    addLog("Estado de conexión reseteado post-desconexión.");
    // disconnectInitiatedRef.current = false; // Reset after full disconnect logic
  }, [port, writer, addLog, toast, isConnected, isConnecting]);


  const resyncConfiguration = useCallback(async (hardwareId: string) => {
    if (isConnected && hardwareId) {
      addLog(`Re-sincronizando configuración para ${hardwareId} (solicitado por UI)...`);
      await fetchAndSyncDeviceConfiguration(hardwareId);
    } else {
      addLog(`No se puede re-sincronizar: ${!isConnected ? "no conectado" : "sin hardwareId"}`);
    }
  }, [isConnected, fetchAndSyncDeviceConfiguration, addLog]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isConnected && port) {
        // Attempt to clean disconnect, though Web Serial is tricky with page unload
        // This is mostly a best-effort.
        addLog("Descarga de página detectada, intentando desconectar puerto...");
        // Not using await here as beforeunload needs to be synchronous for some parts.
        disconnectPort(false); 
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Cleanup on component unmount
      if (isConnected || port) { // Check port as well, as isConnected might be false but port obj exists
          addLog("Desmontando componente, desconectando puerto si está activo...");
          disconnectPort(false);
      }
    };
  }, [isConnected, port, addLog, disconnectPort]);
  
  useEffect(() => {
    // Auto-disconnect if user logs out
    if (!isAuthenticated && (isConnected || port)) {
        addLog("Usuario desautenticado, desconectando puerto si está activo...");
        disconnectPort(false);
    }
  }, [isAuthenticated, isConnected, port, disconnectPort, addLog]);


  return (
    <UsbConnectionContext.Provider
      value={{
        port,
        // reader, // REMOVED
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

    