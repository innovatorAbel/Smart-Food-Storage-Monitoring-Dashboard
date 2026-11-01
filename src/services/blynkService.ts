/**
 * Smart Food Storage Monitoring Dashboard - Read-Only Blynk IoT Service
 *
 * Implements read-only datastream ingestion from the ESP32 via Blynk Cloud HTTP REST API:
 *   - V0: Temperature (Double)
 *   - V1: Relative humidity (Double)
 *   - V2: MQ135 raw analog reading (Integer 0-4095 ADC)
 *   - V3: Storage condition status (String: 'SAFE' | 'MODERATE' | 'DANGER!')
 *   - V5: Risk score (Double 0.0 - 100.0, published by ESP32 firmware)
 *
 * Constraints:
 *   - Strictly read-only (no actuator / write calls to V4).
 *   - V5 is the primary live risk score source; local risk formula is retained for consistency checks.
 *   - If V5 is unconfigured or missing from Blynk product template, it is surfaced as an unconfigured state,
 *     never silently substituted.
 *   - Strict type validation: V3 numeric codes (e.g. '1' or '0') are rejected.
 *   - Never exposes authentication tokens in logs, console, or UI.
 *   - Provides timeout handling via AbortController.
 */

import type { StorageConditionStatus } from '../types';

export type AllowedReadPin = 'v0' | 'v1' | 'v2' | 'v3' | 'v5';

export interface BlynkConfig {
  server: string;
  token: string;
  timeoutMs: number;
}

export interface PinFetchResult<T = unknown> {
  pin: AllowedReadPin;
  success: boolean;
  statusCode?: number;
  data?: T;
  rawText?: string;
  error?: string;
  isCorsError?: boolean;
  isPinUnconfigured?: boolean;
  durationMs: number;
}

export interface LiveBlynkReading {
  temperature: number;
  humidity: number;
  mq135Raw: number;
  condition: StorageConditionStatus;
  riskScore: number | null;
  v5Status: 'operational' | 'unconfigured' | 'error';
  v5ErrorMessage?: string | null;
  timestamp: string;
}

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Loads and sanitizes Blynk environment configuration.
 * Note: VITE_ variables are embedded in the browser client bundle.
 * Supports both Vite (import.meta.env) and Node test runtimes (process.env).
 */
export function getBlynkConfig(): BlynkConfig {
  const globalObj = typeof globalThis !== 'undefined' ? (globalThis as Record<string, unknown>) : {};
  const processEnv = (globalObj.process as { env?: Record<string, string | undefined> } | undefined)?.env;
  const envObj =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env
      : processEnv || {};

  const envServer = envObj.VITE_BLYNK_SERVER?.trim();
  const envToken = envObj.VITE_BLYNK_AUTH_TOKEN?.trim() || '';

  // Sanitize host: remove http://, https://, and trailing slashes
  const server = (envServer || 'blynk.cloud')
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');

  return {
    server: server || 'blynk.cloud',
    token: envToken,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

let hardwareConnectedCache: { connected: boolean; fetchedAt: number } | null = null;
const HW_CONNECTED_CACHE_TTL_MS = 2000;

/**
 * Checks whether the physical ESP32 hardware is currently connected to Blynk Cloud.
 * Calls https://{server}/external/api/isHardwareConnected?token={token}
 * Returns true only if the hardware is actively connected.
 */
export async function checkHardwareConnected(
  overrideConfig?: Partial<BlynkConfig>
): Promise<boolean> {
  const baseConfig = getBlynkConfig();
  const server = overrideConfig?.server || baseConfig.server;
  const token = overrideConfig?.token || baseConfig.token;
  const timeoutMs = overrideConfig?.timeoutMs || baseConfig.timeoutMs;

  if (!token) return false;

  const now = performance.now();
  if (hardwareConnectedCache && now - hardwareConnectedCache.fetchedAt < HW_CONNECTED_CACHE_TTL_MS) {
    return hardwareConnectedCache.connected;
  }

  const url = `https://${server}/external/api/isHardwareConnected?token=${encodeURIComponent(token)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/plain, */*' },
      signal: controller.signal,
    });

    if (!response.ok) {
      hardwareConnectedCache = { connected: false, fetchedAt: performance.now() };
      return false;
    }

    const text = await response.text();
    const isConnected = text.trim().toLowerCase() === 'true';
    hardwareConnectedCache = { connected: isConnected, fetchedAt: performance.now() };
    return isConnected;
  } catch {
    hardwareConnectedCache = { connected: false, fetchedAt: performance.now() };
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Redacts security tokens from logged URL strings.
 */
export function sanitizeLogUrl(url: string): string {
  return url.replace(/token=[^&]+/gi, 'token=[REDACTED]');
}

/**
 * Constructs the canonical Blynk external API read URL for a specific virtual pin.
 * Allows V0, V1, V2, V3, and V5.
 */
export function buildPinUrl(pin: AllowedReadPin, server: string, token: string): string {
  const normalizedPin = pin.toLowerCase();
  if (
    normalizedPin !== 'v0' &&
    normalizedPin !== 'v1' &&
    normalizedPin !== 'v2' &&
    normalizedPin !== 'v3' &&
    normalizedPin !== 'v5'
  ) {
    throw new Error(`Unauthorized or unconfigured pin requested: ${pin}. Only V0-V3 and V5 are allowed.`);
  }

  const encodedToken = encodeURIComponent(token);
  return `https://${server}/external/api/get?token=${encodedToken}&${normalizedPin}`;
}

/**
 * Parses and validates temperature reading from Virtual Pin V0.
 * Expected type: Double (°C).
 */
export function parseTemperature(raw: string): number {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  const parsed = Number.parseFloat(trimmed);

  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new Error(`Malformed temperature value from V0: "${raw}". Expected a finite floating-point number.`);
  }

  return Number(parsed.toFixed(1));
}

/**
 * Parses and validates humidity reading from Virtual Pin V1.
 * Expected type: Double (% RH, 0-100).
 */
export function parseHumidity(raw: string): number {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  const parsed = Number.parseFloat(trimmed);

  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new Error(`Malformed humidity value from V1: "${raw}". Expected a finite floating-point number.`);
  }

  if (parsed < 0 || parsed > 100) {
    throw new Error(`Out-of-range humidity value from V1: ${parsed}%. Expected 0-100% RH.`);
  }

  return Number(parsed.toFixed(1));
}

