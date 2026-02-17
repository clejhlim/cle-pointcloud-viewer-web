/**
 * create-pointcloud-viewer.js — Composition Orchestrator
 *
 * Wires together sub-modules (ViewerRuntime, RenderPipeline,
 * UiBindings, CameraController, MeasurementManager, AxisWidget)
 * and exposes the public API consumed by the custom element.
 */

import { CameraController } from "../interaction/camera-controller.js";
import { MeasurementManager } from "../interaction/measurement-manager.js";
import { MeasurementOverlay } from "../interaction/measurement-overlay.js";
import { AxisWidget } from "../interaction/axis-widget.js";
import { ViewerRuntime } from "../runtime/viewer-runtime.js";
import { RenderPipeline } from "../render/render-pipeline.js";
import { UiBindings } from "../ui/ui-bindings.js";
import { resolveOverlayVisibility } from "../ui/overlay-visibility.js";
import {
    setStatus as _setStatus,
    setStats as _setStats,
    updateCameraInfo
} from "../ui/ui-status.js";
import { DEFAULT_RENDER_OPTIONS, DEFAULT_ROTATION_MODE } from "../common/viewer-defaults.js";
import { normalizeRenderOptions } from "../common/render-options.js";
import type { ViewerDomElements } from "../../types/viewer-ports";
import type {
    OverlayVisibility,
    RenderOptions,
    RotationMode,
    ViewerFiles,
    ViewerHandle,
    ViewerSettings
} from "../../types/viewer-types";
import type { MeasurementStateSnapshot } from "../../types/measurement-types";
import type { Vector3 } from "three";

interface CreatePointCloudViewerOptions {
    root?: Document | ShadowRoot;
    settings?: ViewerSettings;
}

const INACTIVE_MEASUREMENT_SNAPSHOT: Readonly<MeasurementStateSnapshot> = Object.freeze({
    active: false,
    a: null,
    b: null
});

export function createPointCloudViewer(options: CreatePointCloudViewerOptions = {}): ViewerHandle {
    const root = options.root || document;
    const elements = resolveViewerElements(root);
    ensureRequiredElements(elements);

    const settings = normalizeViewerSettings(options.settings || createDefaultViewerSettings());

    return new PointCloudViewerComposer(
        { settings },
        elements
    );
}

class PointCloudViewerComposer implements ViewerHandle {
    private readonly _elements: ViewerDomElements;
    private _overlays: OverlayVisibility;
    private _rotationMode: RotationMode;
    private _renderOptions: RenderOptions;
    private _runtime: ViewerRuntime | null;
    private _cameraCtrl: CameraController | null;
    private _measurement: MeasurementManager | null;
    private _measurementOverlay: MeasurementOverlay | null;
    private _axisWidget: AxisWidget | null;
    private _pipeline: RenderPipeline | null;
    private _uiBindings: UiBindings | null;
    private _renderUiToken: number;
    private _panelVisible: boolean;

    constructor(options: { settings: ViewerSettings }, elements: ViewerDomElements) {
        this._elements = elements;
        this._overlays = options.settings.overlays;
        this._rotationMode = options.settings.rotationMode;
        this._renderOptions = options.settings.renderOptions;
        this._runtime = null;
        this._cameraCtrl = null;
        this._measurement = null;
        this._measurementOverlay = null;
        this._axisWidget = null;
        this._pipeline = null;
        this._uiBindings = null;
        this._renderUiToken = 0;
        this._panelVisible = false;

        try {
            this._init();
        } catch (error) {
            this.dispose();
            throw error;
        }
    }

    async renderFromFiles(files: ViewerFiles): Promise<number> {
        const pipeline = this._requirePipeline();
        const uiBindings = this._uiBindings;

        const uiToken = ++this._renderUiToken;
        if (uiBindings) {
            uiBindings.setRenderButtonDisabled(true);
        }

        try {
            return await pipeline.renderFromFiles(files, this._renderOptions);
        } finally {
            if (this._uiBindings && uiToken === this._renderUiToken) {
                this._uiBindings.setRenderButtonDisabled(false);
            }
        }
    }

