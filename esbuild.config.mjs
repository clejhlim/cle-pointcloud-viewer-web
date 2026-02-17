import { build, context } from "esbuild";

const isWatch = process.argv.includes("--watch");

const baseConfig = {
    bundle: true,
    format: "iife",
    target: ["es2020"],
    sourcemap: true,
    loader: {
        ".html": "text",
        ".css": "text"
    }
};

const entryPoint = "src/pointcloud-viewer.ts";
const normalOutput = "dist/cle-pointcloud-viewer.js";
const minOutput = "dist/cle-pointcloud-viewer.min.js";

async function run() {
    if (isWatch) {
        const ctx = await context({
            ...baseConfig,
            entryPoints: [entryPoint],
            outfile: normalOutput,
            minify: false
        });
        await ctx.watch();
        console.log(`Watching ${entryPoint} -> ${normalOutput}`);
    } else {
        await build({
            ...baseConfig,
            entryPoints: [entryPoint],
            outfile: normalOutput,
            minify: false
        });
        console.log(`Built ${normalOutput}`);

        await build({
            ...baseConfig,
            entryPoints: [entryPoint],
            outfile: minOutput,
            minify: true
        });
        console.log(`Built ${minOutput}`);
    }
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
