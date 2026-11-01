/**
 * Smart Food Storage Monitoring Dashboard - Storage Service Interface & Implementations
 *
 * Defines the contract for fetching storage telemetry, device health, risk analysis,
 * and automated equipment states. Implements both MockStorageService and BlynkStorageService
 * with automatic fallback when Blynk configuration is absent.
 *
 * Firmware compliance:
 * - V0: Temperature (DHT22, Double)
 * - V1: Humidity (DHT22, Double)
 * - V2: Gas Raw ADC (MQ135, Integer 0–4095)
 * - V3: Storage Condition (String: SAFE, MODERATE, DANGER!)
 * - V4: Not implemented in firmware (no manual control, no writes)
 * - V5: Risk score (Double, 0–100)
 *
 * Automated equipment logic:
 * - SAFE (risk <= 30): Fan Relay OFF (LOW), Vent Servo 0°, Buzzer OFF
 * - MODERATE (30 < risk <= 60): Fan Relay ON (HIGH), Vent Servo 60°, Buzzer OFF
 * - DANGER (risk > 60): Fan Relay ON (HIGH), Vent Servo 90°, Buzzer Active (300ms toggling)
 */

import type {
  SensorReading,
  DeviceStatus,
  StorageCondition,
  RiskAssessment,
  AlertEvent,
  HistoricalReading,
  EquipmentCommandState,
  FanControlState,
  StorageDashboardSnapshot,
  TelemetryTimeRange,
  StorageConditionStatus,
  CommandedRelayState,
  CommandedServoPosition,
  CommandedBuzzerState,
} from '../types';

import {
  MOCK_SENSOR_READING,
  MOCK_DEVICE_STATUS,
  MOCK_STORAGE_CONDITION,
  MOCK_RISK_ASSESSMENT,
  MOCK_ALERT_EVENTS,
  MOCK_HISTORICAL_READINGS,
  MOCK_DASHBOARD_SNAPSHOT,
} from '../data';

import { getBlynkConfig, testPinConnection, checkHardwareConnected } from './blynkService';
import { calculateRiskScore, classifyRisk } from '../utils';

/**
 * Derives the automated equipment command states from the storage condition status
 * as defined in the ESP32 firmware source code.
 */
export function deriveEquipmentState(
  condition: StorageConditionStatus,
  isLive: boolean,
  lastCommandAt = new Date().toISOString(),
): EquipmentCommandState {
  let fanRelay: CommandedRelayState = 'off';
  let servoPosition: CommandedServoPosition = '0°';
  let buzzer: CommandedBuzzerState = 'off';

  if (condition === 'SAFE') {
    fanRelay = 'off'; // LOW: Active-HIGH relay OFF
    servoPosition = '0°'; // Closed intake
    buzzer = 'off'; // Silent
  } else if (condition === 'MODERATE') {
    fanRelay = 'on'; // HIGH: Active-HIGH relay ON
    servoPosition = '60°'; // 60-degree intake ventilation
    buzzer = 'off'; // Silent
  } else if (condition === 'DANGER!') {
    fanRelay = 'on'; // HIGH: Active-HIGH relay ON
    servoPosition = '90°'; // Full 90-degree emergency exhaust
    buzzer = 'active'; // Firmware toggles 300ms tone
  } else {
    // UNAVAILABLE
    fanRelay = 'off';
    servoPosition = '0°';
    buzzer = 'off';
  }

  return {
    fanRelay,
    servoPosition,
    buzzer,
    physicalFeedback: 'unavailable', // Physical feedback unavailable in firmware
    lastCommandAt,
    isMock: !isLive,
    dataSource: isLive ? 'blynk_live' : 'mock',
    requestedCommand: fanRelay,
    physicalState: 'unavailable',
  };
}

