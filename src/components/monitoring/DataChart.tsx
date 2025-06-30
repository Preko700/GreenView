
"use client";

import { useMemo } from 'react';
import type { SensorData, SensorType as AppSensorType } from '@/lib/types'; // Renamed SensorType to AppSensorType to avoid conflict with component prop name
import { SensorType } from '@/lib/types'; // Added explicit import
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CartesianGrid, Line, LineChart as RechartsLineChart, XAxis, YAxis } from "recharts";
import { format } from 'date-fns';

interface DataChartProps {
  sensorData: SensorData[];
  sensorType: AppSensorType; // Use the renamed type
  title?: string;
}

const sensorTypeToFriendlyName: Record<AppSensorType, string> = {
  [SensorType.TEMPERATURE]: "Temperature",
  [SensorType.AIR_HUMIDITY]: "Air Humidity",
  [SensorType.SOIL_HUMIDITY]: "Soil Humidity",
  [SensorType.PH]: "pH Level",
  [SensorType.LIGHT]: "Light Intensity",
  [SensorType.WATER_LEVEL]: "Water Level",
  [SensorType.DRAINAGE]: "Drainage Distance",
};

export function DataChart({ sensorData, sensorType, title }: DataChartProps) {
  const chartData = useMemo(() => {
    return sensorData
      .sort((a, b) => a.timestamp - b.timestamp) // Ensure data is sorted by time
      .map(data => ({
        time: format(new Date(data.timestamp), "HH:mm"), // Format timestamp for X-axis
        value: data.value,
        fullDate: format(new Date(data.timestamp), "MMM d, HH:mm")
      }));
  }, [sensorData]);

  const chartConfig = {
    value: {
      label: sensorTypeToFriendlyName[sensorType] || "Value",
      color: "hsl(var(--chart-1))",
    },
  } satisfies ChartConfig;
  
  const yAxisDomain = useMemo(() => {
    if (!sensorData || sensorData.length === 0) {
      // For water level (0 or 1), set a specific domain to make changes visible
      if (sensorType === SensorType.WATER_LEVEL) {
        return [-0.2, 1.2]; // e.g., slightly outside 0 and 1
      }
      return [0, 100]; // Default domain for other sensors if no data
    }
    
    const values = sensorData.map(d => d.value);
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (sensorType === SensorType.WATER_LEVEL) {
      // Ensure domain for water level is appropriate for 0/1 values
      min = -0.2;
      max = 1.2;
    } else {
      const padding = (max - min) * 0.1 || 5; // Add 10% padding or 5 if range is 0
      min = Math.floor(min - padding);
      max = Math.ceil(max + padding);
      // Ensure min is not excessively low, e.g., for humidity/percentage never below 0 or much above 100
      if (sensorType === SensorType.AIR_HUMIDITY || sensorType === SensorType.SOIL_HUMIDITY) {
        min = Math.max(0, min);
        max = Math.min(110, max); // Allow a bit above 100 for padding
      }
    }
    return [min, max];
  }, [sensorData, sensorType]);


  if (!sensorData || sensorData.length === 0) {
    return (
      <Card className="h-[400px] flex items-center justify-center">
        <CardContent>
          <p className="text-muted-foreground">No data available for {sensorTypeToFriendlyName[sensorType]}.</p>
        </CardContent>
      </Card>
    );
  }
  
  const lineType = sensorType === SensorType.WATER_LEVEL ? "stepAfter" : "monotone";
  const yAxisTickFormatter = (value: number) => {
    if (sensorType === SensorType.WATER_LEVEL) {
      if (value === 0) return "LOW";
      if (value === 1) return "HIGH";
      return ""; // Hide other ticks for step chart
    }
    return `${value}${sensorData[0]?.unit || ''}`;
  };
   const yAxisTicks = sensorType === SensorType.WATER_LEVEL ? [0, 1] : undefined;


  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || `${sensorTypeToFriendlyName[sensorType]} Over Time`}</CardTitle>
        <CardDescription>
          {/* Using a more generic description as the data is mock */}
          Displaying historical sensor data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-video h-[300px] w-full">
          <RechartsLineChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
              top: 5,
              bottom: 5,
            }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              domain={yAxisDomain}
              ticks={yAxisTicks}
              tickFormatter={yAxisTickFormatter}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name, item) => {
                    let displayValue = value;
                    if (sensorType === SensorType.WATER_LEVEL) {
                        displayValue = value === 1 ? "HIGH" : "LOW";
                    } else {
                        displayValue = `${value}${sensorData[0]?.unit || ''}`;
                    }
                    return (
                        <>
                        <div className="font-medium">{item.payload.fullDate}</div>
                        <div className="text-muted-foreground">
                            {sensorTypeToFriendlyName[sensorType]}: {displayValue}
                        </div>
                        </>
                    );
                  }}
                />
              }
            />
            <Line
              dataKey="value"
              type={lineType}
              stroke="var(--color-value)"
              strokeWidth={2}
              dot={sensorType === SensorType.WATER_LEVEL ? true : false} // Show dots for step chart for clarity
            />
          </RechartsLineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
