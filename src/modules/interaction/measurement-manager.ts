/**
 * MeasurementManager — manages point picking and 3D measurement objects.
 */

import {
    BufferAttribute,
    BufferGeometry,
    type Intersection,
    Group,
    Line,
    LineBasicMaterial,
    type Material,
    MathUtils,
    type Object3D,
    type PerspectiveCamera,
    Points,
    PointsMaterial,
    Raycaster,
    type Scene,
    type Texture,
    Vector2,
    Vector3,
    type WebGLRenderer
} from "three";
import type {
    MeasurementPointSnapshot,
    MeasurementStateSnapshot,
    Vec3Snapshot
} from "../../types/measurement-types";

interface MeasurementPointData {
    index: number;
    local: Vector3;
    world: Vector3;
}

interface MeasurementDeps {
    scene: Scene;
    camera: PerspectiveCamera;
    renderer: WebGLRenderer;
    pointSprite: Texture | null;
    getPointCloud: () => Points | null;
    getCloudRadius: () => number;
    getPointSize: () => number;
    getCameraTarget: (() => Vector3) | null;
    onPivotSelected: (worldPos: Vector3) => void;
    onStatusMessage: (msg: string, type: string) => void;
    onStateChanged?: (state: MeasurementStateSnapshot) => void;
}

export class MeasurementManager {
    private _scene: Scene;
    private _camera: PerspectiveCamera;
    private _renderer: WebGLRenderer;
    private _pointSprite: Texture | null;
    private _getPointCloud: () => Points | null;
    private _getCloudRadius: () => number;
    private _getPointSize: () => number;
    private _getCameraTarget: (() => Vector3) | null;
    private _onPivotSelected: (worldPos: Vector3) => void;
    private _onStatusMessage: (msg: string, type: string) => void;
    private _onStateChanged: ((state: MeasurementStateSnapshot) => void) | null;
    private _raycaster: Raycaster | null;
    private _pointerNdc: Vector2 | null;
    private _active: boolean;
    private _a: MeasurementPointData | null;
    private _b: MeasurementPointData | null;
    private _markerA: Group | null;
    private _markerB: Group | null;
    private _line: Line | null;
    private _snapshotDirty: boolean;
    private _snapshotCache: MeasurementStateSnapshot;

    constructor(deps: MeasurementDeps) {
        this._scene = deps.scene;
        this._camera = deps.camera;
        this._renderer = deps.renderer;
        this._pointSprite = deps.pointSprite;
        this._getPointCloud = deps.getPointCloud;
        this._getCloudRadius = deps.getCloudRadius;
        this._getPointSize = deps.getPointSize;
        this._getCameraTarget = deps.getCameraTarget;
        this._onPivotSelected = deps.onPivotSelected;
        this._onStatusMessage = deps.onStatusMessage;
        this._onStateChanged = deps.onStateChanged || null;

        this._raycaster = new Raycaster();
        this._pointerNdc = new Vector2();

        this._active = false;
        this._a = null;
        this._b = null;
        this._markerA = null;
        this._markerB = null;
        this._line = null;
        this._snapshotDirty = true;
        this._snapshotCache = {
            active: false,
            a: null,
            b: null
        };
    }

    isActive(): boolean {
        return this._active;
    }

    setActive(active: boolean, showStatus: boolean): void {
        const nextActive = !!active;
        if (this._active !== nextActive) {
            this._active = nextActive;
            this._markSnapshotDirty();
            this._emitStateChanged();
        }

        if (!showStatus) {
            return;
        }

        if (nextActive) {
            this._onStatusMessage("측정 모드: 점을 클릭해 A/B를 선택하세요.", "info");
        } else {
            this._onStatusMessage("측정 모드를 해제했습니다.", "info");
        }
    }

    onWidgetToggleClick(): void {
        this.setActive(!this._active, true);
    }

    tryPick(event: PointerEvent): void {
        const pointCloud = this._getPointCloud();
        if (!pointCloud || !this._raycaster || !this._pointerNdc) {
            return;
        }

        const rect = this._renderer.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }

        this._pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this._pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this._raycaster.setFromCamera(this._pointerNdc, this._camera);

