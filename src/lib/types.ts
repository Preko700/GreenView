
export interface User {
  id: number;
  name: string;
  email: string;
  registrationDate?: number;
}

export interface EmailPasswordCredentials {
  email: string;
  password: string;
}

export interface RegistrationCredentials extends EmailPasswordCredentials {
    name: string;
}

export interface Device {
  serialNumber: string;
  hardwareIdentifier: string;
  name:string;
  plantType?: string | null;
  location?: string | null;
  activationDate: number;
  warrantyEndDate?: number | null;
  isActive: boolean;
  isPoweredByBattery: boolean;
  lastUpdateTimestamp?: number;
  userId?: number; 
  userName?: string; // For admin device list view
}

export enum SensorType {
  TEMPERATURE = "TEMPERATURE",
  AIR_HUMIDITY = "AIR_HUMIDITY",
  SOIL_HUMIDITY = "SOIL_HUMIDITY",
  PH = "PH",
  LIGHT = "LIGHT",
  WATER_LEVEL = "WATER_LEVEL",
  DRAINAGE = "DRAINAGE",
}

export interface SensorData {
  id?: number; 
  deviceId: string;
  type: SensorType | string;
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
  source?: 'capture' | 'upload';
}

export enum TicketStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  RESOLVED = "RESOLVED",
}

export interface SupportTicket {
  id: number;
  deviceId?: string | null;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: TicketStatus;
  timestamp: number;
}

export interface TicketLog {
  id: number;
  ticketId: number;
  technicianName: string;
  logEntry: string;
  timestamp: number;
}


export enum TemperatureUnit {
  CELSIUS = "CELSIUS",
  FAHRENHEIT = "FAHRENHEIT",
}

export interface DeviceSettings {
  deviceId: string;
  measurementInterval: number;
  autoIrrigation: boolean;
  autoVentilation: boolean;
  irrigationThreshold: number;
  temperatureThreshold: number;
  temperatureFanOffThreshold: number;
  photoCaptureInterval: number;
  temperatureUnit: TemperatureUnit;
  desiredLightState: boolean;
  desiredFanState: boolean;
  desiredIrrigationState: boolean;
  requestManualTemperatureReading?: boolean;
  requestManualAirHumidityReading?: boolean;
  requestManualSoilHumidityReading?: boolean;
  requestManualLightLevelReading?: boolean;
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
