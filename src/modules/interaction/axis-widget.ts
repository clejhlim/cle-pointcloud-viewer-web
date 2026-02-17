/**
 * AxisWidget — renders a small XYZ axis gizmo in the bottom-right corner
 * of the viewer to show the current camera orientation.
 */

import {
    ConeGeometry,
    CylinderGeometry,
    Group,
    Material,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    PerspectiveCamera,
    Scene,
    Vector3,
    WebGLRenderer
} from "three";
import { clamp } from "../common/math-utils.js";

export class AxisWidget {
    private _scene: Scene | null;
    private _camera: PerspectiveCamera | null;
    private _root: Group | null;
    private _marginPx: number;
    private _insetPx: number;
    private _sizePx: number;

    constructor() {
        this._scene = null;
        this._camera = null;
        this._root = null;
        this._marginPx = 12;
        this._insetPx = 8;
        this._sizePx = 110;
    }

    init() {
        this._scene = new Scene();
        this._camera = new PerspectiveCamera(36, 1, 0.1, 10);
        this._root = new Group();
        this._scene.add(this._root);

        const shaftLength = 0.62;
        const shaftRadius = 0.045;
        const headLength = 0.22;
        const headRadius = 0.13;

        this._root.add(this._createArrow(new Vector3(1, 0, 0), 0xff5a5a, shaftLength, shaftRadius, headLength, headRadius));
        this._root.add(this._createArrow(new Vector3(0, 1, 0), 0x46e27b, shaftLength, shaftRadius, headLength, headRadius));
        this._root.add(this._createArrow(new Vector3(0, 0, 1), 0x57a8ff, shaftLength, shaftRadius, headLength, headRadius));
    }

    render(
        renderer: WebGLRenderer,
        mainCamera: PerspectiveCamera,
        controlsTarget: Vector3,
        viewerEl: HTMLElement
    ): void {
        if (!this._scene || !this._camera || !renderer || !mainCamera) {
            return;
        }
        const viewerWidth = Math.max(1, viewerEl.clientWidth);
        const viewerHeight = Math.max(1, viewerEl.clientHeight);
        const size = clamp(Math.round(Math.min(viewerWidth, viewerHeight) * 0.14), 72, this._sizePx);
        const margin = this._marginPx;
        const inset = clamp(this._insetPx, 0, Math.floor(size * 0.2));
        const renderSize = Math.max(1, size - (inset * 2));
        const x = Math.max(0, viewerWidth - size - margin + inset);
        const y = Math.max(0, margin + inset);

        const direction = mainCamera.position.clone().sub(controlsTarget);
        if (direction.lengthSq() < 1e-10) {
            direction.set(0, 0, 1);
        }
        // Keep enough camera distance so arrow tips do not clip at the widget edge.
        direction.normalize().multiplyScalar(2.9);

        this._camera.position.copy(direction);
        this._camera.up.copy(mainCamera.up);
        this._camera.lookAt(0, 0, 0);
        this._camera.updateProjectionMatrix();

        const prevAutoClear = renderer.autoClear;
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.setScissorTest(true);
        renderer.setScissor(x, y, renderSize, renderSize);
        renderer.setViewport(x, y, renderSize, renderSize);
        renderer.render(this._scene, this._camera);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, viewerWidth, viewerHeight);
        renderer.autoClear = prevAutoClear;
    }

    dispose() {
        if (!this._root) {
            this._scene = null;
            this._camera = null;
            return;
        }

        const geometries = new Set<{ dispose: () => void }>();
        const materials = new Set<Material>();
        this._root.traverse((child) => {
            if (!(child instanceof Mesh)) {
                return;
            }

            if (child.geometry) {
                geometries.add(child.geometry);
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((material) => materials.add(material));
                } else {
                    materials.add(child.material);
                }
            }
        });
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());

        if (this._scene) {
            this._scene.remove(this._root);
        }
        this._root = null;
        this._scene = null;
        this._camera = null;
    }

    private _createArrow(
        direction: Vector3,
        color: number,
        shaftLength: number,
        shaftRadius: number,
        headLength: number,
        headRadius: number
    ): Object3D {
        const axis = direction.clone().normalize();
        const group = new Group();
        const material = new MeshBasicMaterial({ color });

        const shaftGeometry = new CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 16, 1);
        const shaftMesh = new Mesh(shaftGeometry, material);
        shaftMesh.position.y = shaftLength * 0.5;
        group.add(shaftMesh);

        const headGeometry = new ConeGeometry(headRadius, headLength, 20, 1);
        const headMesh = new Mesh(headGeometry, material);
        headMesh.position.y = shaftLength + (headLength * 0.5);
        group.add(headMesh);

        const from = new Vector3(0, 1, 0);
        group.quaternion.setFromUnitVectors(from, axis);
        return group;
    }
}
