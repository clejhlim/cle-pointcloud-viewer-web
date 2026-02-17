/**
 * Custom element module for <cle-pointcloud-viewer>.
 */

import { createPointCloudViewer } from "../composition/create-pointcloud-viewer.js";
import { resolveViewerSettingsFromAttributes } from "./viewer-attribute-settings.js";
import viewerTemplateHtml from "../../template/viewer-template.html";
import viewerTemplateStyle from "../../template/viewer-template.css";
import type {
    ClePointCloudViewerPublicApi,
    ViewerFiles,
    ViewerHandle,
    ViewerSettings
} from "../../types/viewer-types";
import type { Vector3 } from "three";

export const CLE_POINTCLOUD_VIEWER_TAG = "cle-pointcloud-viewer";

export class ClePointCloudViewer extends HTMLElement implements ClePointCloudViewerPublicApi {
    private _viewer: ViewerHandle | null;
    private _initPromise: Promise<void> | null;
    private _initGeneration: number;
    private _viewerSettings: ViewerSettings;
    private _panelOverlayOpen: boolean;
    private _panelAvailable: boolean;

    static get observedAttributes(): string[] {
        return [
            "overlays",
            "rotation-mode",
            "sampling-step",
            "point-size",
            "use-texture-color",
            "skip-zero"
        ];
    }

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._viewer = null;
        this._initPromise = null;
        this._initGeneration = 0;
        this._viewerSettings = resolveViewerSettingsFromAttributes(this);
        this._panelAvailable = this._viewerSettings.overlays.controlPanel;
        this._panelOverlayOpen = false;
    }

    get overlays(): string | null {
        return this.getAttribute("overlays");
    }

    set overlays(value: string | null | undefined) {
        if (value === null || value === undefined || value === "") {
            this.removeAttribute("overlays");
        } else {
            this.setAttribute("overlays", String(value));
        }
    }

    connectedCallback(): void {
        if (!this.shadowRoot) {
            return;
        }

        this._renderTemplate();
        this._applyViewerSettingsFromAttributes();
        this._startInit();
    }

    disconnectedCallback(): void {
        this.dispose();
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (oldValue === newValue || !this.isConnected || !this.shadowRoot) {
            return;
        }

        if (name === "overlays"
            || name === "rotation-mode"
            || name === "sampling-step"
            || name === "point-size"
            || name === "use-texture-color"
            || name === "skip-zero") {
            this._applyViewerSettingsFromAttributes();
        }
    }

    private _renderTemplate(): void {
        if (!this.shadowRoot) {
            return;
        }
        this.shadowRoot.innerHTML = `<style>${viewerTemplateStyle}</style>${viewerTemplateHtml}`;
        this._bindOverlayToggleButton();
    }

    private _applyViewerSettingsFromAttributes(): void {
        const shadow = this.shadowRoot;
        if (!shadow) {
            return;
        }

        this._viewerSettings = resolveViewerSettingsFromAttributes(this);

        this._panelAvailable = this._viewerSettings.overlays.controlPanel;
        if (!this._panelAvailable) {
            this._panelOverlayOpen = false;
        }

        const setHidden = (id: string, hidden: boolean): void => {
            const element = shadow.getElementById(id);
            if (!element) {
                return;
            }
            element.hidden = !!hidden;
        };

        setHidden("measureWidget", !this._viewerSettings.overlays.measurement);

        const controlPanel = shadow.getElementById("controlPanel");
        if (controlPanel) {
            controlPanel.hidden = !this._panelAvailable;
            controlPanel.classList.toggle("overlay-open", this._panelAvailable && this._panelOverlayOpen);
        }

        const panelOverlayToggle = shadow.getElementById("panelOverlayToggle");
        if (panelOverlayToggle) {
            panelOverlayToggle.hidden = !this._panelAvailable;
        }

        this._syncPanelOverlayToggleUi();
        this._syncViewerSettings();
        this._syncViewerUiVisibility();
    }

    private _syncViewerSettings(): void {
        if (!this._viewer) {
            return;
        }
        this._viewer.applyViewerSettings(this._viewerSettings);
    }

    private _syncViewerUiVisibility(): void {
        if (!this._viewer) {
            return;
        }

        if (typeof this._viewer.setControlPanelVisible === "function") {
            this._viewer.setControlPanelVisible(this._panelAvailable && this._panelOverlayOpen);
        }
    }

    private _bindOverlayToggleButton(): void {
        const shadow = this.shadowRoot;
        if (!shadow) {
            return;
        }

        const toggle = shadow.getElementById("panelOverlayToggle");
        if (!(toggle instanceof HTMLButtonElement)) {
            return;
        }

        toggle.addEventListener("click", () => {
            if (!this._panelAvailable) {
                return;
            }

            this._panelOverlayOpen = !this._panelOverlayOpen;

            const panel = shadow.getElementById("controlPanel");
            if (panel) {
                panel.classList.toggle("overlay-open", this._panelOverlayOpen);
            }

            this._syncPanelOverlayToggleUi();
            this._syncViewerUiVisibility();
        });
    }

    private _syncPanelOverlayToggleUi(): void {
        const shadow = this.shadowRoot;
        if (!shadow) {
            return;
        }

        const toggle = shadow.getElementById("panelOverlayToggle");
        if (!(toggle instanceof HTMLButtonElement)) {
            return;
        }

        const expanded = this._panelAvailable && this._panelOverlayOpen;
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        toggle.textContent = expanded ? "패널 닫기" : "패널 열기";
    }

    private _startInit(): void {
        const generation = ++this._initGeneration;
        this._initPromise = this._init(generation);
    }

    private async _init(generation: number): Promise<void> {
        try {
            if (generation !== this._initGeneration || !this.isConnected || !this.shadowRoot) {
                return;
            }

            const viewer = createPointCloudViewer({
                root: this.shadowRoot,
                settings: this._viewerSettings
            });
            if (generation !== this._initGeneration) {
                if (viewer && typeof viewer.dispose === "function") {
                    viewer.dispose();
                }
                return;
            }
            this._viewer = viewer;
            this._syncViewerSettings();
            this._syncViewerUiVisibility();
        } catch (error) {
            if (generation !== this._initGeneration) {
                return;
            }
            const status = this.shadowRoot && this.shadowRoot.getElementById("status");
            if (status) {
                status.textContent = error instanceof Error ? error.message : String(error);
                status.classList.add("error");
            }
            console.error(error);
        }
    }

    async #getViewerHandle(): Promise<ViewerHandle> {
        if (this._initPromise) {
            await this._initPromise;
        }
        if (!this._viewer) {
            throw new Error("Viewer is not initialized.");
        }
        return this._viewer;
    }

    async renderFromFiles(files: ViewerFiles): Promise<number> {
        const viewer = await this.#getViewerHandle();
        return viewer.renderFromFiles(files);
    }

    async clear(): Promise<void> {
        const viewer = await this.#getViewerHandle();
        await Promise.resolve(viewer.clear());
    }

    async getCameraPosition(): Promise<Vector3 | null> {
        const viewer = await this.#getViewerHandle();
        return viewer.getCameraPosition();
    }

    dispose(): void {
        this._initGeneration += 1;
        if (this._viewer && typeof this._viewer.dispose === "function") {
            this._viewer.dispose();
        }
        this._viewer = null;
        this._initPromise = null;
    }
}

export function registerClePointCloudViewer(registry: CustomElementRegistry | undefined = globalThis.customElements): boolean {
    if (!registry) {
        return false;
    }
    if (!registry.get(CLE_POINTCLOUD_VIEWER_TAG)) {
        registry.define(CLE_POINTCLOUD_VIEWER_TAG, ClePointCloudViewer);
    }
    return true;
}
