import React from 'react';
import { VideoSourceType, ModelOption } from '../types';
import { Camera, Upload, Film, Cpu, Sparkles, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  videoSourceType: VideoSourceType;
  setVideoSourceType: (type: VideoSourceType) => void;
  selectedModel: ModelOption;
  fps: number;
  activePersonCount: number;
  onOpenSamplePicker: () => void;
  onOpenAiModal: () => void;
  onUploadClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  videoSourceType,
  setVideoSourceType,
  selectedModel,
  fps,
  activePersonCount,
  onOpenSamplePicker,
  onOpenAiModal,
  onUploadClick,
}) => {
  return (
    <header className="bg-slate-950 border-b border-slate-800 text-slate-100 px-4 py-3 sticky top-0 z-40 shadow-xl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Brand & Logo */}
        <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 p-0.5 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Cpu className="w-5 h-5 text-emerald-400 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  YOLOv8 <span className="text-emerald-400 font-mono text-xs px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/30">ULTRALYTICS</span>
                </h1>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Visão Computacional em Tempo Real</p>
            </div>
          </div>

          {/* Active Model & FPS badge */}
          <div className="hidden sm:flex items-center space-x-2 bg-slate-900/90 border border-slate-800 px-3 py-1 rounded-lg text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-mono text-emerald-400 font-semibold uppercase">{selectedModel}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300 font-mono">{fps} FPS</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300 font-medium">
              <span className="text-emerald-400 font-bold font-mono">{activePersonCount}</span> pessoas
            </span>
          </div>
        </div>

        {/* Source Switchers & AI Action */}
        <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-center md:justify-end">
          {/* File Upload Button */}
          <button
            onClick={onUploadClick}
            className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
              videoSourceType === 'file'
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-md shadow-emerald-950/50'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Upload de Vídeo</span>
          </button>

          {/* Webcam Button */}
          <button
            onClick={() => setVideoSourceType('webcam')}
            className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
              videoSourceType === 'webcam'
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-md shadow-emerald-950/50'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
            <span>Webcam ao Vivo</span>
          </button>

          {/* Sample Videos Preset */}
          <button
            onClick={onOpenSamplePicker}
            className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
              videoSourceType === 'sample'
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-md shadow-emerald-950/50'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5 text-amber-400" />
            <span>Vídeos Demo</span>
          </button>

          {/* AI Scene Audit Button */}
          <button
            onClick={onOpenAiModal}
            className="flex items-center space-x-1.5 text-xs font-bold px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white shadow-lg shadow-emerald-900/30 hover:brightness-110 active:scale-95 transition-all border border-emerald-400/30"
          >
            <Sparkles className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
            <span>Análise Gemini AI</span>
          </button>
        </div>
      </div>
    </header>
  );
};