    clear(): void {
        if (this._pipeline) {
            this._pipeline.cancel();
        }

        if (this._runtime) {
            this._runtime.clearPointCloudOnly();
        }

        if (this._measurement) {
            this._measurement.clear();
        }

        if (this._cameraCtrl) {
            this._cameraCtrl.resetCadPivotAndTarget();
        }

        this._setStats([]);
        this._setStatus("초기화 완료", "info");
    }

    setControlPanelVisible(visible: boolean): void {
        if (!this._elements.controlPanel) {
            return;
        }

        this._panelVisible = !!visible;
        const canShow = this._overlays.controlPanel;
        this._elements.controlPanel.classList.toggle("overlay-open", canShow && this._panelVisible);
    }

    applyViewerSettings(next: ViewerSettings): void {
        const resolved = normalizeViewerSettings(next);

        const overlayChanged = !isSameOverlays(this._overlays, resolved.overlays);
        const rotationChanged = this._rotationMode !== resolved.rotationMode;
        const pointSizeChanged = this._renderOptions.pointSize !== resolved.renderOptions.pointSize;

        if (overlayChanged) {
            this._applyOverlayChange(this._overlays, resolved.overlays);
            this._overlays = resolved.overlays;
        }

        this._renderOptions = resolved.renderOptions;

        if (rotationChanged) {
            this._rotationMode = resolved.rotationMode;
            if (this._cameraCtrl) {
                this._cameraCtrl.setMode(this._rotationMode);
            }
        }

        if (pointSizeChanged) {
            this._applyPointSizeToPointCloud(this._renderOptions.pointSize);
            if (this._measurement) {
                this._measurement.updateMarkerSizes();
            }
        }

        this.setControlPanelVisible(this._panelVisible);
    }

    getCameraPosition(): Vector3 | null {
        return this._cameraCtrl ? this._cameraCtrl.getPosition() : null;
    }

    dispose(): void {
        this._renderUiToken += 1;

        if (this._pipeline) {
            this._pipeline.dispose();
        }

        if (this._uiBindings) {
            this._uiBindings.dispose();
            this._uiBindings = null;
        }

        if (this._cameraCtrl) {
            this._cameraCtrl.cancelDragging();
        }

        this.clear();

        if (this._measurementOverlay) {
            this._measurementOverlay.dispose();
            this._measurementOverlay = null;
        }

        if (this._measurement) {
            this._measurement.dispose();
            this._measurement = null;
        }

        if (this._axisWidget) {
            this._axisWidget.dispose();
            this._axisWidget = null;
        }

        if (this._cameraCtrl) {
            this._cameraCtrl.dispose();
            this._cameraCtrl = null;
        }

        if (this._runtime) {
            this._runtime.dispose();
            this._runtime = null;
        }

        this._pipeline = null;
    }

