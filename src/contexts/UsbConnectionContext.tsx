"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Device, DeviceSettings, SensorReading } from '@/lib/types'; // Ensure SensorReading is imported
import { useAuth } from './AuthContext'; // Import useAuth

// Typings for SerialPort, SerialReader, SerialWriter (basic)
interface SerialPort {
  getInfo: () => { usbVendorId?: number; usbProductId?: number };
  open: (options: { baudRate: number }) => Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close: () => Promise<void>;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  readonly readableStreamClosed: Promise<void>;
  readonly writableStreamClosed: Promise<void>;
}

interface SerialReader {
  read: () => Promise<{ value?: Uint8Array; done: boolean }>;
  releaseLock: () => void;
  cancel: () => Promise<void>;
}
interface SerialWriter {
  write: (data: Uint8Array) => Promise<void>;
  releaseLock: () => void;
  close: () => Promise<void>;
}

interface UsbConnectionContextType {
  port: SerialPort | null;
  reader: SerialReader | null;
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
  const [reader, setReader] = useState<SerialReader | null>(null);
  const [writer, setWriter] = useState<SerialWriter | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [portInfo, setPortInfo] = useState<string | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [connectedDeviceHardwareId, setConnectedDeviceHardwareId] = useState<string | null>(null);
  
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth(); // Get user for API calls

  const keepReading = useRef(true);
  const disconnectInitiatedRef = useRef(false);
  const textDecoder = useRef(new TextDecoderStream());
  const readableStreamClosedRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const lineBufferRef = useRef('');

  const addLog = useCallback((message: string) => {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    setLogMessages(prev => [`${timeString}: ${message}`, ...prev.slice(0, 199)]); // Keep last 200 messages
  }, []);

  const sendSerialCommand = useCallback(async (command: Record<string, any>) => {
    if (writer && isConnected) {
      try {
        const commandString = JSON.stringify(command) + '\\n'; // Add newline
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(commandString));
        // addLog(`Comando enviado al Arduino: ${JSON.stringify(command)}`);
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
    addLog(`Dispositivo Arduino conectado con hardwareId: ${hardwareId}. Obteniendo configuración...`);
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
      
      addLog(`Configuración obtenida: Intervalo de Medición = ${settings.measurementInterval} minutos.`);
      await sendSerialCommand({ command: "set_interval", value_ms: settings.measurementInterval * 60 * 1000 });

      addLog(`Configuración obtenida: Intervalo de Foto = ${settings.photoCaptureInterval} horas.`);
      await sendSerialCommand({ command: "set_photo_interval", value_hours: settings.photoCaptureInterval });
      
      addLog(`Configuración obtenida: Unidad de Temperatura = ${settings.temperatureUnit}.`);
      await sendSerialCommand({ command: "set_temp_unit", unit: settings.temperatureUnit });

      addLog(`Configuración obtenida: Auto Riego = ${settings.autoIrrigation}, Umbral = ${settings.irrigationThreshold}%.`);
      await sendSerialCommand({ command: "set_auto_irrigation", enabled: settings.autoIrrigation, threshold: settings.irrigationThreshold });
      
      addLog(`Configuración obtenida: Auto Vent. = ${settings.autoVentilation}, Temp On = ${settings.temperatureThreshold}, Temp Off = ${settings.temperatureFanOffThreshold}.`);
      await sendSerialCommand({ 
          command: "set_auto_ventilation", 
          enabled: settings.autoVentilation, 
          temp_on: settings.temperatureThreshold, 
          temp_off: settings.temperatureFanOffThreshold 
      });

    } catch (error: any) {
      addLog(`Error al obtener/aplicar configuración: ${error.message}`);
      console.error("Error fetching/applying device config:", error);
    }
  }, [sendSerialCommand, addLog, user]);

