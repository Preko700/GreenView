
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
  abort?: (reason?: any) => Promise<void>; // Added abort for more robust writer closure
}

interface SerialReader { // Defined interface for reader
  read: () => Promise<ReadableStreamReadResult<string>>;
  cancel: (reason?: any) => Promise<void>;
  releaseLock: () => void;
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
  const textDecoderStreamRef = useRef<TransformStream<Uint8Array, string> | null>(null);
  const streamReaderRef = useRef<SerialReader | null>(null);
  const lineBufferRef = useRef('');

  const addLog = useCallback((message: string) => {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    const finalMessage = `${timeString}: ${message}`;
    setLogMessages(prev => [finalMessage, ...prev.slice(0, 499)]);
  }, []);

  const _internalDisconnectPort = useCallback(async (showToastUserInitiated = true) => {
    if (disconnectInitiatedRef.current) {
      addLog("DISC: Desconexión ya en progreso, evitando reentrada.");
      return;
    }
    disconnectInitiatedRef.current = true;
    addLog("DISC: Iniciando proceso de desconexión...");
    keepReading.current = false;

    const currentReader = streamReaderRef.current;
    if (currentReader) {
      try {
        // streamReaderRef.current.releaseLock(); // Reader from pipeThrough doesn't have releaseLock directly
        await currentReader.cancel();
        addLog("DISC: Lector cancelado.");
      } catch (error: any) {
        addLog(`DISC WARN: Error durante cancelación del lector: ${error.message}`);
      }
      streamReaderRef.current = null;
    }
    
    // Close TextDecoderStream explicitly if it exists
    if (textDecoderStreamRef.current?.writable?.locked) {
        try {
            await textDecoderStreamRef.current.writable.getWriter().close();
            addLog("DISC: TextDecoderStream writable cerrado.");
        } catch (error: any) {
            addLog(`DISC WARN: Error cerrando TextDecoderStream writable: ${error.message}`);
        }
    }
    textDecoderStreamRef.current = null;


    const currentWriter = writer;
    if (currentWriter) {
      try {
        if (typeof currentWriter.abort === 'function') { // Check if abort is available
          await currentWriter.abort();
          addLog("DISC: Escritor abortado.");
        } else {
          await currentWriter.close();
          addLog("DISC: Escritor cerrado.");
        }
      } catch (error: any) {
        addLog(`DISC WARN: Error manejando escritor: ${error.message}`);
      }
      setWriter(null);
    }

    const currentPort = port;
    if (currentPort) {
      try {
        // Remove event listener to prevent trying to disconnect again if 'disconnect' event fires during this process
        // This needs a reference to the exact listener function if we were to use it.
        // currentPort.removeEventListener('disconnect', handleExternalDisconnectRef.current);
        await currentPort.close();
        addLog("DISC: Puerto cerrado exitosamente.");
        if (showToastUserInitiated) {
          toast({ title: "Desconectado", description: "Puerto serial desconectado." });
        }
      } catch (error: any) {
        addLog(`DISC ERR: Error al cerrar puerto: ${error.message}`);
        if (showToastUserInitiated) {
           toast({ title: "Error al Desconectar", description: error.message, variant: "destructive" });
        }
      }
      setPort(null);
    }
    
    lineBufferRef.current = '';
    setPortInfo(null);
    setConnectedDeviceHardwareId(null);
    setIsConnected(false);
    setIsConnecting(false); // Ensure this is also reset
    disconnectInitiatedRef.current = false;
    addLog("DISC: Estado de conexión reseteado post-desconexión.");
  }, [addLog, toast, port, writer]);

  const internalDisconnectPortRef = useRef(_internalDisconnectPort);
  useEffect(() => {
    internalDisconnectPortRef.current = _internalDisconnectPort;
  }, [_internalDisconnectPort]);

  const disconnectPort = useCallback((showToastUserInitiated = true) => {
    internalDisconnectPortRef.current(showToastUserInitiated);
  }, []);
  
  const handleExternalDisconnectRef = useRef<(() => void) | null>(null);


  const sendSerialCommand = useCallback(async (command: Record<string, any>) => {
    const currentWriter = writer;
    if (currentWriter && isConnected && !disconnectInitiatedRef.current && port?.writable && !port.writable.locked) {
      try {
        const commandString = JSON.stringify(command) + '\n';
        const encoder = new TextEncoder();
        await currentWriter.write(encoder.encode(commandString));
        addLog(`CMD: Comando enviado: ${JSON.stringify(command)}`);
      } catch (error: any) {
        addLog(`CMD ERR: Error enviando comando: ${error.message}. desconectando.`);
        console.error("Error sending serial command, might be closed:", error);
        internalDisconnectPortRef.current(false); // Disconnect if write fails
      }
    } else {
      let reason = "";
      if (!currentWriter) reason += "sin escritor; ";
      if (!isConnected) reason += "no conectado; ";
      if (disconnectInitiatedRef.current) reason += "desconexión iniciada; ";
      if (port?.writable?.locked) reason += "puerto bloqueado; ";
      addLog(`CMD WARN: No se pudo enviar comando: ${reason}`);
    }
  }, [writer, isConnected, port, addLog]);