/**
 * Parses and validates MQ135 analog reading from Virtual Pin V2.
 * Expected type: Integer (0-4095 ADC counts).
 * Note: Uncalibrated raw analog voltage, never ppm.
 */
export function parseGasRaw(raw: string): number {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  const parsed = Number.parseInt(trimmed, 10);

  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new Error(`Malformed MQ135 raw ADC value from V2: "${raw}". Expected integer count.`);
  }

  if (parsed < 0 || parsed > 4095) {
    throw new Error(`Out-of-range ADC reading from V2: ${parsed}. Expected 12-bit ADC range 0-4095.`);
  }

  return parsed;
}

/**
 * Parses and validates storage condition status from Virtual Pin V3.
 * Expected type: String ('SAFE' | 'MODERATE' | 'DANGER!').
 *
 * CRITICAL RULE: Rejects numeric codes such as '1' or '0'.
 */
export function parseStorageCondition(raw: string): StorageConditionStatus {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');

  // Reject numeric representations
  if (trimmed === '1' || trimmed === '0' || !Number.isNaN(Number(trimmed))) {
    throw new Error(
      `Invalid storage condition from V3: received numeric code "${trimmed}". Expected string: "SAFE", "MODERATE", or "DANGER!".`
    );
  }

  if (trimmed === 'SAFE' || trimmed === 'MODERATE' || trimmed === 'DANGER!') {
    return trimmed as StorageConditionStatus;
  }

  throw new Error(
    `Unrecognized storage condition string from V3: "${trimmed}". Expected "SAFE", "MODERATE", or "DANGER!".`
  );
}

/**
 * Parses and validates risk score from Virtual Pin V5.
 * Expected type: Double (0.0 - 100.0).
 * ESP32 firmware writes calculated risk score to V5 every 2 seconds.
 */
export function parseRiskScore(raw: string): number {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  const parsed = Number.parseFloat(trimmed);

  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new Error(`Malformed risk score value from V5: "${raw}". Expected a finite floating-point number.`);
  }

  if (parsed < 0 || parsed > 100) {
    throw new Error(`Out-of-range risk score from V5: ${parsed}. Expected 0.0 - 100.0.`);
  }

  return Number(parsed.toFixed(1));
}

/**
 * Executes a single low-level fetch request for a datastream pin with timeout and error handling.
 */
