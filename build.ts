
import { copyFile, rm, mkdir, readFile, writeFile, rename, access } from "fs/promises";
import * as crypto from "crypto";
import fetch, { Response } from "node-fetch";

import * as esbuild from "esbuild";
import { PathLike } from "fs";

async function exists(path: PathLike): Promise<Boolean> {
    try {
        await access(path);
        return true;
    } catch (error) {
        return false;
    }
}

const terminalColors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",
    fgBlack: "\x1b[30m",
    fgRed: "\x1b[31m",
    fgGreen: "\x1b[32m",
    fgYellow: "\x1b[33m",
    fgBlue: "\x1b[34m",
    fgMagenta: "\x1b[35m",
    fgCyan: "\x1b[36m",
    fgWhite: "\x1b[37m",
    bgBlack: "\x1b[40m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
    bgMagenta: "\x1b[45m",
    bgCyan: "\x1b[46m",
    bgWhite: "\x1b[47m"
  };

console.log(`${terminalColors.bgBlue}[Build Process]${terminalColors.reset} ${terminalColors.fgBlue}Started clearing old files${terminalColors.reset}`);

await rm("./dists/", { recursive: true, force: true });
await mkdir("./dists/");
await mkdir("./dists/models/");

if(!await exists("./cache/")) {
    await mkdir("./cache/");
}

console.log(`${terminalColors.bgBlue}[Build Process]${terminalColors.reset} ${terminalColors.fgBlue}Started generating bundled js file${terminalColors.reset}`);

await esbuild.build({
    entryPoints: ["./src/index.ts"],
    bundle: true,
    minify: true,
    sourcemap: true,
    target: ["chrome86", "firefox87"],
    outfile: "./dists/bundled.js",
    format: "esm"
});

console.log(`${terminalColors.bgBlue}[Build Process]${terminalColors.reset} ${terminalColors.fgBlue}Started copying files into dists folder${terminalColors.reset}`);

const bundledJS: string = await readFile("./dists/bundled.js", { encoding: "utf-8" });
const bundledJSHash: string = crypto.createHash("sha256").update(bundledJS).digest("hex").substring(0, 8);
await rename("./dists/bundled.js", `./dists/bundled-${bundledJSHash}.js`);
const indexHTMLContent: string = await readFile(`./src/index.html`, { encoding: "utf-8" });
await copyFile("./node_modules/bootstrap/dist/css/bootstrap.min.css", "./dists/bootstrap.min.css");
await writeFile(`./dists/index.html`, indexHTMLContent.replace("{{LINK_OF_BUNDLED_JS}}", `bundled-${bundledJSHash}.js`).replace("{{LINK_OF_BOOTSTRAP_CSS}}", "bootstrap.min.css"));
await copyFile("./node_modules/tesseract-wasm/dist/tesseract-worker.js", "./dists/tesseract-worker.js");
await copyFile("./node_modules/tesseract-wasm/dist/tesseract-core.wasm", "./dists/tesseract-core.wasm");
await copyFile("./node_modules/tesseract-wasm/dist/tesseract-core-fallback.wasm", "./dists/tesseract-core-fallback.wasm");
await writeFile("./dists/sw.js", (await readFile("./src/sw.js", {encoding: "utf-8"})).replace("{{BUNDLED_JS_FILENAME}}", `bundled-${bundledJSHash}.js`))
await copyFile("./src/manifest.json", "./dists/manifest.json");
await copyFile("./src/icon.png", "./dists/icon.png");

console.log(`${terminalColors.bgBlue}[Build process]${terminalColors.reset} ${terminalColors.fgBlue}Started downloading model files into dists folder. This may take a few minutes.${terminalColors.reset}`);

if (!process.argv.includes("--skip-model-download")){
    let downloadFromCache: boolean = false;

    if (await exists("./cache/chi_sim.traineddata")) {
        const hashOfActualFile = "c0b1f7a21638e2ae4e2fabdeec0433eed152ed4849a5e724f585437da5092e2e";
        const hashOfCachedFile = crypto.createHash("sha256").update(await readFile("./cache/chi_sim.traineddata")).digest("hex");
        if (hashOfActualFile === hashOfCachedFile) {
            downloadFromCache = true;
        } else {
            console.log(`${terminalColors.bgBlue}[Build Process]${terminalColors.reset} ${terminalColors.fgBlue}Incorrect hash for file chi_sim.traineddata. Downloading the file again.${terminalColors.reset}`);
        }
    }
    
    if (!downloadFromCache) {
        await fetch("https://github.com/tesseract-ocr/tessdata/raw/4.00/chi_sim.traineddata")
            .then((response: Response) => {
                if (!response.ok) {
                    throw new Error(`Unable to fetch file: ${response.status}`);
                }
                return response.buffer();
            })
            .then(async (data: Buffer) => {
                await writeFile("./dists/models/chi_sim.traineddata", data);
                console.log(`${terminalColors.bgGreen}[Build Process]${terminalColors.reset} ${terminalColors.fgGreen}All completed!${terminalColors.reset}`);
            })
            .catch(error => {
                console.error(`${terminalColors.bgRed}[Error]${terminalColors.reset} ${terminalColors.fgRed}Error when downloading file: ${error.message}${terminalColors.reset}`);
                console.log(`${terminalColors.bgRed}[Error]${terminalColors.reset} ${terminalColors.fgRed}You have to download the model files manually and put them into the dists/models folder.${terminalColors.reset}`);
                console.log(`${terminalColors.bgRed}[Error]${terminalColors.reset} ${terminalColors.fgRed}Hint: The URL of model file for Chinese Simplified is https://github.com/tesseract-ocr/tessdata/raw/4.00/chi_sim.traineddata${terminalColors.reset}`);
                console.log(`${terminalColors.bgYellow}[Warning]${terminalColors.reset} ${terminalColors.fgYellow}All the steps in the build process has completed expect for downloading the model file, so further operation is required to take. For details please check the information outputed below.${terminalColors.reset}`);
            });
    } else {
        await copyFile("./cache/chi_sim.traineddata", "./dists/models/chi_sim.traineddata");
        console.log(`${terminalColors.bgGreen}[Build Process]${terminalColors.reset} ${terminalColors.fgGreen}All completed!${terminalColors.reset}`);
    }
} else {
    console.log(`${terminalColors.bgYellow}[Warning]${terminalColors.reset} ${terminalColors.fgYellow}Skipping downloading model files. You have to download the model files manually and put them into the dists/models folder.${terminalColors.reset}`);
    console.log(`${terminalColors.bgGreen}[Build process]${terminalColors.reset} ${terminalColors.fgGreen}All completed!${terminalColors.reset}`);
}