  const fetchAndSyncDeviceConfiguration = useCallback(async (hardwareId: string) => {
    if (!user || !isAuthenticated) {
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
  }, [sendSerialCommand, addLog, user, isAuthenticated]);
  
  const processReceivedData = useCallback(async (jsonString: string) => {
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (error: any) {
      addLog(`PARSE ERR: Error parseando JSON: '${jsonString}'. Error: ${error.message}`);
      return;
    }

    let currentHwId = connectedDeviceHardwareId;

    if (data.hardwareId && !currentHwId) {
      setConnectedDeviceHardwareId(data.hardwareId);
      currentHwId = data.hardwareId; // Update local copy for this function run
      addLog(`PARSE: Hardware ID establecido a ${data.hardwareId} desde mensaje: ${jsonString}`);
    } else if (data.hardwareId && data.hardwareId !== currentHwId) {
      addLog(`PARSE WARN: ID de hardware recibido (${data.hardwareId}) no coincide con el conectado (${currentHwId}). Ignorando mensaje: ${jsonString}`);
      return;
    } else if (!data.hardwareId && currentHwId) {
      data.hardwareId = currentHwId; // Add current hardwareId if message doesn't have one
      addLog(`PARSE: Mensaje sin hardwareId explícito. Usando el conectado (${currentHwId}). JSON: ${jsonString}`);
    } else if (!data.hardwareId && !currentHwId) {
      addLog(`PARSE WARN: Sin hardwareId conectado y mensaje sin ID. Imposible procesar: ${jsonString}`);
      return;
    }
    
    const displayHardwareId = data.hardwareId || "desconocido";

    if (data.type === "hello_arduino") {
      addLog(`MSG: 'hello_arduino' recibido de ${displayHardwareId}`);
    } else if (data.type === "ack_interval_set") {
      addLog(`MSG: ACK de intervalo recibido de ${displayHardwareId}. Nuevo intervalo: ${data.new_interval_ms} ms`);
    } else if (data.type === "ack_photo_interval_set") {
      addLog(`MSG: ACK de intervalo de foto recibido de ${displayHardwareId}. Nuevo intervalo: ${data.new_interval_hours} horas`);
    } else if (data.type === "ack_temp_unit_set") {
      addLog(`MSG: ACK de unidad de temperatura recibido de ${displayHardwareId}. Nueva unidad: ${data.new_unit}`);
    } else if (data.type === "ack_auto_irrigation_set") {
      addLog(`MSG: ACK de auto riego recibido de ${displayHardwareId}. Habilitado: ${data.enabled}, Umbral: ${data.threshold}%`);
    } else if (data.type === "ack_auto_ventilation_set") {
      addLog(`MSG: ACK de auto ventilación recibido de ${displayHardwareId}. Habilitado: ${data.enabled}, Temp On: ${data.temp_on}, Temp Off: ${data.temp_off}`);
    } else if (data.hardwareId && (data.temperature !== undefined || data.airHumidity !== undefined || data.soilHumidity !== undefined || data.lightLevel !== undefined || data.waterLevel !== undefined || data.ph !== undefined)) {
      addLog(`MSG: Datos de sensores recibidos de ${displayHardwareId}: ${jsonString}`);
      try {
        addLog(`API: Enviando a /api/ingest-sensor-data: ${JSON.stringify(data)}`);
        const response = await fetch('/api/ingest-sensor-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data), // data already includes hardwareId
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || `Error ${response.status}`);
        addLog(`API: Datos de ${displayHardwareId} enviados al servidor: ${result.message}`);
      } catch (apiError: any) {
        addLog(`API ERR: Error enviando datos de ${displayHardwareId}: ${apiError.message}`);
        console.error("API Ingest Error:", apiError);
      }
    } else {
      addLog(`MSG WARN: Tipo de mensaje JSON desconocido o datos incompletos de ${displayHardwareId}: ${jsonString}`);
    }
  }, [addLog, connectedDeviceHardwareId, setConnectedDeviceHardwareId]); // Added setConnectedDeviceHardwareId

  const readLoop = useCallback(async (currentPortInstance: SerialPort) => {
    addLog("RL: Preparando para iniciar bucle de lectura...");
    keepReading.current = true; // Ensure this is true at the start of a new loop
    
    if (textDecoderStreamRef.current) { // Close any existing TextDecoderStream
        try {
           if (textDecoderStreamRef.current.writable.locked) {
             await textDecoderStreamRef.current.writable.getWriter().close();
           }
        } catch (e) { addLog("RL WARN: Error cerrando TextDecoderStream anterior.");}
    }
    textDecoderStreamRef.current = new TextDecoderStream();
    lineBufferRef.current = '';

    const readableStream = currentPortInstance.readable.pipeThrough(textDecoderStreamRef.current);
    streamReaderRef.current = readableStream.getReader() as unknown as SerialReader; // Cast to SerialReader
    addLog("RL: Lector obtenido del TextDecoderStream. Iniciando bucle de lectura de strings...");

    try {
      while (keepReading.current) {
        const { value, done } = await streamReaderRef.current.read();
        if (done) {
          if (!disconnectInitiatedRef.current) addLog("RL: Bucle finalizado (stream cerrado por 'done').");
          break;
        }
        if (value) {
          lineBufferRef.current += value;
          let newlineIndex;
          while ((newlineIndex = lineBufferRef.current.indexOf('\n')) >= 0) {
            let line = lineBufferRef.current.substring(0, newlineIndex).trim();
            lineBufferRef.current = lineBufferRef.current.substring(newlineIndex + 1);
            
            if (line) {
              // Initial data filtering, improved
              if (!connectedDeviceHardwareId && (!line.startsWith('{') || !line.endsWith('}'))) {
                addLog(`RL: Potenciales datos iniciales corruptos (esperando JSON), descartando: "${line}"`);
                continue; 
              }
              await processReceivedData(line);
            }
          }
        }
      }
    } catch (error: any) {
      if (!disconnectInitiatedRef.current && error.name !== 'AbortError' && error.name !== 'TypeError') {
        addLog(`RL ERR: Error en el bucle de lectura: ${error.name} - ${error.message}`);
        console.error("RL ERR: Read loop error:", error);
      } else if (error.name === 'TypeError' && !disconnectInitiatedRef.current) {
        // This TypeError might be "Cannot read properties of null (reading 'readable')" if port is closed abruptly
        addLog(`RL INFO: TypeError durante la lectura, posible desconexión: ${error.message}`);
      }
    } finally {
      addLog("RL: Ejecutando bloque finally del bucle de lectura.");
      if (streamReaderRef.current) {
        try {
            streamReaderRef.current.releaseLock(); // Release lock before nullifying
        } catch (e) {
            addLog("RL WARN: Error liberando lock del lector en finally.");
        }
        streamReaderRef.current = null;
        addLog("RL: Lector del TextDecoderStream nullified en finally.");
      }
      addLog("RL: Bucle de lectura detenido completamente (finally ejecutado).");
      if (!disconnectInitiatedRef.current && isConnected) { // Check isConnected state as well
         addLog("RL: Desconexión inesperada detectada en finally. Intentando limpieza.");
         internalDisconnectPortRef.current(false);
      }
    }
  }, [addLog, processReceivedData, connectedDeviceHardwareId, isConnected]);

  const connectPort = useCallback(async () => {
    disconnectInitiatedRef.current = false;
    lineBufferRef.current = '';

    addLog("CONN: Intentando conectar...");
    setIsConnecting(true);
    setIsConnected(false); // Explicitly set not connected during connection attempt

    // If a port object exists (even if not 'open' in browser terms), try to clean it up.
    if (port) {
        addLog("CONN WARN: Puerto/escritor anterior existente. Realizando desconexión silenciosa primero.");
        await internalDisconnectPortRef.current(false);
        await new Promise(resolve => setTimeout(resolve, 250)); // Increased pause for system resource release
    }
    
    if (typeof window === 'undefined' || !("serial" in navigator)) {
      addLog("CONN ERR: API Web Serial no soportada o no es entorno de cliente.");
      toast({ title: "Error de Navegador", description: "Tu navegador no soporta la API Web Serial.", variant: "destructive" });
      setIsConnecting(false);
      return;
    }

    addLog("CONN: Solicitando selección de puerto serial...");
    
    let selectedPort: SerialPort | null = null;
    try {
      selectedPort = await (navigator.serial as any).requestPort();
      // At this point, selectedPort is the port chosen by the user.
      // Check if it's the *same* port object as the one we might already have (unlikely due to above cleanup)
      // or if it's a new selection.

      await selectedPort.open({ baudRate: 9600 }); // This is where "port already open" can occur
      setPort(selectedPort);

      const portInformation = selectedPort.getInfo();
      const vid = portInformation.usbVendorId ? `0x${portInformation.usbVendorId.toString(16).padStart(4, '0')}` : 'N/A';
      const pid = portInformation.usbProductId ? `0x${portInformation.usbProductId.toString(16).padStart(4, '0')}` : 'N/A';
      const portLabel = `VID:${vid} PID:${pid}`;
      setPortInfo(portLabel);
      addLog(`CONN: Puerto ${portLabel} abierto.`);
      
      const currentWriter = selectedPort.writable.getWriter();
      setWriter(currentWriter);
      setIsConnected(true); // Set connected only after port is open and writer is obtained
      setIsConnecting(false); // Connection attempt finished
      addLog(`CONN: Conectado a puerto: ${portLabel}. Writer y estado de conexión establecidos.`);
      
      // Define the handler function for external disconnects
      const handleExternalDisconnect = () => {
        if (disconnectInitiatedRef.current) return; // Already handling disconnect
        addLog(`EVT: Puerto ${portLabel} desconectado externamente (evento 'disconnect' del puerto).`);
        toast({ title: "Dispositivo Desconectado", description: `El dispositivo ${portLabel} se ha desconectado.`, variant: "destructive"});
        internalDisconnectPortRef.current(false); // Call internal disconnect without user toast
      };
      handleExternalDisconnectRef.current = handleExternalDisconnect; // Store it for removal
      selectedPort.addEventListener('disconnect', handleExternalDisconnect);

      readLoop(selectedPort);

    } catch (error: any) {
      if (error.name === 'NotFoundError' || error.name === 'AbortError') {
        addLog("CONN: Selección de puerto cancelada por usuario.");
      } else if (error.name === 'InvalidStateError' && error.message.includes('The port is already open')) {
        addLog(`CONN ERR: El puerto ya está abierto. Esto puede indicar un problema de estado. Intentando usar el puerto existente si es el mismo.`);
        // If 'selectedPort' is the same instance as 'port' state, we might be able to recover.
        // However, requestPort() usually returns a new object proxy.
        // Best to ensure full cleanup.
        toast({ title: "Error de Conexión", description: "El puerto ya está abierto. Intente desconectar y reconectar.", variant: "destructive" });
      } else {
        addLog(`CONN ERR: Error al abrir/configurar puerto: ${error.message}`);
        console.error("CONN ERR: Error opening/configuring port:", error);
        toast({ title: "Error de Conexión", description: `No se pudo conectar: ${error.message}`, variant: "destructive" });
      }
      // Ensure cleanup if any part of connection failed
      if (selectedPort) { // If requestPort succeeded but open/setup failed
          await internalDisconnectPortRef.current(false); // Clean up the selectedPort
      } else { // If requestPort itself failed or was cancelled
          setPort(null); setWriter(null); setIsConnected(false); setConnectedDeviceHardwareId(null);
      }
      setIsConnecting(false); // Ensure this is always reset
    }
  }, [addLog, toast, readLoop, port, internalDisconnectPortRef]);

  useEffect(() => {
    if (connectedDeviceHardwareId && writer && isConnected && user && isAuthenticated) {
      addLog(`SYNC_EFFECT: Condiciones cumplidas para ${connectedDeviceHardwareId}. Llamando a fetchAndSyncDeviceConfiguration.`);
      fetchAndSyncDeviceConfiguration(connectedDeviceHardwareId);
    }
  }, [connectedDeviceHardwareId, writer, isConnected, user, isAuthenticated, fetchAndSyncDeviceConfiguration, addLog]);

  const resyncConfiguration = useCallback(async (hardwareId: string) => {
    addLog(`RESYNC: Solicitado para ${hardwareId}. writer: ${!!writer}, connected: ${isConnected}, user: ${!!user}`);
    if (isConnected && writer && hardwareId && user && isAuthenticated) {
      await fetchAndSyncDeviceConfiguration(hardwareId);
    } else {
      addLog(`RESYNC WARN: No se puede re-sincronizar. Condiciones no cumplidas.`);
    }
  }, [isConnected, writer, user, isAuthenticated, fetchAndSyncDeviceConfiguration, addLog]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (port && isConnected) {
        addLog("UNLOAD: Descarga de página detectada, desconectando puerto...");
        // For beforeunload, synchronous operations are very limited.
        // We can't reliably await async disconnect here.
        // The browser might close the port itself.
        // Best effort: signal the readLoop to stop.
        keepReading.current = false;
        // Consider a synchronous alert if data loss is critical, but usually not recommended.
        // event.preventDefault(); // To show a confirmation dialog (requires returnValue set)
        // event.returnValue = ''; // For Chrome
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      // Cleanup when the provider unmounts (e.g., app closes or context is removed)
      if (port) { // Check if port was ever set
        addLog("UNMOUNT: Componente UsbConnectionProvider desmontado, desconectando puerto...");
        internalDisconnectPortRef.current(false);
      }
    };
  }, [port, isConnected, addLog]);

  useEffect(() => {
    if (!isAuthenticated && isConnected) {
        addLog("AUTH: Usuario desautenticado, desconectando puerto...");
        disconnectPort(false);
    }
  }, [isAuthenticated, isConnected, disconnectPort, addLog]);

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
