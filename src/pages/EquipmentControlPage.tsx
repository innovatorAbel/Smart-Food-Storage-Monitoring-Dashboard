import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Clock, Radio, TestTube2 } from 'lucide-react';
import type { EquipmentCommandState } from '../types';
import { storageService } from '../services';
import {
  CoolingFanCard,
  VentServoCard,
  BuzzerControlCard,
  EquipmentSummaryTable,
} from '../components/controls';

export const EquipmentControlPage: React.FC = () => {
  const [equipmentState, setEquipmentState] = useState<EquipmentCommandState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const isLive = storageService.isLive();

  useEffect(() => {
    let isMounted = true;
    storageService
      .getFanState()
      .then((state) => {
        if (isMounted) {
          setEquipmentState(state);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load equipment state', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const refreshEquipmentData = useCallback(async () => {
    try {
      setLoading(true);
      const state = await storageService.getFanState();
      setEquipmentState(state);
    } catch (err) {
      console.error('Failed to refresh equipment state', err);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading && !equipmentState) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-sm font-medium text-slate-600">Loading equipment actuator states...</p>
      </div>
    );
  }

  const lastSyncTime = equipmentState?.lastCommandAt
    ? new Date(equipmentState.lastCommandAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '--:--:--';

  return (
    <div className="space-y-6">
      {/* Top Header & Refresh Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Equipment Status &amp; Automatic Operation
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated ventilation fan, intake servo, and alert buzzer control
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center text-xs">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-200">
              <Radio className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
              Blynk Stream
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium border border-slate-200">
              <TestTube2 className="w-3.5 h-3.5 text-blue-600" />
              Demo Environment
            </span>
          )}

          <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-white px-2.5 py-1 rounded border border-slate-200 text-slate-600">
            <Clock className="w-3 h-3 text-slate-400" />
            Evaluated: {lastSyncTime}
          </span>

          <button
            type="button"
            onClick={refreshEquipmentData}
            className="p-1 rounded hover:bg-slate-200/60 text-slate-500 hover:text-slate-800 transition-colors"
            title="Refresh equipment states"
            aria-label="Refresh equipment states"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Primary Cooling Fan Status (Active-HIGH Relay) */}
      {equipmentState && (
        <CoolingFanCard equipmentState={equipmentState} />
      )}

      {/* Autonomous Peripherals Grid: Vent Servo & Buzzer */}
      {equipmentState && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <VentServoCard equipmentState={equipmentState} />
          <BuzzerControlCard equipmentState={equipmentState} />
        </div>
      )}

      {/* Equipment Summary Matrix */}
      {equipmentState && <EquipmentSummaryTable equipmentState={equipmentState} />}
    </div>
  );
};
