import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, CircleHelp, LockKeyhole, X } from 'lucide-react';
import { IPCameraConfig } from '../types';

interface IPCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (config: IPCameraConfig) => void;
}

export const IPCameraModal: React.FC<IPCameraModalProps> = ({ isOpen, onClose, onConnect }) => {
  const [name, setName] = useState('Intelbras VIP 1300 MINI SD');
  const [hlsUrl, setHlsUrl] = useState('');
  const [accessUsername, setAccessUsername] = useState('');
  const [accessPassword, setAccessPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnect = () => {
    const trimmedUrl = hlsUrl.trim();
    if (!trimmedUrl) {
      setError('Informe a URL HLS fornecida pelo gateway local.');
      return;
    }

    try {
      const parsed = new URL(trimmedUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('protocol');
      }
    } catch {
      setError('Informe uma URL HTTP/HTTPS válida, por exemplo: https://seu-dominio/camera/index.m3u8');
      return;
    }

    onConnect({
      name: name.trim() || 'Câmera IP',
      hlsUrl: trimmedUrl,
      accessUsername: accessUsername.trim() || undefined,
      accessPassword: accessPassword || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-400">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Conectar câmera IP</h2>
              <p className="text-xs text-slate-400">Stream remoto protegido pelo gateway local</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Nome da câmera</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
              placeholder="Ex.: Entrada principal"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">URL HLS do gateway</span>
            <input
              value={hlsUrl}
              onChange={(event) => {
                setHlsUrl(event.target.value);
                setError(null);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400"
              placeholder="https://stream.exemplo.com/camera/index.m3u8"
              spellCheck={false}
              autoComplete="off"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Usuário de leitura (opcional)</span>
            <input
              value={accessUsername}
              onChange={(event) => setAccessUsername(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400"
              placeholder="Ex.: operador"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Senha de leitura (opcional)</span>
            <input
              value={accessPassword}
              onChange={(event) => setAccessPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400"
              placeholder="Senha do usuário do gateway"
              type="password"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-200">
            <div className="mb-1 flex items-center gap-2 font-semibold"><CircleHelp className="h-4 w-4" />Não use rtsp:// neste campo</div>
            <p className="text-amber-100/75">O navegador deve receber HLS/HTTPS. O endereço RTSP e a senha da Intelbras ficam somente no gateway. O usuário e a senha são apenas para autorizar a leitura do stream convertido.</p>
          </div>

          <div className="grid grid-cols-1 gap-2 text-[11px] text-slate-400 sm:grid-cols-2">
            <div className="flex items-center gap-2"><LockKeyhole className="h-3.5 w-3.5 text-emerald-400" />Acesso remoto com HTTPS</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />Credenciais fora do frontend</div>
          </div>

          {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">Cancelar</button>
          <button onClick={handleConnect} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400">Conectar câmera</button>
        </div>
      </div>
    </div>
  );
};
