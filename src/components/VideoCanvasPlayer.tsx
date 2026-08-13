import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import Hls from 'hls.js';
import {
  DetectionConfig,
  VideoSourceType,
  DetectedPerson,
  CountingLine,
  ROIZone,
  Point,
} from '../types';
import { SimpleCentroidTracker } from '../utils/tracker';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Camera,
  Maximize,
  Sliders,
  Sparkles,
  MousePointer,
  PenTool,
  ShieldAlert,
  Download,
  Video,
  VideoOff,
  Square,
  AlertCircle
} from 'lucide-react';

interface VideoCanvasPlayerProps {
  videoUrl: string | null;
  videoSourceType: VideoSourceType;
  ipCameraAccessUsername?: string;
  ipCameraAccessPassword?: string;
  config: DetectionConfig;
  countingLines: CountingLine[];
  setCountingLines: React.Dispatch<React.SetStateAction<CountingLine[]>>;
  roiZones: ROIZone[];
  setRoiZones: React.Dispatch<React.SetStateAction<ROIZone[]>>;
  onDetectionUpdate: (
    persons: DetectedPerson[],
    lineCrossings: { lineId: string; direction: 'in' | 'out' }[],
    roiViolations: string[],
    fps: number
  ) => void;
  onTakeSnapshot: (canvas: HTMLCanvasElement, persons: DetectedPerson[]) => void;
}