        const cameraTarget = this._getCameraTarget ? this._getCameraTarget() : null;
        const fallbackTarget = new Vector3(0, 0, 0);
        const cameraToTarget = this._camera.position.distanceTo(cameraTarget || fallbackTarget);
        const worldPerPixel = 2 * cameraToTarget * Math.tan(MathUtils.degToRad(this._camera.fov * 0.5)) / rect.height;
        const pointSize = this._getPointSize();
        const pickRadiusPx = Math.max(pointSize * 2.0, 6);
        const cloudRadius = this._getCloudRadius();
        this._raycaster.params.Points.threshold = Math.max(worldPerPixel * pickRadiusPx, cloudRadius * 0.0003);

        const intersects = this._raycaster.intersectObject(pointCloud, false);
        if (!intersects.length) {
            this._onStatusMessage("선택 가능한 점을 찾지 못했습니다. 확대하거나 Point Size를 키워보세요.", "info");
            return;
        }

        const hit = this._chooseClosestToPointer(intersects, event.clientX, event.clientY, rect, pointCloud);
        if (typeof hit.index !== "number") {
            return;
        }

        const local = this._getPointLocalCoordinate(pointCloud, hit.index);
        const world = local.clone().add(pointCloud.position);
        this._applyPick({ index: hit.index, local, world });
    }

    updateMarkerSizes(): void {
        const nextSize = this._getSelectionMarkerSize();
        this._setMarkerSize(this._markerA, nextSize);
        this._setMarkerSize(this._markerB, nextSize);
    }

    clear(): void {
        this._clearMeasureObjects();
        this._a = null;
        this._b = null;
        this._markSnapshotDirty();
        this._emitStateChanged();
    }

    getSnapshot(): MeasurementStateSnapshot {
        if (this._snapshotDirty) {
            this._snapshotCache = this._buildSnapshot();
            this._snapshotDirty = false;
        }
        return this._snapshotCache;
    }

    dispose(): void {
        this.clear();
        this._raycaster = null;
        this._pointerNdc = null;
        this._onStateChanged = null;
    }

    private _applyPick(pointData: MeasurementPointData): void {
        if (!this._a || (this._a && this._b)) {
            this._clearMeasureObjects();
            this._a = pointData;
            this._b = null;
            this._onPivotSelected(pointData.world);
            this._markerA = this._createPointMarker(pointData.world, 0xff5252);
            this._scene.add(this._markerA);
            this._onStatusMessage("첫 번째 점을 선택했습니다.", "info");
            this._markSnapshotDirty();
            this._emitStateChanged();
            return;
        }

        if (this._a.index === pointData.index) {
            this._onStatusMessage("이미 선택된 첫 번째 점과 다른 점을 선택하세요.", "info");
            return;
        }

        this._b = pointData;
        this._onPivotSelected(pointData.world);
        this._markerB = this._createPointMarker(pointData.world, 0x4be37f);
        this._line = this._createMeasureLine(this._a.world, this._b.world);
        this._scene.add(this._markerB);
        this._scene.add(this._line);

        const distance = this._a.local.distanceTo(this._b.local);
        this._onStatusMessage(`거리 측정 완료: ${distance.toFixed(3)}`, "success");
        this._markSnapshotDirty();
        this._emitStateChanged();
    }

    private _chooseClosestToPointer(
        intersects: Array<Intersection<Object3D>>,
        pointerX: number,
        pointerY: number,
        rect: DOMRect,
        pointCloud: Points
    ): Intersection<Object3D> {
        const firstHit = intersects[0];
        if (!firstHit) {
            throw new Error("No intersections available for closest-point selection.");
        }

        let closestHit = firstHit;
        let minDist2 = Infinity;

        for (const hit of intersects) {
            if (typeof hit.index !== "number") {
                continue;
            }

            const local = this._getPointLocalCoordinate(pointCloud, hit.index);
            const world = local.clone().add(pointCloud.position);
            const projected = world.project(this._camera);

            const screenX = ((projected.x + 1) * 0.5 * rect.width) + rect.left;
            const screenY = (((-projected.y + 1) * 0.5) * rect.height) + rect.top;

            const dx = screenX - pointerX;
            const dy = screenY - pointerY;
            const dist2 = (dx * dx) + (dy * dy);

            if (dist2 < minDist2) {
                minDist2 = dist2;
                closestHit = hit;
            }
        }

        return closestHit;
    }

    private _getPointLocalCoordinate(pointCloud: Points, index: number): Vector3 {
        const attr = pointCloud.geometry.getAttribute("position");
        const base = index * 3;
        return new Vector3(
            attr.array[base],
            attr.array[base + 1],
            attr.array[base + 2]
        );
    }

    private _createPointMarker(worldPos: Vector3, color: number): Group {
        const marker = new Group();
        const innerSize = this._getSelectionMarkerSize();
        const outlineSize = innerSize + 2.2;

        const outline = this._createSingleMarkerPoint(0xffffff, outlineSize, 0.95);
        const inner = this._createSingleMarkerPoint(color, innerSize, 1.0);

        marker.add(outline);
        marker.add(inner);
        marker.position.copy(worldPos);
        return marker;
    }

    private _createSingleMarkerPoint(color: number, size: number, opacity: number): Points {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0]), 3));

        const material = new PointsMaterial({
            size,
            sizeAttenuation: false,
            color,
            map: this._pointSprite,
            transparent: true,
            opacity,
            alphaTest: 0.35,
            depthTest: false,
            depthWrite: false
        });

        return new Points(geometry, material);
    }

    private _getSelectionMarkerSize(): number {
        const base = this._getPointSize();
        if (base <= 1.0) {
            return Math.max(base + 2.0, base * 3.5);
        }
        if (base <= 2.0) {
            return Math.max(base + 1.8, base * 2.6);
        }
        return Math.max(base + 1.4, base * 2.0);
    }

    private _setMarkerSize(markerGroup: Group | null, innerSize: number): void {
        if (!markerGroup || !markerGroup.children || markerGroup.children.length < 2) {
            return;
        }

        const outline = markerGroup.children[0];
        const inner = markerGroup.children[1];

        if (outline instanceof Points && outline.material instanceof PointsMaterial) {
            outline.material.size = innerSize + 2.2;
            outline.material.needsUpdate = true;
        }

        if (inner instanceof Points && inner.material instanceof PointsMaterial) {
            inner.material.size = innerSize;
            inner.material.needsUpdate = true;
        }
    }

    private _createMeasureLine(start: Vector3, end: Vector3): Line {
        const geometry = new BufferGeometry().setFromPoints([start, end]);
        const material = new LineBasicMaterial({ color: 0xffe183 });
        return new Line(geometry, material);
    }

    private _removeMeasureObject(obj: Object3D | null): void {
        if (!obj) {
            return;
        }

        this._scene.remove(obj);
        obj.traverse((child) => {
            const disposable = child as Object3D & {
                geometry?: { dispose: () => void };
                material?: Material | Material[];
            };

            if (disposable.geometry) {
                disposable.geometry.dispose();
            }
            if (disposable.material) {
                if (Array.isArray(disposable.material)) {
                    disposable.material.forEach((material) => material.dispose());
                } else {
                    disposable.material.dispose();
                }
            }
        });
    }

    private _clearMeasureObjects(): void {
        this._removeMeasureObject(this._markerA);
        this._removeMeasureObject(this._markerB);
        this._removeMeasureObject(this._line);
        this._markerA = null;
        this._markerB = null;
        this._line = null;
    }

    private _markSnapshotDirty(): void {
        this._snapshotDirty = true;
    }

    private _emitStateChanged(): void {
        if (!this._onStateChanged) {
            return;
        }
        this._onStateChanged(this.getSnapshot());
    }

    private _buildSnapshot(): MeasurementStateSnapshot {
        return {
            active: this._active,
            a: this._toPointSnapshot(this._a),
            b: this._toPointSnapshot(this._b)
        };
    }

    private _toPointSnapshot(point: MeasurementPointData | null): MeasurementPointSnapshot | null {
        if (!point) {
            return null;
        }

        return {
            index: point.index,
            local: this._toVec3Snapshot(point.local),
            world: this._toVec3Snapshot(point.world)
        };
    }

    private _toVec3Snapshot(value: Vector3): Vec3Snapshot {
        return {
            x: value.x,
            y: value.y,
            z: value.z
        };
    }
}