export interface StorageDataService {
  getCurrentReading(): Promise<SensorReading>;
  getDeviceStatus(): Promise<DeviceStatus>;
  getStorageCondition(): Promise<StorageCondition>;
  getRiskAssessment(): Promise<RiskAssessment>;
  getRecentAlerts(): Promise<AlertEvent[]>;
  getHistoricalReadings(range?: TelemetryTimeRange): Promise<HistoricalReading[]>;
  getFanState(): Promise<FanControlState>;
  getEquipmentState?(): Promise<EquipmentCommandState>;
  setFanControl(command: Partial<FanControlState>): Promise<FanControlState>;
  getDashboardSnapshot(): Promise<StorageDashboardSnapshot>;
  isLive(): boolean;
}

export class MockStorageService implements StorageDataService {
  isLive(): boolean {
    return false;
  }

  async getCurrentReading(): Promise<SensorReading> {
    return {
      ...MOCK_SENSOR_READING,
      timestamp: new Date().toISOString(),
      isStale: false,
    };
  }

  async getDeviceStatus(): Promise<DeviceStatus> {
    return {
      ...MOCK_DEVICE_STATUS,
      lastHeartbeat: new Date().toISOString(),
    };
  }

  async getStorageCondition(): Promise<StorageCondition> {
    return {
      ...MOCK_STORAGE_CONDITION,
      evaluatedAt: new Date().toISOString(),
    };
  }

  async getRiskAssessment(): Promise<RiskAssessment> {
    return {
      ...MOCK_RISK_ASSESSMENT,
      evaluatedAt: new Date().toISOString(),
    };
  }

  async getRecentAlerts(): Promise<AlertEvent[]> {
    return [...MOCK_ALERT_EVENTS];
  }

  async getHistoricalReadings(range: TelemetryTimeRange = '24h'): Promise<HistoricalReading[]> {
    if (range === '1h') {
      return MOCK_HISTORICAL_READINGS.slice(-2);
    }
    if (range === '6h') {
      return MOCK_HISTORICAL_READINGS.slice(-6);
    }
    return [...MOCK_HISTORICAL_READINGS];
  }

  async getFanState(): Promise<FanControlState> {
    return deriveEquipmentState(MOCK_STORAGE_CONDITION.status, false);
  }

  async getEquipmentState(): Promise<EquipmentCommandState> {
    return deriveEquipmentState(MOCK_STORAGE_CONDITION.status, false);
  }

  async setFanControl(_command: Partial<FanControlState>): Promise<FanControlState> {
    // Firmware operates strictly automatically; manual commands are not implemented
    return this.getFanState();
  }

  async getDashboardSnapshot(): Promise<StorageDashboardSnapshot> {
    return {
      ...MOCK_DASHBOARD_SNAPSHOT,
      fanControlState: deriveEquipmentState(MOCK_STORAGE_CONDITION.status, false),
    };
  }
}

/**
 * Live Read-Only Blynk IoT Storage Service
 *
 * Implements read-only live telemetry integration:
 * - V0: Temperature (Double)
 * - V1: Humidity (Double)
 * - V2: MQ135 raw ADC (Integer, 0-4095)
 * - V3: Storage condition (String: SAFE, MODERATE, DANGER!)
 * - V5: Primary live risk score (Double, 0-100)
 *
 * Constraints:
 * - If V5 is unconfigured/missing in Blynk product, does NOT silently substitute local risk.
 *   Returns score: null and v5Status: 'unconfigured'.
 * - Calculates local risk score only as an optional consistency check.
 * - Strictly read-only: does not send actuator writes to V4 (V4 is not implemented in firmware).
 * - Preserves sample timestamps on cached/stale data and marks isStale: true.
 * - Checks isHardwareConnected for real device connectivity.
 */
export class BlynkStorageService implements StorageDataService {
  private mockService = new MockStorageService();
  private lastSnapshotCache: { data: StorageDashboardSnapshot; fetchedAt: number } | null = null;
  private lastReadingCache: SensorReading | null = null;
  private readonly CACHE_TTL_MS = 2500;

  isLive(): boolean {
    const config = getBlynkConfig();
    return Boolean(config.token && config.token.trim().length > 0);
  }