    private _init(): void {
        const runtime = new ViewerRuntime({
            viewerEl: this._elements.viewer
        });
        runtime.init();
        this._runtime = runtime;

        const sceneRef = runtime.getSceneRef();
        const cameraRef = runtime.getCameraRef();
        const rendererRef = runtime.getRendererRef();
        const pointSpriteRef = runtime.getPointSpriteRef();
        if (!sceneRef || !cameraRef || !rendererRef) {
            throw new Error("Viewer runtime render references are not initialized.");
        }

        const cameraCtrl = new CameraController(cameraRef, {
            viewerEl: this._elements.viewer,
            getCanvas: () => {
                if (!this._runtime) {
                    return null;
                }
                const renderer = this._runtime.getRendererRef();
                return renderer ? renderer.domElement : null;
            }
        });
        cameraCtrl.updateCameraFromOrbit();
        cameraCtrl.setMode(this._rotationMode);
        this._cameraCtrl = cameraCtrl;

        if (this._overlays.axisWidget) {
            const axisWidget = new AxisWidget();
            axisWidget.init();
            this._axisWidget = axisWidget;
        } else {
            this._axisWidget = null;
        }

        const measurementOverlay = new MeasurementOverlay({
            camera: cameraRef,
            viewerEl: this._elements.viewer,
            labelLayer: this._elements.labelLayer,
            measureInfoEl: this._elements.measureInfo,
            measureWidgetEl: this._elements.measureWidget,
            measureWidgetToggleEl: this._elements.measureWidgetToggle
        });
        measurementOverlay.init();
        this._measurementOverlay = measurementOverlay;

        const measurement = new MeasurementManager({
            scene: sceneRef,
            camera: cameraRef,
            renderer: rendererRef,
            pointSprite: pointSpriteRef,
            getPointCloud: () => (this._runtime ? this._runtime.getPointCloud() : null),
            getCloudRadius: () => (this._runtime ? this._runtime.getCloudRadius() : 1),
            getPointSize: () => this._renderOptions.pointSize,
            getCameraTarget: () => cameraCtrl.getTarget(),
            onPivotSelected: (worldPos: Vector3) => {
                cameraCtrl.setCadPivot(worldPos);
            },
            onStatusMessage: (message: string, type: string) => this._setStatus(message, type),
            onStateChanged: (state) => {
                if (this._overlays.measurement && this._measurementOverlay) {
                    this._measurementOverlay.applyState(state);
                }
            }
        });
        this._measurement = measurement;
        if (this._overlays.measurement) {
            measurementOverlay.applyState(measurement.getSnapshot());
        } else {
            measurementOverlay.applyState(INACTIVE_MEASUREMENT_SNAPSHOT);
        }

        this._pipeline = new RenderPipeline({
            runtime,
            measurement,
            cameraCtrl,
            setStatus: (message: string, type?: string) => this._setStatus(message, type),
            setStats: (lines: string[]) => this._setStats(lines)
        });

        const uiBindings = new UiBindings({
            elements: this._elements,
            cameraCtrl,
            measurement,
            getPointCloud: () => (this._runtime ? this._runtime.getPointCloud() : null),
            setStatus: (message: string, type?: string) => this._setStatus(message, type),
            onRenderRequested: (files: ViewerFiles) => this.renderFromFiles(files),
            onClearRequested: () => this.clear()
        });
        this._uiBindings = uiBindings;
        uiBindings.hookEvents();

        this._applyViewerModeLayout();
        runtime.startRenderLoop((nowMs: number) => this._renderLoop(nowMs));

        this._setStatus("파일을 선택한 뒤 Render를 누르세요.", "info");

        measurement.setActive(false, false);
        if (!this._overlays.measurement) {
            this._deactivateMeasurementOverlay();
        }

        this.setControlPanelVisible(this._panelVisible);
        updateCameraInfo(this._elements.cameraInfo, cameraRef);
    }

    private _setStatus(message: string, type?: string): void {
        _setStatus(this._elements.status, message, type);
    }

    private _setStats(lines: string[]): void {
        _setStats(this._elements.stats, lines);
    }

    private _applyViewerModeLayout(): void {
        if (this._runtime) {
            this._runtime.resize();
        }
    }

    private _deactivateMeasurementOverlay(): void {
        if (this._measurement) {
            this._measurement.setActive(false, false);
            this._measurement.clear();
        }
        if (this._measurementOverlay) {
            this._measurementOverlay.applyState(INACTIVE_MEASUREMENT_SNAPSHOT);
        }
    }

    private _applyOverlayChange(prev: OverlayVisibility, next: OverlayVisibility): void {
        if (prev.axisWidget && !next.axisWidget && this._axisWidget) {
            this._axisWidget.dispose();
            this._axisWidget = null;
        } else if (!prev.axisWidget && next.axisWidget) {
            const axisWidget = new AxisWidget();
            axisWidget.init();
            this._axisWidget = axisWidget;
        }

        if (!next.measurement) {
            this._deactivateMeasurementOverlay();
        } else if (this._measurement && this._measurementOverlay) {
            this._measurementOverlay.applyState(this._measurement.getSnapshot());
        }

        if (this._runtime) {
            this._runtime.resize();
        }
    }

    private _applyPointSizeToPointCloud(pointSize: number): void {
        const pointCloud = this._runtime ? this._runtime.getPointCloud() : null;
        if (
            !pointCloud
            || !pointCloud.material
            || typeof pointCloud.material !== "object"
            || !("size" in pointCloud.material)
            || !("needsUpdate" in pointCloud.material)
        ) {
            return;
        }

        const material = pointCloud.material as {
            size: number;
            needsUpdate: boolean;
        };
        material.size = pointSize;
        material.needsUpdate = true;
    }

