import type { RenderOptions, RotationMode } from "../../types/viewer-types";

export const DEFAULT_RENDER_OPTIONS: Readonly<RenderOptions> = Object.freeze({
    samplingStep: 1,
    pointSize: 2,
    useTextureColor: true,
    skipZero: true
});

export const DEFAULT_ROTATION_MODE: RotationMode = "turntable";
