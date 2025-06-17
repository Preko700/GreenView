
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Device, DeviceSettings } from '@/lib/types';
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
    setLogMessages(prev => [finalMessage, ...prev.slice(0, 499)]); // Mantener 500 líneas
    // console.log(`[USB LOG CLIENT] ${finalMessage}`);
  }, []);

  const _internalDisconnectPort = useCallback(async (showToastUserInitiated = true) => {
    addLog("DISC: Iniciando proceso de desconexión...");
    if (!port && !writer && !readableStreamClosedRef.current && !isConnected && !isConnecting && !disconnectInitiatedRef.current) {
        addLog("DISC: Ya desconectado o nunca conectado/intentado, nada que hacer.");
        disconnectInitiatedRef.current = false; // Reset flag if it was somehow true
        return;
    }
    
    disconnectInitiatedRef.current = true;
    keepReading.current = false;
    lineBufferRef.current = ''; 

    if (readableStreamClosedRef.current) {
      try {
        // It's crucial that cancel() is awaited.
        await readableStreamClosedRef.current.cancel();
        addLog("DISC: Lector del TextDecoderStream cancelado.");
      } catch (error: any) {
        addLog(`DISC WARN: Error durante cancelación del lector: ${error.message}`);
      }
      // Ensure readableStreamClosedRef is nullified only after successful cancel or if it was already null
      readableStreamClosedRef.current = null;
    }
    
    const currentWriter = writer; 
    if (currentWriter) {
      try {
        // Ensure writer lock is released. close() should do this, but being explicit can help.
        // However, directly calling releaseLock if the stream is about to be closed by the writer
        // itself might be redundant or even problematic depending on the state.
        // writer.close() is generally sufficient.
        await currentWriter.close();
        addLog("DISC: Escritor cerrado.");
      } catch (error: any) {
        // Log writer error but continue disconnection
        addLog(`DISC WARN: Error manejando escritor: ${error.message}`);
      }
      setWriter(null); 
    }

    const currentPort = port; 
    if (currentPort) {
      try {
        // Ensure all event listeners are removed before closing the port
        // This is a placeholder, actual removal depends on how they were added
        // currentPort.removeEventListener('disconnect', handleExternalDisconnect); // Example
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
      setPort(null); 
    }
    
    setPortInfo(null);
    setConnectedDeviceHardwareId(null); 
    setIsConnected(false); // Set isConnected to false *after* port is confirmed closed or errors
    setIsConnecting(false); // Also reset isConnecting
    disconnectInitiatedRef.current = false; // Reset the flag *after* completion
    addLog("DISC: Estado de conexión reseteado post-desconexión.");
  }, [addLog, toast, port, writer, isConnected, isConnecting]); 

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
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (error: any) {
      addLog(`PARSE ERR: Error parseando JSON o procesando datos: '${jsonString}'. Error: ${error.message}`);
      return;
    }

    if (data.hardwareId && !connectedDeviceHardwareId) {
        // This is the first time we're identifying a device in this session
        if (data.type === "hello_arduino") {
            addLog(`PARSE: Datos JSON para nuevo ${data.hardwareId} (hello_arduino): ${jsonString}`);
        } else {
            addLog(`PARSE: Datos JSON para nuevo ${data.hardwareId} (otro tipo): ${jsonString}`);
        }
        setConnectedDeviceHardwareId(data.hardwareId);
    } else if (data.hardwareId && data.hardwareId !== connectedDeviceHardwareId && connectedDeviceHardwareId) {
        addLog(`PARSE WARN: ID de hardware recibido (${data.hardwareId}) no coincide con el conectado (${connectedDeviceHardwareId}). Datos ignorados.`);
        return; 
    } else if (data.hardwareId && data.hardwareId === connectedDeviceHardwareId) {
        // Known device, no need to log a specific "PARSE:" message unless debugging data itself
    } else if (!data.hardwareId && connectedDeviceHardwareId) {
        addLog(`PARSE WARN: Mensaje JSON sin hardwareId explícito. Usando el conectado (${connectedDeviceHardwareId}). JSON: ${jsonString}`);
        data.hardwareId = connectedDeviceHardwareId; // Impute if missing and we have a connected one
    } else if (!data.hardwareId && !connectedDeviceHardwareId) {
        addLog(`PARSE WARN: Sin hardwareId conectado y mensaje sin ID. Imposible procesar. JSON: ${jsonString}`);
        return;
    }

    if (data.type === "hello_arduino") {
      addLog(`MSG: 'hello_arduino' recibido de ${data.hardwareId}`);
    } else if (data.type === "ack_interval_set") {
      addLog(`MSG: ACK de intervalo recibido de ${data.hardwareId}. Nuevo intervalo: ${data.new_interval_ms} ms`);
    } else if (data.type === "ack_photo_interval_set") {
      addLog(`MSG: ACK de intervalo de foto recibido de ${data.hardwareId}. Nuevo intervalo: ${data.new_interval_hours} horas`);
    } else if (data.type === "ack_temp_unit_set") {
      addLog(`MSG: ACK de unidad de temperatura recibido de ${data.hardwareId}. Nueva unidad: ${data.new_unit}`);
    } else if (data.type === "ack_auto_irrigation_set") {
      addLog(`MSG: ACK de auto riego recibido de ${data.hardwareId}. Habilitado: ${data.enabled}, Umbral: ${data.threshold}%`);
    } else if (data.type === "ack_auto_ventilation_set") {
      addLog(`MSG: ACK de auto ventilación recibido de ${data.hardwareId}. Habilitado: ${data.enabled}, Temp On: ${data.temp_on}, Temp Off: ${data.temp_off}`);
    } else if (data.hardwareId && (data.temperature !== undefined || data.airHumidity !== undefined || data.soilHumidity !== undefined || data.lightLevel !== undefined || data.waterLevel !== undefined || data.ph !== undefined)) {
      addLog(`MSG: Datos de sensores recibidos de ${data.hardwareId}: ${jsonString}`);
      try {
        addLog(`API: Enviando a /api/ingest-sensor-data: ${JSON.stringify(data)}`);
        const response = await fetch('/api/ingest-sensor-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data), // Send the original data object
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || `Error ${response.status}`);
        addLog(`API: Datos de ${data.hardwareId} enviados al servidor: ${result.message}`);
      } catch (apiError: any) {
        addLog(`API ERR: Error enviando datos de ${data.hardwareId}: ${apiError.message}`);
        console.error("API Ingest Error:", apiError);
      }
    } else {
      addLog(`MSG WARN: Tipo de mensaje JSON desconocido o datos incompletos: ${jsonString}`);
    }
  }, [addLog, connectedDeviceHardwareId, setConnectedDeviceHardwareId]);

  const readLoop = useCallback(async (currentPortInstance: SerialPort) => {
    addLog("RL: Preparando para iniciar bucle de lectura...");
    textDecoder.current = new TextDecoderStream(); // Fresh decoder for each loop start
    lineBufferRef.current = ''; // Clear buffer at the start of each loop
    
    const readableStream = currentPortInstance.readable.pipeThrough(textDecoder.current);
    readableStreamClosedRef.current = readableStream.getReader();
    addLog("RL: Lector obtenido del TextDecoderStream. Iniciando bucle de lectura de strings...");

    try {
      while (keepReading.current) {
        const { value, done } = await readableStreamClosedRef.current.read();
        if (done) {
          if (!disconnectInitiatedRef.current) addLog("RL: Bucle finalizado (stream cerrado por 'done').");
          break;
        }
        if (value) {
          // addLog(`RL: Datos RAW recibidos: "${value.replace(/\n/g, '\\n')}"`);
          lineBufferRef.current += value;
          // addLog(`RL: Buffer actual: "${lineBufferRef.current.replace(/\n/g, '\\n')}"`);
          
          let newlineIndex;
          while ((newlineIndex = lineBufferRef.current.indexOf('\n')) >= 0) {
            let line = lineBufferRef.current.substring(0, newlineIndex).trim();
            lineBufferRef.current = lineBufferRef.current.substring(newlineIndex + 1);
            
            if (line) {
              // If we haven't identified the device yet (no hardwareId known),
              // be more stringent. Expect the first valid message to be a JSON object.
              if (!connectedDeviceHardwareId && (!line.startsWith('{') || !line.endsWith('}'))) {
                addLog(`RL: Potenciales datos iniciales corruptos (esperando JSON), descartando: "${line}"`);
                continue; // Skip this line and wait for a proper JSON object
              }
              // addLog(`RL: Línea extraída para procesar: "${line}"`);
              await processReceivedData(line);
            } else {
              // addLog("RL: Línea extraída vacía, ignorando.");
            }
            // addLog(`RL: Buffer restante post-extracción: "${lineBufferRef.current.replace(/\n/g, '\\n')}"`);
          }
        }
      }
    } catch (error: any) {
      if (!disconnectInitiatedRef.current && error.name !== 'AbortError' && error.name !== 'TypeError') { // Added TypeError to ignore as it might be part of normal disconnect
        addLog(`RL ERR: Error en el bucle de lectura: ${error.name} - ${error.message}`);
        console.error("RL ERR: Read loop error:", error);
      } else if (error.name === 'TypeError' && !disconnectInitiatedRef.current) {
        addLog(`RL INFO: TypeError durante la lectura, posiblemente desconexión: ${error.message}`);
      }
    } finally {
      addLog("RL: Ejecutando bloque finally del bucle de lectura.");
      if (readableStreamClosedRef.current) {
        // No es necesario llamar a releaseLock() explícitamente si cancel() lo hace, 
        // o si el stream se cerró normalmente.
        // Releasing lock here might be redundant if cancel was called or stream ended.
        readableStreamClosedRef.current = null; 
        addLog("RL: Lector del TextDecoderStream nullified en finally.");
      }
      addLog("RL: Bucle de lectura detenido completamente (finally ejecutado).");
      // Only auto-disconnect if not initiated by user/external event and still marked as connected
      if (!disconnectInitiatedRef.current && isConnected) {
         addLog("RL: Desconexión inesperada detectada en finally. Intentando limpieza.");
         internalDisconnectPortRef.current(false); // Attempt a cleanup if read loop ended unexpectedly
      }
    }
  }, [addLog, processReceivedData, connectedDeviceHardwareId, isConnected]);

  const connectPort = useCallback(async () => {
    disconnectInitiatedRef.current = false; 
    lineBufferRef.current = ''; // Clean buffer at the very start of connection attempt
    keepReading.current = true; 

    addLog("CONN: Intentando conectar...");
    if (port || writer) {
        addLog("CONN WARN: Puerto/escritor anterior existente. Realizando desconexión silenciosa primero.");
        await internalDisconnectPortRef.current(false); 
         // Brief pause to ensure resources are released system-wise
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (typeof window === 'undefined' || !("serial" in navigator)) {
      addLog("CONN ERR: API Web Serial no soportada o no es entorno de cliente.");
      toast({ title: "Error de Navegador", description: "Tu navegador no soporta la API Web Serial.", variant: "destructive" });
      setIsConnecting(false); // Ensure this is reset
      return;
    }
    if (isConnecting) { 
      addLog("CONN WARN: Conexión ya en progreso.");
      return;
    }

    setIsConnecting(true);
    addLog("CONN: Solicitando selección de puerto serial...");
    
    let selectedPort: SerialPort | null = null;
    try {
      selectedPort = await (navigator.serial as any).requestPort();
      await selectedPort.open({ baudRate: 9600 });
      setPort(selectedPort); 

      const portInformation = selectedPort.getInfo();
      const vid = portInformation.usbVendorId ? `0x${portInformation.usbVendorId.toString(16).padStart(4, '0')}` : 'N/A';
      const pid = portInformation.usbProductId ? `0x${portInformation.usbProductId.toString(16).padStart(4, '0')}` : 'N/A';
      const portLabel = `VID:${vid} PID:${pid}`;
      setPortInfo(portLabel);
      addLog(`CONN: Puerto ${portLabel} abierto.`);
      
      const currentWriter = selectedPort.writable.getWriter();
      setWriter(currentWriter); 
      setIsConnected(true);   
      addLog(`CONN: Conectado a puerto: ${portLabel}. Writer y estado de conexión establecidos.`);
      
      readLoop(selectedPort); 

      selectedPort.addEventListener('disconnect', () => {
        addLog(`EVT: Puerto ${portLabel} desconectado externamente.`);
        if (!disconnectInitiatedRef.current) { // Only toast if not already disconnecting
            toast({ title: "Dispositivo Desconectado", description: `El dispositivo ${portLabel} se ha desconectado.`, variant: "destructive"});
            internalDisconnectPortRef.current(false); 
        }
      });

    } catch (error: any) {
      if (error.name === 'NotFoundError' || error.name === 'AbortError') {
        addLog("CONN: Selección de puerto cancelada por usuario.");
      } else {
        addLog(`CONN ERR: Error al abrir/configurar puerto: ${error.message}`);
        console.error("CONN ERR: Error opening/configuring port:", error);
        toast({ title: "Error de Conexión", description: `No se pudo conectar: ${error.message}`, variant: "destructive" });
      }
      // Full cleanup if any part of connection fails
      await _internalDisconnectPort(false); // Ensures all states (port, writer, isConnected, connectedDeviceHardwareId) are reset
      setPort(null); setWriter(null); setIsConnected(false); setConnectedDeviceHardwareId(null); // Redundant but safe
    } finally {
      setIsConnecting(false); 
      addLog("CONN: Proceso de conexión finalizado (bloque finally).");
    }
  }, [addLog, toast, readLoop, port, writer, isConnecting, _internalDisconnectPort, user]);

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
        internalDisconnectPortRef.current(false); 
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      // Cleanup on component unmount
      if (port) {
        addLog("UNMOUNT: Componente desmontado, desconectando puerto...");
        internalDisconnectPortRef.current(false);
      }
    };
  }, [port, addLog]); 

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

