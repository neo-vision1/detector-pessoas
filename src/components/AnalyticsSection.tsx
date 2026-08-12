import React from 'react';
import { ChartDataPoint } from '../types';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { LineChart, BarChart2, ShieldAlert } from 'lucide-react';

interface AnalyticsSectionProps {
  chartData: ChartDataPoint[];
  alertThreshold: number;
}

export const AnalyticsSection: React.FC<AnalyticsSectionProps> = ({
  chartData,
  alertThreshold,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <LineChart className="w-5 h-5 text-emerald-400" />
          <h2 className="font-bold text-base text-white">Análise Histórica de Fluxo em Tempo Real</h2>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          Amostragem: {chartData.length} pontos de dados
        </span>
      </div>

      <div className="h-64 w-full">
        {chartData.length < 2 ? (
          <div className="w-full h-full bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col items-center justify-center text-slate-500 space-y-1">
            <BarChart2 className="w-8 h-8 opacity-40 animate-pulse" />
            <p className="text-xs font-semibold">Coletando telemetria de fluxo de pessoas...</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="countGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00FF66" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#00FF66" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="timestamp" stroke="#64748B" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0F172A',
                  borderColor: '#334155',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: '#F8FAFC',
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                name="Pessoas Detectadas"
                stroke="#00FF66"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#countGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
