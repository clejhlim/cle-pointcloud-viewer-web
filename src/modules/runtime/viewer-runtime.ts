/**
 * ViewerRuntime — owns Three.js renderer/scene/camera lifecycle and
 * point cloud scene resources.
 */

import {
    AmbientLight,
    BufferAttribute,
    BufferGeometry,
    CanvasTexture,
    Color,
    DirectionalLight,
    LinearFilter,
    PerspectiveCamera,
    Points,
    PointsMaterial,
    Scene,
    Vector3,
    WebGLRenderer
} from "three";
import type { PointBuffersResult } from "../../types/render-types";

interface ViewerRuntimeLifecycleState {
    disposed: boolean;
    rafId: number;
    resizeObserver: ResizeObserver | null;
    useWindowResizeListener: boolean;
}

interface ViewerRuntimeState {
    renderer: WebGLRenderer | null;
    scene: Scene | null;
    camera: PerspectiveCamera | null;
    pointCloud: Points | null;
    pointSprite: CanvasTexture | null;
    cloudRadius: number;
    lifecycle: ViewerRuntimeLifecycleState;
}

type FrameCallback = (nowMs: number) => void;

export class ViewerRuntime {
    private _viewerEl: HTMLElement | null;
    private _frameCallback: FrameCallback | null;
    private _onWindowResize: () => void;
    private _state: ViewerRuntimeState;

    constructor(options: { viewerEl?: HTMLElement | null } = {}) {
        this._viewerEl = options.viewerEl || null;
        this._frameCallback = null;
        this._onWindowResize = () => this.resize();

        this._state = {
            renderer: null,
            scene: null,
            camera: null,
            pointCloud: null,
            pointSprite: null,
            cloudRadius: 1,
            lifecycle: {
                disposed: false,
                rafId: 0,
                resizeObserver: null,
                useWindowResizeListener: false
            }
        };
    }

    getRendererRef(): WebGLRenderer | null {
        return this._state.renderer;
    }

    getSceneRef(): Scene | null {
        return this._state.scene;
    }

    getCameraRef(): PerspectiveCamera | null {
        return this._state.camera;
    }

    getPointSpriteRef(): CanvasTexture | null {
        return this._state.pointSprite;
    }

    isDisposed(): boolean {
        return this._state.lifecycle.disposed;
    }

    getPointCloud(): Points | null {
        return this._state.pointCloud;
    }

    getCloudRadius(): number {
        return this._state.cloudRadius;
    }

    init(): void {
        if (!this._viewerEl) {
            throw new Error("Missing required viewer element: viewer");
        }

        this._initRenderer();
        this._startResizeTracking();
    }

    startRenderLoop(frameCallback: FrameCallback): void {
        if (this.isDisposed()) {
            return;
        }

        this.stopRenderLoop();
        this._frameCallback = typeof frameCallback === "function" ? frameCallback : null;

        const tick = (nowMs: number) => {
            if (this.isDisposed()) {
                return;
            }

            if (this._frameCallback) {
                this._frameCallback(nowMs);
            }

            this._state.lifecycle.rafId = requestAnimationFrame(tick);
        };

        this._state.lifecycle.rafId = requestAnimationFrame(tick);
    }

    stopRenderLoop(): void {
        if (this._state.lifecycle.rafId) {
            cancelAnimationFrame(this._state.lifecycle.rafId);
            this._state.lifecycle.rafId = 0;
        }
    }

    renderScene(): void {
        if (!this._state.renderer || !this._state.scene || !this._state.camera) {
            return;
        }

        this._state.renderer.render(this._state.scene, this._state.camera);
    }

