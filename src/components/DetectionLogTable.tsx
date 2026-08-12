import React, { useState } from 'react';
import { DetectionLogItem } from '../types';
import { Table, Download, Search, FileText, Camera, ShieldAlert } from 'lucide-react';

interface DetectionLogTableProps {
  logs: DetectionLogItem[];
  onClearLogs: () => void;
}

export const DetectionLogTable: React.FC<DetectionLogTableProps> = ({ logs, onClearLogs }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredLogs = logs.filter(
    (log) =>
      log.timestamp.includes(searchTerm) ||
      log.alerts.some((a) => a.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const exportToCSV = () => {
    if (logs.length === 0) return;
    const headers = ['ID', 'Timestamp', 'Tempo (seg)', 'Frame', 'Contagem Pessoas', 'Confianca Media (%)', 'Alertas'];
    const rows = logs.map((l) => [
      l.id,
      l.timestamp,
      l.timeSec.toFixed(1),
      l.frameNumber,
      l.personCount,
      (l.confidenceAvg * 100).toFixed(1),
      `"${l.alerts.join('; ')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `YOLOv8_Logs_Detecção_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Table Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Table className="w-5 h-5 text-emerald-400" />
          <div>
            <h2 className="font-bold text-base text-white">Registro de Eventos de Detecção</h2>
            <p className="text-xs text-slate-400">Histórico detalhado de frames com carimbo de data e hora</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar evento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <button
            onClick={exportToCSV}
            disabled={logs.length === 0}
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-40 transition-colors shadow-md shadow-emerald-950/30"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-72 border border-slate-800 rounded-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-bold border-b border-slate-800">
              <th className="p-3">Horário</th>
              <th className="p-3">Tempo no Vídeo</th>
              <th className="p-3">Pessoas Detectadas</th>
              <th className="p-3">Confiança Média</th>
              <th className="p-3">Alertas & Ocorrências</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500 italic">
                  Nenhum evento registrado ainda.
                </td>
              </tr>
            ) : (
              filteredLogs.slice(-25).reverse().map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-3 font-mono text-slate-400">{log.timestamp}</td>
                  <td className="p-3 font-mono text-emerald-400">{log.timeSec.toFixed(1)}s</td>
                  <td className="p-3 font-mono font-bold text-white">{log.personCount} pessoas</td>
                  <td className="p-3 font-mono text-cyan-400">
                    {(log.confidenceAvg * 100).toFixed(1)}%
                  </td>
                  <td className="p-3">
                    {log.alerts.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {log.alerts.map((al, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center space-x-1"
                          >
                            <ShieldAlert className="w-3 h-3" />
                            <span>{al}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[11px]">Sem alertas</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
