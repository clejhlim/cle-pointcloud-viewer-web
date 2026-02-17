/**
 * ui-controls — helpers for render option controls and range labels.
 */

interface UiRangeElements {
    samplingStepValue?: HTMLElement | null;
    samplingStep?: HTMLInputElement | null;
    pointSizeValue?: HTMLElement | null;
    pointSize?: HTMLInputElement | null;
}

export function getCurrentPointSize(pointSizeEl: HTMLInputElement | null | undefined, defaultPointSize: number): number {
    const value = Number(pointSizeEl ? pointSizeEl.value : defaultPointSize);
    if (!Number.isFinite(value) || value <= 0) {
        return defaultPointSize;
    }
    return value;
}

export function updateRangeLabels(elements: UiRangeElements, defaultPointSize: number): void {
    if (elements.samplingStepValue && elements.samplingStep) {
        elements.samplingStepValue.textContent = String(elements.samplingStep.value);
    }
    if (elements.pointSizeValue) {
        elements.pointSizeValue.textContent = getCurrentPointSize(elements.pointSize, defaultPointSize).toFixed(1);
    }
}
