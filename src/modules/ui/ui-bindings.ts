/**
 * UiBindings — owns DOM event wiring and input/state synchronization.
 */

import type { ViewerFiles } from "../../types/viewer-types";
import type {
    UiCameraControllerPort,
    UiDomElements,
    UiMeasurementPort
} from "../../types/viewer-ports";

interface PointCloudLike {
    material?: unknown;
}

interface UiBindingsOptions {
    elements?: UiDomElements;
    cameraCtrl?: UiCameraControllerPort | null;
    measurement?: UiMeasurementPort | null;
    getPointCloud?: () => PointCloudLike | null;
    setStatus?: (message: string, type?: string) => void;
    onRenderRequested?: (files: ViewerFiles) => Promise<unknown> | unknown;
    onClearRequested?: () => void;
}

function asInput(element: HTMLElement | null | undefined): HTMLInputElement | null {
    return element instanceof HTMLInputElement ? element : null;
}

function asButton(element: HTMLElement | null | undefined): HTMLButtonElement | null {
    return element instanceof HTMLButtonElement ? element : null;
}

function fileFromInput(input: HTMLInputElement | null): File | null {
    return input && input.files ? input.files[0] || null : null;
}

export class UiBindings {
    private _elements: UiDomElements;
    private _cameraCtrl: UiCameraControllerPort | null;
    private _measurement: UiMeasurementPort | null;
    private _getPointCloud: () => PointCloudLike | null;
    private _setStatus: (message: string, type?: string) => void;
    private _onRenderRequested: (files: ViewerFiles) => Promise<unknown> | unknown;
    private _onClearRequested: () => void;
    private _eventsAbort: AbortController | null;

    constructor(options: UiBindingsOptions = {}) {
        this._elements = options.elements || {};

        this._cameraCtrl = options.cameraCtrl || null;
        this._measurement = options.measurement || null;
        this._getPointCloud = options.getPointCloud || (() => null);

        this._setStatus = options.setStatus || (() => { });
        this._onRenderRequested = options.onRenderRequested || (async () => { });
        this._onClearRequested = options.onClearRequested || (() => { });

        this._eventsAbort = null;
    }

