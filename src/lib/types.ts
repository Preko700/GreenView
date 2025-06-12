

export interface User {
  id: number;
  name: string | null;
  email: string | null;
  country?: string | null;
  registrationDate?: number;
  profileImageUrl?: string | null;
  // Password should not be part of this client-side User type
}

export interface EmailPasswordCredentials {
  email: string;
  password: string;
}

export interface RegistrationCredentials extends EmailPasswordCredentials {
    name: string;
    country?: string; // Optional for registration for now
}


export interface Device {
  serialNumber: string;
  name: string;
  activationDate: number;
  warrantyEndDate: number;
  isActive: boolean;
  isPoweredByBattery: boolean;
  lastUpdateTimestamp: number;
  plantType?: string; 
  location?: string; 
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
  id: string;
  deviceId: string;
  type: SensorType;
  value: number;
  timestamp: number;
  unit?: string; 
}

export interface DeviceImage {
  id: string;
  deviceId: string;
  imageUrl: string;
  timestamp: number;
  isManualCapture: boolean;
  dataAiHint?: string;
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
  userId?: number; // To link to the users table
  measurementInterval: number; // minutes
  autoIrrigation: boolean;
  autoVentilation: boolean;
  irrigationThreshold: number; // percentage
  temperatureThreshold: number; // degrees
  temperatureFanOffThreshold: number; // degrees
  photoCaptureInterval: number; // hours
  temperatureUnit: TemperatureUnit;
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
