// Demo Day presentation QR → FitKitchen in the deployed MacroTable app (a presentation asset, not an app feature).
// Usage: node scripts/demo-qr.mjs   → docs/demo-day/fitkitchen-qr.svg (+ .json with the encoded URL and module matrix)
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import qrcode from "qrcode-generator";

export const DEMO_QR_URL = "https://mercouriss.github.io/macrotable-prototype/r/fitkitchen";
const QUIET = 4; // modules of white border required by the QR spec

export function demoQrMatrix(url = DEMO_QR_URL) {
  const qr = qrcode(0, "Q"); // smallest version that fits; level Q (~25% recovery) for projected slides
  qr.addData(url, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

export function demoQrSvg(matrix) {
  const n = matrix.length;
  const size = n + QUIET * 2;
  let d = "";
  matrix.forEach((row, r) => row.forEach((dark, c) => { if (dark) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="1024" height="1024" shape-rendering="crispEdges">` +
    `<title>MacroTable · FitKitchen (${DEMO_QR_URL})</title>` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/><path fill="#000000" d="${d}"/></svg>\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const matrix = demoQrMatrix();
  writeFileSync("docs/demo-day/fitkitchen-qr.svg", demoQrSvg(matrix));
  writeFileSync("docs/demo-day/fitkitchen-qr.json", JSON.stringify({ url: DEMO_QR_URL, errorCorrection: "Q", quietZoneModules: QUIET, modules: matrix.length }, null, 2) + "\n");
  console.log(`QR ${matrix.length}×${matrix.length} modules → ${DEMO_QR_URL}`);
}