export async function fetchPinRaw(
  pin: AllowedReadPin,
  overrideConfig?: Partial<BlynkConfig>
): Promise<{ statusCode: number; text: string; ok: boolean }> {
  const baseConfig = getBlynkConfig();
  const server = overrideConfig?.server || baseConfig.server;
  const token = overrideConfig?.token || baseConfig.token;
  const timeoutMs = overrideConfig?.timeoutMs || baseConfig.timeoutMs;

  if (!token) {
    throw new Error('Blynk authentication token is missing. Configure VITE_BLYNK_AUTH_TOKEN in .env.local.');
  }

  const url = buildPinUrl(pin, server, token);
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
      signal: controller.signal,
    });

    const text = await response.text();
    return {
      statusCode: response.status,
      text,
      ok: response.ok,
    };
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new Error(`Blynk request for ${pin.toUpperCase()} timed out after ${timeoutMs}ms.`);
      }
      // Inspect for common browser CORS or network failure messages
      if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
        const enhancedError = new Error(
          `Browser network/CORS error fetching ${pin.toUpperCase()} from ${server}: ${err.message}`
        );
        (enhancedError as unknown as { isCorsError: boolean }).isCorsError = true;
        throw enhancedError;
      }
    }
    throw err;
  } finally {
    clearTimeout(timeoutTimer);
  }
}

const pinCache = new Map<string, { result: PinFetchResult<unknown>; fetchedAt: number }>();
const inFlightPinRequests = new Map<string, Promise<PinFetchResult<unknown>>>();
const PIN_CACHE_TTL_MS = 1500;

/**
 * Tests an individual pin connection and returns structured diagnostic results.
 * Deduplicates in-flight requests and caches responses for 1.5s to avoid rate-limiting.
 */
export async function testPinConnection(
  pin: AllowedReadPin,
  overrideConfig?: Partial<BlynkConfig>
): Promise<PinFetchResult<unknown>> {
  const cacheKey = `${pin}_${overrideConfig?.token || 'default'}`;
  const now = performance.now();

  const cached = pinCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < PIN_CACHE_TTL_MS) {
    return cached.result;
  }

  const existingPromise = inFlightPinRequests.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  const fetchPromise = (async () => {
    const startTime = performance.now();
    try {
      const { statusCode, text, ok } = await fetchPinRaw(pin, overrideConfig);
      const durationMs = Math.round(performance.now() - startTime);

      if (!ok) {
        const isPinUnconfigured =
          text.toLowerCase().includes("doesn't exist") || text.toLowerCase().includes('not exist');
        const errResult: PinFetchResult<unknown> = {
          pin,
          success: false,
          statusCode,
          rawText: text,
          error: isPinUnconfigured
            ? `Requested pin doesn't exist in the product. Datastream ${pin.toUpperCase()} is unconfigured in Blynk Console.`
            : `HTTP ${statusCode}: ${text}`,
          isPinUnconfigured,
          durationMs,
        };
        pinCache.set(cacheKey, { result: errResult, fetchedAt: performance.now() });
        return errResult;
      }

      // Parse according to pin specification
      let parsedValue: unknown;
      if (pin === 'v0') parsedValue = parseTemperature(text);
      else if (pin === 'v1') parsedValue = parseHumidity(text);
      else if (pin === 'v2') parsedValue = parseGasRaw(text);
      else if (pin === 'v3') parsedValue = parseStorageCondition(text);
      else if (pin === 'v5') parsedValue = parseRiskScore(text);

      const successResult: PinFetchResult<unknown> = {
        pin,
        success: true,
        statusCode,
        data: parsedValue,
        rawText: text,
        durationMs,
      };
      pinCache.set(cacheKey, { result: successResult, fetchedAt: performance.now() });
      return successResult;
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      const isCors = Boolean((err as { isCorsError?: boolean })?.isCorsError);
      const message = err instanceof Error ? err.message : String(err);

      const failedResult: PinFetchResult<unknown> = {
        pin,
        success: false,
        error: message,
        isCorsError: isCors,
        durationMs,
      };
      return failedResult;
    } finally {
      inFlightPinRequests.delete(cacheKey);
    }
  })();

  inFlightPinRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Tests all 5 datastreams (V0, V1, V2, V3, V5) independently.
 */
export async function testAllPins(
  overrideConfig?: Partial<BlynkConfig>
): Promise<Record<AllowedReadPin, PinFetchResult<unknown>>> {
  const [v0, v1, v2, v3, v5] = await Promise.all([
    testPinConnection('v0', overrideConfig),
    testPinConnection('v1', overrideConfig),
    testPinConnection('v2', overrideConfig),
    testPinConnection('v3', overrideConfig),
    testPinConnection('v5', overrideConfig),
  ]);

  return { v0, v1, v2, v3, v5 };
}

