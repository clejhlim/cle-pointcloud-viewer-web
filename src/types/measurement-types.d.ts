export interface Vec3Snapshot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MeasurementPointSnapshot {
  readonly index: number;
  readonly local: Vec3Snapshot;
  readonly world: Vec3Snapshot;
}

export interface MeasurementStateSnapshot {
  readonly active: boolean;
  readonly a: MeasurementPointSnapshot | null;
  readonly b: MeasurementPointSnapshot | null;
}
