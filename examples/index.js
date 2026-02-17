(function setupInstancePlayground() {
  const FILE_KEYS = ["pcX", "pcY", "pcZ", "texture", "validMask"];
  const REQUIRED_FILE_KEYS = ["pcX", "pcY", "pcZ"];

  const addViewerBtn = document.getElementById("addViewerBtn");
  const viewerCountChip = document.getElementById("viewerCountChip");
  const headlineStatus = document.getElementById("headlineStatus");
  const viewerGrid = document.getElementById("viewerGrid");
  const emptyState = document.getElementById("emptyState");

  const state = {
    nextViewerId: 1,
    instances: []
  };

  function setHeadline(message) {
    if (headlineStatus) {
      headlineStatus.textContent = message;
    }
  }

  function nowText() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function isAbortError(error) {
    return !!error && typeof error === "object" && error.name === "AbortError";
  }

  function logToConsole(message, level) {
    const line = `[${nowText()}] ${message}`;
    if (level === "error") {
      console.error(line);
      return;
    }
    if (level === "warn") {
      console.warn(line);
      return;
    }
    console.info(line);
  }

  async function runAction(name, fn, formatResult) {
    try {
      setHeadline(`${name} 실행 중...`);
      const result = await fn();
      const summary = formatResult ? formatResult(result) : "완료";
      setHeadline(`${name} 완료: ${summary}`);
      logToConsole(`${name} -> ${summary}`, "ok");
    } catch (error) {
      if (isAbortError(error)) {
        setHeadline(`${name}: 이전 요청이 취소되었습니다.`);
        logToConsole(`${name} -> AbortError`, "warn");
        return;
      }
      const message = toErrorMessage(error);
      setHeadline(`${name} 실패: ${message}`);
      logToConsole(`${name} -> ${message}`, "error");
    }
  }

  function parsePositiveNumber(inputValue, fallback) {
    const parsed = Number(inputValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return String(fallback);
    }
    return String(parsed);
  }

  function overlayChecksToAttr(controlPanel, measurement, axisWidget) {
    const tokens = [];
    if (controlPanel) {
      tokens.push("control-panel");
    }
    if (measurement) {
      tokens.push("measurement");
    }
    if (axisWidget) {
      tokens.push("axis-widget");
    }
    return tokens.join(" ");
  }

  function getMissingRequiredFileKeys(instance) {
    return REQUIRED_FILE_KEYS.filter((key) => !instance.files[key]);
  }

  function setRenderFromFilesDisabled(instance) {
    const renderFromFilesBtn = instance.card.querySelector('button[data-action="render-from-files"]');
    if (!(renderFromFilesBtn instanceof HTMLButtonElement)) {
      return;
    }

    const missing = getMissingRequiredFileKeys(instance);
    const disabled = missing.length > 0;
    renderFromFilesBtn.disabled = disabled;
    renderFromFilesBtn.title = disabled
      ? `필수 파일 누락: ${missing.join(", ")}`
      : "";
  }

  function buildInstanceTemplate(id) {
    const root = document.createElement("article");
    root.className = "viewer-card";
    root.dataset.viewerId = String(id);

    root.innerHTML = `
      <div class="viewer-card-header">
        <div>
          <h2>Viewer #${id}</h2>
          <p>파일/속성/API를 인스턴스별로 독립 제어</p>
        </div>
        <button class="btn danger" data-action="remove-instance" type="button">Remove</button>
      </div>

      <div class="viewer-host">
        <cle-pointcloud-viewer id="viewer-${id}"></cle-pointcloud-viewer>
      </div>

      <div class="api-grid">
        <button class="btn" data-action="render-from-files" type="button" disabled>renderFromFiles()</button>
        <button class="btn secondary" data-action="clear" type="button">clear()</button>
        <button class="btn ghost" data-action="camera" type="button">getCameraPosition()</button>
        <button class="btn warn" data-action="dispose" type="button">dispose()</button>
      </div>

      <details class="instance-fold">
        <summary>Files</summary>
        <div class="fold-body">
          <p class="summary-text">필수: Point Cloud X/Y/Z 선택</p>

          <div class="file-grid">
            <label>
              Point Cloud X
              <input data-file-key="pcX" type="file" accept=".tif,.tiff" />
            </label>
            <label>
              Point Cloud Y
              <input data-file-key="pcY" type="file" accept=".tif,.tiff" />
            </label>
            <label>
              Point Cloud Z
              <input data-file-key="pcZ" type="file" accept=".tif,.tiff" />
            </label>
            <label>
              Texture (optional)
              <input data-file-key="texture" type="file" accept=".png" />
            </label>
            <label>
              ValidMask (optional)
              <input data-file-key="validMask" type="file" accept=".tif,.tiff,.png,image/png" />
            </label>
          </div>

          <div class="mini-actions">
            <button class="btn secondary" data-action="clear-instance-files" type="button">파일 비우기</button>
            <span></span>
          </div>

          <p class="summary-text" data-role="file-summary"></p>
        </div>
      </details>

      <details class="instance-fold">
        <summary>Attributes</summary>
        <div class="fold-body">
          <div class="overlay-grid">
            <label class="check-row">
              <input data-role="overlay-control-panel" type="checkbox" />
              control-panel
            </label>
            <label class="check-row">
              <input data-role="overlay-measurement" type="checkbox" />
              measurement
            </label>
            <label class="check-row">
              <input data-role="overlay-axis-widget" type="checkbox" />
              axis-widget
            </label>
          </div>

          <div class="attr-grid">
            <label>
              rotation-mode
              <select data-role="attr-rotation-mode">
                <option value="turntable" selected>turntable</option>
                <option value="arcball">arcball</option>
                <option value="cad">cad</option>
              </select>
            </label>

            <label>
              sampling-step
              <input data-role="attr-sampling-step" type="number" min="1" step="1" value="1" />
            </label>

            <label>
              point-size
              <input data-role="attr-point-size" type="number" min="0.1" step="0.1" value="2" />
            </label>

            <label class="check-row">
              <input data-role="attr-use-texture-color" type="checkbox" checked />
              use-texture-color=true
            </label>

            <label class="check-row">
              <input data-role="attr-skip-zero" type="checkbox" checked />
              skip-zero=true
            </label>
          </div>

          <div class="mini-actions">
            <button class="btn ghost" data-action="apply-attrs" type="button">attrs 적용</button>
            <button class="btn secondary" data-action="clear-attrs" type="button">attrs 제거</button>
          </div>

          <p class="summary-text" data-role="attr-summary"></p>
          <code class="raw-attrs" data-role="raw-attrs"></code>
        </div>
      </details>
    `;

    return root;
  }

  function getAttrControlsFromCard(card) {
    return {
      overlayControlPanel: card.querySelector('[data-role="overlay-control-panel"]'),
      overlayMeasurement: card.querySelector('[data-role="overlay-measurement"]'),
      overlayAxisWidget: card.querySelector('[data-role="overlay-axis-widget"]'),
      rotationMode: card.querySelector('[data-role="attr-rotation-mode"]'),
      samplingStep: card.querySelector('[data-role="attr-sampling-step"]'),
      pointSize: card.querySelector('[data-role="attr-point-size"]'),
      useTextureColor: card.querySelector('[data-role="attr-use-texture-color"]'),
      skipZero: card.querySelector('[data-role="attr-skip-zero"]')
    };
  }

  function setAttrControlsDefaults(instance) {
    const c = instance.attrControls;
    c.overlayControlPanel.checked = false;
    c.overlayMeasurement.checked = false;
    c.overlayAxisWidget.checked = false;
    c.rotationMode.value = "turntable";
    c.samplingStep.value = "1";
    c.pointSize.value = "2";
    c.useTextureColor.checked = true;
    c.skipZero.checked = true;
  }

  function collectAttrsFromCard(instance) {
    const c = instance.attrControls;
    return {
      overlays: overlayChecksToAttr(
        c.overlayControlPanel.checked,
        c.overlayMeasurement.checked,
        c.overlayAxisWidget.checked
      ),
      rotationMode: c.rotationMode.value || "turntable",
      samplingStep: parsePositiveNumber(c.samplingStep.value, 1),
      pointSize: parsePositiveNumber(c.pointSize.value, 2),
      useTextureColor: !!c.useTextureColor.checked,
      skipZero: !!c.skipZero.checked
    };
  }

  function applyAttrsToViewer(instance, attrs) {
    const viewer = instance.viewer;

    if (attrs.overlays) {
      viewer.setAttribute("overlays", attrs.overlays);
    } else {
      viewer.removeAttribute("overlays");
    }

    viewer.setAttribute("rotation-mode", attrs.rotationMode);
    viewer.setAttribute("sampling-step", attrs.samplingStep);
    viewer.setAttribute("point-size", attrs.pointSize);
    viewer.setAttribute("use-texture-color", String(attrs.useTextureColor));
    viewer.setAttribute("skip-zero", String(attrs.skipZero));

    updateInstanceAttrSummary(instance);
  }

  function clearAttrsFromViewer(instance) {
    const viewer = instance.viewer;
    ["overlays", "rotation-mode", "sampling-step", "point-size", "use-texture-color", "skip-zero"].forEach((key) => {
      viewer.removeAttribute(key);
    });

    setAttrControlsDefaults(instance);
    updateInstanceAttrSummary(instance);
  }

  function updateInstanceAttrSummary(instance) {
    const summaryEl = instance.card.querySelector('[data-role="attr-summary"]');
    const rawEl = instance.card.querySelector('[data-role="raw-attrs"]');
    const viewer = instance.viewer;

    const overlays = viewer.getAttribute("overlays") || "(none)";
    const rotationMode = viewer.getAttribute("rotation-mode") || "turntable";
    const samplingStep = viewer.getAttribute("sampling-step") || "1";
    const pointSize = viewer.getAttribute("point-size") || "2";
    const useTextureColor = viewer.getAttribute("use-texture-color") || "true";
    const skipZero = viewer.getAttribute("skip-zero") || "true";

    summaryEl.textContent = `overlays=${overlays} | rotation=${rotationMode} | sampling=${samplingStep} | size=${pointSize} | tex=${useTextureColor} | skipZero=${skipZero}`;

    const rawParts = [];
    ["overlays", "rotation-mode", "sampling-step", "point-size", "use-texture-color", "skip-zero"].forEach((key) => {
      const value = viewer.getAttribute(key);
      if (value !== null) {
        rawParts.push(`${key}="${value}"`);
      }
    });

    rawEl.textContent = rawParts.length ? rawParts.join(" ") : "(no explicit attrs)";
  }

  function clearInstanceFiles(instance) {
    FILE_KEYS.forEach((key) => {
      instance.files[key] = null;
    });

    const fileInputs = instance.card.querySelectorAll("input[data-file-key]");
    fileInputs.forEach((input) => {
      input.value = "";
    });

    updateInstanceFileSummary(instance);
  }

  function setInstanceFile(instance, key, file) {
    instance.files[key] = file || null;
  }

  function updateInstanceFileSummary(instance) {
    const summaryEl = instance.card.querySelector('[data-role="file-summary"]');
    const missingRequired = getMissingRequiredFileKeys(instance);

    const text = [
      `X=${instance.files.pcX ? instance.files.pcX.name : "-"}`,
      `Y=${instance.files.pcY ? instance.files.pcY.name : "-"}`,
      `Z=${instance.files.pcZ ? instance.files.pcZ.name : "-"}`,
      `Texture=${instance.files.texture ? instance.files.texture.name : "-"}`,
      `ValidMask=${instance.files.validMask ? instance.files.validMask.name : "-"}`
    ].join(" | ");

    const readiness = missingRequired.length
      ? `required missing: ${missingRequired.join(", ")}`
      : "ready";
    summaryEl.textContent = `source=instance files | ${text} | ${readiness}`;

    setRenderFromFilesDisabled(instance);
  }

  async function resolveFilesForInstance(instance) {
    const missingRequired = getMissingRequiredFileKeys(instance);
    if (missingRequired.length > 0) {
      throw new Error(`renderFromFiles 실행 전 필수 파일 누락: ${missingRequired.join(", ")}`);
    }

    return {
      files: {
        pcX: instance.files.pcX,
        pcY: instance.files.pcY,
        pcZ: instance.files.pcZ,
        texture: instance.files.texture,
        validMask: instance.files.validMask
      },
      sourceText: "instance-files"
    };
  }

  function updateViewerCount() {
    const count = state.instances.length;
    viewerCountChip.textContent = `viewers: ${count}`;
    emptyState.hidden = count > 0;
  }

  function createNewInstance() {
    const id = state.nextViewerId;
    state.nextViewerId += 1;

    const card = buildInstanceTemplate(id);
    viewerGrid.appendChild(card);

    const instance = {
      id,
      card,
      viewer: card.querySelector("cle-pointcloud-viewer"),
      files: {
        pcX: null,
        pcY: null,
        pcZ: null,
        texture: null,
        validMask: null
      },
      attrControls: getAttrControlsFromCard(card)
    };

    setAttrControlsDefaults(instance);
    updateInstanceFileSummary(instance);
    updateInstanceAttrSummary(instance);

    card.addEventListener("click", (event) => {
      const target = event.target instanceof Element
        ? event.target.closest("button[data-action]")
        : null;

      if (!target) {
        return;
      }

      const action = target.getAttribute("data-action");
      if (!action) {
        return;
      }

      if (action === "remove-instance") {
        void runAction(`Viewer #${instance.id} remove`, async () => {
          try {
            instance.viewer.dispose();
          } catch (error) {
            logToConsole(`Viewer #${instance.id} dispose during remove 실패: ${toErrorMessage(error)}`, "warn");
          }

          instance.card.remove();
          state.instances = state.instances.filter((it) => it.id !== instance.id);
          updateViewerCount();
          return true;
        }, () => "카드 제거");
        return;
      }

      if (action === "render-from-files") {
        void runAction(`Viewer #${instance.id} renderFromFiles()`, async () => {
          const resolved = await resolveFilesForInstance(instance);
          const pointCount = await instance.viewer.renderFromFiles(resolved.files);
          return { pointCount, sourceText: resolved.sourceText };
        }, (result) => `${result.pointCount} points (${result.sourceText})`);
        return;
      }

      if (action === "clear") {
        void runAction(`Viewer #${instance.id} clear()`, async () => {
          await instance.viewer.clear();
          return true;
        }, () => "초기화");
        return;
      }

      if (action === "camera") {
        void runAction(`Viewer #${instance.id} getCameraPosition()`, async () => {
          const p = await instance.viewer.getCameraPosition();
          if (!p) {
            return "null";
          }
          return `${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}`;
        }, (text) => text);
        return;
      }

      if (action === "dispose") {
        void runAction(`Viewer #${instance.id} dispose()`, async () => {
          instance.viewer.dispose();
          return true;
        }, () => "리소스 해제");
        return;
      }

      if (action === "clear-instance-files") {
        clearInstanceFiles(instance);
        setHeadline(`Viewer #${instance.id} 파일 입력 비움`);
        return;
      }

      if (action === "apply-attrs") {
        const attrs = collectAttrsFromCard(instance);
        applyAttrsToViewer(instance, attrs);
        setHeadline(`Viewer #${instance.id} attrs 적용`);
        return;
      }

      if (action === "clear-attrs") {
        clearAttrsFromViewer(instance);
        setHeadline(`Viewer #${instance.id} attrs 제거`);
      }
    });

    card.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        return;
      }

      if (target instanceof HTMLInputElement && target.matches("input[data-file-key]")) {
        const key = target.getAttribute("data-file-key");
        if (!key || !FILE_KEYS.includes(key)) {
          return;
        }

        setInstanceFile(instance, key, target.files[0] || null);
        updateInstanceFileSummary(instance);
      }
    });

    state.instances.push(instance);
    updateViewerCount();
    return instance;
  }

  function bindGlobalEvents() {
    addViewerBtn.addEventListener("click", () => {
      const instance = createNewInstance();
      setHeadline(`Viewer #${instance.id} 생성 완료. X/Y/Z 파일을 선택하세요.`);
    });
  }

  function bootstrap() {
    bindGlobalEvents();
    updateViewerCount();
    setHeadline("인스턴스를 추가하고 카드별 X/Y/Z 파일을 선택해 렌더링하세요.");
  }

  bootstrap();
})();
