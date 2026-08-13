import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  VideoSourceType,
  DetectionConfig,
  SampleVideo,
  CountingLine,
  ROIZone,
  DetectedPerson,
  DetectionLogItem,
  ChartDataPoint,
  IPCameraConfig,
} from './types';
import { Navbar } from './components/Navbar';
import { VideoCanvasPlayer } from './components/VideoCanvasPlayer';
import { MetricsPanel } from './components/MetricsPanel';
import { ControlsSidebar } from './components/ControlsSidebar';
import { AnalyticsSection } from './components/AnalyticsSection';
import { DetectionLogTable } from './components/DetectionLogTable';
import { AIInspectorModal } from './components/AIInspectorModal';
import { SampleVideoPicker } from './components/SampleVideoPicker';
import { IPCameraModal } from './components/IPCameraModal';
import { ShieldAlert, Cpu, Sparkles, Upload, FileVideo } from 'lucide-react';

export default function App() {
  // Video Source state
  const [videoSourceType, setVideoSourceType] = useState<VideoSourceType>('sample');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sampleVideos, setSampleVideos] = useState<SampleVideo[]>([]);
  const [selectedSample, setSelectedSample] = useState<SampleVideo | null>(null);
  const [ipCameraConfig, setIpCameraConfig] = useState<IPCameraConfig | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadedVideoUrlRef = useRef<string | null>(null);

  // Vision Config State
  const [config, setConfig] = useState<DetectionConfig>({
    confidenceThreshold: 0.35,
    iouThreshold: 0.45,
    targetFPS: 30,
    selectedModel: 'yolov8n',
    boxColor: '#00FF66',
    showLabels: true,
    showConfidence: true,
    showTrackingId: true,
    showMotionTrails: true,
    showPoseKeypoints: false,
    showHeatmap: false,
    alertThreshold: 5,
  });

  // KPI Metrics State
  const [activePersonCount, setActivePersonCount] = useState<number>(0);
  const [peakPersonCount, setPeakPersonCount] = useState<number>(0);
  const [trackedIdSet, setTrackedIdSet] = useState<Set<number>>(new Set());
  const [totalLineIn, setTotalLineIn] = useState<number>(0);
  const [totalLineOut, setTotalLineOut] = useState<number>(0);
  const [fps, setFps] = useState<number>(0);

  // Lines & ROIs
  const [countingLines, setCountingLines] = useState<CountingLine[]>([]);
  const [roiZones, setRoiZones] = useState<ROIZone[]>([]);

  // Logs & Analytics Chart
  const [logs, setLogs] = useState<DetectionLogItem[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);

  // Modals
  const [isSampleModalOpen, setIsSampleModalOpen] = useState<boolean>(false);
  const [isIpCameraModalOpen, setIsIpCameraModalOpen] = useState<boolean>(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);

  // Canvas Ref callback helper for AI modal
  const canvasSnapshotRef = useRef<(() => string | null) | null>(null);

  // Load sample videos from backend
  useEffect(() => {
    fetch('/api/sample-videos')
      .then((res) => res.json())
      .then((data: SampleVideo[]) => {
        if (data && data.length > 0) {
          setSampleVideos(data);
          setSelectedSample(data[0]);
          setVideoUrl(data[0].url);
        }
      })
      .catch((err) => console.error('Failed to load sample videos:', err));
  }, []);

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (uploadedVideoUrlRef.current) {
        URL.revokeObjectURL(uploadedVideoUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      uploadedVideoUrlRef.current = url;
      setVideoUrl(url);
      setVideoSourceType('file');
      setSelectedSample(null);
      resetMetrics();
    }
  };

  // Select Sample Video
  const handleSelectSample = (sample: SampleVideo) => {
    if (uploadedVideoUrlRef.current) {
      URL.revokeObjectURL(uploadedVideoUrlRef.current);
      uploadedVideoUrlRef.current = null;
    }
    setSelectedSample(sample);
    setIpCameraConfig(null);
    setVideoUrl(sample.url);
    setVideoSourceType('sample');
    resetMetrics();
  };

  const handleConnectIPCamera = (camera: IPCameraConfig) => {
    setIpCameraConfig(camera);
    setSelectedSample(null);
    setVideoUrl(camera.hlsUrl);
    setVideoSourceType('ip-camera');
    resetMetrics();
  };

  // Libera o Blob URL do vídeo enviado quando a aplicação é desmontada.
  useEffect(() => {
    return () => {
      if (uploadedVideoUrlRef.current) {
        URL.revokeObjectURL(uploadedVideoUrlRef.current);
      }
    };
  }, []);

  // Reset Metrics
  const resetMetrics = () => {
    setActivePersonCount(0);
    setPeakPersonCount(0);
    setTrackedIdSet(new Set());
    setTotalLineIn(0);
    setTotalLineOut(0);
    setLogs([]);
    setChartData([]);
  };

  // Frame detection callback from VideoCanvasPlayer
  const handleDetectionUpdate = useCallback(
    (
      persons: DetectedPerson[],
      lineCrossings: { lineId: string; direction: 'in' | 'out' }[],
      roiViolations: string[],
      currentFps: number
    ) => {
      const count = persons.length;
      setActivePersonCount(count);
      setFps(currentFps);

      // Peak count check
      setPeakPersonCount((prev) => Math.max(prev, count));

      // Tracked unique IDs set
      setTrackedIdSet((prev) => {
        const nextSet = new Set(prev);
        persons.forEach((p) => nextSet.add(p.id));
        return nextSet;
      });

      // Agrupa cruzamentos do mesmo frame em uma única atualização de estado.
      if (lineCrossings.length > 0) {
        const incrementsByLine = new Map<string, { in: number; out: number }>();
        let totalIncrementsIn = 0;
        let totalIncrementsOut = 0;

        for (const crossing of lineCrossings) {
          const increment = incrementsByLine.get(crossing.lineId) ?? { in: 0, out: 0 };
          increment[crossing.direction] += 1;
          incrementsByLine.set(crossing.lineId, increment);
          if (crossing.direction === 'in') totalIncrementsIn += 1;
          else totalIncrementsOut += 1;
        }

        if (totalIncrementsIn > 0) {
          setTotalLineIn((previous) => previous + totalIncrementsIn);
        }
        if (totalIncrementsOut > 0) {
          setTotalLineOut((previous) => previous + totalIncrementsOut);
        }

        setCountingLines((previousLines) =>
          previousLines.map((line) => {
            const increment = incrementsByLine.get(line.id);
            if (!increment) return line;
            return {
              ...line,
              countIn: line.countIn + increment.in,
              countOut: line.countOut + increment.out,
            };
          })
        );
      }

      // Atualiza as zonas somente quando seu estado visual realmente mudar.
      // Assim, a referência da configuração permanece estável entre os frames.
      if (roiZones.length > 0) {
        const violatedSet = new Set(roiViolations);
        setRoiZones((prevZones) => {
          let changed = false;
          const nextZones = prevZones.map((zone) => {
            const isViolated = violatedSet.has(zone.id);
            if (zone.isViolated === isViolated) return zone;
            changed = true;
            return { ...zone, isViolated };
          });
          return changed ? nextZones : prevZones;
        });
      }

      // Record telemetry chart point periodically (every 1.5 seconds)
      const now = new Date();
      const timeStr = now.toLocaleTimeString('pt-BR');
      const timeSec = now.getSeconds() + now.getMinutes() * 60;

      setChartData((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].timestamp === timeStr) {
          return prev;
        }
        const newPoints = [
          ...prev,
          {
            timeSec,
            timestamp: timeStr,
            count,
            countIn: totalLineIn,
            countOut: totalLineOut,
          },
        ];
        return newPoints.slice(-40); // keep last 40 data points
      });

      // Log alerts if capacity exceeded or ROI violated
      const alerts: string[] = [];
      if (count > config.alertThreshold) {
        alerts.push(`Lotação Excedida (${count} > ${config.alertThreshold})`);
      }
      if (roiViolations.length > 0) {
        alerts.push('Invasão de Zona Restrita');
      }

      if (alerts.length > 0 && Math.random() < 0.1) {
        const newLog: DetectionLogItem = {
          id: `log_${Date.now()}_${Math.random()}`,
          timestamp: timeStr,
          timeSec,
          frameNumber: Math.floor(Math.random() * 1000),
          personCount: count,
          confidenceAvg:
            persons.reduce((acc, curr) => acc + curr.score, 0) / (persons.length || 1),
          alerts,
        };

        // Mantém apenas os eventos mais recentes para evitar crescimento indefinido.
        setLogs((prev) => [...prev, newLog].slice(-500));
      }
    },
    [config.alertThreshold, roiZones.length, totalLineIn, totalLineOut]
  );

  // Take Snapshot function
  const handleTakeSnapshot = (canvas: HTMLCanvasElement) => {
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `YOLOv8_Frame_Capture_${Date.now()}.png`;
    a.click();
  };

  // Helper for AI Modal to grab canvas snapshot
  const getCanvasFrameBase64 = (): string | null => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const isCapacityExceeded = activePersonCount > config.alertThreshold;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/mov,video/avi"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Navbar */}
      <Navbar
        videoSourceType={videoSourceType}
        setVideoSourceType={setVideoSourceType}
        selectedModel={config.selectedModel}
        fps={fps}
        activePersonCount={activePersonCount}
        onOpenSamplePicker={() => setIsSampleModalOpen(true)}
        onOpenAiModal={() => setIsAiModalOpen(true)}
        onUploadClick={() => fileInputRef.current?.click()}
        onOpenIPCamera={() => setIsIpCameraModalOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Lotação Excedida Global Alert Banner */}
        {isCapacityExceeded && (
          <div className="bg-rose-500/15 border border-rose-500/50 rounded-2xl p-4 flex items-center justify-between text-rose-300 shadow-xl shadow-rose-950/40 animate-pulse">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-rose-500 text-slate-950 font-bold">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  ALERTA DE SEGURANÇA: Capacidade de Pessoas Excedida!
                </h3>
                <p className="text-xs text-rose-300">
                  Detectadas <span className="font-bold text-white font-mono">{activePersonCount}</span> pessoas no frame (Limite configurado: {config.alertThreshold}).
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsAiModalOpen(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-rose-500 text-slate-950 hover:bg-rose-400 transition-colors shadow"
            >
              Analisar Com AI
            </button>
          </div>
        )}

        {/* Top Section: Video Canvas Player + HUD Metrics Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Video View Column (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            <VideoCanvasPlayer
              videoUrl={videoUrl}
              videoSourceType={videoSourceType}
              ipCameraAccessUsername={ipCameraConfig?.accessUsername}
              ipCameraAccessPassword={ipCameraConfig?.accessPassword}
              config={config}
              countingLines={countingLines}
              setCountingLines={setCountingLines}
              roiZones={roiZones}
              setRoiZones={setRoiZones}
              onDetectionUpdate={handleDetectionUpdate}
              onTakeSnapshot={handleTakeSnapshot}
            />

            {/* Real-time KPI Stats Bar */}
            <MetricsPanel
              activePersonCount={activePersonCount}
              peakPersonCount={peakPersonCount}
              totalUniqueTracked={trackedIdSet.size}
              totalLineIn={totalLineIn}
              totalLineOut={totalLineOut}
              fps={fps}
              alertThreshold={config.alertThreshold}
              isCapacityExceeded={isCapacityExceeded}
            />
          </div>

          {/* Right Controls Sidebar (4 cols) */}
          <div className="lg:col-span-4">
            <ControlsSidebar
              config={config}
              setConfig={setConfig}
              countingLines={countingLines}
              setCountingLines={setCountingLines}
              roiZones={roiZones}
              setRoiZones={setRoiZones}
              onResetCounts={resetMetrics}
            />
          </div>
        </div>

        {/* Bottom Section: Time-Series Analytics Chart & Detection Event Logs Table */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6">
            <AnalyticsSection chartData={chartData} alertThreshold={config.alertThreshold} />
          </div>

          <div className="lg:col-span-6">
            <DetectionLogTable logs={logs} onClearLogs={() => setLogs([])} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-4 px-6 text-center text-xs text-slate-500 font-mono">
        YOLOv8 Ultralytics Computer Vision Engine &bull; Google AI Studio
      </footer>

      {/* Sample Videos Picker Modal */}
      <IPCameraModal
        isOpen={isIpCameraModalOpen}
        onClose={() => setIsIpCameraModalOpen(false)}
        onConnect={handleConnectIPCamera}
      />

      <SampleVideoPicker
        isOpen={isSampleModalOpen}
        onClose={() => setIsSampleModalOpen(false)}
        sampleVideos={sampleVideos}
        selectedVideoId={selectedSample?.id || null}
        onSelectSample={handleSelectSample}
      />

      {/* Gemini AI Visual Inspector Modal */}
      <AIInspectorModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        activePersonCount={activePersonCount}
        selectedModel={config.selectedModel}
        getFrameSnapshotBase64={getCanvasFrameBase64}
      />
    </div>
  );
}
