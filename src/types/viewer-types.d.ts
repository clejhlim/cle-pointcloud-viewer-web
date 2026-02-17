import type { Vector3 } from "three";

export interface RenderOptions {
  samplingStep: number;
  pointSize: number;
  useTextureColor: boolean;
  skipZero: boolean;
}

export type RotationMode = "turntable" | "arcball" | "cad";

export interface ViewerFiles {
  pcX: File;
  pcY: File;
  pcZ: File;
  texture?: File | null;
  validMask?: File | null;
}

export interface OverlayVisibility {
  controlPanel: boolean;
  measurement: boolean;
  axisWidget: boolean;
}

export interface ViewerSettings {
  overlays: OverlayVisibility;
  rotationMode: RotationMode;
  renderOptions: RenderOptions;
}

export interface ViewerHandle {
  renderFromFiles(files: ViewerFiles): Promise<number>;
  clear(): void;
  setControlPanelVisible(visible: boolean): void;
  applyViewerSettings(next: ViewerSettings): void;
  getCameraPosition(): Vector3 | null;
  dispose(): void;
}

export interface ClePointCloudViewerPublicApi {
  renderFromFiles(files: ViewerFiles): Promise<number>;
  clear(): Promise<void>;
  getCameraPosition(): Promise<Vector3 | null>;
  dispose(): void;
}
