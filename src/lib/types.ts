
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
  name:string;
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

export interface SupportTicket {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: TicketStatus;
  timestamp: number;
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
  
  // Notification thresholds
  notificationTemperatureLow: number;
  notificationTemperatureHigh: number;
  notificationSoilHumidityLow: number;
  notificationAirHumidityLow: number;
  notificationAirHumidityHigh: number;

  // Roof control
  autoRoofControl?: boolean;
  roofOpenTime?: string; // HH:MM format
  roofCloseTime?: string; // HH:MM format
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

export type NotificationType = 'CRITICAL_HIGH' | 'CRITICAL_LOW' | 'WARNING' | 'INFO';

export interface Notification {
  id: number;
  userId: number;
  deviceId: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  timestamp: number;
}

export interface AdminDeviceView {
  serialNumber: string;
  userId: number;
  deviceName: string;
  userName: string;
  activationDate: number;
  warrantyEndDate: number;
}

export enum ServiceRequestStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
}

export interface ServiceRequest {
    id: number;
    userId: number;
    deviceId: string;
    reason: string;
    phoneNumber: string;
    status: ServiceRequestStatus;
    timestamp: number;
}

export interface AdminServiceRequestView extends ServiceRequest {
    userName: string;
    userEmail: string;
    deviceName: string;
}

export interface ServiceLogEntry {
    id: number;
    technicianName: string;
    userId: number;
    deviceId: string;
    serviceDate: number;
    actionsTaken: string;
    result: string;
    timestamp: number;
}

export interface AdminServiceLogView extends ServiceLogEntry {
    userName: string;
    deviceName: string;
}
