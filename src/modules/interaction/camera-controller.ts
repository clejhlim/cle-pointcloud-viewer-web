/**
 * CameraController — manages orbit camera (turntable / arcball / CAD),
 * mouse drag rotation, scroll zoom, and WASD keyboard movement.
 */

import { Quaternion, Vector3 } from "three";
import type { PerspectiveCamera } from "three";
import { clamp } from "../common/math-utils.js";

type OrbitMode = "turntable" | "arcball" | "cad";

export class CameraController {
    private _camera: PerspectiveCamera;
    private _viewerEl: HTMLElement | null;
    private _getCanvas: () => HTMLCanvasElement | null;
    private _mode: OrbitMode;
    private _radius: number;
    private _theta: number;
    private _phi: number;
    private _moveSpeed: number;
    private _target: Vector3;
    private _fixedUp: Vector3;
    private _cadPivot: Vector3;
    private _hasCadPivot: boolean;
    private _keys: Record<string, boolean>;
    private _lastTickMs: number;
    private _dragging: boolean;
    private _dragMoved: boolean;
    private _downX: number;
    private _downY: number;
    private _lastX: number;
    private _lastY: number;

    constructor(
        camera: PerspectiveCamera,
        options: { viewerEl?: HTMLElement | null, getCanvas?: (() => HTMLCanvasElement | null) } = {}
    ) {
        this._camera = camera;
        this._viewerEl = options.viewerEl || null;
        this._getCanvas = options.getCanvas ?? (() => null);

        // Orbit state
        this._mode = "turntable";
        this._radius = 1000;
        this._theta = Math.PI;
        this._phi = Math.PI / 2;
        this._moveSpeed = 100;
        this._target = new Vector3(0, 0, 0);
        this._fixedUp = new Vector3(0, -1, 0);
        this._cadPivot = new Vector3(0, 0, 0);
        this._hasCadPivot = false;

        // Keyboard state
        this._keys = Object.create(null);
        this._lastTickMs = 0;

        // Drag state
        this._dragging = false;
        this._dragMoved = false;
        this._downX = 0;
        this._downY = 0;
        this._lastX = 0;
        this._lastY = 0;

        // Set initial up
        this._camera.up.copy(this._fixedUp);
    }

    // ─── Public queries ─────────────────────────────────────────────

    isDragging(): boolean {
        return this._dragging;
    }

    hasDragMoved(): boolean {
        return this._dragMoved;
    }

    getPosition(): Vector3 | null {
        return this._camera ? this._camera.position.clone() : null;
    }

    getTarget(): Vector3 {
        return this._target.clone();
    }

    getMode(): OrbitMode {
        return this._mode;
    }

    hasCadPivotSelection(): boolean {
        return this._hasCadPivot;
    }

    resetCadPivotAndTarget(): void {
        this._hasCadPivot = false;
        this._cadPivot.set(0, 0, 0);
        this._target.set(0, 0, 0);
        this.setMode(this._mode);
    }

    // ─── Mode management ───────────────────────────────────────────

    setMode(mode: string): void {
        const nextMode = mode === "arcball" || mode === "cad" ? mode : "turntable";
        this._mode = nextMode;

        if (nextMode === "cad") {
            this._target.copy(this._getCadPivotTarget());
            this._camera.up.copy(this._fixedUp);
            this._syncOrbitFromCamera();
            this.updateCameraFromOrbit();
        } else if (nextMode === "turntable") {
            this._target.set(0, 0, 0);
            this._camera.up.copy(this._fixedUp);
            this._syncOrbitFromCamera();
            this.updateCameraFromOrbit();
        } else {
            // Arcball keeps current camera up vector to allow free rotation.
            this._syncOrbitFromCamera();
        }
    }

    setCadPivot(worldPos: Vector3): void {
        this._cadPivot.copy(worldPos);
        this._hasCadPivot = true;

        if (this._mode === "cad") {
            this._target.copy(this._cadPivot);
            this._syncOrbitFromCamera();
            this.updateCameraFromOrbit();
        }
    }

    resetOrbit({ radius, moveSpeed, theta, phi }: { radius: number, moveSpeed: number, theta: number, phi: number }): void {
        this._radius = radius;
        this._moveSpeed = moveSpeed;
        this._theta = theta;
        this._phi = phi;
        this._hasCadPivot = false;
        this._cadPivot.set(0, 0, 0);
        this._target.set(0, 0, 0);
        this._camera.up.copy(this._fixedUp);
        this.updateCameraFromOrbit();
        this.setMode(this._mode);
    }

    // ─── Pointer events ────────────────────────────────────────────

    onPointerDown(event: PointerEvent): void {
        const canvas = this._getCanvas();
        if (!canvas) {
            return;
        }

        if (_isViewerWidgetTarget(event.target)) {
            return;
        }

        this._activateViewerControl();

        this._dragging = true;
        this._dragMoved = false;
        this._downX = event.clientX;
        this._downY = event.clientY;
        this._lastX = event.clientX;
        this._lastY = event.clientY;
        if (typeof canvas.setPointerCapture === "function") {
            canvas.setPointerCapture(event.pointerId);
        }
    }

