
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
  abort?: (reason?: any) => Promise<void>;
}

interface SerialReader {
  read: () => Promise<ReadableStreamReadResult<string>>;
  cancel: (reason?: any) => Promise<void>;
  releaseLock: () => void;
}

interface UsbConnectionContextType {
  port: SerialPort | null;
  writer: SerialWriter | null;
  isConnecting: boolean;
  isConnected: boolean;
  isHandshakeComplete: boolean;
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
  const [isHandshakeComplete, _setIsHandshakeComplete] = useState(false);
  const [portInfo, setPortInfo] = useState<string | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [connectedDeviceHardwareId, _setConnectedDeviceHardwareId] = useState<string | null>(null);

  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();

  // Refs para acceso inmediato sin race conditions
  const keepReading = useRef(true);
  const disconnectInitiatedRef = useRef(false);
  const textDecoderStreamRef = useRef<TransformStream<Uint8Array, string> | null>(null);
  const streamReaderRef = useRef<SerialReader | null>(null);
  const lineBufferRef = useRef('');
  const isHandshakeCompleteRef = useRef(false);
  const connectedDeviceHardwareIdRef = useRef<string | null>(null);
  
  // ✅ NUEVA: Queue para mensajes que llegan durante handshake
  const pendingMessagesRef = useRef<string[]>([]);
  const handshakeInProgressRef = useRef(false);

  const addLog = useCallback((message: string) => {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    const finalMessage = `${timeString}: ${message}`;
    setLogMessages(prev => [finalMessage, ...prev.slice(0, 499)]);
  }, []);

  const processReceivedDataInternal = useCallback(async (jsonString: string) => {
    addLog(`[DEBUG] Línea recibida: '${jsonString}'`);
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (error: any) {
      if (isHandshakeCompleteRef.current) {
        addLog(`PARSE ERR: Error parseando JSON: '${jsonString}'. Error: ${error.message}`);
      }
      return;
    }

    // ✅ PRIORIDAD ABSOLUTA: Handshake SIEMPRE se procesa primero
    if (data.type === 'hello_arduino' && data.hardwareId) {
      if (!isHandshakeCompleteRef.current) {
        handshakeInProgressRef.current = true;
        addLog(`HANDSHAKE: 'hello_arduino' recibido. Iniciando handshake para ${data.hardwareId}.`);
        
        // Establecimiento INMEDIATO del handshake
        connectedDeviceHardwareIdRef.current = data.hardwareId;
        isHandshakeCompleteRef.current = true;
        handshakeInProgressRef.current = false;
        
        _setConnectedDeviceHardwareId(data.hardwareId);
        _setIsHandshakeComplete(true);
        
        addLog(`HANDSHAKE: Hardware ID establecido. Ref=${connectedDeviceHardwareIdRef.current}, Progreso=${handshakeInProgressRef.current}`);
        
        // Procesar mensajes que llegaron durante el handshake
        if(pendingMessagesRef.current.length > 0) {
            addLog(`PENDING: Procesando ${pendingMessagesRef.current.length} mensajes pendientes post-handshake`);
            const messagesToProcess = [...pendingMessagesRef.current];
            pendingMessagesRef.current = [];
            for (const msg of messagesToProcess) {
                await processReceivedDataInternal(msg);
            }
        }
      } else {
        addLog(`MSG: 'hello_arduino' recibido de ${data.hardwareId} (post-handshake).`);
      }
      return;
    }

    // ✅ BUFFER: Si estamos en handshake, encolar mensaje
    if (handshakeInProgressRef.current) {
      addLog(`BUFFER: Mensaje encolado durante handshake: ${jsonString.substring(0, 100)}...`);
      pendingMessagesRef.current.push(jsonString);
      return;
    }

    // ✅ VALIDACIÓN: Esperar handshake completo
    if (!isHandshakeCompleteRef.current) {
      addLog(`MSG WARN: Mensaje ignorado, esperando handshake: ${jsonString}`);
      return;
    }

    // ✅ CONSISTENCIA: Usar SIEMPRE la referencia para validación
    const currentHardwareId = connectedDeviceHardwareIdRef.current;
    
    if (data.hardwareId && data.hardwareId !== currentHardwareId) {
      addLog(`MSG WARN: ID de hardware recibido (${data.hardwareId}) no coincide con el conectado (${currentHardwareId}). Ignorando.`);
      addLog(`[DEBUG] Estado refs - hwId: ${connectedDeviceHardwareIdRef.current}, handshake: ${isHandshakeCompleteRef.current}, progreso: ${handshakeInProgressRef.current}`);
      return;
    }

    const isSensorData = data.hardwareId && (
        data.temperature !== undefined ||
        data.airHumidity !== undefined ||
        data.soilHumidity !== undefined ||
        data.lightLevel !== undefined ||
        data.waterLevel !== undefined ||
        data.ph !== undefined ||
        data.drainageDistance !== undefined
    );

    if (isSensorData) {
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
        return;
    }

    if (data.type) {
        switch(data.type) {
            case "ack_interval_set":
              addLog(`MSG: ACK de intervalo recibido de ${currentHardwareId}. Nuevo intervalo: ${data.new_interval_ms} ms`);
              break;
            case "ack_photo_interval_set":
              addLog(`MSG: ACK de intervalo de foto recibido de ${currentHardwareId}. Nuevo intervalo: ${data.new_interval_hours} horas`);
              break;
            case "ack_temp_unit_set":
              addLog(`MSG: ACK de unidad de temperatura recibido de ${currentHardwareId}. Nueva unidad: ${data.new_unit}`);
              break;
            case "ack_auto_irrigation_set":
              addLog(`MSG: ACK de auto riego recibido de ${currentHardwareId}. Habilitado: ${data.enabled}, Umbral: ${data.threshold}%`);
              break;
            case "ack_auto_ventilation_set":
              addLog(`MSG: ACK de auto ventilación recibido de ${currentHardwareId}. Habilitado: ${data.enabled}, Temp On: ${data.temp_on}, Temp Off: ${data.temp_off}`);
              break;
            case "ack_led_set":
              addLog(`ACK: LED estado confirmado: ${data.state} por ${currentHardwareId}`);
              break;
            case 'ack_fan_set':
              addLog(`ACK: Ventilador estado confirmado: ${data.state} por ${currentHardwareId}`);
              break;
            case 'ack_valve_set':
              addLog(`ACK: Válvula estado confirmado: ${data.state} por ${currentHardwareId}`);
              break;
            case 'ack_auto_mode_set':
              addLog(`ACK: Modo automático activado para ${data.device} por ${currentHardwareId}`);
              break;
            case 'parse_error':
              addLog(`ARDUINO PARSE ERR: Arduino reportó un error de parseo. Input: '${data.raw_input}', Error: ${data.error}`);
              break;
            default:
                addLog(`MSG WARN: Tipo de mensaje con 'type' desconocido de ${currentHardwareId}: ${jsonString}`);
                break;
        }
        return;
    }
    
    addLog(`MSG WARN: Mensaje no reconocido o datos incompletos de ${currentHardwareId}: ${jsonString}`);

  }, [addLog]);