  async getCurrentReading(): Promise<SensorReading> {
    if (!this.isLive()) {
      return this.mockService.getCurrentReading();
    }

    // Check hardware connectivity first
    const isHardwareOnline = await checkHardwareConnected();
    if (!isHardwareOnline) {
      if (this.lastReadingCache) {
        return {
          ...this.lastReadingCache,
          isStale: true,
          // STRICT RULE: Retain original timestamp of cached reading
        };
      }
      return {
        ...MOCK_SENSOR_READING,
        isStale: true,
      };
    }

    try {
      const [v0Res, v1Res, v2Res] = await Promise.all([
        testPinConnection('v0'),
        testPinConnection('v1'),
        testPinConnection('v2'),
      ]);

      if (v0Res.success && v1Res.success && v2Res.success) {
        const reading: SensorReading = {
          temperature: v0Res.data as number,
          humidity: v1Res.data as number,
          mq135Raw: v2Res.data as number,
          timestamp: new Date().toISOString(),
          isMock: false,
          dataSource: 'blynk_live',
          isStale: false,
        };
        this.lastReadingCache = reading;
        return reading;
      }

      if (this.lastReadingCache) {
        return {
          ...this.lastReadingCache,
          isStale: true,
          // STRICT RULE: Retain original timestamp of cached reading
        };
      }

      return {
        ...MOCK_SENSOR_READING,
        isStale: true,
      };
    } catch {
      if (this.lastReadingCache) {
        return {
          ...this.lastReadingCache,
          isStale: true,
          // STRICT RULE: Retain original timestamp of cached reading
        };
      }
      return {
        ...MOCK_SENSOR_READING,
        isStale: true,
      };
    }
  }

  async getStorageCondition(): Promise<StorageCondition> {
    if (!this.isLive()) {
      return this.mockService.getStorageCondition();
    }

    const v3Res = await testPinConnection('v3');
    if (!v3Res.success) {
      return {
        status: 'UNAVAILABLE',
        summary: 'Storage condition is currently unavailable from edge hardware.',
        evaluatedAt: new Date().toISOString(),
        isMock: false,
      };
    }

    const status = v3Res.data as StorageConditionStatus;
    const summaries: Record<StorageConditionStatus, string> = {
      SAFE: 'Chamber conditions are within safe preservation parameters (Risk <= 30).',
      MODERATE: 'Chamber conditions show elevated spoilage factors (Risk 31–60).',
      'DANGER!': 'Critical conditions detected! Active buzzer alarm triggered (Risk > 60).',
      UNAVAILABLE: 'Storage condition is currently unavailable from edge hardware.',
    };

    return {
      status,
      summary: summaries[status] || `Storage status: ${status}`,
      evaluatedAt: new Date().toISOString(),
      isMock: false,
    };
  }

  async getRiskAssessment(): Promise<RiskAssessment> {
    if (!this.isLive()) {
      return this.mockService.getRiskAssessment();
    }

    // V5 is the primary live risk source.
    // Concurrently fetch V0, V1, V2 to evaluate local consistency check.
    const [v5Res, v0Res, v1Res, v2Res] = await Promise.all([
      testPinConnection('v5'),
      testPinConnection('v0'),
      testPinConnection('v1'),
      testPinConnection('v2'),
    ]);

    let locallyCalculatedScore: number | undefined;
    if (v0Res.success && v1Res.success && v2Res.success) {
      locallyCalculatedScore = calculateRiskScore(
        v0Res.data as number,
        v1Res.data as number,
        v2Res.data as number,
      );
    }

    // Scenario A: V5 read succeeded
    if (v5Res.success) {
      const v5Score = v5Res.data as number;
      const level = classifyRisk(v5Score);
      const isMismatch =
        locallyCalculatedScore !== undefined
          ? Math.abs(v5Score - locallyCalculatedScore) > 2.0
          : false;

      return {
        score: v5Score,
        level,
        evaluatedAt: new Date().toISOString(),
        isMock: false,
        scoreSource: 'blynk_v5',
        v5Status: 'operational',
        locallyCalculatedScore,
        isConsistencyMismatch: isMismatch,
      };
    }

    // Scenario B: V5 read failed - check if unconfigured in Blynk console
    const isUnconfigured =
      Boolean(v5Res.isPinUnconfigured) ||
      (v5Res.rawText?.toLowerCase().includes("doesn't exist") ?? false) ||
      (v5Res.error?.toLowerCase().includes("doesn't exist") ?? false);

    const fallbackLevel =
      locallyCalculatedScore !== undefined ? classifyRisk(locallyCalculatedScore) : 'SAFE';

    return {
      score: null, // STRICT RULE: Do not silently substitute local risk if V5 is missing/unavailable!
      level: fallbackLevel,
      evaluatedAt: new Date().toISOString(),
      isMock: false,
      scoreSource: 'locally_calculated',
      v5Status: isUnconfigured ? 'unconfigured' : 'error',
      v5ErrorMessage: isUnconfigured
        ? "Requested pin doesn't exist in the product Temperature Display. V5 datastream is unconfigured in Blynk Console."
        : v5Res.error || 'Failed to query Virtual Pin V5 from Blynk Cloud.',
      locallyCalculatedScore,
      isConsistencyMismatch: false,
    };
  }

