/**
 * Smart Food Storage Monitoring Dashboard - Domain Type Definitions
 * 
 * Accurately models the latest physical ESP32 hardware firmware telemetry:
 *   - V0: Temperature in Celsius (DHT22)
 *   - V1: Relative humidity percentage (DHT22)
 *   - V2: Gas sensor raw analog reading (MQ135, 0–4095 ADC)
 *   - V3: Storage condition status string (SAFE | MODERATE | DANGER!)
 *   - V4: Not implemented in firmware (no manual control, no BLYNK_WRITE(V4))
 *   - V5: Firmware-calculated risk score (Double, 0–100)
 *
 * NOTE: The ESP32 firmware does not publish gas ppm calibration, device IP addresses,
 * Wi-Fi signal strengths, firmware build strings, or uptime counters.
 */

export type DataSource = 'mock' | 'blynk_live';

export type ConnectionState = 'online' | 'offline' | 'unknown';

export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Exact status values published by ESP32 firmware for Virtual Pin V3.
 */
export type StorageConditionStatus = 'SAFE' | 'MODERATE' | 'DANGER!' | 'UNAVAILABLE';

export type RiskLevel = 'SAFE' | 'MODERATE' | 'DANGER';

export type TelemetryTimeRange = '1h' | '6h' | '24h';

export type FanCommand = 'off' | 'on';

export type PhysicalFanFeedback = 'unavailable';

export type CommandedRelayState = 'off' | 'on';

export type CommandedServoPosition = '0°' | '60°' | '90°';

export type CommandedBuzzerState = 'off' | 'active';

/**
 * Environmental sensor readings directly mapped to ESP32 firmware virtual pins:
 *   - temperature -> V0
 *   - humidity    -> V1
 *   - mq135Raw    -> V2 (Raw ADC value, 0-4095; uncalibrated raw analog voltage)
 */
export interface SensorReading {
  temperature: number; // V0: Degrees Celsius (°C)
  humidity: number; // V1: Relative humidity percentage (% RH, 0-100)
  mq135Raw: number; // V2: MQ-135 raw analog ADC reading (0 - 4095)
  timestamp: string; // ISO 8601 UTC timestamp of last known update
  isMock: boolean; // Explicit flag distinguishing simulated from live hardware telemetry
  dataSource: DataSource;
  isStale?: boolean; // Flag indicating telemetry is retained from last-known retrieval
}

/**
 * ESP32 device status representation.
 * Determines connectivity from actual hardware connection status (isHardwareConnected).
 */
export interface DeviceStatus {
  deviceType: 'ESP32';
  connectionState: ConnectionState;
  isHardwareConnected: boolean; // Direct hardware connectivity reported by Blynk API
  lastHeartbeat: string; // ISO 8601 timestamp
  isMock: boolean;
  dataSource: DataSource;
  // Optional diagnostics (marked unavailable unless supported by future firmware updates)
  ipAddress?: string | null;
  wifiSignalStrengthRssi?: number | null;
  firmwareVersion?: string | null;
  uptimeSeconds?: number | null;
}

/**
 * Storage condition evaluation corresponding to firmware Virtual Pin V3.
 * Exact firmware values: 'SAFE' | 'MODERATE' | 'DANGER!'
 */
export interface StorageCondition {
  status: StorageConditionStatus; // V3: Exact firmware storage status
  summary: string;
  evaluatedAt: string;
  isMock: boolean;
}

/**
 * Risk assessment evaluated using Virtual Pin V5 (primary) or local estimate:
 *   temperatureContribution = temperature > 25 ? (temperature - 25) * 2 : 0;
 *   humidityContribution = humidity > 60 ? (humidity - 60) * 1.5 : 0;
 *   gasContribution = gasRaw > 1500 ? (gasRaw - 1500) * 0.02 : 0;
 *   risk = Math.min(100, temperatureContribution + humidityContribution + gasContribution);
 *
 * Classifications: SAFE (<= 30), MODERATE (> 30 and <= 60), DANGER (> 60)
 */
export type RiskScoreSource = 'blynk_v5' | 'locally_calculated' | 'mock';

export type V5DatastreamStatus = 'operational' | 'unconfigured' | 'error' | 'mock';

export interface RiskAssessment {
  score: number | null; // Primary risk score from Virtual Pin V5; null if V5 is unconfigured/missing
  level: RiskLevel; // SAFE | MODERATE | DANGER
  evaluatedAt: string;
  isMock: boolean;
  scoreSource: RiskScoreSource;
  v5Status: V5DatastreamStatus;
  v5ErrorMessage?: string | null;
  locallyCalculatedScore?: number; // Estimated via firmware formula for diagnostic consistency
  isConsistencyMismatch?: boolean;
}

/**
 * Automated equipment state commanded by ESP32 firmware based on condition status:
 *   - SAFE: Relay OFF (LOW), Servo 0°, Buzzer OFF
 *   - MODERATE: Relay ON (HIGH), Servo 60°, Buzzer OFF
 *   - DANGER: Relay ON (HIGH), Servo 90°, Buzzer Active (toggles every 300ms)
 *
 * NOTE: Physical feedback is unavailable in firmware. Commanded state is not verified physical rotation.
 * V4 manual control is not implemented in firmware.
 */
export interface EquipmentCommandState {
  fanRelay: CommandedRelayState; // Commanded relay state ('off' | 'on')
  servoPosition: CommandedServoPosition; // Commanded vent servo ('0°' | '60°' | '90°')
  buzzer: CommandedBuzzerState; // Commanded buzzer state ('off' | 'active')
  physicalFeedback: PhysicalFanFeedback; // Always 'unavailable'
  lastCommandAt: string;
  isMock: boolean;
  dataSource: DataSource;
  // Backward compatibility aliases
  requestedCommand?: FanCommand;
  physicalState?: PhysicalFanFeedback;
}

export type FanControlState = EquipmentCommandState;

/**
 * Alert event logged when environmental parameters cross safe operational thresholds.
 */
export interface AlertEvent {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  parameter: 'temperature' | 'humidity' | 'mq135Raw' | 'risk' | 'system';
  title: string;
  message: string;
  acknowledged: boolean;
}

/**
 * Simulated demonstration time-series point for UI validation.
 * Note: Firmware streams live values (V0-V3, V5); historical records are simulated until a telemetry DB is introduced.
 */
export interface HistoricalReading {
  id: string;
  timestamp: string;
  temperature: number;
  humidity: number;
  mq135Raw: number; // Raw ADC reading (0-4095)
  riskScore: number; // Calculated via latest firmware formula
  fanRelayActive: boolean; // Commanded fan state based on condition
  requestedFanActive?: boolean; // Backward-compatible alias
  isMock: true; // Always marked mock demonstration data
}

/**
 * Combined view model representing the complete food storage monitoring state.
 */
export interface StorageDashboardSnapshot {
  sensorReading: SensorReading;
  deviceStatus: DeviceStatus;
  storageCondition: StorageCondition;
  riskAssessment: RiskAssessment;
  fanControlState: EquipmentCommandState;
  historicalReadings: HistoricalReading[];
  recentAlerts: AlertEvent[];
  isMock: boolean;
}