export const VideoCanvasPlayer: React.FC<VideoCanvasPlayerProps> = ({
  videoUrl,
  videoSourceType,
  ipCameraAccessUsername,
  ipCameraAccessPassword,
  config,
  countingLines,
  setCountingLines,
  roiZones,
  setRoiZones,
  onDetectionUpdate,
  onTakeSnapshot,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // COCO-SSD / Vision model ref
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const trackerRef = useRef<SimpleCentroidTracker>(new SimpleCentroidTracker());

  // State
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [drawingMode, setDrawingMode] = useState<'none' | 'line' | 'roi'>('none');
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // FPS calculation
  const lastFrameTimeRef = useRef<number>(performance.now());
  const frameCountRef = useRef<number>(0);
  const fpsRef = useRef<number>(0);

  // Heatmap accumulator canvas
  const heatmapDataRef = useRef<number[][] | null>(null);

  // Referências estáveis impedem que atualizações de métricas recriem o loop de inferência.
  const configRef = useRef(config);
  const countingLinesRef = useRef(countingLines);
  const roiZonesRef = useRef(roiZones);
  const onDetectionUpdateRef = useRef(onDetectionUpdate);
  const frameRequestRef = useRef<number | null>(null);
  const isLoopActiveRef = useRef(false);
  const isInferenceRunningRef = useRef(false);
  const lastParentUpdateRef = useRef(0);
  const lastPlaybackUiUpdateRef = useRef(0);

  useEffect(() => {
    configRef.current = config;
    countingLinesRef.current = countingLines;
    roiZonesRef.current = roiZones;
    onDetectionUpdateRef.current = onDetectionUpdate;
  }, [config, countingLines, roiZones, onDetectionUpdate]);

  // Load Model on Mount
  useEffect(() => {
    let isMounted = true;
    async function loadModel() {
      try {
        setIsLoadingModel(true);
        setModelError(null);
        // Load fast COCO-SSD engine
        const loadedModel = await cocoSsd.load({
          base: 'lite_mobilenet_v2', // High performance browser inference
        });
        if (isMounted) {
          modelRef.current = loadedModel;
          setIsLoadingModel(false);
        }
      } catch (err: any) {
        console.error('Error loading COCO-SSD model:', err);
        if (isMounted) {
          setModelError('Falha ao carregar o modelo YOLOv8/COCO em navegador. Verifique a conexão.');
          setIsLoadingModel(false);
        }
      }
    }
    loadModel();
    return () => {
      isMounted = false;
      // Libera o modelo e os buffers associados quando o componente sai da tela.
      modelRef.current?.dispose?.();
      modelRef.current = null;
    };
  }, []);

  // Handle Webcam or Video source setup
  useEffect(() => {
    if (videoSourceType === 'webcam') {
      navigator.mediaDevices
        .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            setIsPlaying(true);
          }
        })
        .catch((err) => {
          console.error('Webcam permission error:', err);
          alert('Não foi possível acessar a webcam. Verifique a permissão do navegador.');
        });
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    }
  }, [videoSourceType]);

  // HLS é o formato entregue pelo gateway; o navegador nunca recebe o RTSP da câmera.
  useEffect(() => {
    if (videoSourceType !== 'ip-camera' || !videoUrl || !videoRef.current) return;

    const video = videoRef.current;
    let hls: Hls | null = null;
    let cancelled = false;
    const startPlayback = () => {
      if (cancelled) return;
      video.play()
        .then(() => setIsPlaying(true))
        .catch(() => setModelError('O navegador bloqueou a reprodução automática. Clique em Play para iniciar a câmera.'));
    };

    setModelError(null);
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoUrl;
      video.addEventListener('loadedmetadata', startPlayback, { once: true });
    } else if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        xhrSetup: ipCameraAccessUsername && ipCameraAccessPassword
          ? (xhr) => {
              const credentials = btoa(`${ipCameraAccessUsername}:${ipCameraAccessPassword}`);
              xhr.setRequestHeader('Authorization', `Basic ${credentials}`);
            }
          : undefined,
      });
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, startPlayback);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal && !cancelled) {
          setModelError('Não foi possível abrir o stream HLS. Verifique o gateway, HTTPS e as permissões de acesso.');
        }
      });
    } else {
      setModelError('Este navegador não oferece suporte a HLS. Use uma versão atualizada do Chrome, Edge, Firefox ou Safari.');
    }

    return () => {
      cancelled = true;
      video.pause();
      video.removeEventListener('loadedmetadata', startPlayback);
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
      setIsPlaying(false);
    };
  }, [videoSourceType, videoUrl, ipCameraAccessUsername, ipCameraAccessPassword]);

  // Main Detection Loop. Mantém exatamente uma animação e uma inferência ativas.
  const processFrame = useCallback(async () => {
    if (!isLoopActiveRef.current || isInferenceRunningRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.paused || video.ended || video.readyState < 2) {
      if (isLoopActiveRef.current) {
        frameRequestRef.current = requestAnimationFrame(processFrame);
      }
      return;
    }

    isInferenceRunningRef.current = true;
    try {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, width, height);

      const now = performance.now();
      const delta = now - lastFrameTimeRef.current;
      frameCountRef.current++;
      if (delta >= 1000) {
        fpsRef.current = Math.round((frameCountRef.current * 1000) / delta);
        frameCountRef.current = 0;
        lastFrameTimeRef.current = now;
      }

      let detectedPersons: DetectedPerson[] = [];
      let crossings: { lineId: string; direction: 'in' | 'out' }[] = [];
      let violations: string[] = [];
      const activeConfig = configRef.current;
      const activeLines = countingLinesRef.current;
      const activeRois = roiZonesRef.current;

      if (modelRef.current) {
        const predictions = await modelRef.current.detect(video, 20, activeConfig.confidenceThreshold);
        const personDetections = predictions
          .filter((pred) => pred.class === 'person' && pred.score >= activeConfig.confidenceThreshold)
          .map((pred) => ({
            bbox: pred.bbox as [number, number, number, number],
            score: pred.score,
            class: 'Pessoa',
          }));

        const trackerResult = trackerRef.current.update(personDetections, width, height, activeLines, activeRois);
        detectedPersons = trackerResult.tracked;
        crossings = trackerResult.lineCrossings;
        violations = trackerResult.roiViolations;
        renderVisuals(ctx, width, height, detectedPersons, activeLines, activeRois);
      }

      // Métricas não precisam disparar renderizações na velocidade máxima da inferência.
      if (now - lastParentUpdateRef.current >= 100 || crossings.length > 0) {
        onDetectionUpdateRef.current(detectedPersons, crossings, violations, fpsRef.current);
        lastParentUpdateRef.current = now;
      }

      // Controles de reprodução são atualizados quatro vezes por segundo.
      if (now - lastPlaybackUiUpdateRef.current >= 250) {
        setCurrentTime(video.currentTime);
        setDuration(video.duration || 0);
        lastPlaybackUiUpdateRef.current = now;
      }
    } catch (err) {
      console.error('Inference error:', err);
    } finally {
      isInferenceRunningRef.current = false;
      if (isLoopActiveRef.current) {
        frameRequestRef.current = requestAnimationFrame(processFrame);
      }
    }
  }, []);

  // Trigger a single lifecycle-managed loop only when playback changes.
  useEffect(() => {
    if (!isPlaying) return;
    isLoopActiveRef.current = true;
    processFrame();
    return () => {
      isLoopActiveRef.current = false;
      if (frameRequestRef.current !== null) {
        cancelAnimationFrame(frameRequestRef.current);
        frameRequestRef.current = null;
      }
    };
  }, [isPlaying, processFrame]);

  // Render Visual Overlays on Canvas
  const renderVisuals = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    persons: DetectedPerson[],
    lines: CountingLine[],
    rois: ROIZone[]
  ) => {
    // 1. Draw Heatmap if enabled
    if (configRef.current.showHeatmap) {
      ctx.fillStyle = 'rgba(0, 255, 100, 0.08)';
      persons.forEach((p) => {
        const grad = ctx.createRadialGradient(p.centroid.x, p.centroid.y, 10, p.centroid.x, p.centroid.y, 90);
        grad.addColorStop(0, 'rgba(255, 60, 0, 0.35)');
        grad.addColorStop(0.5, 'rgba(255, 200, 0, 0.15)');
        grad.addColorStop(1, 'rgba(0, 255, 100, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.centroid.x, p.centroid.y, 90, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 2. Draw ROI Zones
    rois.forEach((roi) => {
      if (roi.points.length < 2) return;
      ctx.save();
      ctx.beginPath();
      const p0 = roi.points[0];
      ctx.moveTo(p0.x * width, p0.y * height);
      for (let i = 1; i < roi.points.length; i++) {
        ctx.lineTo(roi.points[i].x * width, roi.points[i].y * height);
      }
      ctx.closePath();

      if (roi.isViolated) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 3;
      } else {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = 2;
      }
      ctx.fill();
      ctx.stroke();

      // Label
      const center = roi.points[0];
      ctx.fillStyle = roi.isViolated ? '#EF4444' : '#3B82F6';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(`ZONE: ${roi.name} ${roi.isViolated ? '[INVASÃO!]' : ''}`, center.x * width + 8, center.y * height + 16);
      ctx.restore();
    });

    // 3. Draw Counting Lines
    lines.forEach((line) => {
      const p1x = line.p1.x * width;
      const p1y = line.p1.y * height;
      const p2x = line.p2.x * width;
      const p2y = line.p2.y * height;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.strokeStyle = '#F59E0B'; // Amber line
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 4]);
      ctx.stroke();

      // Draw Endpoints
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(p1x, p1y, 6, 0, Math.PI * 2);
      ctx.arc(p2x, p2y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Line Counter Badge
      const midX = (p1x + p2x) / 2;
      const midY = (p1y + p2y) / 2;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(midX - 60, midY - 22, 120, 28, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FBBF24';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${line.name}: IN ${line.countIn} | OUT ${line.countOut}`, midX, midY - 4);
      ctx.restore();
    });

    // 4. Draw Persons Bounding Boxes
    persons.forEach((person) => {
      const [x, y, w, h] = person.bbox;
      const boxColor = configRef.current.boxColor || '#00FF66';

      ctx.save();

      // Corner Accents Ultralytics Style
      const cornerLength = Math.min(w, h) * 0.2;
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 3;

      // Main semi-transparent box fill
      ctx.fillStyle = boxColor.startsWith('#')
        ? `${boxColor}1A`
        : 'rgba(0, 255, 102, 0.10)';
      ctx.fillRect(x, y, w, h);

      // Box outline
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // Motion Trails
      if (configRef.current.showMotionTrails && person.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(person.trail[0].x, person.trail[0].y);
        for (let i = 1; i < person.trail.length; i++) {
          ctx.lineTo(person.trail[i].x, person.trail[i].y);
        }
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Pose Skeleton Keypoints
      if (configRef.current.showPoseKeypoints && person.keypoints) {
        person.keypoints.forEach((kp) => {
          ctx.fillStyle = '#00E5FF';
          ctx.beginPath();
          ctx.arc(kp.x, kp.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Label Header Badge above box
      if (configRef.current.showLabels || configRef.current.showConfidence || configRef.current.showTrackingId) {
        const labelParts: string[] = [];
        if (configRef.current.showTrackingId) labelParts.push(`#${person.id}`);
        if (configRef.current.showLabels) labelParts.push('Pessoa');
        if (configRef.current.showConfidence) labelParts.push(`${(person.score * 100).toFixed(1)}%`);

        const labelText = labelParts.join(' | ');
        ctx.font = 'bold 12px Inter, monospace';
        const textMetrics = ctx.measureText(labelText);
        const badgeWidth = textMetrics.width + 12;
        const badgeHeight = 22;

        ctx.fillStyle = boxColor;
        ctx.beginPath();
        ctx.roundRect(x, y - badgeHeight, badgeWidth, badgeHeight, [4, 4, 0, 0]);
        ctx.fill();

        ctx.fillStyle = '#0B0F17'; // Dark text on bright badge
        ctx.fillText(labelText, x + 6, y - 6);
      }

      ctx.restore();
    });

    // 5. Draw Active Interactive Drawing Points
    if (drawingPoints.length > 0) {
      ctx.save();
      ctx.fillStyle = '#EF4444';
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;

      ctx.beginPath();
      drawingPoints.forEach((pt, idx) => {
        const px = pt.x * width;
        const py = pt.y * height;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);

        ctx.arc(px, py, 5, 0, Math.PI * 2);
      });
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
  };

  // Canvas Click Handler for Drawing Lines & ROIs
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawingMode === 'none') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width; // Normalized 0..1
    const clickY = (e.clientY - rect.top) / rect.height;

    const newPoints = [...drawingPoints, { x: clickX, y: clickY }];

    if (drawingMode === 'line') {
      if (newPoints.length === 2) {
        const newLine: CountingLine = {
          id: `line_${Date.now()}`,
          name: `Linha ${countingLines.length + 1}`,
          p1: newPoints[0],
          p2: newPoints[1],
          countIn: 0,
          countOut: 0,
        };
        setCountingLines((prev) => [...prev, newLine]);
        setDrawingPoints([]);
        setDrawingMode('none');
      } else {
        setDrawingPoints(newPoints);
      }
    } else if (drawingMode === 'roi') {
      if (newPoints.length >= 4) {
        const newROI: ROIZone = {
          id: `roi_${Date.now()}`,
          name: `Zona ${roiZones.length + 1}`,
          points: newPoints,
          isViolated: false,
        };
        setRoiZones((prev) => [...prev, newROI]);
        setDrawingPoints([]);
        setDrawingMode('none');
      } else {
        setDrawingPoints(newPoints);
      }
    }
  };

  // Libera recursos temporários gerados durante a reprodução/gravação.
  const cleanupRuntimeResources = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    heatmapDataRef.current = null;
  };

  // Garante limpeza automática ao desmontar o componente.
  useEffect(() => {
    return () => {
      cleanupRuntimeResources();
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
  }, []);

  // Recording Video Output Handler
  const toggleRecording = () => {
    if (isRecording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    } else {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const stream = canvas.captureStream(30);
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `YOLOv8_Nano_Person_Detection_${Date.now()}.webm`;
        a.click();
        // O download já foi iniciado; revoga o Blob URL e zera os chunks.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        recordedChunksRef.current = [];
        mediaRecorderRef.current = null;
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    }
  };

  // Toggle Play / Pause
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  // Speed Change
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  // Seek time
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  // Snapshot Capture
  const handleSnapshotClick = () => {
    if (canvasRef.current) {
      onTakeSnapshot(canvasRef.current, []);
    }
  };

  return (
    <div className="relative bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Hidden Video Source */}
      <video
        ref={videoRef}
        src={videoSourceType !== 'webcam' && videoSourceType !== 'ip-camera' ? videoUrl || undefined : undefined}
        crossOrigin="anonymous"
        muted={isMuted}
        loop
        playsInline
        className="hidden"
        onLoadedData={() => {
          if (videoRef.current) {
            setDuration(videoRef.current.duration || 0);
          }
        }}
      />

      {/* Main Vision Display Screen */}
      <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden group">
        {/* Loading overlay for vision engine */}
        {isLoadingModel && (
          <div className="absolute inset-0 bg-slate-950/90 z-30 flex flex-col items-center justify-center space-y-3 p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center animate-bounce">
              <Sparkles className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
            <p className="text-sm font-semibold text-slate-200">Inicializando YOLOv8 Nano...</p>
            <p className="text-xs text-slate-400 max-w-sm">Carregando o único modelo ativo para detecção de pessoas em tempo real.</p>
          </div>
        )}

        {/* Error overlay */}
        {modelError && (
          <div className="absolute inset-0 bg-slate-950/90 z-30 flex flex-col items-center justify-center space-y-2 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500" />
            <p className="text-sm font-bold text-rose-400">{modelError}</p>
          </div>
        )}

        {/* Drawing Mode Banner */}
        {drawingMode !== 'none' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-amber-500/90 text-slate-950 text-xs font-bold px-4 py-2 rounded-full shadow-lg border border-amber-300 flex items-center space-x-2 animate-pulse">
            <PenTool className="w-4 h-4" />
            <span>
              {drawingMode === 'line'
                ? 'Clique em 2 pontos na tela para criar a Linha de Contagem'
                : 'Clique em 4 pontos na tela para definir a Zona de Perímetro (ROI)'}
            </span>
            <button
              onClick={() => {
                setDrawingMode('none');
                setDrawingPoints([]);
              }}
              className="ml-2 bg-slate-950 text-amber-400 px-2 py-0.5 rounded-full hover:bg-slate-900"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Primary Interactive Canvas */}
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className={`w-full h-full object-contain ${
            drawingMode !== 'none' ? 'cursor-crosshair' : 'cursor-default'
          }`}
        />

        {/* Interactive Drawing Toolbar Overlay */}
        <div className="absolute top-4 right-4 z-20 flex flex-col space-y-2">
          <button
            onClick={() => {
              setDrawingMode(drawingMode === 'line' ? 'none' : 'line');
              setDrawingPoints([]);
            }}
            title="Desenhar Linha de Contagem (In/Out)"
            className={`p-2.5 rounded-xl border backdrop-blur-md transition-all shadow-lg ${
              drawingMode === 'line'
                ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                : 'bg-slate-950/80 text-slate-300 border-slate-700/80 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <PenTool className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setDrawingMode(drawingMode === 'roi' ? 'none' : 'roi');
              setDrawingPoints([]);
            }}
            title="Desenhar Zona de Restrição / Perímetro (ROI)"
            className={`p-2.5 rounded-xl border backdrop-blur-md transition-all shadow-lg ${
              drawingMode === 'roi'
                ? 'bg-blue-500 text-white border-blue-300 font-bold'
                : 'bg-slate-950/80 text-slate-300 border-slate-700/80 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
          </button>

          <button
            onClick={toggleRecording}
            title={isRecording ? 'Parar Gravação do Vídeo' : 'Gravar Vídeo com Delimitadores'}
            className={`p-2.5 rounded-xl border backdrop-blur-md transition-all shadow-lg ${
              isRecording
                ? 'bg-rose-600 text-white border-rose-400 animate-pulse'
                : 'bg-slate-950/80 text-slate-300 border-slate-700/80 hover:bg-slate-900 hover:text-white'
            }`}
          >
            {isRecording ? <Square className="w-4 h-4 fill-current" /> : <Video className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Player Controls Bar */}
      <div className="bg-slate-950 border-t border-slate-800 p-3 space-y-2">
        {/* Seek Bar (For File / Sample videos) */}
        {videoSourceType !== 'webcam' && videoSourceType !== 'ip-camera' && (
          <div className="flex items-center space-x-3 px-1">
            <span className="text-[11px] font-mono text-slate-400 w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
            <span className="text-[11px] font-mono text-slate-400 w-12">
              {formatTime(duration)}
            </span>
          </div>
        )}

        {/* Buttons Control Row */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {/* Left Play/Pause/Mute */}
          <div className="flex items-center space-x-2">
            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center justify-center transition-all shadow-md shadow-emerald-900/30 active:scale-95"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>

            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  setCurrentTime(0);
                }
              }}
              title="Reiniciar Vídeo"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsMuted(!isMuted)}
              title={isMuted ? 'Ativar Áudio' : 'Mutar Áudio'}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>

          {/* Speed Selector */}
          <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {[0.5, 1, 2, 5].map((speed) => (
              <button
                key={speed}
                onClick={() => handleSpeedChange(speed)}
                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded transition-all ${
                  playbackSpeed === speed
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Right Snapshot & Fullscreen */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleSnapshotClick}
              className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
            >
              <Camera className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Capturar Frame</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper Time Formatter
function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
