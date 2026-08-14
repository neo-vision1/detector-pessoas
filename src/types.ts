export type ModelOption = 'yolov8n';

export type VideoSourceType = 'file' | 'webcam' | 'sample' | 'ip-camera';

export interface IPCameraConfig {
  name: string;
  hlsUrl: string;
  accessUsername?: string;
  accessPassword?: string;
}

export interface SampleVideo {
  id: string;
  title: string;
  description: string;
  category: string;
  url: string;
  thumbnail: string;
}

export interface Point {
  x: number; // Normalized 0..1 or Canvas coordinate
  y: number;
}

export interface Keypoint {
  x: number;
  y: number;
  score?: number;
  name?: string;
}

export interface DetectedPerson {
  id: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
  score: number;
  class: string;
  centroid: Point;
  prevCentroid?: Point;
  trail: Point[];
  speed: number; // pixels per frame or relative
  keypoints?: Keypoint[];
}

export interface CountingLine {
  id: string;
  name: string;
  p1: Point; // normalized 0..1
  p2: Point; // normalized 0..1
  countIn: number;
  countOut: number;
  currentCount: number; // saldo atual: entradas menos saídas, nunca negativo
}

export interface ROIZone {
  id: string;
  name: string;
  points: Point[]; // normalized 0..1
  isViolated: boolean;
  color?: string;
}

export interface DetectionConfig {
  confidenceThreshold: number; // 0.1 to 0.95
  iouThreshold: number; // 0.1 to 0.95
  targetFPS: number; // 15, 30, 60
  selectedModel: ModelOption;
  boxColor: string;
  showLabels: boolean;
  showConfidence: boolean;
  showTrackingId: boolean;
  showMotionTrails: boolean;
  showPoseKeypoints: boolean;
  showHeatmap: boolean;
  alertThreshold: number;
}

export interface DetectionLogItem {
  id: string;
  timestamp: string;
  timeSec: number;
  frameNumber: number;
  personCount: number;
  confidenceAvg: number;
  alerts: string[];
  screenshotUrl?: string;
}

export interface ChartDataPoint {
  timeSec: number;
  timestamp: string;
  count: number;
  countIn: number;
  countOut: number;
}

export interface AIAnalysisResult {
  crowdDensity: string;
  estimatedPeopleCount: number;
  activityDescription: string;
  safetyStatus: string;
  anomalies: string[];
  recommendation: string;
}
