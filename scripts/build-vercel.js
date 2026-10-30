const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputDirectory = path.join(projectRoot, "dist");
const files = [
    "index.html",
    "style.css",
    "i18n.js",
    "script.js",
    "service-worker.js",
    "manifest.webmanifest"
];
const directories = ["icons", "images"];

fs.mkdirSync(outputDirectory, { recursive: true });

for (const file of files) {
    fs.copyFileSync(path.join(projectRoot, file), path.join(outputDirectory, file));
}

for (const directory of directories) {
    fs.cpSync(path.join(projectRoot, directory), path.join(outputDirectory, directory), { recursive: true });
}
