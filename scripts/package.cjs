const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const manifest = require("../extension/manifest.json");
fs.mkdirSync(path.join(root, "downloads"), { recursive: true });
const output = path.join(root, "downloads", `photo-shortlist-${manifest.version}.zip`);
execFileSync(process.platform === "win32" ? "python" : "python3", ["-c", `
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys
source = Path(sys.argv[1])
with ZipFile(sys.argv[2], 'w', ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob('*')):
        if file.is_file():
            archive.write(file, file.relative_to(source))
`, path.join(root, "extension"), output]);
console.log(`Created ${output} (${fs.statSync(output).size.toLocaleString()} bytes)`);
