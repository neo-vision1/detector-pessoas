import React from 'react';
import { DetectionConfig, CountingLine, ROIZone } from '../types';
import { Sliders, Trash2, Activity } from 'lucide-react';

interface ControlsSidebarProps {
  config: DetectionConfig;
  setConfig: React.Dispatch<React.SetStateAction<DetectionConfig>>;
  countingLines: CountingLine[];
  setCountingLines: React.Dispatch<React.SetStateAction<CountingLine[]>>;
  roiZones: ROIZone[];
  setRoiZones: React.Dispatch<React.SetStateAction<ROIZone[]>>;
  onResetCounts: () => void;
}

export const ControlsSidebar: React.FC<ControlsSidebarProps> = ({
  config,
  setConfig,
  countingLines,
  setCountingLines,
  roiZones,
  setRoiZones,
  onResetCounts,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-6 shadow-xl text-slate-200">
      {/* Title */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Sliders className="w-5 h-5 text-emerald-400" />
          <h2 className="font-bold text-base text-white">Parâmetros de Detecção</h2>
        </div>
        <button
          onClick={onResetCounts}
          className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-700 transition-colors"
        >
          Resetar Métricas
        </button>
      </div>

      {/* Threshold Sliders */}
      <div className="space-y-4 pt-2 border-t border-slate-800">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-300">
              Limiar de Confiança (Confidence):
            </span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {Math.round(config.confidenceThreshold * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={config.confidenceThreshold}
            onChange={(e) =>
              setConfig((prev) => ({ ...prev, confidenceThreshold: parseFloat(e.target.value) }))
            }
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Filtra detecções abaixo do percentual especificado.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-300">
              Alerta de Lotação Máxima:
            </span>
            <span className="text-xs font-mono font-bold text-rose-400">
              &gt; {config.alertThreshold} pessoas
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            step={1}
            value={config.alertThreshold}
            onChange={(e) =>
              setConfig((prev) => ({ ...prev, alertThreshold: parseInt(e.target.value) }))
            }
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
          />
        </div>
      </div>

      {/* Counting Lines & Zones List */}
      <div className="space-y-3 pt-2 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
            <Activity className="w-4 h-4 text-amber-400" />
            <span>Linhas & Zonas ({countingLines.length + roiZones.length})</span>
          </label>
        </div>

        {countingLines.length === 0 && roiZones.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Nenhuma linha ou zona ativa. Use os botões na tela do vídeo para desenhar.
          </p>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {countingLines.map((line) => (
              <div
                key={line.id}
                className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800 text-xs"
              >
                <div>
                  <span className="font-bold text-amber-400">{line.name}</span>
                  <span className="text-slate-500 ml-2 font-mono">
                    Presentes: <strong className="text-amber-300">{line.currentCount}</strong>
                  </span>
                </div>
                <button
                  onClick={() =>
                    setCountingLines((prev) => prev.filter((l) => l.id !== line.id))
                  }
                  className="text-slate-500 hover:text-rose-400 p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {roiZones.map((roi) => (
              <div
                key={roi.id}
                className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800 text-xs"
              >
                <div>
                  <span className="font-bold text-blue-400">{roi.name}</span>
                  <span className="text-slate-500 ml-2">Perímetro ROI</span>
                </div>
                <button
                  onClick={() => setRoiZones((prev) => prev.filter((z) => z.id !== roi.id))}
                  className="text-slate-500 hover:text-rose-400 p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
