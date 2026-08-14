import React from 'react';
import { Users, TrendingUp, ShieldAlert, Award, Footprints, ArrowUpDown } from 'lucide-react';

interface MetricsPanelProps {
  activePersonCount: number;
  peakPersonCount: number;
  totalUniqueTracked: number;
  totalLineIn: number;
  totalLineOut: number;
  currentLineOccupancy: number;
  fps: number;
  alertThreshold: number;
  isCapacityExceeded: boolean;
}

export const MetricsPanel: React.FC<MetricsPanelProps> = ({
  activePersonCount,
  peakPersonCount,
  totalUniqueTracked,
  totalLineIn,
  totalLineOut,
  currentLineOccupancy,
  fps,
  alertThreshold,
  isCapacityExceeded,
}) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* 1. Active Person Count KPI */}
      <div
        className={`relative bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between transition-all shadow-xl overflow-hidden ${
          isCapacityExceeded
            ? 'border-rose-500/80 shadow-rose-950/50 bg-rose-950/20'
            : 'border-emerald-500/30 hover:border-emerald-500/60 shadow-emerald-950/20'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Pessoas Detectadas
          </span>
          <div
            className={`p-2 rounded-xl border ${
              isCapacityExceeded
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}
          >
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="flex items-baseline space-x-2">
          <span className="text-3xl font-extrabold font-mono text-white tracking-tight">
            {activePersonCount}
          </span>
          <span className="text-xs text-slate-400">no frame</span>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Limite de Lotação: {alertThreshold}</span>
          {isCapacityExceeded ? (
            <span className="text-rose-400 font-bold flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" /> ALERTA!
            </span>
          ) : (
            <span className="text-emerald-400 font-medium">Normal</span>
          )}
        </div>
      </div>

      {/* 2. Total Unique Tracked */}
      <div className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Total Único Rastreado
          </span>
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Footprints className="w-5 h-5" />
          </div>
        </div>

        <div className="flex items-baseline space-x-2">
          <span className="text-3xl font-extrabold font-mono text-cyan-400 tracking-tight">
            {totalUniqueTracked}
          </span>
          <span className="text-xs text-slate-400">IDs de rastreio</span>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>Rastreamento Contínuo SORT</span>
          <span className="text-cyan-400 font-mono">100% Ativo</span>
        </div>
      </div>

      {/* 3. Entrance / Exit Line Counter */}
      <div className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Linha de Cruzamento
          </span>
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <ArrowUpDown className="w-5 h-5" />
          </div>
        </div>

        <div className="my-1 rounded-xl border border-amber-500/30 bg-slate-950/80 p-2 text-center">
          <span className="block text-[10px] font-bold uppercase text-amber-400">Pessoas na área</span>
          <span className="text-3xl font-extrabold font-mono text-white">{currentLineOccupancy}</span>
        </div>

        <div className="mt-1 flex justify-center gap-3 text-[11px] text-slate-400">
          <span>Entradas: <strong className="font-mono text-emerald-400">{totalLineIn}</strong></span>
          <span>Saídas: <strong className="font-mono text-rose-400">{totalLineOut}</strong></span>
        </div>
      </div>

      {/* 4. Peak Count & Vision FPS */}
      <div className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Pico & Desempenho
          </span>
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-2xl font-extrabold font-mono text-purple-300">
              {peakPersonCount}
            </span>
            <span className="text-xs text-slate-400 block">Pico Máximo</span>
          </div>
          <div className="text-right">
            <span className="text-2xl font-extrabold font-mono text-emerald-400">
              {fps}
            </span>
            <span className="text-xs text-slate-400 block">FPS Processador</span>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>Aceleração WebGL</span>
          <span className="text-emerald-400 font-mono">GPU Ativa</span>
        </div>
      </div>
    </div>
  );
};