    resize(): void {
        if (!this._state.renderer || !this._state.camera || !this._viewerEl) {
            return;
        }

        const rect = this._viewerEl.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width), this._viewerEl.clientWidth);
        const height = Math.max(1, Math.round(rect.height), this._viewerEl.clientHeight);

        this._state.camera.aspect = width / height;
        this._state.camera.updateProjectionMatrix();
        this._state.renderer.setSize(width, height);
    }

    applyPointCloudData(data: PointBuffersResult, pointSize: number): { radius: number } {
        if (!this._state.scene) {
            throw new Error("Viewer runtime scene is not initialized.");
        }

        this.clearPointCloudOnly();

        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
        geometry.setAttribute("color", new BufferAttribute(data.colors, 3));

        const material = new PointsMaterial({
            size: pointSize,
            sizeAttenuation: false,
            vertexColors: true,
            map: this._state.pointSprite,
            transparent: true,
            alphaTest: 0.35
        });

        const points = new Points(geometry, material);
        geometry.computeBoundingBox();

        const bbox = geometry.boundingBox;
        if (!bbox) {
            throw new Error("Point cloud bounding box is not available.");
        }

        const center = new Vector3();
        bbox.getCenter(center);
        points.position.set(-center.x, -center.y, -center.z);

        const size = new Vector3();
        bbox.getSize(size);
        const radius = Math.max(size.x, size.y, size.z) * 0.8 || 1;

        this._state.cloudRadius = radius;
        this._state.scene.add(points);
        this._state.pointCloud = points;

        return { radius };
    }

    clearPointCloudOnly(): void {
        const pointCloud = this._state.pointCloud;
        if (!pointCloud || !this._state.scene) {
            return;
        }

        this._state.scene.remove(pointCloud);

        if (pointCloud.geometry) {
            pointCloud.geometry.dispose();
        }

        if (pointCloud.material) {
            if (Array.isArray(pointCloud.material)) {
                pointCloud.material.forEach((material) => material.dispose());
            } else {
                pointCloud.material.dispose();
            }
        }

        this._state.pointCloud = null;
    }

    dispose(): void {
        if (this.isDisposed()) {
            return;
        }

        this._state.lifecycle.disposed = true;

        this.stopRenderLoop();
        this._stopResizeTracking();
        this.clearPointCloudOnly();

        if (this._state.renderer && this._state.renderer.domElement && this._state.renderer.domElement.parentNode) {
            this._state.renderer.domElement.parentNode.removeChild(this._state.renderer.domElement);
        }

        if (this._state.pointSprite) {
            this._state.pointSprite.dispose();
            this._state.pointSprite = null;
        }

        if (this._state.renderer) {
            this._state.renderer.dispose();
            this._state.renderer = null;
        }

        this._state.scene = null;
        this._state.camera = null;
        this._frameCallback = null;
        this._viewerEl = null;
    }

    private _initRenderer(): void {
        if (!this._viewerEl) {
            throw new Error("Viewer root element is not available.");
        }

        const rect = this._viewerEl.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width), this._viewerEl.clientWidth);
        const height = Math.max(1, Math.round(rect.height), this._viewerEl.clientHeight);

        this._state.scene = new Scene();
        this._state.scene.background = new Color(0x050b14);

        this._state.camera = new PerspectiveCamera(60, width / height, 0.1, 200000);

        this._state.renderer = new WebGLRenderer({ antialias: true, alpha: true });
        this._state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this._state.renderer.setSize(width, height);
        this._viewerEl.appendChild(this._state.renderer.domElement);

        const ambient = new AmbientLight(0xffffff, 0.8);
        this._state.scene.add(ambient);

        const dir = new DirectionalLight(0xffffff, 0.5);
        dir.position.set(1, 1, 2);
        this._state.scene.add(dir);

        this._state.pointSprite = this._createPointSpriteTexture();
    }

    private _createPointSpriteTexture(): CanvasTexture | null {
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return null;
        }

        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
        ctx.fill();

        const texture = new CanvasTexture(canvas);
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return texture;
    }

    private _startResizeTracking(): void {
        if (!this._viewerEl) {
            return;
        }

        if (typeof ResizeObserver === "function") {
            const observer = new ResizeObserver(() => this.resize());
            observer.observe(this._viewerEl);
            this._state.lifecycle.resizeObserver = observer;
            this._state.lifecycle.useWindowResizeListener = false;
            return;
        }

        window.addEventListener("resize", this._onWindowResize);
        this._state.lifecycle.useWindowResizeListener = true;
    }

    private _stopResizeTracking(): void {
        if (this._state.lifecycle.resizeObserver) {
            this._state.lifecycle.resizeObserver.disconnect();
            this._state.lifecycle.resizeObserver = null;
        }

        if (this._state.lifecycle.useWindowResizeListener) {
            window.removeEventListener("resize", this._onWindowResize);
            this._state.lifecycle.useWindowResizeListener = false;
        }
    }
}
