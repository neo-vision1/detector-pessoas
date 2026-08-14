import { DetectedPerson, Point, CountingLine, ROIZone, Keypoint, PostureState } from '../types';

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface CachedLine {
  id: string;
  p1: Point;
  p2: Point;
  bounds: Bounds;
}

interface CachedRoi {
  id: string;
  polygon: Point[];
  bounds: Bounds;
}

interface GeometryCache {
  lineSignature: string;
  roiSignature: string;
  width: number;
  height: number;
  lines: CachedLine[];
  rois: CachedRoi[];
}

export class SimpleCentroidTracker {
  private nextId = 1;
  private maxDisappearedFrames = 15;
  private maxDistanceThreshold = 80;
  private readonly roiCheckIntervalMs = 120;
  private readonly lineCrossingCooldownMs = 450;
  private trackedObjects: Map<number, {
    person: DetectedPerson;
    disappearedFrames: number;
  }> = new Map();
  private geometryCache: GeometryCache | null = null;
  private lastRoiCheckAt = 0;
  private lastRoiViolations: string[] = [];
  private lastLineCrossingAt = new Map<string, number>();

  public update(
    rawDetections: Array<{ bbox: [number, number, number, number]; score: number; class: string; keypoints?: Keypoint[]; posture?: PostureState }>,
    canvasWidth: number,
    canvasHeight: number,
    lines: CountingLine[],
    rois: ROIZone[]
  ): {
    tracked: DetectedPerson[];
    lineCrossings: { lineId: string; direction: 'in' | 'out' }[];
    roiViolations: string[];
  } {
    const lineCrossings: { lineId: string; direction: 'in' | 'out' }[] = [];
    const geometry = this.getGeometry(lines, rois, canvasWidth, canvasHeight);

    const inputCentroids = rawDetections.map((det) => ({
      centroid: {
        x: det.bbox[0] + det.bbox[2] / 2,
        y: det.bbox[1] + det.bbox[3] / 2,
      },
      bbox: det.bbox,
      score: det.score,
      class: det.class,
      keypoints: det.keypoints,
      posture: det.posture,
    }));

    if (this.trackedObjects.size === 0) {
      for (const det of inputCentroids) {
        const id = this.nextId++;
        this.trackedObjects.set(id, {
          person: {
            id,
            bbox: det.bbox,
            score: det.score,
            class: det.class,
            centroid: det.centroid,
            trail: [det.centroid],
            speed: 0,
            keypoints: det.keypoints,
            posture: det.posture ?? 'unknown',
          },
          disappearedFrames: 0,
        });
      }
    } else {
      const existingIds = Array.from(this.trackedObjects.keys());
      const usedInputIndices = new Set<number>();
      const usedExistingIds = new Set<number>();
      const distances: { existingId: number; inputIdx: number; dist: number }[] = [];

      for (const id of existingIds) {
        const existing = this.trackedObjects.get(id)!;
        for (let inputIdx = 0; inputIdx < inputCentroids.length; inputIdx++) {
          const input = inputCentroids[inputIdx];
          const dx = existing.person.centroid.x - input.centroid.x;
          const dy = existing.person.centroid.y - input.centroid.y;
          distances.push({ existingId: id, inputIdx, dist: Math.hypot(dx, dy) });
        }
      }

      distances.sort((a, b) => a.dist - b.dist);

      for (const item of distances) {
        if (
          item.dist > this.maxDistanceThreshold ||
          usedExistingIds.has(item.existingId) ||
          usedInputIndices.has(item.inputIdx)
        ) {
          continue;
        }

        usedExistingIds.add(item.existingId);
        usedInputIndices.add(item.inputIdx);

        const trackedObject = this.trackedObjects.get(item.existingId)!;
        const input = inputCentroids[item.inputIdx];
        const prevCentroid = { ...trackedObject.person.centroid };
        const newCentroid = input.centroid;
        const dx = newCentroid.x - prevCentroid.x;
        const dy = newCentroid.y - prevCentroid.y;

        trackedObject.person.prevCentroid = prevCentroid;
        trackedObject.person.centroid = newCentroid;
        trackedObject.person.bbox = input.bbox;
        trackedObject.person.score = input.score;
        trackedObject.person.trail = [...trackedObject.person.trail, newCentroid].slice(-12);
        trackedObject.person.speed = Math.round(Math.hypot(dx, dy));
        trackedObject.person.keypoints = input.keypoints;
        trackedObject.person.posture = input.posture ?? trackedObject.person.posture ?? 'unknown';
        trackedObject.disappearedFrames = 0;

        // A caixa delimitadora elimina a maioria das linhas antes da interseção exata.
        for (const line of geometry.lines) {
          if (!this.segmentMayTouchBounds(prevCentroid, newCentroid, line.bounds)) continue;
          const direction = this.checkLineIntersection(prevCentroid, newCentroid, line.p1, line.p2);
          if (!direction) continue;

          // Evita contagens em cascata quando a detecção oscila sobre a mesma linha.
          const crossingKey = `${item.existingId}:${line.id}`;
          const now = performance.now();
          const lastCrossingAt = this.lastLineCrossingAt.get(crossingKey) ?? -Infinity;
          if (now - lastCrossingAt < this.lineCrossingCooldownMs) continue;
          this.lastLineCrossingAt.set(crossingKey, now);
          lineCrossings.push({ lineId: line.id, direction });
        }
      }

      for (const id of existingIds) {
        if (usedExistingIds.has(id)) continue;
        const trackedObject = this.trackedObjects.get(id)!;
        trackedObject.disappearedFrames += 1;
        if (trackedObject.disappearedFrames > this.maxDisappearedFrames) {
          this.trackedObjects.delete(id);
          for (const line of geometry.lines) {
            this.lastLineCrossingAt.delete(`${id}:${line.id}`);
          }
        }
      }

      inputCentroids.forEach((input, inputIdx) => {
        if (usedInputIndices.has(inputIdx)) return;
        const id = this.nextId++;
        this.trackedObjects.set(id, {
          person: {
            id,
            bbox: input.bbox,
            score: input.score,
            class: input.class,
            centroid: input.centroid,
            trail: [input.centroid],
            speed: 0,
            keypoints: input.keypoints,
            posture: input.posture ?? 'unknown',
          },
          disappearedFrames: 0,
        });
      });
    }

    const tracked = Array.from(this.trackedObjects.values())
      .filter((trackedObject) => trackedObject.disappearedFrames === 0)
      .map((trackedObject) => trackedObject.person);

    const now = performance.now();
    if (geometry.rois.length === 0) {
      this.lastRoiViolations = [];
      this.lastRoiCheckAt = now;
    } else if (now - this.lastRoiCheckAt >= this.roiCheckIntervalMs || this.lastRoiCheckAt === 0) {
      this.lastRoiViolations = this.findRoiViolations(tracked, geometry.rois);
      this.lastRoiCheckAt = now;
    }

    return {
      tracked,
      lineCrossings,
      roiViolations: this.lastRoiViolations,
    };
  }

