/**
 * MeasurementOverlay — DOM/UI rendering for measurement state and labels.
 */

import { type PerspectiveCamera, Vector3 } from "three";
import { formatVec3 } from "../common/format-utils.js";
import type { MeasurementStateSnapshot, Vec3Snapshot } from "../../types/measurement-types";

interface MeasurementOverlayDeps {
    camera: PerspectiveCamera;
    viewerEl: HTMLElement | null;
    labelLayer: HTMLElement | null;
    measureInfoEl: HTMLElement | null;
    measureWidgetEl: HTMLElement | null;
    measureWidgetToggleEl: HTMLElement | null;
}

export class MeasurementOverlay {
    private _camera: PerspectiveCamera;
    private _viewerEl: HTMLElement | null;
    private _labelLayer: HTMLElement | null;
    private _measureInfoEl: HTMLElement | null;
    private _measureWidgetEl: HTMLElement | null;
    private _measureWidgetToggleEl: HTMLElement | null;
    private _labelA: HTMLDivElement | null;
    private _labelB: HTMLDivElement | null;
    private _labelDistance: HTMLDivElement | null;
    private _tmpAWorld: Vector3;
    private _tmpBWorld: Vector3;
    private _tmpMidWorld: Vector3;
    private _tmpProjected: Vector3;

    constructor(deps: MeasurementOverlayDeps) {
        this._camera = deps.camera;
        this._viewerEl = deps.viewerEl;
        this._labelLayer = deps.labelLayer;
        this._measureInfoEl = deps.measureInfoEl;
        this._measureWidgetEl = deps.measureWidgetEl;
        this._measureWidgetToggleEl = deps.measureWidgetToggleEl;
        this._labelA = null;
        this._labelB = null;
        this._labelDistance = null;
        this._tmpAWorld = new Vector3();
        this._tmpBWorld = new Vector3();
        this._tmpMidWorld = new Vector3();
        this._tmpProjected = new Vector3();
    }

    init(): void {
        if (!this._labelLayer) {
            return;
        }

        if (!this._labelA) {
            this._labelA = this._createLabelEl("point-a");
        }
        if (!this._labelB) {
            this._labelB = this._createLabelEl("point-b");
        }
        if (!this._labelDistance) {
            this._labelDistance = this._createLabelEl("distance");
        }
    }

    applyState(state: MeasurementStateSnapshot): void {
        this._updateModeVisual(state.active);
        this._updateWidgetVisibility(state.active);
        this._updateMeasurementInfo(state);

        if (!state.active) {
            this._hideAllLabels();
        }
    }

    updateLabels(state: MeasurementStateSnapshot): void {
        if (!state.active || !this._labelA || !this._labelB || !this._labelDistance) {
            this._hideAllLabels();
            return;
        }

        if (!state.a) {
            this._hideAllLabels();
            return;
        }

        this._setVectorFromSnapshot(this._tmpAWorld, state.a.world);
        this._placeLabelAtWorld(this._labelA, this._tmpAWorld, formatVec3(state.a.local));

        if (!state.b) {
            this._setLabelVisible(this._labelB, false);
            this._setLabelVisible(this._labelDistance, false);
            return;
        }

        this._setVectorFromSnapshot(this._tmpBWorld, state.b.world);
        this._placeLabelAtWorld(this._labelB, this._tmpBWorld, formatVec3(state.b.local));

        this._tmpMidWorld.set(
            (state.a.world.x + state.b.world.x) * 0.5,
            (state.a.world.y + state.b.world.y) * 0.5,
            (state.a.world.z + state.b.world.z) * 0.5
        );
        const distance = this._distance(state.a.local, state.b.local);
        this._placeLabelAtWorld(this._labelDistance, this._tmpMidWorld, `${distance.toFixed(3)} mm`);
    }

