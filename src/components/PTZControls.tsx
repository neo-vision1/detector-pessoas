import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Home,
  LoaderCircle,
  Move,
  RefreshCw,
  Square,
} from 'lucide-react';

type PtzDirection = 'up' | 'down' | 'left' | 'right';
type ConnectionState = 'checking' | 'ready' | 'unavailable';

interface PtzStatusResponse {
  connected: boolean;
  device?: {
    manufacturer?: string;
    model?: string;
  };
}

const getApiError = async (response: Response) => {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || 'Não foi possível comunicar com o controle PTZ.';
  } catch {
    return 'Não foi possível comunicar com o controle PTZ.';
  }
};

export const PTZControls: FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('checking');
  const [statusText, setStatusText] = useState('Verificando conexão ONVIF…');
  const latestCommandRef = useRef(0);

  const refreshStatus = useCallback(async () => {
    setConnectionState('checking');
    setStatusText('Verificando conexão ONVIF…');

    try {
      const response = await fetch('/api/camera/ptz/status');
      if (!response.ok) throw new Error(await getApiError(response));

      const status = (await response.json()) as PtzStatusResponse;
      const deviceName = [status.device?.manufacturer, status.device?.model]
        .filter(Boolean)
        .join(' ');
      setConnectionState('ready');
      setStatusText(deviceName ? `Conectado: ${deviceName}` : 'Câmera PTZ conectada.');
    } catch (error) {
      setConnectionState('unavailable');
      setStatusText(error instanceof Error ? error.message : 'PTZ indisponível.');
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const sendCommand = async (
    endpoint: string,
    options: { body?: Record<string, unknown>; successMessage: string }
  ) => {
    if (connectionState === 'unavailable') return;

    const commandId = ++latestCommandRef.current;
    setStatusText(options.successMessage);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      if (!response.ok) throw new Error(await getApiError(response));

      if (commandId === latestCommandRef.current) {
        setConnectionState('ready');
      }
    } catch (error) {
      // Respostas antigas não podem substituir o estado de um comando mais recente.
      if (commandId !== latestCommandRef.current) return;
      setConnectionState('unavailable');
      setStatusText(error instanceof Error ? error.message : 'Falha ao enviar o comando PTZ.');
    }
  };

  const move = (direction: PtzDirection) => {
    const labels: Record<PtzDirection, string> = {
      up: 'Movendo para cima…',
      down: 'Movendo para baixo…',
      left: 'Movendo para a esquerda…',
      right: 'Movendo para a direita…',
    };
    // Cada toque envia um pulso de 180 ms. A API envia Stop automaticamente.
    void sendCommand('/api/camera/ptz/move', {
      body: { direction, durationMs: 180 },
      successMessage: labels[direction],
    });
  };

  const stop = () => {
    // Não há bloqueio de interface: o botão Parar pode ser acionado imediatamente.
    void sendCommand('/api/camera/ptz/stop', {
      successMessage: 'Parando a câmera…',
    });
  };

  const disabled = connectionState !== 'ready';
  const actionClass =
    'h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-200 transition-colors hover:border-emerald-500 hover:bg-emerald-500/15 hover:text-emerald-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl text-slate-200">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Move className="h-5 w-5 text-sky-400" />
          <div>
            <h2 className="text-base font-bold text-white">Controle PTZ</h2>
            <p className="mt-0.5 text-[10px] text-slate-500">Toques curtos de 180 ms para ajuste fino.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refreshStatus()}
          disabled={connectionState === 'checking'}
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-400 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
          title="Atualizar status PTZ"
          aria-label="Atualizar status PTZ"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${connectionState === 'checking' ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div
        className={`rounded-lg border px-3 py-2 text-xs ${
          connectionState === 'ready'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : connectionState === 'checking'
              ? 'border-slate-700 bg-slate-950 text-slate-400'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        }`}
        role="status"
      >
        <div className="flex items-center gap-2">
          {connectionState === 'checking' && <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />}
          <span>{statusText}</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5" aria-label="Comandos de direção PTZ">
        <button type="button" className={actionClass} onClick={() => move('up')} disabled={disabled} title="Mover para cima" aria-label="Mover para cima">
          <ChevronUp className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1.5">
          <button type="button" className={actionClass} onClick={() => move('left')} disabled={disabled} title="Mover para a esquerda" aria-label="Mover para a esquerda">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-rose-500/50 bg-rose-500/10 text-rose-300 transition-colors hover:bg-rose-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={stop}
            disabled={connectionState === 'unavailable'}
            title="Parar movimento imediatamente"
            aria-label="Parar movimento imediatamente"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
          <button type="button" className={actionClass} onClick={() => move('right')} disabled={disabled} title="Mover para a direita" aria-label="Mover para a direita">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <button type="button" className={actionClass} onClick={() => move('down')} disabled={disabled} title="Mover para baixo" aria-label="Mover para baixo">
          <ChevronDown className="h-5 w-5" />
        </button>
      </div>

      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => void sendCommand('/api/camera/ptz/home', { successMessage: 'Indo para a posição inicial…' })}
        disabled={disabled}
      >
        <Home className="h-4 w-4" />
        Posição inicial
      </button>
    </section>
  );
};
