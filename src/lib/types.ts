
// User type for simplified auth
export interface User {
  // uid no longer needed from Firebase for this simple auth
  email: string;
  name: string | null; // Keep name for UserNav display
  profileImageUrl?: string | null; // Keep for UserNav, will likely be undefined/null
}

export interface EmailPasswordCredentials {
  email: string;
  password: string;
}

export interface Device {
  serialNumber: string;
  // userId: string; // This would previously match User['uid']. Consider if still needed or how to link if no real users.
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
  // userId: string; // Consider if still needed
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
