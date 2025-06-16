
import type { SensorData, DeviceImage, DeviceSettings, User } from '@/lib/types';
import { SensorType, TemperatureUnit } from '@/lib/types';

export const mockUser: User = {
  id: 1, // Assuming first user in DB will be ID 1
  name: 'Demo User',
  email: 'user@example.com',
  country: 'USA',
  registrationDate: Date.now() - 1000 * 60 * 60 * 24 * 30, // 30 days ago
  profileImageUrl: 'https://placehold.co/100x100.png',
};

// mockDevices is now removed as devices will be fetched from the database.
// export const mockDevices: Device[] = [ ... ];

// getMockDevice is also removed.
// export const getMockDevice = (deviceId: string): Device | undefined => mockDevices.find(d => d.serialNumber === deviceId);


// Sensor data can still be mocked for now until actual sensor integration
export const mockSensorData: { [deviceId: string]: SensorData[] } = {
  'GH-001': [ // Example deviceId, replace with actual deviceIds once registered
    { id: 'temp1', deviceId: 'GH-001', type: SensorType.TEMPERATURE, value: 25, unit: '°C', timestamp: Date.now() - 1000 * 60 * 2 },
    { id: 'airh1', deviceId: 'GH-001', type: SensorType.AIR_HUMIDITY, value: 60, unit: '%', timestamp: Date.now() - 1000 * 60 * 2 },
    { id: 'soilh1', deviceId: 'GH-001', type: SensorType.SOIL_HUMIDITY, value: 55, unit: '%', timestamp: Date.now() - 1000 * 60 * 2 },
    { id: 'light1', deviceId: 'GH-001', type: SensorType.LIGHT, value: 12000, unit: 'lux', timestamp: Date.now() - 1000 * 60 * 2 },
    { id: 'ph1', deviceId: 'GH-001', type: SensorType.PH, value: 6.5, unit: '', timestamp: Date.now() - 1000 * 60 * 2 },
    { id: 'water1', deviceId: 'GH-001', type: SensorType.WATER_LEVEL, value: 1, unit: 'state', timestamp: Date.now() - 1000 * 60 * 2 }, // state: 0 (LOW), 1 (HIGH)
  ],
  'GH-002': [
    { id: 'temp2', deviceId: 'GH-002', type: SensorType.TEMPERATURE, value: 22, unit: '°C', timestamp: Date.now() - 1000 * 60 * 3 },
    { id: 'airh2', deviceId: 'GH-002', type: SensorType.AIR_HUMIDITY, value: 65, unit: '%', timestamp: Date.now() - 1000 * 60 * 3 },
    { id: 'soilh2', deviceId: 'GH-002', type: SensorType.SOIL_HUMIDITY, value: 70, unit: '%', timestamp: Date.now() - 1000 * 60 * 3 },
    { id: 'light2', deviceId: 'GH-002', type: SensorType.LIGHT, value: 8000, unit: 'lux', timestamp: Date.now() - 1000 * 60 * 3 },
    { id: 'water2', deviceId: 'GH-002', type: SensorType.WATER_LEVEL, value: 0, unit: 'state', timestamp: Date.now() - 1000 * 60 * 3 },
  ],
};

export const mockHistoricalSensorData: { [deviceId: string]: { [type in SensorType]?: SensorData[] } } = {
  'GH-001': {
    [SensorType.TEMPERATURE]: Array.from({ length: 24 }, (_, i) => ({
      id: `hist_temp_gh001_${i}`,
      deviceId: 'GH-001',
      type: SensorType.TEMPERATURE,
      value: parseFloat((20 + Math.sin(i / 3) * 5 + Math.random() * 2).toFixed(1)),
      unit: '°C',
      timestamp: Date.now() - 1000 * 60 * 60 * (24 - i),
    })),
    [SensorType.AIR_HUMIDITY]: Array.from({ length: 24 }, (_, i) => ({
      id: `hist_airh_gh001_${i}`,
      deviceId: 'GH-001',
      type: SensorType.AIR_HUMIDITY,
      value: Math.round(50 + Math.cos(i / 4) * 10 + Math.random() * 5),
      unit: '%',
      timestamp: Date.now() - 1000 * 60 * 60 * (24 - i),
    })),
     [SensorType.SOIL_HUMIDITY]: Array.from({ length: 24 }, (_, i) => ({
      id: `hist_soilh_gh001_${i}`,
      deviceId: 'GH-001',
      type: SensorType.SOIL_HUMIDITY,
      value: Math.round(45 + Math.sin(i / 2) * 15 + Math.random() * 5),
      unit: '%',
      timestamp: Date.now() - 1000 * 60 * 60 * (24 - i),
    })),
    [SensorType.LIGHT]: Array.from({ length: 24 }, (_, i) => ({
      id: `hist_light_gh001_${i}`,
      deviceId: 'GH-001',
      type: SensorType.LIGHT,
      value: Math.round(Math.max(0, 8000 + Math.sin(i / 7.6) * 7000 + Math.random() * 1000)), // Simula ciclo día/noche
      unit: 'lux',
      timestamp: Date.now() - 1000 * 60 * 60 * (24 - i),
    })),
    [SensorType.WATER_LEVEL]: Array.from({ length: 24 }, (_, i) => ({
      id: `hist_water_gh001_${i}`,
      deviceId: 'GH-001',
      type: SensorType.WATER_LEVEL,
      value: (i % 8 === 0 && i > 0) ? 0 : 1, 
      unit: 'state', // 0 for LOW, 1 for HIGH
      timestamp: Date.now() - 1000 * 60 * 60 * (24 - i),
    })),
    [SensorType.PH]: Array.from({ length: 24 }, (_, i) => ({
      id: `hist_ph_gh001_${i}`,
      deviceId: 'GH-001',
      type: SensorType.PH,
      value: parseFloat((6.0 + Math.sin(i/5) * 0.5 + Math.random() * 0.2).toFixed(1)), // Simula variaciones leves de pH
      unit: '',
      timestamp: Date.now() - 1000 * 60 * 60 * (24 - i),
    })),
  }
};


