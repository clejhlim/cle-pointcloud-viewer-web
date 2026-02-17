/**
 * RenderPipeline — runs file decode/validation/buffer build and updates
 * runtime scene state with cancellation semantics.
 */

import {
    readSingleBandTiff,
    readTexturePng,
    readValidMask,
    validateRasterShape,
    buildPointBuffers
} from "./pointcloud-loader.js";
import { numberWithCommas } from "../common/format-utils.js";
import type {
    PointBuffersResult,
    RenderPipelineOptions,
    RenderRuntimeLike
} from "../../types/render-types";
import type { RenderCameraControllerPort, RenderMeasurementPort } from "../../types/viewer-ports";
import type { RenderOptions, ViewerFiles } from "../../types/viewer-types";

class RenderAbortError extends Error {
    constructor(message = "렌더 작업이 취소되었습니다.") {
        super(message);
        this.name = "AbortError";
    }
}

function isAbortError(error: unknown): boolean {
    return error instanceof RenderAbortError
        || (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError");
}

export class RenderPipeline {
    private _runtime: RenderRuntimeLike | null | undefined;
    private _measurement: RenderMeasurementPort | null;
    private _cameraCtrl: RenderCameraControllerPort | null;
    private _setStatus: (message: string, type?: string) => void;
    private _setStats: (lines: string[]) => void;
    private _renderToken: number;

    constructor(options: RenderPipelineOptions = {}) {
        this._runtime = options.runtime;
        this._measurement = options.measurement || null;
        this._cameraCtrl = options.cameraCtrl || null;
        this._setStatus = options.setStatus || (() => { });
        this._setStats = options.setStats || (() => { });

        this._renderToken = 0;
    }

    cancel(): void {
        this._renderToken += 1;
    }

    dispose(): void {
        this.cancel();
    }

    async renderFromFiles(files: ViewerFiles, renderOptions: RenderOptions): Promise<number> {
        const renderToken = ++this._renderToken;

        try {
            if (!this._runtime || this._runtime.isDisposed()) {
                throw this._createAbortedRenderError();
            }

            this._ensureRequiredFileArgs(files);
            this._setStatus("파일 로딩 중...", "info");

            this._ensureActive(renderToken);

            const [xRaster, yRaster, zRaster] = await Promise.all([
                readSingleBandTiff(files.pcX),
                readSingleBandTiff(files.pcY),
                readSingleBandTiff(files.pcZ)
            ]);
            this._ensureActive(renderToken);

            validateRasterShape(xRaster, yRaster, "X", "Y");
            validateRasterShape(xRaster, zRaster, "X", "Z");

            const textureRaster = files.texture
                ? await readTexturePng(files.texture)
                : null;
            this._ensureActive(renderToken);

            const maskRaster = files.validMask
                ? await readValidMask(files.validMask)
                : null;
            this._ensureActive(renderToken);

            if (textureRaster) {
                validateRasterShape(xRaster, textureRaster, "Point Cloud", "Texture");
            }

            if (maskRaster) {
                validateRasterShape(xRaster, maskRaster, "Point Cloud", "ValidMask");
            }

            const samplingStep = renderOptions.samplingStep;
            const pointSize = renderOptions.pointSize;
            const useTextureColor = renderOptions.useTextureColor;
            const skipZero = renderOptions.skipZero;

            const result = buildPointBuffers({
                xRaster,
                yRaster,
                zRaster,
                textureRaster,
                maskRaster,
                samplingStep,
                useTextureColor,
                skipZero
            });

            if (this._measurement) {
                this._measurement.clear();
            }

            const { radius } = this._applyPointCloudDataSafely(renderToken, result, pointSize);

            if (this._cameraCtrl) {
                this._cameraCtrl.resetOrbit({
                    radius: radius * 2.2,
                    moveSpeed: Math.max(radius * 0.8, 10),
                    theta: Math.PI,
                    phi: Math.PI / 2
                });
                this._cameraCtrl.updateCameraBounds(radius);
            }

            const sourcePixels = xRaster.width * xRaster.height;
            const sampledPixels = Math.ceil(xRaster.width / samplingStep) * Math.ceil(xRaster.height / samplingStep);

            if (this._isActive(renderToken)) {
                this._setStats([
                    `Resolution: ${xRaster.width} x ${xRaster.height}`,
                    `Input Pixels: ${numberWithCommas(sourcePixels)}`,
                    `Sampled Pixels: ${numberWithCommas(sampledPixels)}`,
                    `Rendered Points: ${numberWithCommas(result.count)}`,
                    `Skipped: ${numberWithCommas(sampledPixels - result.count)}`,
                    `Point Size: ${pointSize.toFixed(1)}`,
                    `Color: ${useTextureColor && textureRaster ? "Texture" : "Depth(Z)"}`
                ]);

                this._setStatus("렌더링 완료", "success");
            }

            return result.count;
        } catch (error: unknown) {
            if (!isAbortError(error) && this._isActive(renderToken)) {
                this._setStatus(error instanceof Error ? error.message : String(error), "error");
            }
            throw error;
        }
    }

    private _ensureRequiredFileArgs(files: ViewerFiles): void {
        if (!files || !files.pcX || !files.pcY || !files.pcZ) {
            throw new Error("Point Cloud X/Y/Z 파일이 필요합니다.");
        }
    }

    private _applyPointCloudDataSafely(
        renderToken: number,
        result: PointBuffersResult,
        pointSize: number
    ): { radius: number } {
        const runtime = this._runtime;
        if (!runtime || runtime.isDisposed()) {
            throw this._createAbortedRenderError();
        }

        this._ensureActive(renderToken);
        const applied = runtime.applyPointCloudData(result, pointSize);

        // Guard against stale commits. If a newer render took over, roll back immediately.
        if (!this._isActive(renderToken)) {
            if (typeof runtime.clearPointCloudOnly === "function") {
                runtime.clearPointCloudOnly();
            }
            throw this._createAbortedRenderError();
        }

        return applied;
    }

    private _createAbortedRenderError(): RenderAbortError {
        return new RenderAbortError();
    }

    private _isActive(renderToken: number): boolean {
        return !!this._runtime
            && !this._runtime.isDisposed()
            && this._renderToken === renderToken;
    }

    private _ensureActive(renderToken: number): void {
        if (!this._isActive(renderToken)) {
            throw this._createAbortedRenderError();
        }
    }
}