    onPointerMove(event: PointerEvent): void {
        if (!this._dragging) {
            return;
        }

        const prevX = this._lastX;
        const prevY = this._lastY;
        const dx = event.clientX - prevX;
        const dy = event.clientY - prevY;
        this._lastX = event.clientX;
        this._lastY = event.clientY;

        const draggedPixelDistance = Math.abs(event.clientX - this._downX) + Math.abs(event.clientY - this._downY);
        if (draggedPixelDistance > 4) {
            this._dragMoved = true;
        }

        if (this._mode === "arcball") {
            this._rotateArcball(prevX, prevY, event.clientX, event.clientY);
        } else {
            this._theta -= dx * 0.005;
            this._phi -= dy * 0.005;
            this._phi = clamp(this._phi, 0.05, Math.PI - 0.05);
            this.updateCameraFromOrbit();
        }
    }

    onPointerUp(event: PointerEvent): void {
        this.cancelDragging(event);
    }

    onPointerLeave(event: PointerEvent): void {
        this.cancelDragging(event);
    }

    onPointerCancel(event: PointerEvent): void {
        this.cancelDragging(event);
    }

    cancelDragging(event?: PointerEvent): void {
        this._dragging = false;
        this._dragMoved = false;

        const canvas = this._getCanvas();
        if (!event || !canvas) {
            return;
        }

        if (typeof event.pointerId === "number" && canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
        }
    }

    onWheel(event: WheelEvent): void {
        if (_isViewerWidgetTarget(event.target)) {
            return;
        }

        event.preventDefault();
        const scale = event.deltaY > 0 ? 1.08 : 0.92;
        if (this._mode === "arcball") {
            this._zoomArcball(scale);
        } else {
            this._radius = clamp(this._radius * scale, 0.01, 500000);
            this.updateCameraFromOrbit();
        }
    }

    // ─── Keyboard events ───────────────────────────────────────────

    onKeyDown(event: KeyboardEvent): void {
        if (!_isMovementKey(event.code) || _isTypingContext(event, this._viewerEl)) {
            return;
        }

        if (event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }

        this._keys[event.code] = true;
        if (event.code === "Space") {
            event.preventDefault();
        }
    }

    onKeyUp(event: KeyboardEvent): void {
        if (!_isMovementKey(event.code)) {
            return;
        }

        this._keys[event.code] = false;
    }

    clearMovementKeys(): void {
        this._keys.KeyW = false;
        this._keys.KeyA = false;
        this._keys.KeyS = false;
        this._keys.KeyD = false;
        this._keys.ShiftLeft = false;
        this._keys.ShiftRight = false;
        this._keys.Space = false;
    }

    onWindowBlur(): void {
        this.clearMovementKeys();
        this.cancelDragging();
    }

    onFocus(): void {
        this.clearMovementKeys();
    }

    onBlur(): void {
        this.clearMovementKeys();
        this.cancelDragging();
    }

    // ─── Per-frame update ──────────────────────────────────────────

    update(nowMs: number): void {
        const prevMs = this._lastTickMs || nowMs;
        this._lastTickMs = nowMs;
        const deltaSec = Math.min(Math.max((nowMs - prevMs) / 1000, 0), 0.1);
        this._updateKeyboardMovement(deltaSec);
    }

    // ─── Camera math ───────────────────────────────────────────────

    updateCameraFromOrbit(): void {
        const sinPhi = Math.sin(this._phi);

        if (this._mode !== "arcball") {
            this._camera.up.copy(this._fixedUp);
        }

        this._camera.position.set(
            this._target.x + (this._radius * sinPhi * Math.sin(this._theta)),
            this._target.y + (this._radius * Math.cos(this._phi)),
            this._target.z + (this._radius * sinPhi * Math.cos(this._theta))
        );

        this._camera.lookAt(this._target);
    }

    updateCameraBounds(radius: number): void {
        this._camera.near = Math.max(0.001, radius / 2000);
        this._camera.far = Math.max(2000, radius * 30);
        this._camera.updateProjectionMatrix();
    }

    // ─── Dispose ───────────────────────────────────────────────────

    dispose(): void {
        this.clearMovementKeys();
        this._lastTickMs = 0;
        this._viewerEl = null;
        this._getCanvas = () => null;
    }

    // ─── Private helpers ───────────────────────────────────────────

    private _activateViewerControl(): void {
        if (this._viewerEl && document.activeElement !== this._viewerEl) {
            this._viewerEl.focus({ preventScroll: true });
        }
    }

    private _getCadPivotTarget(): Vector3 {
        if (this._hasCadPivot) {
            return this._cadPivot.clone();
        }
        return new Vector3(0, 0, 0);
    }

    private _syncOrbitFromCamera(): void {
        const offset = this._camera.position.clone().sub(this._target);
        const radius = Math.max(offset.length(), 1e-6);
        this._radius = radius;
        this._theta = Math.atan2(offset.x, offset.z);
        this._phi = Math.acos(clamp(offset.y / radius, -1, 1));
    }