    private _renderLoop(nowMs: number): void {
        if (!this._runtime || this._runtime.isDisposed()) {
            return;
        }

        const rendererRef = this._runtime.getRendererRef();
        const cameraRef = this._runtime.getCameraRef();
        if (!rendererRef || !cameraRef) {
            return;
        }

        if (this._cameraCtrl) {
            this._cameraCtrl.update(nowMs);
        }

        this._runtime.renderScene();

        if (this._overlays.axisWidget && this._axisWidget && this._cameraCtrl && this._elements.viewer) {
            this._axisWidget.render(rendererRef, cameraRef, this._cameraCtrl.getTarget(), this._elements.viewer);
        }

        if (this._overlays.measurement && this._measurement && this._measurementOverlay) {
            this._measurementOverlay.updateLabels(this._measurement.getSnapshot());
        }

        updateCameraInfo(this._elements.cameraInfo, cameraRef);
    }

    private _requirePipeline(): RenderPipeline {
        if (!this._pipeline) {
            throw new Error("Viewer runtime is not initialized.");
        }
        return this._pipeline;
    }

}

function createDefaultViewerSettings(): ViewerSettings {
    return {
        overlays: resolveOverlayVisibility(null),
        rotationMode: DEFAULT_ROTATION_MODE,
        renderOptions: { ...DEFAULT_RENDER_OPTIONS }
    };
}

function normalizeViewerSettings(settings: ViewerSettings): ViewerSettings {
    return {
        overlays: {
            controlPanel: !!settings.overlays.controlPanel,
            measurement: !!settings.overlays.measurement,
            axisWidget: !!settings.overlays.axisWidget
        },
        rotationMode: normalizeRotationMode(settings.rotationMode),
        renderOptions: normalizeRenderOptions(settings.renderOptions, DEFAULT_RENDER_OPTIONS)
    };
}

function normalizeRotationMode(mode: string): RotationMode {
    if (mode === "arcball" || mode === "cad") {
        return mode;
    }
    return DEFAULT_ROTATION_MODE;
}

function isSameOverlays(a: OverlayVisibility, b: OverlayVisibility): boolean {
    return a.controlPanel === b.controlPanel
        && a.measurement === b.measurement
        && a.axisWidget === b.axisWidget;
}

function resolveViewerElements(root: Document | ShadowRoot): ViewerDomElements {
    return {
        layout: getElementFromRoot(root, "viewerLayout"),
        controlPanel: getElementFromRoot(root, "controlPanel"),
        pcX: getElementFromRoot(root, "pcX"),
        pcY: getElementFromRoot(root, "pcY"),
        pcZ: getElementFromRoot(root, "pcZ"),
        texture: getElementFromRoot(root, "texture"),
        validMask: getElementFromRoot(root, "validMask"),
        measureWidget: getElementFromRoot(root, "measureWidget"),
        measureWidgetToggle: getElementFromRoot(root, "measureWidgetToggle"),
        clearMeasureButton: getElementFromRoot(root, "clearMeasureButton"),
        measureInfo: getElementFromRoot(root, "measureInfo"),
        labelLayer: getElementFromRoot(root, "labelLayer"),
        renderButton: getElementFromRoot(root, "renderButton"),
        clearButton: getElementFromRoot(root, "clearButton"),
        status: getElementFromRoot(root, "status"),
        cameraInfo: getElementFromRoot(root, "cameraInfo"),
        stats: getElementFromRoot(root, "stats"),
        viewer: getElementFromRoot(root, "viewer")
    };
}

function getElementFromRoot(root: Document | ShadowRoot, id: string): HTMLElement | null {
    let element: Element | null = null;
    if (typeof root.getElementById === "function") {
        element = root.getElementById(id);
    } else if (typeof root.querySelector === "function") {
        element = root.querySelector(`#${id}`);
    }
    return element instanceof HTMLElement ? element : null;
}

function ensureRequiredElements(elements: ViewerDomElements): void {
    if (!elements.viewer) {
        throw new Error("Missing required viewer element: viewer");
    }
}