    hookEvents(): void {
        this.dispose();

        const controller = new AbortController();
        this._eventsAbort = controller;

        const on = (
            target: EventTarget | null | undefined,
            type: string,
            listener: EventListenerOrEventListenerObject,
            opts?: AddEventListenerOptions
        ): void => {
            if (!target || typeof target.addEventListener !== "function") {
                return;
            }

            const nextOpts = opts
                ? { ...opts, signal: controller.signal }
                : { signal: controller.signal };
            target.addEventListener(type, listener, nextOpts);
        };

        on(this._elements.renderButton, "click", () => {
            void this._onRenderButtonClick().catch((error) => {
                if (error && error.name === "AbortError") {
                    return;
                }

                const message = error instanceof Error ? error.message : String(error);
                this._setStatus(message, "error");
                console.error(error);
            });
        });

        on(this._elements.clearButton, "click", () => this._onClearRequested());

        on(this._elements.clearMeasureButton, "click", () => {
            if (this._measurement) {
                this._measurement.clear();
            }
            this._setStatus("측정 정보를 초기화했습니다.", "info");
        });

        on(this._elements.measureWidgetToggle, "click", () => {
            if (this._measurement) {
                this._measurement.onWidgetToggleClick();
            }
        });

        on(this._elements.viewer, "keydown", (event) => {
            if (this._cameraCtrl) {
                this._cameraCtrl.onKeyDown(event as KeyboardEvent);
            }
        });

        on(this._elements.viewer, "keyup", (event) => {
            if (this._cameraCtrl) {
                this._cameraCtrl.onKeyUp(event as KeyboardEvent);
            }
        });

        on(window, "blur", () => {
            if (this._cameraCtrl) {
                this._cameraCtrl.onWindowBlur();
            }
        });

        on(document, "visibilitychange", () => {
            if (document.hidden && this._cameraCtrl) {
                this._cameraCtrl.onWindowBlur();
            }
        });

        on(this._elements.viewer, "focus", () => {
            if (this._cameraCtrl) {
                this._cameraCtrl.onFocus();
            }
        });

        on(this._elements.viewer, "blur", () => {
            if (this._cameraCtrl) {
                this._cameraCtrl.onBlur();
            }
        });

        on(this._elements.viewer, "pointerdown", (event) => {
            if (this._cameraCtrl) {
                this._cameraCtrl.onPointerDown(event as PointerEvent);
            }
        });

        on(this._elements.viewer, "pointermove", (event) => {
            if (this._cameraCtrl) {
                this._cameraCtrl.onPointerMove(event as PointerEvent);
            }
        });

        on(this._elements.viewer, "pointerup", (event) => {
            const measurement = this._measurement;
            const pointCloud = this._getPointCloud();
            const shouldPick = !!this._cameraCtrl
                && !!measurement
                && this._cameraCtrl.isDragging()
                && measurement.isActive()
                && !!pointCloud
                && !this._cameraCtrl.hasDragMoved()
                && !(event.target instanceof Element && event.target.closest(".viewer-widget"));

            if (shouldPick && measurement) {
                measurement.tryPick(event as PointerEvent);
            }

            if (this._cameraCtrl) {
                this._cameraCtrl.onPointerUp(event as PointerEvent);
            }
        });

        on(this._elements.viewer, "pointerleave", (event) => {
            if (this._cameraCtrl) {
                this._cameraCtrl.onPointerLeave(event as PointerEvent);
            }
        });

        on(this._elements.viewer, "pointercancel", (event) => {
            if (this._cameraCtrl) {
                this._cameraCtrl.onPointerCancel(event as PointerEvent);
            }
        });

        on(this._elements.viewer, "wheel", (event) => {
            if (this._cameraCtrl) {
                this._cameraCtrl.onWheel(event as WheelEvent);
            }
        }, { passive: false });
    }

    dispose(): void {
        if (this._eventsAbort) {
            this._eventsAbort.abort();
            this._eventsAbort = null;
        }
    }

    ensureRequiredFiles(): void {
        const pcX = asInput(this._elements.pcX);
        const pcY = asInput(this._elements.pcY);
        const pcZ = asInput(this._elements.pcZ);

        if (!pcX || !pcY || !pcZ) {
            const error = new Error("현재 뷰어에는 파일 입력 패널이 없습니다. renderFromFiles(...)를 사용하세요.");
            this._setStatus(error.message, "error");
            throw error;
        }

        if (!pcX.files?.[0] || !pcY.files?.[0] || !pcZ.files?.[0]) {
            const error = new Error("Point Cloud X/Y/Z 파일을 모두 선택하세요.");
            this._setStatus(error.message, "error");
            throw error;
        }
    }

    getFilesFromInputs(): ViewerFiles {
        const pcX = fileFromInput(asInput(this._elements.pcX));
        const pcY = fileFromInput(asInput(this._elements.pcY));
        const pcZ = fileFromInput(asInput(this._elements.pcZ));
        const texture = fileFromInput(asInput(this._elements.texture));
        const validMask = fileFromInput(asInput(this._elements.validMask));

        if (!pcX || !pcY || !pcZ) {
            throw new Error("Point Cloud X/Y/Z 파일을 모두 선택하세요.");
        }

        return {
            pcX,
            pcY,
            pcZ,
            texture,
            validMask
        };
    }

    setRenderButtonDisabled(disabled: boolean): void {
        const renderButton = asButton(this._elements.renderButton);
        if (!renderButton) {
            return;
        }

        renderButton.disabled = !!disabled;
    }

    async _onRenderButtonClick(): Promise<void> {
        this.ensureRequiredFiles();
        await this._onRenderRequested(this.getFilesFromInputs());
    }
}
