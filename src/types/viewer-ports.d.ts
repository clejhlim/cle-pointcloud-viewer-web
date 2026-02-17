export interface ViewerDomElements {
  layout: HTMLElement | null;
  controlPanel: HTMLElement | null;
  pcX: HTMLElement | null;
  pcY: HTMLElement | null;
  pcZ: HTMLElement | null;
  texture: HTMLElement | null;
  validMask: HTMLElement | null;
  measureWidget: HTMLElement | null;
  measureWidgetToggle: HTMLElement | null;
  clearMeasureButton: HTMLElement | null;
  measureInfo: HTMLElement | null;
  labelLayer: HTMLElement | null;
  renderButton: HTMLElement | null;
  clearButton: HTMLElement | null;
  status: HTMLElement | null;
  cameraInfo: HTMLElement | null;
  stats: HTMLElement | null;
  viewer: HTMLElement | null;
}

export type UiDomElements = Partial<Pick<
  ViewerDomElements,
  | "renderButton"
  | "clearButton"
  | "clearMeasureButton"
  | "measureWidgetToggle"
  | "pcX"
  | "pcY"
  | "pcZ"
  | "texture"
  | "validMask"
  | "viewer"
>>;

export interface UiCameraControllerPort {
  onKeyDown(event: KeyboardEvent): void;
  onKeyUp(event: KeyboardEvent): void;
  onWindowBlur(): void;
  onFocus(): void;
  onBlur(): void;
  onPointerDown(event: PointerEvent): void;
  onPointerMove(event: PointerEvent): void;
  onPointerUp(event: PointerEvent): void;
  onPointerLeave(event: PointerEvent): void;
  onPointerCancel(event: PointerEvent): void;
  onWheel(event: WheelEvent): void;
  isDragging(): boolean;
  hasDragMoved(): boolean;
}

export interface UiMeasurementPort {
  clear(): void;
  onWidgetToggleClick(): void;
  updateMarkerSizes(): void;
  isActive(): boolean;
  tryPick(event: PointerEvent): void;
}

export interface RenderMeasurementPort {
  clear(): void;
}

export interface RenderCameraControllerPort {
  resetOrbit(options: {
    radius: number;
    moveSpeed: number;
    theta: number;
    phi: number;
  }): void;
  updateCameraBounds(radius: number): void;
}
