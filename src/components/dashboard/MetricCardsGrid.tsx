import React from 'react';
import { Thermometer, Droplets, Activity, ShieldCheck } from 'lucide-react';
import type { SensorReading, RiskAssessment } from '../../types';
import { MetricCard } from './MetricCard';

interface MetricCardsGridProps {
  reading: SensorReading;
  risk: RiskAssessment;
}

export const MetricCardsGrid: React.FC<MetricCardsGridProps> = ({
  reading,
  risk,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Temperature */}
      <MetricCard
        name="Temperature"
        value={reading.temperature.toFixed(1)}
        unit="°C"
        badge={reading.isStale ? 'Cached' : 'Live'}
        icon={Thermometer}
        accentColor="text-sky-700 bg-sky-50 border-sky-200"
        description="Preservation target window: 2.0°C – 6.0°C. Baseline threshold: 25.0°C."
      />

      {/* 2. Humidity */}
      <MetricCard
        name="Relative Humidity"
        value={reading.humidity.toFixed(1)}
        unit="% RH"
        badge={reading.isStale ? 'Cached' : 'Live'}
        icon={Droplets}
        accentColor="text-blue-700 bg-blue-50 border-blue-200"
        description="Preservation moisture target: 60.0% – 70.0% RH. Baseline threshold: 60.0%."
      />

      {/* 3. Gas Sensor (Raw ADC) */}
      <MetricCard
        name="Gas Sensor (Raw ADC)"
        value={reading.mq135Raw}
        unit="ADC"
        badge={reading.isStale ? 'Cached' : 'Live'}
        icon={Activity}
        accentColor="text-purple-700 bg-purple-50 border-purple-200"
        description="MQ135 raw analog reading (0–4095 ADC). Spoilage baseline threshold: 1500 ADC."
      />

      {/* 4. Risk Index */}
      <MetricCard
        name="Spoilage Risk Index"
        value={risk.score !== null ? risk.score.toFixed(1) : 'Unavailable'}
        unit={risk.score !== null ? '/ 100' : ''}
        badge={
          risk.score !== null
            ? (risk.scoreSource === 'blynk_v5' ? 'Live Telemetry' : 'Calculated')
            : 'Pending Setup'
        }
        icon={ShieldCheck}
        accentColor={
          risk.score === null
            ? 'text-amber-700 bg-amber-50 border-amber-200'
            : risk.level === 'SAFE'
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : 'text-amber-700 bg-amber-50 border-amber-200'
        }
        description={
          risk.score !== null
            ? 'Unified spoilage index based on temperature, humidity, and gas ADC.'
            : `Awaiting cloud datastream setup. Sensor formula check: ${risk.locallyCalculatedScore?.toFixed(1) ?? 'N/A'} / 100 (${risk.level}).`
        }
      />
    </div>
  );
};
