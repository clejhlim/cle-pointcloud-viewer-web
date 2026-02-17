/**
 * ui-status — helpers for status/stats/camera display elements.
 */

interface CameraLike {
    position: {
        x: number;
        y: number;
        z: number;
    };
}

export function setStatus(statusEl: HTMLElement | null | undefined, message: string, type?: string): void {
    if (!statusEl) {
        if (type === "error") {
            console.error(message);
        }
        return;
    }

    statusEl.textContent = message;
    statusEl.classList.remove("error", "success");

    if (type === "error") {
        statusEl.classList.add("error");
    }

    if (type === "success") {
        statusEl.classList.add("success");
    }
}

export function setStats(statsEl: HTMLElement | null | undefined, lines: string[]): void {
    if (!statsEl) {
        return;
    }
    statsEl.textContent = lines.length ? lines.join("\n") : "";
}

export function updateCameraInfo(cameraInfoEl: HTMLElement | null | undefined, camera: CameraLike | null | undefined): void {
    if (!cameraInfoEl || !camera) {
        return;
    }

    const p = camera.position;
    const nextText = `Camera XYZ: ${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}`;
    if (cameraInfoEl.textContent !== nextText) {
        cameraInfoEl.textContent = nextText;
    }
}
