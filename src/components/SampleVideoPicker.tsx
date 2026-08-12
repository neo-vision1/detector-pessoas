import React from 'react';
import { SampleVideo } from '../types';
import { Film, X, Play, Check } from 'lucide-react';

interface SampleVideoPickerProps {
  isOpen: boolean;
  onClose: () => void;
  sampleVideos: SampleVideo[];
  selectedVideoId: string | null;
  onSelectSample: (video: SampleVideo) => void;
}

export const SampleVideoPicker: React.FC<SampleVideoPickerProps> = ({
  isOpen,
  onClose,
  sampleVideos,
  selectedVideoId,
  onSelectSample,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Vídeos de Demonstração Pré-Carregados</h2>
              <p className="text-xs text-slate-400">Selecione uma amostra de vídeo para testar a detecção YOLOv8</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Gallery */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto">
          {sampleVideos.map((video) => {
            const isSelected = selectedVideoId === video.id;
            return (
              <div
                key={video.id}
                onClick={() => {
                  onSelectSample(video);
                  onClose();
                }}
                className={`group relative rounded-2xl overflow-hidden border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-emerald-500 ring-2 ring-emerald-500/40 bg-slate-800/80'
                    : 'border-slate-800 bg-slate-950/80 hover:border-slate-700 hover:bg-slate-800/50'
                }`}
              >
                <div className="aspect-video w-full bg-slate-950 relative overflow-hidden">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

                  <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded bg-slate-950/80 text-emerald-400 border border-emerald-500/30">
                    {video.category}
                  </span>

                  {isSelected && (
                    <div className="absolute top-2 right-2 p-1 rounded-full bg-emerald-500 text-slate-950">
                      <Check className="w-4 h-4 stroke-[3]" />
                    </div>
                  )}

                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950/40">
                    <div className="w-10 h-10 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg">
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                <div className="p-3">
                  <h3 className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                    {video.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                    {video.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