    private _rotateArcball(prevX: number, prevY: number, nextX: number, nextY: number): void {
        if (!this._camera) {
            return;
        }

        const dx = nextX - prevX;
        const dy = nextY - prevY;
        if ((dx * dx) + (dy * dy) < 1e-6) {
            return;
        }

        const sensitivity = 0.005;
        const yaw = -dx * sensitivity;
        const pitch = -dy * sensitivity;

        const target = this._target;
        const fixedUp = this._fixedUp;
        const offset = this._camera.position.clone().sub(target);
        if (offset.lengthSq() < 1e-10) {
            return;
        }

        const qYaw = new Quaternion().setFromAxisAngle(fixedUp, yaw);
        offset.applyQuaternion(qYaw);

        const forward = offset.clone().normalize().negate();
        const right = new Vector3().crossVectors(forward, fixedUp);
        if (right.lengthSq() > 1e-12) {
            right.normalize();
            const qPitch = new Quaternion().setFromAxisAngle(right, pitch);
            const nextOffset = offset.clone().applyQuaternion(qPitch);
            const nextForward = nextOffset.clone().normalize().negate();
            // Prevent singularity near top/bottom.
            if (Math.abs(nextForward.dot(fixedUp)) < 0.995) {
                offset.copy(nextOffset);
            }
        }

        this._camera.position.copy(target).add(offset);
        this._camera.up.copy(fixedUp);
        this._camera.lookAt(target);
        this._syncOrbitFromCamera();
    }

    private _zoomArcball(scale: number): void {
        const offset = this._camera.position.clone().sub(this._target);
        const nextRadius = clamp(offset.length() * scale, 0.01, 500000);
        offset.setLength(nextRadius);
        this._camera.position.copy(this._target).add(offset);
        this._camera.up.copy(this._fixedUp);
        this._camera.lookAt(this._target);
        this._radius = nextRadius;
        this._syncOrbitFromCamera();
    }

    private _updateKeyboardMovement(deltaSec: number): void {
        if (!this._camera || !deltaSec) {
            return;
        }
        const keys = this._keys;
        const forwardSign = (keys.KeyW ? 1 : 0) + (keys.KeyS ? -1 : 0);
        const rightSign = (keys.KeyD ? 1 : 0) + (keys.KeyA ? -1 : 0);
        const verticalSign = (keys.Space ? 1 : 0) + ((keys.ShiftLeft || keys.ShiftRight) ? -1 : 0);

        if (forwardSign === 0 && rightSign === 0 && verticalSign === 0) {
            return;
        }

        const forward = new Vector3(0, 0, -1).applyQuaternion(this._camera.quaternion).normalize();
        const right = new Vector3(1, 0, 0).applyQuaternion(this._camera.quaternion).normalize();
        const up = this._camera.up.clone().normalize();
        const move = new Vector3()
            .addScaledVector(forward, forwardSign)
            .addScaledVector(right, rightSign)
            .addScaledVector(up, verticalSign);

        if (move.lengthSq() < 1e-12) {
            return;
        }

        move.normalize();
        move.multiplyScalar(this._moveSpeed * deltaSec);

        this._camera.position.add(move);
        this._target.add(move);

        if (this._hasCadPivot) {
            this._cadPivot.add(move);
        }

        this._camera.lookAt(this._target);
        this._syncOrbitFromCamera();
    }
}

// ─── Module-private helpers ─────────────────────────────────────────

function _isViewerWidgetTarget(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest(".viewer-widget");
}

function _isMovementKey(code: string): boolean {
    return code === "KeyW"
        || code === "KeyA"
        || code === "KeyS"
        || code === "KeyD"
        || code === "ShiftLeft"
        || code === "ShiftRight"
        || code === "Space";
}

function _isTypingContext(event: KeyboardEvent, viewerEl: HTMLElement | null): boolean {
    const target = event.target instanceof Element ? event.target : null;
    if (_isEditableElement(target)) {
        return true;
    }

    if (typeof event.composedPath === "function") {
        const path = event.composedPath();
        for (const node of path) {
            if (node instanceof Element && _isEditableElement(node)) {
                return true;
            }
        }
    }

    const viewerRoot = viewerEl ? viewerEl.getRootNode() : null;
    if (viewerRoot instanceof Document || viewerRoot instanceof ShadowRoot) {
        if (_isEditableElement(_getDeepActiveElement(viewerRoot))) {
            return true;
        }
    }

    return _isEditableElement(_getDeepActiveElement(document));
}

function _isEditableElement(el: Element | null): boolean {
    if (!el) {
        return false;
    }

    if (el instanceof HTMLElement && el.isContentEditable) {
        return true;
    }

    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON";
}

function _getDeepActiveElement(root: Document | ShadowRoot): Element | null {
    let current: Element | null = root.activeElement;

    while (current instanceof HTMLElement && current.shadowRoot && current.shadowRoot.activeElement) {
        current = current.shadowRoot.activeElement;
    }

    return current;
}