  const readLoop = useCallback(async (currentPortInstance: SerialPort) => {
    addLog("RL: Preparando para iniciar bucle de lectura...");
    keepReading.current = true;
    
    if (textDecoderStreamRef.current) {
        try {
           if (textDecoderStreamRef.current.writable?.locked) {
             await textDecoderStreamRef.current.writable.getWriter().close();
           }
        } catch (e) { addLog("RL WARN: Error cerrando TextDecoderStream anterior.");}
    }
    textDecoderStreamRef.current = new TextDecoderStream();
    lineBufferRef.current = '';

    if (currentPortInstance.readable.locked) {
        addLog("RL ERR: port.readable ya está bloqueado antes de pipeThrough. Abortando readLoop.");
        internalDisconnectPortRef.current(false);
        return;
    }

    const readableStream = currentPortInstance.readable.pipeThrough(textDecoderStreamRef.current);
    streamReaderRef.current = readableStream.getReader() as unknown as SerialReader;
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
              await processReceivedDataInternal(line);
            }
          }
        }
      }
    } catch (error: any) {
      if (!disconnectInitiatedRef.current && error.name !== 'AbortError' && error.name !== 'TypeError') {
        addLog(`RL ERR: Error en el bucle de lectura: ${error.name} - ${error.message}`);
        console.error("RL ERR: Read loop error:", error);
      } else if (error.name === 'TypeError' && !disconnectInitiatedRef.current) {
        addLog(`RL INFO: TypeError durante la lectura, posible desconexión abrupta: ${error.message}`);
      }
    } finally {
      addLog("RL: Ejecutando bloque finally del bucle de lectura.");
      if (streamReaderRef.current) {
        try {
            streamReaderRef.current.releaseLock();
        } catch (e) {
            // silent fail
        }
        streamReaderRef.current = null;
      }
      addLog("RL: Bucle de lectura detenido completamente (finally ejecutado).");
      if (!disconnectInitiatedRef.current && isConnected) {
         addLog("RL: Desconexión inesperada detectada en finally del bucle de lectura. Intentando limpieza.");
         internalDisconnectPortRef.current(false);
      }
    }
  }, [addLog, processReceivedDataInternal, isConnected]);

  const _internalDisconnectPort = useCallback(async (showToastUserInitiated = true) => {
    if (disconnectInitiatedRef.current && port === null) {
      addLog("DISC: Desconexión ya en progreso y puerto nulo, evitando reentrada.");
      return;
    }
    if (disconnectInitiatedRef.current && port !== null) {
       addLog("DISC WARN: Desconexión ya en progreso pero puerto no es nulo. Procediendo con cautela.");
    }

    disconnectInitiatedRef.current = true;
    addLog("DISC: Iniciando proceso de desconexión...");
    keepReading.current = false;

    // ✅ RESET: Limpiar estados de handshake
    handshakeInProgressRef.current = false;
    pendingMessagesRef.current = [];

    const currentReader = streamReaderRef.current;
    if (currentReader) {
      try {
        await currentReader.cancel();
        addLog("DISC: Lector (del TextDecoderStream) cancelado.");
      } catch (error: any) {
        if (error.name !== 'TypeError') {
            addLog(`DISC WARN: Error durante cancelación del lector: ${error.message}`);
        }
      }
      streamReaderRef.current = null;
    }
    
    const currentTextDecoderStream = textDecoderStreamRef.current;
    if (currentTextDecoderStream?.writable) {
        try {
            if (currentTextDecoderStream.writable.locked) {
                await currentTextDecoderStream.writable.abort().catch(e => addLog(`DISC WARN: Error abortando TextDecoderStream writable: ${e.message}`));
                addLog("DISC: TextDecoderStream writable abortado (o intento).");
            } else {
                 await currentTextDecoderStream.writable.getWriter().close().catch(e => addLog(`DISC WARN: Error cerrando TextDecoderStream writable: ${e.message}`));
                 addLog("DISC: TextDecoderStream writable cerrado (o intento).");
            }
        } catch (error: any) {
            addLog(`DISC WARN: Error manejando TextDecoderStream writable: ${error.message}`);
        }
    }
    textDecoderStreamRef.current = null;

    const currentWriter = writer;
    if (currentWriter) {
      try {
        if (typeof currentWriter.abort === 'function') {
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
        await currentPort.close();
        addLog("DISC: Puerto cerrado exitosamente.");
        if (showToastUserInitiated) {
          toast({ title: "Desconectado", description: "Puerto serial desconectado." });
        }
      } catch (error: any) {
         if (error.message && !error.message.includes("The port is already closed")) {
             addLog(`DISC ERR: Error al cerrar puerto: ${error.message}`);
             if (showToastUserInitiated) {
                toast({ title: "Error al Desconectar", description: error.message, variant: "destructive" });
             }
         } else {
            addLog("DISC INFO: Intento de cerrar puerto que ya estaba cerrado.");
         }
      }
      setPort(null);
    }
    
    lineBufferRef.current = '';
    setPortInfo(null);
    _setConnectedDeviceHardwareId(null);
    _setIsHandshakeComplete(false);
    connectedDeviceHardwareIdRef.current = null;
    isHandshakeCompleteRef.current = false;
    setIsConnected(false);
    setIsConnecting(false);
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
  
  const sendSerialCommand = useCallback(async (command: Record<string, any>) => {
    if (writer && isConnected && isHandshakeCompleteRef.current && !disconnectInitiatedRef.current) {
      addLog(`CMD_INTERNAL: Attempting to send. isConnected: ${isConnected}, writer available: ${!!writer}`);
      try {
        const commandString = JSON.stringify(command) + '\n';
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(commandString));
        addLog(`CMD: Comando enviado: ${JSON.stringify(command)}`);
      } catch (error: any) {
        addLog(`CMD ERR: Error enviando comando: ${error.message}. Desconectando.`);
        console.error("Error sending serial command, might be closed:", error);
        internalDisconnectPortRef.current(false);
      }
    } else {
      let reason = "";
      if (!writer) reason += "sin escritor; ";
      if (!isConnected) reason += "no conectado; ";
      if (!isHandshakeCompleteRef.current) reason += "handshake incompleto; ";
      if (disconnectInitiatedRef.current) reason += "desconexión iniciada; ";
      addLog(`CMD WARN: No se pudo enviar comando (pre-condición fallida): ${reason}`);
    }
  }, [writer, isConnected, addLog]);

  const fetchAndSyncDeviceConfiguration = useCallback(async (hardwareId: string) => {
    if (!user || !isAuthenticated) {
        addLog("SYNC ERR: No se puede sincronizar configuración: usuario no autenticado.");
        return;
    }
    addLog(`SYNC: Dispositivo Arduino (${hardwareId}). Obteniendo configuración...`);
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

  const connectPort = useCallback(async () => {
    disconnectInitiatedRef.current = false;
    lineBufferRef.current = '';
    
    _setIsHandshakeComplete(false);
    isHandshakeCompleteRef.current = false;
    handshakeInProgressRef.current = false;
    pendingMessagesRef.current = [];

    addLog("CONN: Intentando conectar...");
    setIsConnecting(true);
    setIsConnected(false);

    if (port) {
        addLog("CONN WARN: Puerto/escritor anterior existente. Realizando desconexión silenciosa primero.");
        await internalDisconnectPortRef.current(false);
        await new Promise(resolve => setTimeout(resolve, 250));
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
      await selectedPort.open({ baudRate: 9600 });
      setPort(selectedPort);

      const portInformation = selectedPort.getInfo();
      const vid = portInformation.usbVendorId ? `0x${portInformation.usbVendorId.toString(16).padStart(4, '0')}` : 'N/A';
      const pid = portInformation.usbProductId ? `0x${portInformation.usbProductId.toString(16).padStart(4, '0')}` : 'N/A';
      const portLabel = `VID:${vid} PID:${pid}`;
      setPortInfo(portLabel);
      addLog(`CONN: Puerto ${portLabel} abierto.`);
      
      if (selectedPort.writable.locked) {
          addLog("CONN ERR: selectedPort.writable está bloqueado INESPERADAMENTE antes de getWriter().");
          throw new Error("Port's writable stream is unexpectedly locked after open.");
      }
      const currentWriter = selectedPort.writable.getWriter();
      setWriter(currentWriter);

      setIsConnected(true);
      setIsConnecting(false);
      addLog(`CONN: Conectado a puerto: ${portLabel}. Writer y estado de conexión establecidos.`);
      
      const handleExternalDisconnect = () => {
        if (disconnectInitiatedRef.current) return;
        addLog(`EVT: Puerto ${portLabel} desconectado externamente (evento 'disconnect' del puerto).`);
        toast({ title: "Dispositivo Desconectado", description: `El dispositivo ${portLabel} se ha desconectado.`, variant: "destructive"});
        internalDisconnectPortRef.current(false);
      };
      
      selectedPort.addEventListener('disconnect', handleExternalDisconnect);

      readLoop(selectedPort);

    } catch (error: any) {
      let errorLogged = false;
      if (error.name === 'NotFoundError' || error.name === 'AbortError') {
        addLog("CONN: Selección de puerto cancelada por usuario.");
        errorLogged = true;
      } else if (error.name === 'InvalidStateError' && error.message.includes('The port is already open')) {
        addLog(`CONN ERR: El puerto ya está abierto. Esto puede indicar un problema de estado. Intentando desconexión completa.`);
        toast({ title: "Error de Conexión", description: "El puerto ya está abierto. Intente desconectar y reconectar.", variant: "destructive" });
        errorLogged = true;
        if(selectedPort) await selectedPort.close().catch(()=>{/*ignore*/});
        setPort(null);
      } else {
        addLog(`CONN ERR: Error al abrir/configurar puerto: ${error.message}`);
        console.error("CONN ERR: Error opening/configuring port:", error);
        toast({ title: "Error de Conexión", description: `No se pudo conectar: ${error.message}`, variant: "destructive" });
        errorLogged = true;
      }
      
      if (selectedPort && (!port || port !== selectedPort)) { 
          await selectedPort.close().catch(e => { if(!errorLogged) addLog(`CONN ERR CLEANUP: Error cerrando selectedPort: ${e.message}`);});
      } else if (port) {
          await internalDisconnectPortRef.current(false);
      }
      
      setPort(null); setWriter(null); setIsConnected(false); _setConnectedDeviceHardwareId(null);
      setIsConnecting(false);
    }
  }, [addLog, toast, readLoop, port, internalDisconnectPortRef]);

  useEffect(() => {
    addLog(`SYNC_EFFECT: Triggered. hwId: ${connectedDeviceHardwareId}, writer: ${!!writer}, connected: ${isConnected}, user: ${!!user}`);
    if (connectedDeviceHardwareId && writer && isConnected && user && isAuthenticated) {
      addLog(`SYNC_EFFECT: Condiciones cumplidas para ${connectedDeviceHardwareId}. Llamando a fetchAndSyncDeviceConfiguration.`);
      fetchAndSyncDeviceConfiguration(connectedDeviceHardwareId);
    } else {
        let reason = "";
        if (!connectedDeviceHardwareId) reason += "no hardwareId; ";
        if (!writer) reason += "no writer; ";
        if (!isConnected) reason += "not connected; ";
        if (!user || !isAuthenticated) reason += "no user; ";
        addLog(`SYNC_EFFECT: Condiciones NO cumplidas. Razón: ${reason}`);
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
        keepReading.current = false;
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      if (port) { 
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
        isHandshakeComplete,
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
