
export interface User {
  id: number;
  name: string | null;
  email: string | null;
  country?: string | null;
  registrationDate?: number;
  profileImageUrl?: string | null;
}

export interface EmailPasswordCredentials {
  email: string;
  password: string;
}

export interface RegistrationCredentials extends EmailPasswordCredentials {
    name: string;
    country?: string;
}

export interface Device {
  serialNumber: string;
  hardwareIdentifier: string;
  // userId is fetched alongside in API routes when needed
  name: string;
  plantType?: string | null;
  location?: string | null;
  activationDate: number;
  warrantyEndDate?: number | null;
  isActive: boolean;
  isPoweredByBattery: boolean;
  lastUpdateTimestamp?: number;
}

export enum SensorType {
  TEMPERATURE = "TEMPERATURE",
  AIR_HUMIDITY = "AIR_HUMIDITY",
  SOIL_HUMIDITY = "SOIL_HUMIDITY",
  PH = "PH",
  LIGHT = "LIGHT",
  WATER_LEVEL = "WATER_LEVEL",
  DRAINAGE = "DRAINAGE", // Not in Arduino code yet, but keeping
}

export interface SensorReading {
  id?: number; // Optional as it's auto-incremented
  deviceId: string;
  type: SensorType | string; // Allow string for flexibility if Arduino sends custom types
  value: number;
  unit?: string; 
  timestamp: number;
}

export interface DeviceImage {
  id: string;
  deviceId: string;
  imageUrl: string;
  timestamp: number;
  isManualCapture: boolean;
  dataAiHint?: string;
  source?: 'capture' | 'upload'; // To distinguish between captured and uploaded
}

export enum TicketStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  RESOLVED = "RESOLVED",
}

export interface Ticket {
  id: string;
  deviceId: string;
  title: string;
  description: string;
  status: TicketStatus;
  creationDate: number;
  assignedTechnician?: string;
  lastUpdateTimestamp: number;
}

export enum TemperatureUnit {
  CELSIUS = "CELSIUS",
  FAHRENHEIT = "FAHRENHEIT",
}

export interface DeviceSettings {
  deviceId: string;
  measurementInterval: number; // minutes
  autoIrrigation: boolean;
  autoVentilation: boolean;
  irrigationThreshold: number; // percentage
  temperatureThreshold: number; // degrees
  temperatureFanOffThreshold: number; // degrees
  photoCaptureInterval: number; // hours
  temperatureUnit: TemperatureUnit;
  desiredLightState: boolean;
  desiredFanState: boolean;
  desiredIrrigationState: boolean;
  desiredUvLightState: boolean;
  requestManualTemperatureReading?: boolean;
  requestManualAirHumidityReading?: boolean;
  requestManualSoilHumidityReading?: boolean;
  requestManualLightLevelReading?: boolean;
  // Add other manual reading flags if needed, e.g., PH, WATER_LEVEL
  // requestManualPhReading?: boolean;
  // requestManualWaterLevelReading?: boolean;
}

export interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  disabled?: boolean;
  external?: boolean;
  label?: string;
  description?: string;
}
