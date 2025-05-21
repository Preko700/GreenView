import type { SensorData, SensorType } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Thermometer, Droplets, Wind, Sun, Waves, Leaf, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SensorDisplayCardProps {
  sensorData: SensorData | null | undefined;
  sensorType: SensorType;
  className?: string;
}

const sensorMeta: Record<SensorType, { name: string; icon: React.ElementType; defaultUnit?: string }> = {
  [SensorType.TEMPERATURE]: { name: 'Temperature', icon: Thermometer, defaultUnit: '°C' },
  [SensorType.AIR_HUMIDITY]: { name: 'Air Humidity', icon: Droplets, defaultUnit: '%' },
  [SensorType.SOIL_HUMIDITY]: { name: 'Soil Humidity', icon: Leaf, defaultUnit: '%' },
  [SensorType.PH]: { name: 'Soil pH', icon: TrendingUp, defaultUnit: '' }, // Using TrendingUp as PH placeholder
  [SensorType.LIGHT]: { name: 'Light Intensity', icon: Sun, defaultUnit: 'lux' },
  [SensorType.WATER_LEVEL]: { name: 'Water Level', icon: Waves, defaultUnit: '%' },
  [SensorType.DRAINAGE]: { name: 'Drainage', icon: Wind, defaultUnit: '' }, // Using Wind for drainage placeholder
};


export function SensorDisplayCard({ sensorData, sensorType, className }: SensorDisplayCardProps) {
  const meta = sensorMeta[sensorType];
  const Icon = meta.icon;
  const value = sensorData?.value ?? '--';
  const unit = sensorData?.unit ?? meta.defaultUnit ?? '';

  return (
    <Card className={cn("shadow-lg hover:shadow-xl transition-shadow", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{meta.name}</CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {value}{unit && <span>{unit}</span>}
        </div>
        {sensorData?.timestamp && (
          <p className="text-xs text-muted-foreground pt-1">
            Last updated: {new Date(sensorData.timestamp).toLocaleTimeString()}
          </p>
        )}
         {!sensorData && (
          <p className="text-xs text-muted-foreground pt-1">
            No data available
          </p>
        )}
      </CardContent>
    </Card>
  );
}

