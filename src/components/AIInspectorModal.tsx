import React, { useState } from 'react';
import { AIAnalysisResult } from '../types';
import { Sparkles, X, ShieldAlert, CheckCircle2, AlertTriangle, Cpu, RefreshCw } from 'lucide-react';

interface AIInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePersonCount: number;
  selectedModel: string;
  getFrameSnapshotBase64: () => string | null;
}

export const AIInspectorModal: React.FC<AIInspectorModalProps> = ({
  isOpen,
  onClose,
  activePersonCount,
  selectedModel,
  getFrameSnapshotBase64,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshotPreview, setSnapshotPreview] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);

    const base64Img = getFrameSnapshotBase64();
    if (!base64Img) {
      setError('Não foi possível obter o frame atual do vídeo.');
      setIsAnalyzing(false);
      return;
    }

    setSnapshotPreview(base64Img);

    try {
      const res = await fetch('/api/ai-analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Img,
          detectionCount: activePersonCount,
          timestamp: new Date().toLocaleTimeString('pt-BR'),
          modelName: selectedModel,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setAnalysis(data.analysis);
      } else {
        setError(data.error || 'Erro ao realizar análise Gemini AI.');
      }
    } catch (err: any) {
      setError('Erro de rede ao conectar com o servidor Gemini AI.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-slate-950 font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Auditoria Inteligente de Cena (Gemini AI)</h2>
              <p className="text-xs text-slate-400">Análise multimodal de densidade, segurança e comportamentos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Action trigger if no analysis yet */}
          {!analysis && !isAnalyzing && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                <Cpu className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Capturar Frame e Analisar com Gemini 3.6</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  O Gemini AI processará a imagem atual da visão computacional para classificar agrupamentos, estimar risco e fornecer recomendações de segurança.
                </p>
              </div>
              <button
                onClick={handleRunAnalysis}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-950/50 transition-all active:scale-95 flex items-center space-x-2 mx-auto"
              >
                <Sparkles className="w-4 h-4" />
                <span>Iniciar Análise Visual</span>
              </button>
            </div>
          )}

          {/* Loading state */}
          {isAnalyzing && (
            <div className="text-center py-12 space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-white">Analisando frame de vídeo com Gemini Vision AI...</p>
              <p className="text-xs text-slate-400">Avaliando vetores de movimento e densidade populacional.</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Results View */}
          {analysis && (
            <div className="space-y-4">
              {snapshotPreview && (
                <div className="rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video max-h-48">
                  <img src={snapshotPreview} alt="Snapshot" className="w-full h-full object-contain" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Densidade de Multidão</span>
                  <span className="text-base font-bold text-emerald-400">{analysis.crowdDensity}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Status de Segurança</span>
                  <span className="text-base font-bold text-cyan-400">{analysis.safetyStatus}</span>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-300 block">Atividade da Cena:</span>
                <p className="text-xs text-slate-300 leading-relaxed">{analysis.activityDescription}</p>
              </div>

              {analysis.anomalies && analysis.anomalies.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl space-y-1">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Observações de Campo:
                  </span>
                  <ul className="list-disc list-inside text-xs text-amber-200/90 space-y-1">
                    {analysis.anomalies.map((an, i) => (
                      <li key={i}>{an}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-xl space-y-1">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Recomendação Operacional:
                </span>
                <p className="text-xs text-emerald-200">{analysis.recommendation}</p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleRunAnalysis}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors flex items-center space-x-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reanalisar Outro Frame</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
