import { resolveOverlayVisibility } from "../ui/overlay-visibility.js";
import { DEFAULT_RENDER_OPTIONS, DEFAULT_ROTATION_MODE } from "../common/viewer-defaults.js";
import type { RotationMode, ViewerSettings } from "../../types/viewer-types";

function _clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function _readAttribute(host: HTMLElement, name: string): string | null {
    const value = host.getAttribute(name);
    return typeof value === "string" ? value : null;
}

export function parseRotationModeAttr(value: string | null | undefined): RotationMode {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized === "arcball" || normalized === "cad") {
        return normalized;
    }
    return DEFAULT_ROTATION_MODE;
}

export function parseSamplingStepAttr(value: string | null | undefined): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_RENDER_OPTIONS.samplingStep;
    }
    return _clamp(Math.round(parsed), 1, 8);
}

export function parsePointSizeAttr(value: string | null | undefined): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_RENDER_OPTIONS.pointSize;
    }
    return _clamp(parsed, 0.5, 6);
}

export function parseBooleanStringAttr(value: string | null | undefined, fallback: boolean): boolean {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized === "true") {
        return true;
    }
    if (normalized === "false") {
        return false;
    }
    return fallback;
}

export function resolveViewerSettingsFromAttributes(host: HTMLElement): ViewerSettings {
    return {
        overlays: resolveOverlayVisibility(_readAttribute(host, "overlays")),
        rotationMode: parseRotationModeAttr(_readAttribute(host, "rotation-mode")),
        renderOptions: {
            samplingStep: parseSamplingStepAttr(_readAttribute(host, "sampling-step")),
            pointSize: parsePointSizeAttr(_readAttribute(host, "point-size")),
            useTextureColor: parseBooleanStringAttr(
                _readAttribute(host, "use-texture-color"),
                DEFAULT_RENDER_OPTIONS.useTextureColor
            ),
            skipZero: parseBooleanStringAttr(
                _readAttribute(host, "skip-zero"),
                DEFAULT_RENDER_OPTIONS.skipZero
            )
        }
    };
}
