/**
 * render-options — shared normalization helpers for render options.
 */

import { DEFAULT_RENDER_OPTIONS } from "./viewer-defaults.js";
import type { RenderOptions } from "../../types/viewer-types";

interface RenderOptionsInput {
    samplingStep?: number | string | null | undefined;
    pointSize?: number | string | null | undefined;
    useTextureColor?: boolean | null | undefined;
    skipZero?: boolean | null | undefined;
}

export function normalizeRenderOptions(
    rawOptions: RenderOptionsInput = {},
    defaultOptions: RenderOptions = DEFAULT_RENDER_OPTIONS
): RenderOptions {
    const samplingStep = Number(rawOptions.samplingStep ?? defaultOptions.samplingStep);
    const pointSize = Number(rawOptions.pointSize ?? defaultOptions.pointSize);
    const useTextureColor = rawOptions.useTextureColor ?? defaultOptions.useTextureColor;
    const skipZero = rawOptions.skipZero ?? defaultOptions.skipZero;

    return {
        samplingStep: Number.isFinite(samplingStep) && samplingStep >= 1
            ? Math.round(samplingStep)
            : defaultOptions.samplingStep,
        pointSize: Number.isFinite(pointSize) && pointSize > 0
            ? pointSize
            : defaultOptions.pointSize,
        useTextureColor: Boolean(useTextureColor),
        skipZero: Boolean(skipZero)
    };
}
