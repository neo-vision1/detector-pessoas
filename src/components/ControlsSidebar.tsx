import React from 'react';
import { DetectionConfig, CountingLine, ROIZone } from '../types';
import { Sliders, Cpu, Eye, Palette, Trash2, Plus, ShieldAlert, Sparkles, Activity } from 'lucide-react';

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
  const colorPalette = [
    { name: 'Verde Neon', hex: '#00FF66' },
    { name: 'Ciano Cyber', hex: '#00E5FF' },
    { name: 'Laranja Elétrico', hex: '#FF5500' },
    { name: 'Rosa Magenta', hex: '#FF007A' },
    { name: 'Amarelo Alerta', hex: '#FACC15' },
    { name: 'Púrpura UV', hex: '#A855F7' },
  ];

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

      {/* 1. YOLOv8 Model Selection */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <span>Modelo YOLOv8</span>
        </label>
        <div className="rounded-xl border border-emerald-500/60 bg-emerald-500/10 p-3 shadow-md shadow-emerald-950/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-100">YOLOv8 Nano (yolov8n)</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-emerald-500/30">
              Ativo
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Modelo fixo, leve e otimizado para detecção em tempo real.</p>
        </div>
      </div>

      {/* 2. Threshold Sliders */}
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

      {/* 3. Visual Customizations */}
      <div className="space-y-3 pt-2 border-t border-slate-800">
        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
          <Palette className="w-4 h-4 text-cyan-400" />
          <span>Visual dos Delimitadores</span>
        </label>

        {/* Color Picker */}
        <div className="flex items-center space-x-2">
          {colorPalette.map((c) => (
            <button
              key={c.hex}
              onClick={() => setConfig((prev) => ({ ...prev, boxColor: c.hex }))}
              title={c.name}
              style={{ backgroundColor: c.hex }}
              className={`w-6 h-6 rounded-full transition-transform border-2 ${
                config.boxColor === c.hex ? 'scale-125 border-white shadow-lg' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            />
          ))}
        </div>

        {/* Checkbox Toggles */}
        <div className="grid grid-cols-2 gap-2 text-xs pt-2">
          <label className="flex items-center space-x-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showLabels}
              onChange={(e) => setConfig((prev) => ({ ...prev, showLabels: e.target.checked }))}
              className="rounded accent-emerald-500"
            />
            <span>Rótulo "Pessoa"</span>
          </label>

          <label className="flex items-center space-x-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showConfidence}
              onChange={(e) => setConfig((prev) => ({ ...prev, showConfidence: e.target.checked }))}
              className="rounded accent-emerald-500"
            />
            <span>% Confiança</span>
          </label>

          <label className="flex items-center space-x-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showTrackingId}
              onChange={(e) => setConfig((prev) => ({ ...prev, showTrackingId: e.target.checked }))}
              className="rounded accent-emerald-500"
            />
            <span>ID Rastreio (#)</span>
          </label>

          <label className="flex items-center space-x-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showMotionTrails}
              onChange={(e) => setConfig((prev) => ({ ...prev, showMotionTrails: e.target.checked }))}
              className="rounded accent-emerald-500"
            />
            <span>Rastro Movimento</span>
          </label>

          <label className="flex items-center space-x-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showPoseKeypoints}
              onChange={(e) => setConfig((prev) => ({ ...prev, showPoseKeypoints: e.target.checked }))}
              className="rounded accent-emerald-500"
            />
            <span>Pontos Articulação</span>
          </label>

          <label className="flex items-center space-x-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showHeatmap}
              onChange={(e) => setConfig((prev) => ({ ...prev, showHeatmap: e.target.checked }))}
              className="rounded accent-emerald-500"
            />
            <span>Mapa de Calor</span>
          </label>
        </div>
      </div>

      {/* 4. Counting Lines & Zones List */}
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
                    IN: {line.countIn} | OUT: {line.countOut}
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
