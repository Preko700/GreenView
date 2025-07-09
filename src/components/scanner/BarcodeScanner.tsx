"use client";

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Camera, CameraOff, Loader2 } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function BarcodeScanner({ onScan, onError, className }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  const checkCameraPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      return false;
    }
  };

  const startScanning = async () => {
    if (!videoRef.current) return;

    try {
      setIsScanning(true);
      
      // Check camera permission
      const hasPermission = await checkCameraPermission();
      if (!hasPermission) {
        setHasPermission(false);
        onError?.('Camera permission denied. Please allow camera access to scan barcodes.');
        setIsScanning(false);
        return;
      }
      
      setHasPermission(true);

      // Initialize the reader
      if (!readerRef.current) {
        readerRef.current = new BrowserMultiFormatReader();
      }

      // Start scanning
      await readerRef.current.decodeFromVideoDevice(
        undefined, // Use default camera
        videoRef.current,
        (result, error) => {
          if (result) {
            onScan(result.getText());
            stopScanning();
          }
          if (error && error.name !== 'NotFoundException') {
            console.error('Scanner error:', error);
          }
        }
      );
    } catch (error) {
      console.error('Failed to start scanning:', error);
      onError?.('Failed to start camera. Please make sure your camera is available and not being used by another application.');
      setIsScanning(false);
    }
  };

  const stopScanning = () => {
    if (readerRef.current) {
      readerRef.current.reset();
    }
    setIsScanning(false);
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Barcode Scanner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <video
            ref={videoRef}
            className="w-full h-64 bg-black rounded-lg object-cover"
            style={{ display: isScanning ? 'block' : 'none' }}
          />
          {!isScanning && (
            <div className="w-full h-64 bg-muted rounded-lg flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Camera className="h-12 w-12 mx-auto mb-2" />
                <p>Camera preview will appear here</p>
              </div>
            </div>
          )}
        </div>

        {hasPermission === false && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
            Camera permission is required to scan barcodes. Please allow camera access and try again.
          </div>
        )}

        <div className="flex gap-2">
          {!isScanning ? (
            <Button onClick={startScanning} className="flex-1">
              <Camera className="mr-2 h-4 w-4" />
              Start Scanning
            </Button>
          ) : (
            <Button onClick={stopScanning} variant="outline" className="flex-1">
              <CameraOff className="mr-2 h-4 w-4" />
              Stop Scanning
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Position a barcode in front of your camera to scan it automatically.
        </div>
      </CardContent>
    </Card>
  );
}