    dispose(): void {
        const labels = [this._labelA, this._labelB, this._labelDistance];
        for (const label of labels) {
            if (label && label.parentNode) {
                label.parentNode.removeChild(label);
            }
        }

        this._labelA = null;
        this._labelB = null;
        this._labelDistance = null;
    }

    private _updateModeVisual(active: boolean): void {
        if (!this._viewerEl) {
            return;
        }

        this._viewerEl.classList.toggle("measure-mode", !!active);
    }

    private _updateWidgetVisibility(active: boolean): void {
        if (!this._measureWidgetEl || !this._measureWidgetToggleEl) {
            return;
        }

        this._measureWidgetEl.classList.toggle("overlay-open", !!active);
        this._measureWidgetToggleEl.setAttribute("aria-expanded", active ? "true" : "false");
        this._measureWidgetToggleEl.textContent = active ? "측정 패널 닫기" : "측정 패널 열기";
    }

    private _updateMeasurementInfo(state: MeasurementStateSnapshot): void {
        if (!this._measureInfoEl) {
            return;
        }

        if (!state.active || !state.a) {
            this._measureInfoEl.textContent = "거리 측정 버튼을 눌러 시작하세요.";
            return;
        }

        const lines = [
            `Point 1 XYZ: ${formatVec3(state.a.local)}`
        ];

        if (!state.b) {
            lines.push("Point 2 XYZ: -");
            lines.push("Distance: -");
            lines.push("다음 클릭으로 두 번째 점을 선택하세요.");
            this._measureInfoEl.textContent = lines.join("\n");
            return;
        }

        const distance = this._distance(state.a.local, state.b.local);
        lines.push(`Point 2 XYZ: ${formatVec3(state.b.local)}`);
        lines.push(`Distance: ${distance.toFixed(3)}`);
        this._measureInfoEl.textContent = lines.join("\n");
    }

    private _createLabelEl(extraClass: string): HTMLDivElement {
        const el = document.createElement("div");
        el.className = `measure-label3d ${extraClass}`;
        el.style.display = "none";
        if (!this._labelLayer) {
            throw new Error("Label layer is not initialized.");
        }
        this._labelLayer.appendChild(el);
        return el;
    }

    private _placeLabelAtWorld(label: HTMLDivElement, worldPos: Vector3, text: string): void {
        const projected = this._projectWorldToViewer(worldPos);
        if (!projected.visible) {
            this._setLabelVisible(label, false);
            return;
        }

        label.textContent = text;
        label.style.left = `${projected.x.toFixed(1)}px`;
        label.style.top = `${projected.y.toFixed(1)}px`;
        this._setLabelVisible(label, true);
    }

    private _projectWorldToViewer(worldPos: Vector3): { visible: boolean, x: number, y: number } {
        if (!this._viewerEl) {
            return { visible: false, x: 0, y: 0 };
        }

        const width = Math.max(1, this._viewerEl.clientWidth);
        const height = Math.max(1, this._viewerEl.clientHeight);

        this._tmpProjected.copy(worldPos).project(this._camera);
        const visible = this._tmpProjected.z > -1 && this._tmpProjected.z < 1;
        return {
            visible,
            x: ((this._tmpProjected.x + 1) * 0.5) * width,
            y: ((-this._tmpProjected.y + 1) * 0.5) * height
        };
    }

    private _setLabelVisible(label: HTMLElement | null, visible: boolean): void {
        if (!label) {
            return;
        }
        label.style.display = visible ? "block" : "none";
    }

    private _hideAllLabels(): void {
        this._setLabelVisible(this._labelA, false);
        this._setLabelVisible(this._labelB, false);
        this._setLabelVisible(this._labelDistance, false);
    }

    private _setVectorFromSnapshot(out: Vector3, snapshot: Vec3Snapshot): void {
        out.set(snapshot.x, snapshot.y, snapshot.z);
    }

    private _distance(a: Vec3Snapshot, b: Vec3Snapshot): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    }
}
