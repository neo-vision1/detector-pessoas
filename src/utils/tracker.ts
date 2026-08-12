import { DetectedPerson, Point, CountingLine, ROIZone, Keypoint } from '../types';

export class SimpleCentroidTracker {
  private nextId = 1;
  private maxDisappearedFrames = 15;
  private maxDistanceThreshold = 80; // pixels
  private trackedObjects: Map<number, {
    person: DetectedPerson;
    disappearedFrames: number;
  }> = new Map();

  public update(
    rawDetections: Array<{ bbox: [number, number, number, number]; score: number; class: string; keypoints?: Keypoint[] }>,
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
    const roiViolations: string[] = [];

    // Calculate centroids for incoming detections
    const inputCentroids: Array<{
      centroid: Point;
      bbox: [number, number, number, number];
      score: number;
      class: string;
      keypoints?: Keypoint[];
    }> = rawDetections.map((det) => ({
      centroid: {
        x: det.bbox[0] + det.bbox[2] / 2,
        y: det.bbox[1] + det.bbox[3] / 2,
      },
      bbox: det.bbox,
      score: det.score,
      class: det.class,
      keypoints: det.keypoints,
    }));

    // If no existing objects, assign new IDs to all detections
    if (this.trackedObjects.size === 0) {
      for (const det of inputCentroids) {
        const id = this.nextId++;
        const newPerson: DetectedPerson = {
          id,
          bbox: det.bbox,
          score: det.score,
          class: det.class,
          centroid: det.centroid,
          trail: [det.centroid],
          speed: 0,
          keypoints: det.keypoints,
        };
        this.trackedObjects.set(id, { person: newPerson, disappearedFrames: 0 });
      }
    } else {
      // Distance matrix matching
      const existingIds = Array.from(this.trackedObjects.keys());
      const usedInputIndices = new Set<number>();
      const usedExistingIds = new Set<number>();

      // Compute pairwise distances
      const distances: { existingId: number; inputIdx: number; dist: number }[] = [];
      existingIds.forEach((id) => {
        const existingObj = this.trackedObjects.get(id)!;
        inputCentroids.forEach((inp, idx) => {
          const dx = existingObj.person.centroid.x - inp.centroid.x;
          const dy = existingObj.person.centroid.y - inp.centroid.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          distances.push({ existingId: id, inputIdx: idx, dist });
        });
      });

      // Sort by distance ascending
      distances.sort((a, b) => a.dist - b.dist);

      // Match closest pairs within threshold
      for (const item of distances) {
        if (usedExistingIds.has(item.existingId) || usedInputIndices.has(item.inputIdx)) {
          continue;
        }

        if (item.dist <= this.maxDistanceThreshold) {
          usedExistingIds.add(item.existingId);
          usedInputIndices.add(item.inputIdx);

          const obj = this.trackedObjects.get(item.existingId)!;
          const inp = inputCentroids[item.inputIdx];

          const prevCentroid = { ...obj.person.centroid };
          const newCentroid = inp.centroid;

          // Trail history limit 12 points
          const updatedTrail = [...obj.person.trail, newCentroid].slice(-12);
          const speed = Math.round(Math.sqrt(
            Math.pow(newCentroid.x - prevCentroid.x, 2) + Math.pow(newCentroid.y - prevCentroid.y, 2)
          ));

          obj.person.prevCentroid = prevCentroid;
          obj.person.centroid = newCentroid;
          obj.person.bbox = inp.bbox;
          obj.person.score = inp.score;
          obj.person.trail = updatedTrail;
          obj.person.speed = speed;
          if (inp.keypoints) {
            obj.person.keypoints = inp.keypoints;
          }
          obj.disappearedFrames = 0;

          // Check line crossing
          for (const line of lines) {
            const cross = this.checkLineIntersection(
              prevCentroid,
              newCentroid,
              { x: line.p1.x * canvasWidth, y: line.p1.y * canvasHeight },
              { x: line.p2.x * canvasWidth, y: line.p2.y * canvasHeight }
            );
            if (cross) {
              lineCrossings.push({ lineId: line.id, direction: cross });
            }
          }
        }
      }

      // Increment disappeared count for unmatched existing objects
      existingIds.forEach((id) => {
        if (!usedExistingIds.has(id)) {
          const obj = this.trackedObjects.get(id)!;
          obj.disappearedFrames += 1;
          if (obj.disappearedFrames > this.maxDisappearedFrames) {
            this.trackedObjects.delete(id);
          }
        }
      });

      // Add new objects for unmatched input detections
      inputCentroids.forEach((inp, idx) => {
        if (!usedInputIndices.has(idx)) {
          const id = this.nextId++;
          const newPerson: DetectedPerson = {
            id,
            bbox: inp.bbox,
            score: inp.score,
            class: inp.class,
            centroid: inp.centroid,
            trail: [inp.centroid],
            speed: 0,
            keypoints: inp.keypoints,
          };
          this.trackedObjects.set(id, { person: newPerson, disappearedFrames: 0 });
        }
      });
    }

    const trackedList = Array.from(this.trackedObjects.values())
      .filter((obj) => obj.disappearedFrames === 0)
      .map((obj) => obj.person);

    // Check ROI violations
    for (const roi of rois) {
      if (roi.points.length < 3) continue;
      const poly = roi.points.map((p) => ({ x: p.x * canvasWidth, y: p.y * canvasHeight }));

      for (const p of trackedList) {
        if (this.isPointInPolygon(p.centroid, poly)) {
          roiViolations.push(roi.id);
          break;
        }
      }
    }

    return {
      tracked: trackedList,
      lineCrossings,
      roiViolations,
    };
  }

  // Segment intersection check for counting lines
  private checkLineIntersection(
    a1: Point,
    a2: Point,
    b1: Point,
    b2: Point
  ): 'in' | 'out' | null {
    const ccw = (p1: Point, p2: Point, p3: Point) => {
      return (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
    };

    const intersect =
      ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2);

    if (intersect) {
      // Determine crossing direction via vector cross product
      const lineVecX = b2.x - b1.x;
      const lineVecY = b2.y - b1.y;
      const moveVecX = a2.x - a1.x;
      const moveVecY = a2.y - a1.y;

      const cross = lineVecX * moveVecY - lineVecY * moveVecX;
      return cross > 0 ? 'in' : 'out';
    }

    return null;
  }

  // Ray casting algorithm for polygon ROI detection
  private isPointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  public reset() {
    this.nextId = 1;
    this.trackedObjects.clear();
  }
}
