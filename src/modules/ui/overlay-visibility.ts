/**
 * overlay-visibility — helpers for parsing and normalizing overlay tokens.
 */

import type { OverlayVisibility } from "../../types/viewer-types";

type OverlayKey = keyof OverlayVisibility;

function createOverlayVisibility(): OverlayVisibility {
    return {
        controlPanel: false,
        measurement: false,
        axisWidget: false
    };
}

function parseOverlayToken(token: string): OverlayKey | null {
    if (token === "control-panel") {
        return "controlPanel";
    }
    if (token === "measurement") {
        return "measurement";
    }
    if (token === "axis-widget") {
        return "axisWidget";
    }
    return null;
}

export function resolveOverlayVisibility(overlaysAttr: string | null | undefined): OverlayVisibility {
    const raw = typeof overlaysAttr === "string" ? overlaysAttr.trim().toLowerCase() : "";
    if (!raw) {
        return createOverlayVisibility();
    }

    const tokens = raw
        .split(/[,\s]+/)
        .map((token) => token.trim())
        .filter(Boolean);

    const visibility = createOverlayVisibility();
    for (const token of tokens) {
        const key = parseOverlayToken(token);
        if (key) {
            visibility[key] = true;
        }
    }
    return visibility;
}
