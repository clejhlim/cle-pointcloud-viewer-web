/**
 * PointCloud Loader — reads GeoTIFF / PNG files and builds typed-array
 * buffers for Three.js point cloud rendering.
 *
 * This module has NO dependency on Three.js and works with pure data.
 */

import { fromArrayBuffer } from "geotiff";
import { clamp } from "../common/math-utils.js";
import type {
    BuildPointBuffersInput,
    ColorRaster,
    DepthColor,
    NumericRaster,
    PointBuffersResult,
    RasterLike
} from "../../types/render-types";

// ─── GeoTIFF / PNG readers ──────────────────────────────────────────

export async function readSingleBandTiff(file: File): Promise<NumericRaster> {
    const arrayBuffer = await file.arrayBuffer();
    const tiff = await fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();

    const width = image.getWidth();
    const height = image.getHeight();
    const data = await image.readRasters({ interleave: true }) as ArrayLike<number>;

    return { width, height, data };
}

export async function readTexturePng(file: File): Promise<ColorRaster> {
    const imageBitmap = await createImageBitmap(file);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
            throw new Error("Texture PNG 디코딩용 2D 컨텍스트를 생성하지 못했습니다.");
        }

        ctx.drawImage(imageBitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return {
            width: canvas.width,
            height: canvas.height,
            data: imageData.data
        };
    } finally {
        imageBitmap.close();
    }
}

export async function readValidMask(file: File): Promise<NumericRaster> {
    const lower = (file.name || "").toLowerCase();
    if (lower.endsWith(".tif") || lower.endsWith(".tiff")) {
        return readSingleBandTiff(file);
    }

    if (lower.endsWith(".png") || file.type === "image/png") {
        return readMaskPng(file);
    }

    throw new Error("ValidMask는 .tif/.tiff/.png 형식만 지원합니다.");
}

async function readMaskPng(file: File): Promise<NumericRaster> {
    const imageBitmap = await createImageBitmap(file);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
            throw new Error("ValidMask PNG 디코딩용 2D 컨텍스트를 생성하지 못했습니다.");
        }

        ctx.drawImage(imageBitmap, 0, 0);

        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const pixelCount = canvas.width * canvas.height;
        const data = new Uint8Array(pixelCount);

        // If alpha is meaningful, use alpha as mask. Otherwise use RGB intensity.
        let hasTransparentAlpha = false;
        for (let i = 0; i < pixelCount; i += 1) {
            const alpha = rgba[(i * 4) + 3] ?? 255;
            if (alpha < 255) {
                hasTransparentAlpha = true;
                break;
            }
        }

        for (let i = 0; i < pixelCount; i += 1) {
            const base = i * 4;
            if (hasTransparentAlpha) {
                data[i] = rgba[base + 3] ?? 0;
            } else {
                const r = rgba[base] ?? 0;
                const g = rgba[base + 1] ?? 0;
                const b = rgba[base + 2] ?? 0;
                data[i] = Math.max(r, g, b);
            }
        }

        return {
            width: canvas.width,
            height: canvas.height,
            data
        };
    } finally {
        imageBitmap.close();
    }
}

// ─── Validation ─────────────────────────────────────────────────────

export function validateRasterShape(a: RasterLike, b: RasterLike, nameA: string, nameB: string): void {
    if (a.width !== b.width || a.height !== b.height) {
        throw new Error(`${nameA}(${a.width}x${a.height})와 ${nameB}(${b.width}x${b.height}) 해상도가 다릅니다.`);
    }
}

// ─── Buffer builder ─────────────────────────────────────────────────

export function buildPointBuffers({
    xRaster,
    yRaster,
    zRaster,
    textureRaster,
    maskRaster,
    samplingStep,
    useTextureColor,
    skipZero
}: BuildPointBuffersInput): PointBuffersResult {
    const width = xRaster.width;
    const height = xRaster.height;

    const maxCount = Math.ceil(width / samplingStep) * Math.ceil(height / samplingStep);
    const positions = new Float32Array(maxCount * 3);
    const colors = new Float32Array(maxCount * 3);
    const zValues = new Float32Array(maxCount);

    const xData = xRaster.data;
    const yData = yRaster.data;
    const zData = zRaster.data;
    const maskData = maskRaster ? maskRaster.data : null;

    const textureData = textureRaster ? textureRaster.data : null;
    const useTexture = useTextureColor && !!textureData;

    let minZ = Infinity;
    let maxZ = -Infinity;
    let count = 0;

    for (let row = 0; row < height; row += samplingStep) {
        for (let col = 0; col < width; col += samplingStep) {
            const idx = row * width + col;

            if (maskData && Number(maskData[idx]) <= 0) {
                continue;
            }

            const x = Number(xData[idx]);
            const y = Number(yData[idx]);
            const z = Number(zData[idx]);

            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
                continue;
            }

            if (skipZero && x === 0 && y === 0 && z === 0) {
                continue;
            }

            const base3 = count * 3;
            positions[base3] = x;
            positions[base3 + 1] = y;
            positions[base3 + 2] = z;

            if (useTexture && textureData) {
                const base4 = idx * 4;
                colors[base3] = Number(textureData[base4]) / 255;
                colors[base3 + 1] = Number(textureData[base4 + 1]) / 255;
                colors[base3 + 2] = Number(textureData[base4 + 2]) / 255;
            } else {
                zValues[count] = z;
                if (z < minZ) {
                    minZ = z;
                }
                if (z > maxZ) {
                    maxZ = z;
                }
            }

            count += 1;
        }
    }

    if (!useTexture && count > 0) {
        const range = Math.max(maxZ - minZ, 1e-6);
        for (let i = 0; i < count; i += 1) {
            const base3 = i * 3;
            const t = ((zValues[i] ?? minZ) - minZ) / range;
            const color = depthColor(t);
            colors[base3] = color[0];
            colors[base3 + 1] = color[1];
            colors[base3 + 2] = color[2];
        }
    }

    if (count === 0) {
        throw new Error("렌더링할 유효 포인트가 없습니다.");
    }

    return {
        count,
        positions: positions.subarray(0, count * 3),
        colors: colors.subarray(0, count * 3)
    };
}

export function depthColor(t: number): DepthColor {
    const x = clamp(t, 0, 1);
    const r = 0.15 + 0.85 * x;
    const g = 0.25 + 0.75 * (1 - Math.abs(2 * x - 1));
    const b = 1.0 - 0.75 * x;
    return [r, g, b];
}