  const processReceivedData = useCallback(async (jsonString: string, currentHardwareId: string | null) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.hardwareId && data.hardwareId !== currentHardwareId && !currentHardwareId) {
        // This could be the first message that sets the hardwareId
        addLog(`Datos JSON parseados para ${data.hardwareId}: ${jsonString}`);
        setConnectedDeviceHardwareId(data.hardwareId); // Update hardwareId if it's part of the message
        currentHardwareId = data.hardwareId; // Use for subsequent logic in this call
      } else {
         addLog(`Datos JSON parseados para ${currentHardwareId || 'desconocido'}: ${jsonString}`);
      }

      if (data.type === "hello_arduino" && data.hardwareId) {
        addLog(`Mensaje 'hello_arduino' recibido de ${data.hardwareId}`);
        setConnectedDeviceHardwareId(data.hardwareId);
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
        addLog(`Datos de sensores recibidos de ${data.hardwareId}: ${jsonString}`);
        // Send to API
        try {
            addLog(`[ApiClient] Enviando a /api/ingest-sensor-data: ${JSON.stringify(data)}`);
            const response = await fetch('/api/ingest-sensor-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || `Error ${response.status}`);
            addLog(`Datos enviados al servidor para ${data.hardwareId}: ${result.message}`);
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
  }, [addLog, fetchAndSyncDeviceConfiguration]);


  const readLoop = useCallback(async (currentPort: SerialPort, currentReader: SerialReader) => {
    addLog("Iniciando bucle de lectura de strings...");
    textDecoder.current = new TextDecoderStream(); // Reinitialize for new connection
    const readableStream = currentPort.readable.pipeThrough(textDecoder.current);
    readableStreamClosedRef.current = readableStream.getReader();

    try {
      while (keepReading.current) {
        const { value, done } = await readableStreamClosedRef.current.read();
        if (done) {
          addLog("Bucle de lectura finalizado (stream cerrado).");
          break;
        }
        if (value) {
          lineBufferRef.current += value;
          let newlineIndex;
          while ((newlineIndex = lineBufferRef.current.indexOf('\\n')) >= 0) {
            const line = lineBufferRef.current.substring(0, newlineIndex).trim();
            lineBufferRef.current = lineBufferRef.current.substring(newlineIndex + 1);
            if (line) {
              // Add timestamp for raw line log
              addLog(`Línea completa recibida y parseada (desde sanitizada): ${line}`);
              await processReceivedData(line, connectedDeviceHardwareId); // Pass currentHardwareId
            }
          }
        }
      }
    } catch (error: any) {
      if (!disconnectInitiatedRef.current) { // Only log error if not user-initiated
        addLog(`Error en el bucle de lectura: ${error.message}`);
        console.error("Read loop error:", error);
      }
    } finally {
      if (readableStreamClosedRef.current) {
        try {
            await readableStreamClosedRef.current.cancel(); // Ensure stream is cancelled
            readableStreamClosedRef.current.releaseLock();
        } catch (releaseError) {
            // console.warn("Error releasing reader lock on finally:", releaseError);
        }
        readableStreamClosedRef.current = null;
      }
      addLog("Bucle de lectura detenido.");
    }
  }, [addLog, processReceivedData, connectedDeviceHardwareId]); // Added connectedDeviceHardwareId dependency


  const connectPort = useCallback(async () => {
    if (!("serial" in navigator)) {
      addLog("API Web Serial no soportada en este navegador.");
      toast({ title: "Error de Navegador", description: "Tu navegador no soporta la API Web Serial necesaria para esta función.", variant: "destructive" });
      return;
    }

    setIsConnecting(true);
    disconnectInitiatedRef.current = false;
    addLog("Solicitando selección de puerto serial...");

    try {
      const selectedPort = await (navigator.serial as any).requestPort();
      await selectedPort.open({ baudRate: 9600 }); // Common baud rate

      setPort(selectedPort);
      const portInformation = selectedPort.getInfo();
      const vid = portInformation.usbVendorId ? `0x${portInformation.usbVendorId.toString(16).padStart(4, '0')}` : 'N/A';
      const pid = portInformation.usbProductId ? `0x${portInformation.usbProductId.toString(16).padStart(4, '0')}` : 'N/A';
      const portLabel = `VID:${vid} PID:${pid}`;
      setPortInfo(portLabel);
      addLog(`Puerto ${portLabel} abierto.`);

      keepReading.current = true; // Reset for new connection

      const currentReader = selectedPort.readable.getReader();
      setReader(currentReader); // Store reader instance

      const currentWriter = selectedPort.writable.getWriter();
      setWriter(currentWriter); // Store writer instance

      setIsConnected(true);
      addLog(`Conectado a puerto: ${portLabel}`);
      
      readLoop(selectedPort, currentReader); // Pass reader to readLoop

       // Listen for 'disconnect' event on the port
      selectedPort.addEventListener('disconnect', () => {
        addLog(`Puerto ${portLabel} desconectado externamente.`);
        toast({ title: "Dispositivo Desconectado", description: `El dispositivo ${portLabel} se ha desconectado.`, variant: "destructive"});
        disconnectPort(false); // Do not show another toast
      });


    } catch (error: any) {
      if (error.name === 'NotFoundError' || error.name === 'AbortError') {
        addLog("Selección de puerto cancelada por el usuario.");
      } else {
        addLog(`Error al abrir puerto: ${error.message}`);
        console.error("Error opening port:", error);
        toast({ title: "Error de Conexión", description: `No se pudo conectar al puerto: ${error.message}`, variant: "destructive" });
      }
      setPort(null);
      setReader(null);
      setWriter(null);
      setIsConnected(false);
      setConnectedDeviceHardwareId(null);
    } finally {
      setIsConnecting(false);
    }
  }, [addLog, toast, readLoop]);


  const disconnectPort = useCallback(async (showToastUserInitiated = true) => {
    disconnectInitiatedRef.current = true; // Signal that disconnect is user-initiated or app-initiated
    keepReading.current = false;
    addLog("Intentando desconectar puerto...");

    if (reader) {
      try {
        if (readableStreamClosedRef.current) {
            await readableStreamClosedRef.current.cancel(); // Cancel the reader from the TextDecoderStream
            // readableStreamClosedRef.current.releaseLock(); // Lock is on the TextDecoderStream's reader
        }
        // Reader from port.readable is likely already released by piping through TextDecoderStream
        // but if direct reader was used:
        // await reader.cancel(); // Cancel direct port reader if it was used
        // reader.releaseLock();
        addLog("Lector cancelado y liberado.");
      } catch (error: any) {
        addLog(`Error cancelando/liberando lector: ${error.message}`);
      }
      setReader(null);
    }

    if (writer) {
      try {
        await writer.close(); // Close the writer
        addLog("Escritor cerrado.");
      } catch (error: any) {
        addLog(`Error cerrando escritor: ${error.message}`);
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
    setConnectedDeviceHardwareId(null);
    lineBufferRef.current = ''; // Clear buffer
    addLog("Estado de conexión reseteado.");
    disconnectInitiatedRef.current = false; // Reset ref
  }, [reader, writer, port, addLog, toast]);

  // Resync configuration (e.g., when settings change in the UI)
  const resyncConfiguration = useCallback(async (hardwareId: string) => {
    if (isConnected && hardwareId) {
      addLog(`Re-sincronizando configuración para ${hardwareId}...`);
      await fetchAndSyncDeviceConfiguration(hardwareId);
    }
  }, [isConnected, fetchAndSyncDeviceConfiguration, addLog]);

  // Effect for cleaning up on component unmount or when user logs out
  useEffect(() => {
    const handleLogoutOrUnmount = async () => {
        if (isConnected) {
            addLog("Cerrando sesión o desmontando componente, desconectando puerto...");
            await disconnectPort(false); // Don't show toast on auto-disconnect
        }
    };
    
    if (!isAuthenticated && isConnected) { // If user logs out while connected
        handleLogoutOrUnmount();
    }
    
    return () => { // Cleanup on component unmount
        handleLogoutOrUnmount();
    };
  }, [disconnectPort, isAuthenticated, isConnected, addLog]);


  return (
    <UsbConnectionContext.Provider
      value={{
        port,
        reader,
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

