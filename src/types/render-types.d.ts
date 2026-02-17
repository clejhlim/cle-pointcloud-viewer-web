import type { RenderOptions, ViewerFiles } from "./viewer-types";
import type { RenderCameraControllerPort, RenderMeasurementPort } from "./viewer-ports";

export interface RasterLike {
  width: number;
  height: number;
}

export interface NumericRaster extends RasterLike {
  data: ArrayLike<number>;
}

export interface ColorRaster extends RasterLike {
  data: ArrayLike<number>;
}

export type DepthColor = [number, number, number];

export interface BuildPointBuffersInput {
  xRaster: NumericRaster;
  yRaster: NumericRaster;
  zRaster: NumericRaster;
  textureRaster?: ColorRaster | null;
  maskRaster?: NumericRaster | null;
  samplingStep: number;
  useTextureColor: boolean;
  skipZero: boolean;
}

export interface PointBuffersResult {
  count: number;
  positions: Float32Array;
  colors: Float32Array;
}

export interface RenderRuntimeLike {
  isDisposed(): boolean;
  applyPointCloudData(data: PointBuffersResult, pointSize: number): { radius: number };
  clearPointCloudOnly?(): void;
}

export interface RenderPipelineOptions {
  runtime?: RenderRuntimeLike | null;
  measurement?: RenderMeasurementPort | null;
  cameraCtrl?: RenderCameraControllerPort | null;
  setStatus?: (message: string, type?: string) => void;
  setStats?: (lines: string[]) => void;
}

export interface RenderRequest {
  files: ViewerFiles;
  renderOptions: RenderOptions;
}