  private getGeometry(
    lines: CountingLine[],
    rois: ROIZone[],
    width: number,
    height: number
  ): GeometryCache {
    const lineSignature = lines
      .map((line) => `${line.id}:${line.p1.x},${line.p1.y},${line.p2.x},${line.p2.y}`)
      .join('|');
    const roiSignature = rois
      .map((roi) => `${roi.id}:${roi.points.map((point) => `${point.x},${point.y}`).join(';')}`)
      .join('|');
    const cache = this.geometryCache;
    if (cache && cache.lineSignature === lineSignature && cache.roiSignature === roiSignature && cache.width === width && cache.height === height) {
      return cache;
    }

    const cachedLines = lines.map((line) => {
      const p1 = { x: line.p1.x * width, y: line.p1.y * height };
      const p2 = { x: line.p2.x * width, y: line.p2.y * height };
      return { id: line.id, p1, p2, bounds: this.getBounds([p1, p2], 2) };
    });

    const cachedRois = rois
      .filter((roi) => roi.points.length >= 3)
      .map((roi) => {
        const polygon = roi.points.map((point) => ({ x: point.x * width, y: point.y * height }));
        return { id: roi.id, polygon, bounds: this.getBounds(polygon) };
      });

    this.geometryCache = {
      lineSignature,
      roiSignature,
      width,
      height,
      lines: cachedLines,
      rois: cachedRois,
    };
    this.lastRoiCheckAt = 0;
    return this.geometryCache;
  }

  private findRoiViolations(persons: DetectedPerson[], rois: CachedRoi[]): string[] {
    const violations: string[] = [];
    for (const roi of rois) {
      for (const person of persons) {
        if (!this.pointIsInsideBounds(person.centroid, roi.bounds)) continue;
        if (this.isPointInPolygon(person.centroid, roi.polygon)) {
          violations.push(roi.id);
          break;
        }
      }
    }
    return violations;
  }

  private getBounds(points: Point[], padding = 0): Bounds {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    return { minX: minX - padding, maxX: maxX + padding, minY: minY - padding, maxY: maxY + padding };
  }

  private segmentMayTouchBounds(a: Point, b: Point, bounds: Bounds): boolean {
    return !(
      Math.max(a.x, b.x) < bounds.minX ||
      Math.min(a.x, b.x) > bounds.maxX ||
      Math.max(a.y, b.y) < bounds.minY ||
      Math.min(a.y, b.y) > bounds.maxY
    );
  }

  private pointIsInsideBounds(point: Point, bounds: Bounds): boolean {
    return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
  }

  private checkLineIntersection(a1: Point, a2: Point, b1: Point, b2: Point): 'in' | 'out' | null {
    const ccw = (p1: Point, p2: Point, p3: Point) =>
      (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);

    const intersects = ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2);
    if (!intersects) return null;

    const lineVecX = b2.x - b1.x;
    const lineVecY = b2.y - b1.y;
    const moveVecX = a2.x - a1.x;
    const moveVecY = a2.y - a1.y;
    return lineVecX * moveVecY - lineVecY * moveVecX > 0 ? 'in' : 'out';
  }

  private isPointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const current = polygon[i];
      const previous = polygon[j];
      const intersects =
        current.y > point.y !== previous.y > point.y &&
        point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  public reset() {
    this.nextId = 1;
    this.trackedObjects.clear();
    this.geometryCache = null;
    this.lastRoiCheckAt = 0;
    this.lastRoiViolations = [];
    this.lastLineCrossingAt.clear();
  }
}
