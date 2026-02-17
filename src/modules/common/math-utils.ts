/**
 * math-utils — generic math helpers shared across modules.
 */

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
