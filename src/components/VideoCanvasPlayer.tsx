import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs';
import Hls from 'hls.js';
import {
  DetectionConfig,
  VideoSourceType,
  DetectedPerson,
  Keypoint,
  PostureState,
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
  Sparkles,
  MousePointer,
  PenTool,
  ShieldAlert,
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

type PoseDetectionInput = {
  bbox: [number, number, number, number];
  score: number;
  class: string;
  keypoints?: Keypoint[];
  posture?: PostureState;
  bodyAspectRatio?: number;
};

type PoseResult = {
  centroid: Point;
  keypoints: Keypoint[];
  posture: PostureState;
  bodyAspectRatio: number;
};

const POSE_CONNECTIONS: Array<[string, string]> = [
  ['nose', 'left_shoulder'], ['nose', 'right_shoulder'],
  ['left_shoulder', 'right_shoulder'], ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'], ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'], ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'], ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
];

async function initializeTensorFlowBackend(): Promise<string> {
  const preferredBackends = ['webgl', 'cpu'] as const;
  for (const backend of preferredBackends) {
    try {
      if (tf.getBackend() !== backend) {
        await tf.setBackend(backend);
      }
      await tf.ready();
      if (tf.getBackend() === backend) {
        console.info(`TensorFlow.js inicializado com backend: ${backend}`);
        return backend;
      }
    } catch (error) {
      console.warn(`Backend TensorFlow.js ${backend} indisponível:`, error);
    }
  }
  throw new Error('Nenhum backend TensorFlow.js pôde ser inicializado (WebGL/CPU).');
}

type PostureAnalysis = {
  posture: PostureState;
  bodyAspectRatio: number;
};

function classifyPosture(keypoints: Keypoint[]): PostureAnalysis {
  const visible = keypoints.filter((point) => (point.score ?? 1) >= 0.25);
  const minX = visible.length ? Math.min(...visible.map((point) => point.x)) : 0;
  const maxX = visible.length ? Math.max(...visible.map((point) => point.x)) : 0;
  const minY = visible.length ? Math.min(...visible.map((point) => point.y)) : 0;
  const maxY = visible.length ? Math.max(...visible.map((point) => point.y)) : 0;
  const bodyWidth = maxX - minX;
  const bodyHeight = maxY - minY;
  const bodyAspectRatio = bodyHeight > 1 ? bodyWidth / bodyHeight : 0;
  if (visible.length < 5) return { posture: 'unknown', bodyAspectRatio };

  const get = (name: string) => visible.find((point) => point.name === name);
  const shoulders = [get('left_shoulder'), get('right_shoulder')].filter(Boolean) as Keypoint[];
  const hips = [get('left_hip'), get('right_hip')].filter(Boolean) as Keypoint[];
  const knees = [get('left_knee'), get('right_knee')].filter(Boolean) as Keypoint[];
  const ankles = [get('left_ankle'), get('right_ankle')].filter(Boolean) as Keypoint[];
  if (shoulders.length < 1 || hips.length < 1) return { posture: 'unknown', bodyAspectRatio };

  const average = (points: Keypoint[]): Point => ({
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  });
  const shoulderCenter = average(shoulders);
  const hipCenter = average(hips);
  const kneeCenter = knees.length > 0 ? average(knees) : null;
  const ankleCenter = ankles.length > 0 ? average(ankles) : null;
  const torsoDx = Math.abs(hipCenter.x - shoulderCenter.x);
  const torsoDy = Math.abs(hipCenter.y - shoulderCenter.y);
  const torsoAngleFromVertical = Math.atan2(torsoDx, Math.max(torsoDy, 1));
  const horizontalBody = bodyAspectRatio > 1.15;
  const horizontalTorso = torsoAngleFromVertical > 0.95;
  const lowerBodyAligned = kneeCenter && ankleCenter
    ? ankleCenter.y > kneeCenter.y && kneeCenter.y > hipCenter.y
    : true;

  return {
    posture: horizontalBody || horizontalTorso || !lowerBodyAligned ? 'fallen' : 'standing',
    bodyAspectRatio,
  };
}

function mapPoseKeypoints(keypoints: poseDetection.Keypoint[]): Keypoint[] {
  return keypoints.map((point) => ({
    x: point.x,
    y: point.y,
    score: point.score,
    name: point.name,
  }));
}

