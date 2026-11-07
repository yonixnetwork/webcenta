// Generates PWA icons from the logo SVG (run once; outputs are committed).
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const logo = (pad) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs>
<rect width="512" height="512" rx="${pad ? 0 : 112}" fill="url(#g)"/>
<g transform="translate(${pad ? 96 : 64} ${pad ? 96 : 64}) scale(${pad ? 0.625 : 0.75})"><path d="M107 171l64 213 64-149h42l64 149 64-213" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`);

mkdirSync("public/icons", { recursive: true });
for (const size of [192, 512]) {
  await sharp(logo(false)).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
  await sharp(logo(true)).resize(size, size).png().toFile(`public/icons/maskable-${size}.png`);
}
await sharp(logo(false)).resize(180, 180).flatten({ background: "#6366f1" }).png().toFile("public/icons/apple-touch-icon.png");
console.log("icons written");
