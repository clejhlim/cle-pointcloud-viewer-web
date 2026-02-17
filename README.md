# CLE PointCloud Viewer

정적 페이지 기반 포인트 클라우드 뷰어입니다.  
소스는 TypeScript로 관리하고, 배포는 JavaScript 번들로 제공합니다.
배포/사용 단위는 Web Component 단일 번들입니다.

- 번들: `dist/cle-pointcloud-viewer.js`
- 커스텀 엘리먼트: `<cle-pointcloud-viewer>`

## 빠른 실행


1. 의존성 설치
   `npm install`
2. 번들 빌드
   `npm run build`
3. 개발 모드 (Auto-rebuild on change)
   `npm run watch`
4. 타입 체크
   `npm run typecheck`
5. 로컬 서버 실행
   `npx --yes serve -l 8080 .`
6. 브라우저에서 `http://localhost:8080/examples/` 접속

## 데모 페이지

- `examples/index.html`: 모든 샘플 시나리오를 통합한 기본 페이지
- `examples/index.css`: 공통 스타일 정의
- `examples/index.js`: 시나리오별 뷰어 인스턴스 생성 및 이벤트 바인딩

## 사용 예시 1: 로컬 파일 선택 (File Input)

```html
<script src="./dist/cle-pointcloud-viewer.js"></script>
<cle-pointcloud-viewer
  id="pcv"
  overlays="control-panel measurement axis-widget"
  rotation-mode="turntable"
  sampling-step="1"
  point-size="2"
  use-texture-color="true"
  skip-zero="true"
  style="width:100%;height:640px;"
></cle-pointcloud-viewer>
<script>
  const viewer = document.getElementById("pcv");

  async function render(files) {
    try {
      const renderedCount = await viewer.renderFromFiles(files);
      console.log("Rendered points:", renderedCount);
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
      throw error;
    }
  }
</script>
```

## 사용 예시 2: 원격 파일 로드 (Remote URL)

HTML 로드 직후 미리 지정된 URL에서 파일을 받아와 렌더링하는 예시입니다.

```html
<!-- 1. 뷰어 배치 -->
<cle-pointcloud-viewer
  id="pcv-remote"
  overlays="control-panel measurement axis-widget"
  style="width:100%;height:640px;"
></cle-pointcloud-viewer>

<!-- 2. 스크립트 로드 -->
<script src="./dist/cle-pointcloud-viewer.js"></script>

<script>
  (async function main() {
    const viewer = document.getElementById("pcv-remote");

    // 헬퍼: URL에서 Blob을 받아 File 객체로 변환
    async function loadFile(url, filename) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${url} 로드 실패 (${response.status})`);
      }
      const blob = await response.blob();
      // MIME 타입은 blob.type을 쓰거나 application/octet-stream fallback
      return new File([blob], filename, { type: blob.type || "application/octet-stream" });
    }

    try {
      // 3. 파일 병렬 다운로드
      // (실제 경로에 맞게 URL을 수정하세요)
      const [pcX, pcY, pcZ, texture] = await Promise.all([
        loadFile("./data/sample_X.tif", "sample_X.tif"),
        loadFile("./data/sample_Y.tif", "sample_Y.tif"),
        loadFile("./data/sample_Z.tif", "sample_Z.tif"),
        loadFile("./data/sample_Tex.png", "sample_Tex.png")
      ]);

      // 4. 뷰어에 렌더 요청
      const count = await viewer.renderFromFiles({
        pcX,
        pcY,
        pcZ,
        texture, // texture는 선택 사항
        validMask: null // validMask도 선택 사항
      });

      console.log(`렌더링 완료: ${count} 포인트`);
    } catch (err) {
      console.error("초기화 실패:", err);
    }
  })();