  async getDeviceStatus(): Promise<DeviceStatus> {
    if (!this.isLive()) {
      return this.mockService.getDeviceStatus();
    }

    const isConnected = await checkHardwareConnected();

    return {
      deviceType: 'ESP32',
      connectionState: isConnected ? 'online' : 'offline',
      isHardwareConnected: isConnected,
      lastHeartbeat: new Date().toISOString(),
      isMock: false,
      dataSource: 'blynk_live',
      ipAddress: null,
      wifiSignalStrengthRssi: null,
      firmwareVersion: null,
      uptimeSeconds: null,
    };
  }

  async getRecentAlerts(): Promise<AlertEvent[]> {
    return this.mockService.getRecentAlerts();
  }

  async getHistoricalReadings(range: TelemetryTimeRange = '24h'): Promise<HistoricalReading[]> {
    // Hardware streams live values; time-series records are simulated demonstration data
    return this.mockService.getHistoricalReadings(range);
  }

  async getFanState(): Promise<FanControlState> {
    return this.getEquipmentState();
  }

  async getEquipmentState(): Promise<EquipmentCommandState> {
    if (!this.isLive()) {
      return this.mockService.getFanState();
    }

    const condition = await this.getStorageCondition();
    return deriveEquipmentState(condition.status, true);
  }

  async setFanControl(_command: Partial<FanControlState>): Promise<FanControlState> {
    // STRICT CONSTRAINT: Firmware operates strictly automatically.
    // V4 is not implemented in firmware, no writes are sent.
    return this.getFanState();
  }

  async getDashboardSnapshot(): Promise<StorageDashboardSnapshot> {
    if (!this.isLive()) {
      return this.mockService.getDashboardSnapshot();
    }

    const now = Date.now();
    if (this.lastSnapshotCache && now - this.lastSnapshotCache.fetchedAt < this.CACHE_TTL_MS) {
      return this.lastSnapshotCache.data;
    }

    try {
      const [
        sensorReading,
        deviceStatus,
        storageCondition,
        riskAssessment,
        fanControlState,
        historicalReadings,
        recentAlerts,
      ] = await Promise.all([
        this.getCurrentReading(),
        this.getDeviceStatus(),
        this.getStorageCondition(),
        this.getRiskAssessment(),
        this.getFanState(),
        this.getHistoricalReadings('24h'),
        this.getRecentAlerts(),
      ]);

      const snapshot: StorageDashboardSnapshot = {
        sensorReading,
        deviceStatus,
        storageCondition,
        riskAssessment,
        fanControlState,
        historicalReadings,
        recentAlerts,
        isMock: sensorReading.isMock,
      };

      this.lastSnapshotCache = { data: snapshot, fetchedAt: now };
      return snapshot;
    } catch {
      if (this.lastSnapshotCache) {
        return this.lastSnapshotCache.data;
      }
      return this.mockService.getDashboardSnapshot();
    }
  }
}

/**
 * Default singleton instance used across the dashboard application.
 * Automatically switches to live read-only Blynk telemetry when VITE_BLYNK_AUTH_TOKEN is configured.
 */
export const storageService: StorageDataService = new BlynkStorageService();