async function enrichWithPose(
  detector: poseDetection.PoseDetector | null,
  video: HTMLVideoElement,
  detections: PoseDetectionInput[],
  previousResults: PoseResult[],
  runInference: boolean
): Promise<{ detections: PoseDetectionInput[]; results: PoseResult[] }> {
  if (!detector || detections.length === 0) return { detections, results: previousResults };

  let results = previousResults;
  if (runInference) {
    const poses = await detector.estimatePoses(video, {
      flipHorizontal: false,
      maxPoses: 6,
    });
    results = poses
      .filter((pose) => (pose.score ?? 0) >= 0.2)
      .map((pose) => {
        const keypoints = mapPoseKeypoints(pose.keypoints);
        const analysis = classifyPosture(keypoints);
        const center = keypoints.length
          ? {
              x: keypoints.reduce((sum, point) => sum + point.x, 0) / keypoints.length,
              y: keypoints.reduce((sum, point) => sum + point.y, 0) / keypoints.length,
            }
          : { x: 0, y: 0 };
        return {
          centroid: center,
          keypoints,
          posture: analysis.posture,
          bodyAspectRatio: analysis.bodyAspectRatio,
        };
      });
  }

  const usedPoseIndexes = new Set<number>();
  const enriched = detections.map((detection) => {
    const center = {
      x: detection.bbox[0] + detection.bbox[2] / 2,
      y: detection.bbox[1] + detection.bbox[3] / 2,
    };
    let bestIndex = -1;
    let bestDistance = Infinity;
    results.forEach((result, index) => {
      if (usedPoseIndexes.has(index)) return;
      const distance = Math.hypot(result.centroid.x - center.x, result.centroid.y - center.y);
      const maxDistance = Math.max(detection.bbox[2], detection.bbox[3]) * 0.95;
      if (distance < bestDistance && distance < maxDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    });

    if (bestIndex < 0) return { ...detection, posture: 'unknown' as PostureState };
    usedPoseIndexes.add(bestIndex);
    const best = results[bestIndex];
    return {
      ...detection,
      keypoints: best.keypoints,
      posture: best.posture,
      bodyAspectRatio: best.bodyAspectRatio,
    };
  });

  return { detections: enriched, results };
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
  const poseDetectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const lastPoseInferenceAtRef = useRef(0);
  const lastPoseResultsRef = useRef<PoseResult[]>([]);
  const trackerRef = useRef<SimpleCentroidTracker>(new SimpleCentroidTracker());

  // State
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(true);
  const [isLoadingPose, setIsLoadingPose] = useState<boolean>(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [poseError, setPoseError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
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

  // Carrega os modelos em sequência para evitar disputa de memória/backend WebGL.
  // O COCO-SSD é obrigatório para localizar pessoas; o MoveNet complementa com pose.
  useEffect(() => {
    let isMounted = true;

    const describeModelError = (error: unknown) => {
      if (error instanceof Error) return error.message;
      return String(error || 'erro desconhecido');
    };

    async function loadModels() {
      setIsLoadingModel(true);
      setIsLoadingPose(true);
      setModelError(null);
      setPoseError(null);

      try {
        await initializeTensorFlowBackend();
        const loadedModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        if (!isMounted) {
          loadedModel.dispose();
          return;
        }
        modelRef.current = loadedModel;
        setIsLoadingModel(false);
      } catch (error) {
        console.error('Erro ao carregar COCO-SSD:', error);
        if (isMounted) {
          setModelError(`Falha ao carregar o detector no navegador. Detalhe: ${describeModelError(error)}`);
          setIsLoadingModel(false);
          setIsLoadingPose(false);
        }
        return;
      }

      try {
        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          {
            modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
            multiPoseMaxDimension: 256,
            enableSmoothing: true,
            enableTracking: true,
          }
        );
        if (isMounted) {
          poseDetectorRef.current = detector;
        } else {
          detector.dispose();
        }
      } catch (error) {
        // A detecção de pessoas permanece funcional mesmo se a pose não carregar.
        console.error('Erro ao carregar o estimador de pose:', error);
        if (isMounted) {
          setPoseError(`Pose indisponível; a detecção de pessoas continuará ativa. Detalhe: ${describeModelError(error)}`);
        }
      } finally {
        if (isMounted) setIsLoadingPose(false);
      }
    }

    void loadModels();
    return () => {
      isMounted = false;
      modelRef.current?.dispose?.();
      modelRef.current = null;
      poseDetectorRef.current?.dispose();
      poseDetectorRef.current = null;
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
    let latencyRecoveryTimer: number | null = null;
    let cancelled = false;
    const toPlaybackUrl = (source: string) => {
      try {
        const parsed = new URL(source);
        const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
        const isLocalMediaMtx = localHosts.has(parsed.hostname) && parsed.port === '8888';
        return isLocalMediaMtx ? `/api/hls-proxy?url=${encodeURIComponent(parsed.toString())}` : source;
      } catch {
        return source;
      }
    };
    const playbackUrl = toPlaybackUrl(videoUrl);
    const startPlayback = () => {
      if (cancelled) return;
      video.play()
        .then(() => {
          setModelError(null);
          setIsPlaying(true);
        })
        .catch(() => setModelError('O navegador bloqueou a reprodução automática. Clique em Play para iniciar a câmera.'));
    };

    setModelError(null);
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playbackUrl;
      video.addEventListener('loadedmetadata', startPlayback, { once: true });
    } else if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        // O MediaMTX entrega Low-Latency HLS; mantenha o player próximo ao live edge.
        lowLatencyMode: true,
        liveSyncMode: 'edge',
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        maxLiveSyncPlaybackRate: 1.1,
        liveSyncOnStallIncrease: 0,
        initialLiveManifestSize: 1,
        maxBufferLength: 4,
        maxMaxBufferLength: 8,
        backBufferLength: 0,
        liveDurationInfinity: true,
        xhrSetup: ipCameraAccessUsername && ipCameraAccessPassword
          ? (xhr) => {
              const credentials = btoa(`${ipCameraAccessUsername}:${ipCameraAccessPassword}`);
              xhr.setRequestHeader('Authorization', `Basic ${credentials}`);
            }
          : undefined,
      });
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, startPlayback);
      // Alguns gateways só entregam o primeiro frame após o buffer inicial.
      hls.on(Hls.Events.FRAG_BUFFERED, startPlayback);

      // Se a rede ou o navegador acumularem atraso, volta ao ponto ao vivo sem
      // reiniciar o detector nem desmontar o player HLS.
      latencyRecoveryTimer = window.setInterval(() => {
        if (cancelled || !hls || video.paused || video.readyState < 2) return;
        const latency = hls.latency;
        const livePosition = hls.liveSyncPosition;
        if (
          Number.isFinite(latency) &&
          latency > 4 &&
          typeof livePosition === 'number' &&
          Number.isFinite(livePosition) &&
          livePosition > video.currentTime
        ) {
          video.currentTime = livePosition;
        }
      }, 1000);

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (cancelled || !data.fatal) return;

        console.warn('Falha HLS:', {
          type: data.type,
          details: data.details,
          responseCode: data.response?.code,
          url: data.url,
        });

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setModelError('Conexão HLS interrompida; tentando reconectar…');
          hls?.startLoad();
          return;
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          setModelError('O navegador encontrou um erro no segmento HLS; recuperando a reprodução…');
          hls?.recoverMediaError();
          return;
        }

        setModelError(
          `Não foi possível abrir o HLS (${data.details || data.type}). Verifique se o gateway está transmitindo.`
        );
        hls?.destroy();
      });
    } else {
      setModelError('Este navegador não oferece suporte a HLS. Use uma versão atualizada do Chrome, Edge, Firefox ou Safari.');
    }

    return () => {
      cancelled = true;
      video.pause();
      video.removeEventListener('loadedmetadata', startPlayback);
      if (latencyRecoveryTimer !== null) window.clearInterval(latencyRecoveryTimer);
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
        const personDetections: PoseDetectionInput[] = predictions
          .filter((pred) => pred.class === 'person' && pred.score >= activeConfig.confidenceThreshold)
          .map((pred) => ({
            bbox: pred.bbox as [number, number, number, number],
            score: pred.score,
            class: 'Pessoa',
            posture: 'unknown',
          }));

        // A pose roda por intervalo de tempo: aproximadamente 3 Hz com uma
        // pessoa e 2 Hz com várias pessoas, sem bloquear o detector principal.
        if (personDetections.length === 0) lastPoseResultsRef.current = [];
        const poseIntervalMs = personDetections.length > 2 ? 450 : 320;
        const shouldRunPose =
          lastPoseResultsRef.current.length === 0 || now - lastPoseInferenceAtRef.current >= poseIntervalMs;
        if (shouldRunPose) lastPoseInferenceAtRef.current = now;
        const poseUpdate = await enrichWithPose(
          poseDetectorRef.current,
          video,
          personDetections,
          lastPoseResultsRef.current,
          shouldRunPose
        );
        lastPoseResultsRef.current = poseUpdate.results;

        const trackerResult = trackerRef.current.update(poseUpdate.detections, width, height, activeLines, activeRois);
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
      ctx.fillText(`${line.name}: PRESENTES ${line.currentCount}`, midX, midY - 4);
      ctx.restore();
    });

    // 4. Draw Persons Bounding Boxes
    persons.forEach((person) => {
      const [x, y, w, h] = person.bbox;
      const postureColor = person.posture === 'fallen' ? '#FF334D' : configRef.current.boxColor || '#00FF66';
      const boxColor = postureColor;

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

      // Skeleton e keypoints: permanecem visíveis para conferir a qualidade da pose.
      if (person.keypoints && person.keypoints.length > 0) {
        const keypointsByName = new Map(person.keypoints.filter((kp) => (kp.score ?? 1) >= 0.25).map((kp) => [kp.name, kp]));
        ctx.strokeStyle = person.posture === 'fallen' ? '#FFB3C1' : '#00E5FF';
        ctx.lineWidth = 2;
        POSE_CONNECTIONS.forEach(([fromName, toName]) => {
          const from = keypointsByName.get(fromName);
          const to = keypointsByName.get(toName);
          if (!from || !to) return;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        });

        person.keypoints.forEach((kp) => {
          if ((kp.score ?? 1) < 0.25) return;
          ctx.fillStyle = person.posture === 'fallen' ? '#FFEA70' : '#00E5FF';
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
        if (person.posture === 'standing') labelParts.push('EM PÉ');
        if (person.posture === 'fallen') labelParts.push('CAÍDA');
        if (person.bodyAspectRatio && person.bodyAspectRatio > 0) labelParts.push(`R:${person.bodyAspectRatio.toFixed(2)}`);

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
          currentCount: 0,
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

  // Seek time
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerContainerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!playerContainerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await playerContainerRef.current.requestFullscreen();
    }
  };

  // Snapshot Capture
  const handleSnapshotClick = () => {
    if (canvasRef.current) {
      onTakeSnapshot(canvasRef.current, []);
    }
  };

  return (
    <div ref={playerContainerRef} className={`relative bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col ${isFullscreen ? 'h-screen w-screen rounded-none' : ''}`}>
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
        {(isLoadingModel || isLoadingPose) && (
          <div className="absolute inset-0 bg-slate-950/90 z-30 flex flex-col items-center justify-center space-y-3 p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center animate-bounce">
              <Sparkles className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
            <p className="text-sm font-semibold text-slate-200">Inicializando detector e pose...</p>
            <p className="text-xs text-slate-400 max-w-sm">Preparando a detecção de pessoas em tempo real.</p>
          </div>
        )}

        {videoSourceType === 'idle' && !isLoadingModel && !isLoadingPose && !modelError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/80 p-6 text-center">
            <Camera className="h-10 w-10 text-cyan-400" />
            <p className="text-sm font-semibold text-slate-200">Selecione uma fonte de vídeo</p>
            <p className="max-w-sm text-xs text-slate-400">Use Upload de Vídeo, Webcam ao Vivo ou Câmera IP para iniciar a detecção e a estimativa de postura.</p>
          </div>
        )}

        {/* Error overlay */}
        {modelError && (
          <div className="absolute inset-0 bg-slate-950/90 z-30 flex flex-col items-center justify-center space-y-2 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500" />
            <p className="max-w-2xl text-sm font-bold text-rose-400">{modelError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
            >
              Recarregar modelos
            </button>
          </div>
        )}

        {poseError && !modelError && (
          <div className="absolute bottom-4 left-1/2 z-20 max-w-xl -translate-x-1/2 rounded-lg border border-amber-500/40 bg-slate-950/90 px-3 py-2 text-center text-xs text-amber-200 shadow-xl">
            {poseError}
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

          {/* Right Snapshot & Fullscreen */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleSnapshotClick}
              className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
            >
              <Camera className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Capturar Frame</span>
            </button>
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Sair da tela cheia' : 'Maximizar tela'}
              className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            >
              <Maximize className="h-4 w-4" />
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
