import React from 'react';
import { VideoSourceType } from '../types';
import { Camera, Upload, Film, Sparkles, FileText, Moon, Sun } from 'lucide-react';

interface NavbarProps {
  videoSourceType: VideoSourceType;
  setVideoSourceType: (type: VideoSourceType) => void;
  fps: number;
  activePersonCount: number;
  onOpenSamplePicker: () => void;
  onOpenAiModal: () => void;
  onOpenReport: () => void;
  onUploadClick: () => void;
  onOpenIPCamera: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  videoSourceType,
  setVideoSourceType,
  fps,
  activePersonCount,
  onOpenSamplePicker,
  onOpenAiModal,
  onOpenReport,
  onUploadClick,
  onOpenIPCamera,
  theme,
  onToggleTheme,
}) => {
  return (
    <header className="bg-slate-950 border-b border-slate-800 text-slate-100 px-4 py-3 sticky top-0 z-40 shadow-xl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 p-0.5 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
              </div>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-100">Detector de Pessoas</h1>
              <p className="text-[11px] text-slate-400 font-medium">Visão Computacional em Tempo Real</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center space-x-2 bg-slate-900/90 border border-slate-800 px-3 py-1 rounded-lg text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-slate-300 font-mono">{fps} FPS</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300 font-medium"><span className="text-emerald-400 font-bold font-mono">{activePersonCount}</span> pessoas</span>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-center md:justify-end">
          <button onClick={onUploadClick} className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${videoSourceType === 'file' ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-md shadow-emerald-950/50' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Upload de Vídeo</span>
          </button>

          <button onClick={onOpenIPCamera} className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${videoSourceType === 'ip-camera' ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-md shadow-cyan-950/50' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
            <span>Câmera IP</span>
          </button>

          <button onClick={() => setVideoSourceType('webcam')} className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${videoSourceType === 'webcam' ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-md shadow-emerald-950/50' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
            <span>Webcam ao Vivo</span>
          </button>

          <button onClick={onOpenSamplePicker} className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${videoSourceType === 'sample' ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-md shadow-emerald-950/50' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <Film className="w-3.5 h-3.5 text-amber-400" />
            <span>Vídeos Demo</span>
          </button>

          <button onClick={onOpenReport} className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-all">
            <FileText className="w-3.5 h-3.5" />
            <span>Relatório</span>
          </button>

          <button onClick={onToggleTheme} title={theme === 'dark' ? 'Ativar tema White' : 'Ativar tema Dark'} className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white">
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-indigo-400" />}
            <span>{theme === 'dark' ? 'Dark' : 'White'}</span>
          </button>

          <button onClick={onOpenAiModal} className="flex items-center space-x-1.5 text-xs font-bold px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white shadow-lg shadow-emerald-900/30 hover:brightness-110 active:scale-95 transition-all border border-emerald-400/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Análise Gemini AI</span>
          </button>
        </div>
      </div>
    </header>
  );
};
export default Navbar;