export const mockDeviceImages: { [deviceId: string]: DeviceImage[] } = {
  'GH-001': [
    { id: 'img1', deviceId: 'GH-001', imageUrl: 'https://placehold.co/600x400.png', dataAiHint: 'tomato plant', timestamp: Date.now() - 1000 * 60 * 60 * 2, isManualCapture: false },
    { id: 'img2', deviceId: 'GH-001', imageUrl: 'https://placehold.co/600x400.png', dataAiHint: 'greenhouse interior', timestamp: Date.now() - 1000 * 60 * 60 * 5, isManualCapture: true },
    { id: 'img3', deviceId: 'GH-001', imageUrl: 'https://placehold.co/600x400.png', dataAiHint: 'seedling tray', timestamp: Date.now() - 1000 * 60 * 60 * 8, isManualCapture: false },
  ],
  'GH-002': [
    { id: 'img4', deviceId: 'GH-002', imageUrl: 'https://placehold.co/600x400.png', dataAiHint: 'basil herb', timestamp: Date.now() - 1000 * 60 * 30, isManualCapture: false },
    { id: 'img5', deviceId: 'GH-002', imageUrl: 'https://placehold.co/600x400.png', dataAiHint: 'mint plant', timestamp: Date.now() - 1000 * 60 * 90, isManualCapture: false },
  ],
};

// mockDeviceSettings and getMockDeviceSettings are no longer the primary source for device settings.
// Settings will be fetched from /api/device-settings/[deviceId]
// This object can be removed or kept for reference of structure if needed.
export const mockDeviceSettings: { [deviceId: string]: DeviceSettings } = {
  'GH-001': {
    deviceId: 'GH-001',
    measurementInterval: 5,
    autoIrrigation: true,
    autoVentilation: true,
    irrigationThreshold: 40,
    temperatureThreshold: 28,
    temperatureFanOffThreshold: 25,
    photoCaptureInterval: 6,
    temperatureUnit: TemperatureUnit.CELSIUS,
    desiredFanState: false,
    desiredIrrigationState: false,
    desiredLightState: false,
    desiredUvLightState: false,
  },
};
export const getMockDeviceSettings = (deviceId: string): DeviceSettings | undefined => mockDeviceSettings[deviceId];


export const getMockSensorData = (deviceId: string): SensorData[] => mockSensorData[deviceId] || [];

export const getMockHistoricalSensorData = (deviceId: string, sensorType: SensorType): SensorData[] => {
  if (mockHistoricalSensorData[deviceId] && mockHistoricalSensorData[deviceId][sensorType]) {
    return mockHistoricalSensorData[deviceId][sensorType] || [];
  }

  // If deviceId or sensorType data is not explicitly mocked, generate some plausible generic data
  const generatedData: SensorData[] = Array.from({ length: 24 }, (_, i) => {
    let rawValue;
    let finalValue;
    let unit;
    const baseTimestamp = Date.now() - 1000 * 60 * 60 * (24 - i); // Last 24 hours

    switch (sensorType) {
      case SensorType.TEMPERATURE:
        rawValue = 15 + Math.sin(i / 3.5) * 7 + Math.random() * 3; // Range 5-25 approx
        finalValue = parseFloat(rawValue.toFixed(1));
        unit = '°C';
        break;
      case SensorType.AIR_HUMIDITY:
        rawValue = 40 + Math.cos(i / 4.2) * 15 + Math.random() * 10; // Range 15-65 approx
        finalValue = Math.round(rawValue);
        unit = '%';
        break;
      case SensorType.SOIL_HUMIDITY:
        rawValue = 30 + Math.sin(i / 2.5) * 20 + Math.random() * 10; // Range 0-60 approx
        finalValue = Math.round(rawValue);
        unit = '%';
        break;
      case SensorType.LIGHT:
        rawValue = Math.max(0, 5000 + Math.sin(i / 7.0) * 4500 + Math.random() * 1000); // Simulates day/night
        finalValue = Math.round(rawValue);
        unit = 'lux';
        break;
      case SensorType.WATER_LEVEL:
        rawValue = (i % 6 === 0 && i > 0) ? 0 : 1; // Mostly HIGH, occasionally LOW
        finalValue = rawValue; // Already 0 or 1
        unit = 'state';
        break;
      case SensorType.PH:
        rawValue = 5.5 + Math.sin(i/5.5) * 0.7 + Math.random() * 0.3; // Simulates pH variations
        finalValue = parseFloat(rawValue.toFixed(1));
        unit = '';
        break;
      default: // Should not happen if SensorType enum is exhaustive for SENSOR_TYPES_FOR_DISPLAY
        rawValue = Math.random() * 100;
        finalValue = parseFloat(rawValue.toFixed(1));
        unit = 'N/A';
    }
    return {
      id: `gen_hist_${sensorType.toString()}_${deviceId.replace(/[^a-zA-Z0-9]/g, '')}_${i}`,
      deviceId: deviceId,
      type: sensorType,
      value: finalValue,
      unit: unit,
      timestamp: baseTimestamp,
    };
  });
  return generatedData;
};

export const getMockDeviceImages = (deviceId: string): DeviceImage[] => mockDeviceImages[deviceId] || [];