</script>
```

## 빌드 결과물 노출 범위

`dist/cle-pointcloud-viewer.js`를 로드하면 `cle-pointcloud-viewer` 커스텀 엘리먼트만 등록됩니다.  
코어 전역 API(`window.ClePointCloudViewer*`)는 노출하지 않습니다.

**소스맵 (Source Maps)**:  
`dist/` 디렉토리에 `.map` 파일이 함께 생성되므로, 필요한 경우 개발자 도구에서 원본 TypeScript 소스를 디버깅할 수 있습니다.

## TypeScript 설정

`tsconfig.json`의 주요 설정은 다음과 같습니다:

- **Target**: `ES2020` (모던 브라우저 지원)
- **Strict Mode**: `true` (엄격한 타입 검사)
- **Module Resolution**: `Bundler`

## 컴포넌트 인스턴스 API

`<cle-pointcloud-viewer>` 인스턴스에서 아래 메서드를 제공합니다.

메서드 시그니처 요약:

- `renderFromFiles(files): Promise<number>`
- `clear(): Promise<void>`
- `getCameraPosition(): Promise<THREE.Vector3 | null>`
- `dispose(): void`

공통 동작:

- 비동기 메서드는 내부적으로 컴포넌트 초기화 완료를 자동으로 기다립니다.
- 동일 인스턴스에서 렌더가 겹치면 이전 렌더는 취소되고 최신 요청만 유지됩니다.
- 취소된 렌더는 `AbortError`로 reject 될 수 있으므로 `try/catch` 처리를 권장합니다.

### `await viewer.renderFromFiles(files)`

목적:

- 외부에서 준비한 `File` 객체를 직접 전달해 렌더합니다.

`files` 파라미터:

- `pcX: File` (필수)
- `pcY: File` (필수)
- `pcZ: File` (필수)
- `texture: File | null` (선택, PNG)
- `validMask: File | null` (선택, TIFF/PNG)

반환:

- `Promise<number>`: 렌더된 최종 포인트 개수.

동작 메모:

- 렌더 옵션은 `sampling-step`, `point-size`, `use-texture-color`, `skip-zero` attribute에서 읽습니다.
- 해상도 불일치, 유효 포인트 0개, 라이브러리 로드 실패 등의 경우 에러를 throw 합니다.

### `await viewer.clear()`

목적:

- 현재 렌더된 포인트 클라우드, 측정 마커/선/라벨, 통계 표시를 초기화합니다.

반환:

- `Promise<void>`

동작 메모:

- 카메라 CAD pivot/target 상태도 기본값으로 리셋됩니다.
- 파일 입력 자체(`input[type=file]`)는 비우지 않습니다.

### `await viewer.getCameraPosition()`

목적:

- 현재 카메라 월드 좌표를 읽습니다.

반환:

- `Promise<THREE.Vector3 | null>`

동작 메모:

- 정상 초기화 상태에서는 `THREE.Vector3`를 반환합니다.
- 방어적으로 `null` 가능성을 열어두고 사용하는 것이 안전합니다.

### `viewer.dispose()`

목적:

- 렌더 루프/이벤트/그래픽 리소스를 즉시 해제합니다.

반환:

- 없음(`void`)

동작 메모:

- 여러 번 호출해도 안전한(idempotent) 해제 동작을 목표로 구현되어 있습니다.
- 호출 후 비동기 API를 사용하면 초기화되지 않은 상태 에러가 날 수 있습니다.
- 커스텀 엘리먼트가 DOM에서 제거될 때(`disconnectedCallback`)도 내부적으로 호출됩니다.

## 속성(Attributes)

- `overlays`
  오버레이 기능 활성 토큰 문자열입니다. 공백/쉼표 구분이 가능합니다.
- `rotation-mode`
  회전 모드를 지정합니다. 허용값은 `turntable`, `arcball`, `cad`입니다.
- `sampling-step`
  샘플링 간격(정수)입니다. `1..8` 범위로 보정됩니다.
- `point-size`
  포인트 크기(실수)입니다. `0.5..6` 범위로 보정됩니다.
- `use-texture-color`
  텍스처 색상 사용 여부입니다. 문자열 `true|false`만 유효합니다.
- `skip-zero`
  `(0,0,0)` 점 제외 여부입니다. 문자열 `true|false`만 유효합니다.

지원 토큰:

- `control-panel`, `measurement`, `axis-widget`

기본 동작:

- 미지정 또는 빈 문자열: `controlPanel`, `measurement`, `axisWidget` 모두 비활성
- 유효하지 않은 토큰은 무시하고 유효 토큰만 반영
- `rotation-mode` 미지정/무효: `turntable`
- `sampling-step` 미지정/무효: `1`
- `point-size` 미지정/무효: `2.0`
- `use-texture-color` 미지정/무효: `true`
- `skip-zero` 미지정/무효: `true`
- 속성 변경은 연결 상태에서 즉시 반영(재초기화 없음)

예시:

```html
<cle-pointcloud-viewer></cle-pointcloud-viewer>
<cle-pointcloud-viewer overlays="control-panel"></cle-pointcloud-viewer>
<cle-pointcloud-viewer overlays="measurement axis-widget"></cle-pointcloud-viewer>
<cle-pointcloud-viewer
  overlays="control-panel measurement axis-widget"
  rotation-mode="cad"
  sampling-step="2"
  point-size="1.6"
  use-texture-color="true"
  skip-zero="true"
></cle-pointcloud-viewer>
```

## UI/동작 요약

- 회전 모드: `rotation-mode` attribute (`turntable|arcball|cad`)
- 측정 모드: 뷰어 내부 측정 패널 버튼으로 ON/OFF, 클릭 1회 A, 2회 B, 3회 새 측정 시작
- 키보드 이동: 포커스된 뷰어에서 `W/A/S/D`, `Space`, `Shift`
- 동일 뷰어에 연속 렌더 시 이전 작업은 취소되고 최신 요청만 유지
- 취소된 렌더는 `AbortError`로 전달
- `overlays` 속성 변경은 재초기화 없이 즉시 반영

## 입력 파일

- 필수: `*_IMG_PointCloud_X.tif`, `*_IMG_PointCloud_Y.tif`, `*_IMG_PointCloud_Z.tif`
- 선택: `*_IMG_Texture_8Bit.png`, ValidMask(`.tif/.tiff/.png`)

## 주의사항

- `dist/cle-pointcloud-viewer.js`에는 코어 런타임과 `three`, `geotiff`가 함께 번들됩니다(standalone).
- `examples/index.html`은 인스턴스별 파일 입력 기반이므로 로컬 테스트 시 X/Y/Z 파일을 직접 선택해야 합니다.
- 대용량 데이터는 `samplingStep`을 높여 점 개수를 줄이는 것을 권장합니다.
