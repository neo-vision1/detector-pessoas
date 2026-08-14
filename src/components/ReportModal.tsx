import React, { useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Camera, Download, FileText, X } from 'lucide-react';
import { ChartDataPoint, DetectionLogItem } from '../types';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartData: ChartDataPoint[];
  logs: DetectionLogItem[];
  snapshotUrl: string | null;
  onCaptureSnapshot: () => void;
}

const toSeconds = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 3600 + (minutes || 0) * 60;
};

const isInPeriod = (timeSec: number, startSec: number, endSec: number) => {
  if (startSec <= endSec) return timeSec >= startSec && timeSec <= endSec;
  return timeSec >= startSec || timeSec <= endSec;
};

const formatClock = (timeSec: number) => {
  const normalized = Math.max(0, Math.floor(timeSec));
  const hours = Math.floor(normalized / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((normalized % 3600) / 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  chartData,
  logs,
  snapshotUrl,
  onCaptureSnapshot,
}) => {
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const filteredData = useMemo(() => {
    const startSec = toSeconds(startTime);
    const endSec = toSeconds(endTime);
    return chartData.filter((point) => isInPeriod(point.timeSec, startSec, endSec));
  }, [chartData, startTime, endTime]);

  const filteredLogs = useMemo(() => {
    const startSec = toSeconds(startTime);
    const endSec = toSeconds(endTime);
    return logs.filter((log) => isInPeriod(log.timeSec, startSec, endSec));
  }, [logs, startTime, endTime]);

  const peak = filteredData.reduce((max, point) => Math.max(max, point.count), 0);

  const downloadSnapshot = () => {
    if (!snapshotUrl) return;
    const link = document.createElement('a');
    link.href = snapshotUrl;
    link.download = `relatorio-captura-${Date.now()}.png`;
    link.click();
  };

  const downloadChart = () => {
    const svg = chartContainerRef.current?.querySelector('svg');
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-grafico-${Date.now()}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl">
        <div className="mb-5 flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2 text-cyan-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Relatório de detecção</h2>
              <p className="text-xs text-slate-400">Selecione o intervalo de horas para filtrar os dados registrados.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title="Fechar relatório">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:grid-cols-3 sm:items-end">
          <label className="text-xs font-semibold text-slate-300">
            De
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs font-semibold text-slate-300">
            Até
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
              <strong className="block text-lg font-mono text-cyan-400">{filteredData.length}</strong>
              pontos
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
              <strong className="block text-lg font-mono text-amber-400">{peak}</strong>
              pico
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
              <strong className="block text-lg font-mono text-rose-400">{filteredLogs.length}</strong>
              alertas
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100">Pessoas detectadas no período</h3>
                <p className="text-[11px] text-slate-500">{startTime} — {endTime}</p>
              </div>
              <button onClick={downloadChart} disabled={filteredData.length === 0} className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 disabled:opacity-40">
                <Download className="h-3.5 w-3.5" /> SVG
              </button>
            </div>
            <div ref={chartContainerRef} className="h-64 w-full">
              {filteredData.length < 2 ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">Ainda não há dados suficientes neste período.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="timestamp" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                    <Line type="monotone" dataKey="count" name="Pessoas" stroke="#22d3ee" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100">Captura do vídeo</h3>
                <p className="text-[11px] text-slate-500">Use o frame atual para documentar as pessoas detectadas.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={onCaptureSnapshot} className="flex items-center gap-1 rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-bold text-slate-950">
                  <Camera className="h-3.5 w-3.5" /> Capturar
                </button>
                <button onClick={downloadSnapshot} disabled={!snapshotUrl} className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 disabled:opacity-40">
                  <Download className="h-3.5 w-3.5" /> Baixar
                </button>
              </div>
            </div>
            <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-black">
              {snapshotUrl ? <img src={snapshotUrl} alt="Captura do vídeo" className="max-h-64 w-full object-contain" /> : <span className="px-5 text-center text-xs text-slate-500">Clique em Capturar para registrar o frame atual do vídeo.</span>}
            </div>
          </section>
        </div>

        <div className="mt-5 border-t border-slate-800 pt-4 text-right">
          <button onClick={onClose} className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-600">Fechar relatório</button>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;
