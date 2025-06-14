
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Zap, XCircle, CheckCircle, Usb } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface SensorPayload {
  hardwareId: string;
  temperature?: number;
  airHumidity?: number;
  soilHumidity?: number;
  lightLevel?: number;
  waterLevel?: number; // 0 for LOW, 1 for HIGH
  // Add other sensor types if your Arduino sends them
}

export function UsbDeviceConnector() {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [port, setPort] = useState<SerialPort | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<string> | null>(null);
  const keepReadingRef = useRef(true);
  const textDecoderRef = useRef(new TextDecoderStream());
  const textEncoderRef = useRef(new TextEncoderStream());


  const addLog = useCallback((message: string) => {
    console.log('[UsbDeviceConnector]', message);
    setLogMessages(prev => [...prev.slice(-100), `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

  const handleConnect = async () => {
    if (!navigator.serial) {
      addLog("Web Serial API no es soportada por este navegador.");
      toast({ title: "Error de Navegador", description: "La API Web Serial no es compatible con tu navegador. Prueba con Chrome o Edge.", variant: "destructive" });
      return;
    }

    setIsConnecting(true);
    addLog("Solicitando selección de puerto serial...");
    try {
      const serialPort = await navigator.serial.requestPort();
      await serialPort.open({ baudRate: 9600 }); // Asegúrate que el baudRate coincida con tu Arduino Serial.begin()

      setPort(serialPort);
      setIsConnected(true);
      addLog(`Conectado a puerto: ${serialPort.getInfo().usbVendorId}:${serialPort.getInfo().usbProductId}`);
      toast({ title: "Dispositivo Conectado", description: "Conexión serial establecida." });

      // Pipe through TextDecoderStream and TextEncoderStream
      if (serialPort.readable && serialPort.writable) {
        serialPort.readable.pipeTo(textDecoderRef.current.writable);
        textEncoderRef.current.readable.pipeTo(serialPort.writable);
        
        readerRef.current = textDecoderRef.current.readable.getReader();
        writerRef.current = textEncoderRef.current.writable.getWriter();
        keepReadingRef.current = true;
        readLoop();
      } else {
        throw new Error("El puerto serial no es leíble o escribible.");
      }

    } catch (error: any) {
      addLog(`Error al conectar: ${error.message}`);
      toast({ title: "Error de Conexión", description: error.message, variant: "destructive" });
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const readLoop = async () => {
    addLog("Iniciando bucle de lectura...");
    while (port?.readable && readerRef.current && keepReadingRef.current) {
      try {
        const { value, done } = await readerRef.current.read();
        if (done) {
          addLog("Lector cerrado.");
          readerRef.current.releaseLock();
          break;
        }
        if (value) {
          addLog(`Datos recibidos: ${value.trim()}`);
          processReceivedData(value.trim());
        }
      } catch (error: any) {
        addLog(`Error en bucle de lectura: ${error.message}`);
        // Esto puede ocurrir si el dispositivo se desconecta
        await handleDisconnect(false); // No re-toast, ya se logueó el error
        break;
      }
    }
    addLog("Bucle de lectura terminado.");
  };
  
  const processReceivedData = async (jsonData: string) => {
    try {
      const data: SensorPayload = JSON.parse(jsonData);
      if (!data.hardwareId) {
        addLog("Dato JSON recibido sin hardwareId. Descartando.");
        return;
      }
      addLog(`Datos parseados para ${data.hardwareId}: Temp=${data.temperature}, AirHum=${data.airHumidity}, SoilHum=${data.soilHumidity}, Light=${data.lightLevel}, WaterLvl=${data.waterLevel}`);

      // Enviar a la API de ingestión
      const response = await fetch('/api/ingest-sensor-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data), // La API /api/ingest-sensor-data espera un objeto o un array de objetos con esta estructura
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Error al enviar datos al servidor');
      }
      addLog(`Datos enviados al servidor para ${data.hardwareId}: ${result.message}`);

    } catch (error: any) {
      addLog(`Error procesando datos JSON: ${error.message}. Datos recibidos: "${jsonData}"`);
    }
  };


  const handleDisconnect = async (showToastNotification = true) => {
    keepReadingRef.current = false;

    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
        // readerRef.current.releaseLock(); // releaseLock es llamado automáticamente por cancel() o cuando done es true
      } catch (error: any) {
        addLog(`Error al cancelar lector: ${error.message}`);
      }
    }
    readerRef.current = null;
    
    if (writerRef.current) {
        try {
            // No hay un método 'cancel' directo en WritableStreamDefaultWriter como en ReadableStreamDefaultReader.
            // Se puede intentar cerrar o abortar el writable stream del puerto si es necesario,
            // pero simplemente liberar el lock y cerrar el puerto suele ser suficiente.
            await writerRef.current.close(); // o writerRef.current.abort() si es más apropiado
        } catch (error: any) {
            addLog(`Error al cerrar escritor: ${error.message}`);
        }
    }
    writerRef.current = null;


    if (port) {
      try {
        await port.close();
        addLog("Puerto serial cerrado.");
      } catch (error: any) {
        addLog(`Error al cerrar puerto: ${error.message}`);
      }
    }
    
    setPort(null);
    setIsConnected(false);
    setIsConnecting(false);
    if (showToastNotification) {
        toast({ title: "Dispositivo Desconectado", description: "Conexión serial terminada." });
    }
     // Re-initialize TextDecoderStream and TextEncoderStream for next connection
    textDecoderRef.current = new TextDecoderStream();
    textEncoderRef.current = new TextEncoderStream();
  };
  
  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (isConnected || port) {
        handleDisconnect(false);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, port]);


  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Usb className="mr-2 h-6 w-6 text-primary" />
          Conectar Dispositivo USB (Experimental)
        </CardTitle>
        <CardDescription>
          Conecta tu Arduino u otro dispositivo serial para enviar datos de sensores directamente.
          Asegúrate que tu dispositivo envíe datos JSON por línea, incluyendo un `hardwareId`.
          Ej: `{"hardwareId": "TU_HW_ID", "temperature": 25.5, ...}`
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-4">
          {!isConnected ? (
            <Button onClick={handleConnect} disabled={isConnecting || isConnected}>
              {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Conectar Dispositivo
            </Button>
          ) : (
            <Button onClick={() => handleDisconnect()} variant="destructive">
              <XCircle className="mr-2 h-4 w-4" />
              Desconectar Dispositivo
            </Button>
          )}
          <Badge variant={isConnected ? "default" : "secondary"} className={isConnected ? "bg-green-600 hover:bg-green-700 text-white" : ""}>
            {isConnected ? <CheckCircle className="mr-1 h-4 w-4" /> : <XCircle className="mr-1 h-4 w-4" />}
            {isConnecting ? "Conectando..." : isConnected ? "Conectado" : "Desconectado"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
            El `hardwareId` enviado por tu dispositivo USB debe coincidir con el `Hardware Identifier` de un dispositivo registrado en GreenView.
            Puedes ver el `Hardware Identifier` en la base de datos (`greenview.db`, tabla `devices`) después de registrar un dispositivo en la app.
        </p>

        <Label htmlFor="serial-log">Log de Conexión Serial:</Label>
        <ScrollArea id="serial-log" className="h-40 w-full rounded-md border p-2 text-xs">
          {logMessages.length === 0 && <p className="text-muted-foreground">Esperando actividad...</p>}
          {logMessages.map((msg, index) => (
            <div key={index} className="font-mono">{msg}</div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
