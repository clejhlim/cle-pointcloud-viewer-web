/**
 * format-utils — generic formatting helpers shared across modules.
 */

export interface Vec3Like {
    x: number;
    y: number;
    z: number;
}

export function numberWithCommas(value: number | string): string {
    return Number(value).toLocaleString("en-US");
}

export function formatVec3(v: Vec3Like): string {
    return `${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}`;
}
