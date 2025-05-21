import type { Device, SensorData, DeviceImage, DeviceSettings, User } from '@/lib/types';
import { SensorType, TemperatureUnit } from '@/lib/types';

export const mockUser: User = {
  id: 'user123',
  name: 'Demo User',
  email: 'user@example.com',
  country: 'USA',
  registrationDate: Date.now() - 1000 * 60 * 60 * 24 * 30, // 30 days ago
  profileImageUrl: 'https://placehold.co/100x100.png',
};

export const mockDevices: Device[] = [
  {
    serialNumber: 'GH-001',
    userId: 'user123',
    name: 'Backyard Greenhouse',
    activationDate: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days ago
    warrantyEndDate: Date.now() + 1000 * 60 * 60 * 24 * 355, // 355 days left
    isActive: true,
    isPoweredByBattery: false,
    lastUpdateTimestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
    plantType: 'Tomatoes',
    location: 'California, USA'
  },
  {
    serialNumber: 'GH-002',
    userId: 'user123',
    name: 'Balcony Herbs',
    activationDate: Date.now() - 1000 * 60 * 60 * 24 * 5, // 5 days ago
    warrantyEndDate: Date.now() + 1000 * 60 * 60 * 24 * 360, // 360 days left
    isActive: true,
    isPoweredByBattery: true,
    lastUpdateTimestamp: Date.now() - 1000 * 60 * 15, // 15 minutes ago
    plantType: 'Basil and Mint',
    location: 'New York, USA'
  },
  {
    serialNumber: 'GH-003',
    userId: 'user123',
    name: 'Inactive Setup',
    activationDate: Date.now() - 1000 * 60 * 60 * 24 * 60, // 60 days ago
    warrantyEndDate: Date.now() + 1000 * 60 * 60 * 24 * 305, // 305 days left
    isActive: false,
    isPoweredByBattery: false,
    lastUpdateTimestamp: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    plantType: 'Various Seedlings',
    location: 'Florida, USA'
  },
];

export const mockSensorData: { [deviceId: string]: SensorData[] } = {
  'GH-001': [
    { id: 'temp1', deviceId: 'GH-001', type: SensorType.TEMPERATURE, value: 25, unit: '°C', timestamp: Date.now() - 1000 * 60 * 2 },
    { id: 'airh1', deviceId: 'GH-001', type: SensorType.AIR_HUMIDITY, value: 60, unit: '%', timestamp: Date.now() - 1000 * 60 * 2 },
    { id: 'soilh1', deviceId: 'GH-001', type: SensorType.SOIL_HUMIDITY, value: 55, unit: '%', timestamp: Date.now() - 1000 * 60 * 2 },
    { id: 'light1', deviceId: 'GH-001', type: SensorType.LIGHT, value: 12000, unit: 'lux', timestamp: Date.now() - 1000 * 60 * 2 },
    { id: 'ph1', deviceId: 'GH-001', type: SensorType.PH, value: 6.5, unit: '', timestamp: Date.now() - 1000 * 60 * 2 },
    { id: 'water1', deviceId: 'GH-001', type: SensorType.WATER_LEVEL, value: 75, unit: '%', timestamp: Date.now() - 1000 * 60 * 2 },
  ],
  'GH-002': [
    { id: 'temp2', deviceId: 'GH-002', type: SensorType.TEMPERATURE, value: 22, unit: '°C', timestamp: Date.now() - 1000 * 60 * 3 },
    { id: 'airh2', deviceId: 'GH-002', type: SensorType.AIR_HUMIDITY, value: 65, unit: '%', timestamp: Date.now() - 1000 * 60 * 3 },
    { id: 'soilh2', deviceId: 'GH-002', type: SensorType.SOIL_HUMIDITY, value: 70, unit: '%', timestamp: Date.now() - 1000 * 60 * 3 },
    { id: 'light2', deviceId: 'GH-002', type: SensorType.LIGHT, value: 8000, unit: 'lux', timestamp: Date.now() - 1000 * 60 * 3 },
  ],
};

// Mock historical data for charts
export const mockHistoricalSensorData: { [deviceId: string]: { [type in SensorType]?: SensorData[] } } = {
  'GH-001': {
    [SensorType.TEMPERATURE]: Array.from({ length: 24 }, (_, i) => ({
      id: `hist_temp_${i}`,
      deviceId: 'GH-001',
      type: SensorType.TEMPERATURE,
      value: 20 + Math.sin(i / 3) * 5 + Math.random() * 2,
      unit: '°C',
      timestamp: Date.now() - 1000 * 60 * 60 * (24 - i),
    })),
    [SensorType.AIR_HUMIDITY]: Array.from({ length: 24 }, (_, i) => ({
      id: `hist_airh_${i}`,
      deviceId: 'GH-001',
      type: SensorType.AIR_HUMIDITY,
      value: 50 + Math.cos(i / 4) * 10 + Math.random() * 5,
      unit: '%',
      timestamp: Date.now() - 1000 * 60 * 60 * (24 - i),
    })),
     [SensorType.SOIL_HUMIDITY]: Array.from({ length: 24 }, (_, i) => ({
      id: `hist_soilh_${i}`,
      deviceId: 'GH-001',
      type: SensorType.SOIL_HUMIDITY,
      value: 45 + Math.sin(i / 2) * 15 + Math.random() * 5,
      unit: '%',
      timestamp: Date.now() - 1000 * 60 * 60 * (24 - i),
    })),
    [SensorType.LIGHT]: Array.from({ length: 24 }, (_, i) => ({
      id: `hist_light_${i}`,
      deviceId: 'GH-001',
      type: SensorType.LIGHT,
      value: Math.max(0, 8000 + Math.sin(i / 7.6) * 7000 + Math.random() * 1000), // Simulate day/night
      unit: 'lux',
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
  },
  'GH-002': {
    deviceId: 'GH-002',
    measurementInterval: 10,
    autoIrrigation: false,
    autoVentilation: true,
    irrigationThreshold: 50,
    temperatureThreshold: 26,
    temperatureFanOffThreshold: 23,
    photoCaptureInterval: 12,
    temperatureUnit: TemperatureUnit.CELSIUS,
  },
};

export const getMockDevice = (deviceId: string): Device | undefined => mockDevices.find(d => d.serialNumber === deviceId);
export const getMockSensorData = (deviceId: string): SensorData[] => mockSensorData[deviceId] || [];
export const getMockHistoricalSensorData = (deviceId: string, sensorType: SensorType): SensorData[] => mockHistoricalSensorData[deviceId]?.[sensorType] || [];
export const getMockDeviceImages = (deviceId: string): DeviceImage[] => mockDeviceImages[deviceId] || [];
export const getMockDeviceSettings = (deviceId: string): DeviceSettings | undefined => mockDeviceSettings[deviceId];
