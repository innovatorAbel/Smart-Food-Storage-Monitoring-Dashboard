import React from 'react';
import { Fan, Cpu, Info, Clock } from 'lucide-react';
import type { EquipmentCommandState } from '../../types';

interface CoolingFanCardProps {
  equipmentState: EquipmentCommandState;
}

export const CoolingFanCard: React.FC<CoolingFanCardProps> = ({ equipmentState }) => {
  const isCommandOn = equipmentState.fanRelay === 'on';

  const formattedCommandTime = equipmentState.lastCommandAt
    ? new Date(equipmentState.lastCommandAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '--:--:--';

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
      <div>
        {/* Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border transition-colors ${
                isCommandOn
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <Fan className={`w-5 h-5 ${isCommandOn ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Chamber Ventilation Fan (Active-HIGH Relay)
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  GPIO Relay Pin 26
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Microcontroller-switched active ventilation and air circulation unit
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center text-xs text-slate-500 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Last Evaluated: {formattedCommandTime}</span>
          </div>
        </div>

        {/* Operational Status Boxes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5">
          {/* Commanded State Box */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Commanded Relay State
              </span>
              <div className="flex items-center gap-2.5 mt-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase ${
                    isCommandOn
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-200/90 text-slate-700 border border-slate-300'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${isCommandOn ? 'bg-emerald-600' : 'bg-slate-500'}`}
                  />
                  {equipmentState.fanRelay.toUpperCase()}
                </span>
                <span className="text-xs text-slate-500">
                  {isCommandOn ? 'Relay Energized (HIGH)' : 'Relay De-energized (LOW)'}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
              Relay polarity is Active-HIGH (<code>#define RELAY_ON HIGH</code>). Commanded automatically by firmware logic.
            </p>
          </div>

          {/* Physical Confirmation Box */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Physical Feedback Status
              </span>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-slate-600 bg-slate-200/70 border border-slate-300/80">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  Unavailable
                </span>
                <span className="text-xs text-slate-500">Open loop hardware</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
              Physical fan tachometer feedback is unavailable in firmware. Displayed state is commanded, not physically confirmed.
            </p>
          </div>
        </div>

        {/* Control Authority Banner */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Cpu className="w-4 h-4 text-blue-600" />
            <span>Strictly Automatic Operation</span>
            <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              No Manual Overrides
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Ventilation fan operation is governed strictly by the ESP32 firmware control cycle.
            Virtual Pin V4 manual control is not implemented in the firmware. Manual actuation buttons and overrides have been removed to preserve hardware accuracy.
          </p>
        </div>
      </div>

      {/* Firmware Control Matrix Notice */}
      <div className="mt-5 p-4 rounded-lg bg-blue-50/70 border border-blue-200 text-blue-900 text-xs space-y-2">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-semibold text-blue-950">Firmware Logic Matrix:</strong>{' '}
            The ESP32 evaluates storage risk every 2 seconds and switches the Active-HIGH relay:
          </div>
        </div>

        <div className="pt-2 border-t border-blue-200/60 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
          <div className="p-2 rounded bg-white/80 border border-blue-200">
            <span className="font-semibold text-emerald-800 block">SAFE (Risk ≤ 30):</span>
            <span>Relay OFF (LOW) — Standby</span>
          </div>
          <div className="p-2 rounded bg-white/80 border border-blue-200">
            <span className="font-semibold text-amber-800 block">MODERATE (30 &lt; Risk ≤ 60):</span>
            <span>Relay ON (HIGH) — Active</span>
          </div>
          <div className="p-2 rounded bg-white/80 border border-blue-200">
            <span className="font-semibold text-rose-800 block">DANGER (Risk &gt; 60):</span>
            <span>Relay ON (HIGH) — Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};
