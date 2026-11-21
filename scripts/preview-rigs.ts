// Draws every character, enemy and boss rig from content/*.json into one self-contained page.
// Run: npx tsx scripts/preview-rigs.ts   -> writes content/rig-preview.html
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Cartridge, Rig } from "../src/shared/schema";
import { RIG_SIZES } from "../src/shared/schema";

type Entry = { name: string; role: string; rig: Rig };
type Group = { id: string; title: string; entries: Entry[] };

const dir = "content";
const groups: Group[] = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  try {
    const cart = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Cartridge;
    if (!cart?.character?.rig || !cart?.world) continue;
    groups.push({
      id: cart.id,
      title: `${cart.source?.title ?? cart.id} (${f})`,
      entries: [
        { name: cart.character.name, role: "character", rig: cart.character.rig },
        ...cart.world.enemies.map((e) => ({ name: e.name, role: "enemy", rig: e.rig })),
        { name: cart.world.boss.name, role: "boss", rig: cart.world.boss.rig },
      ],
    });
  } catch (e) {
    console.warn(`skipping ${f}: ${(e as Error).message}`);
  }
}

// Escape "<" so cartridge text can never close the <script> tag.
const data = JSON.stringify({ groups, sizes: RIG_SIZES }).replace(/</g, "\\u003c");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rig Preview</title>
<style>
  body { margin: 0; padding: 16px; background: #808080; color: #111; font: 14px/1.4 system-ui, sans-serif; }
  h1 { margin: 0 0 8px; font-size: 20px; }
  h2 { margin: 24px 0 8px; font-size: 16px; border-bottom: 1px solid #555; padding-bottom: 4px; }
  .row { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; }
  figure { margin: 0; text-align: center; }
  canvas { display: block; image-rendering: pixelated; background: #8c8c8c; outline: 1px dashed #666; }
  figcaption { margin-top: 4px; }
  .tag { font-size: 12px; color: #2a2a2a; }
  label { user-select: none; cursor: pointer; }
</style>
</head>
<body>
<h1>Rig preview</h1>
<label><input type="checkbox" id="run"> run animation (legs ±30° around hip, arms ±20° around shoulder)</label>
<div id="out"></div>
<script>
const DATA = ${data};
const SCALE = 6;
const items = [];

function drawShapes(ctx, shapes) {
  for (const s of shapes) {
    ctx.fillStyle = s.color;
    if (s.type === "rect") ctx.fillRect(s.x, s.y, s.w, s.h);
    else { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
  }
}
function rotated(ctx, pivot, angle, fn) {
  ctx.save();
  ctx.translate(pivot[0], pivot[1]);
  ctx.rotate(angle);
  ctx.translate(-pivot[0], -pivot[1]);
  fn();
  ctx.restore();
}
function drawRig(ctx, rig, t) {
  const p = rig.parts, pv = rig.pivots;
  const swing = Math.sin(t * Math.PI * 2 / 0.4);
  const leg = swing * Math.PI / 6, arm = -swing * Math.PI / 9;
  const extras = (to) => p.extras.filter((e) => e.attachTo === to).forEach((e) => drawShapes(ctx, e.shapes));
  rotated(ctx, pv.shoulder, -arm, () => drawShapes(ctx, p.armBack));
  rotated(ctx, pv.hip, -leg, () => drawShapes(ctx, p.legBack));
  rotated(ctx, pv.hip, leg, () => drawShapes(ctx, p.legFront));
  drawShapes(ctx, p.torso);
  drawShapes(ctx, p.head);
  rotated(ctx, pv.shoulder, arm, () => drawShapes(ctx, p.armFront));
  extras("torso");
  extras("head");
  rotated(ctx, pv.shoulder, arm, () => extras("armFront"));
}

const out = document.getElementById("out");
if (!DATA.groups.length) out.textContent = "No cartridges found in content/.";
for (const g of DATA.groups) {
  const h = document.createElement("h2");
  h.textContent = g.title;
  out.appendChild(h);
  const row = document.createElement("div");
  row.className = "row";
  out.appendChild(row);
  for (const e of g.entries) {
    const size = DATA.sizes[e.rig.sizeClass];
    const off = document.createElement("canvas");
    off.width = size.w; off.height = size.h;
    const view = document.createElement("canvas");
    view.width = size.w * SCALE; view.height = size.h * SCALE;
    const fig = document.createElement("figure");
    const cap = document.createElement("figcaption");
    const name = document.createElement("div");
    name.textContent = e.name;
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = e.role + " · " + e.rig.sizeClass + " (" + size.w + "×" + size.h + ")";
    cap.append(name, tag);
    fig.append(view, cap);
    row.appendChild(fig);
    items.push({ rig: e.rig, off, view });
  }
}

const runBox = document.getElementById("run");
function render(now) {
  const t = runBox.checked ? now / 1000 : 0;
  for (const it of items) {
    const o = it.off.getContext("2d");
    o.clearRect(0, 0, it.off.width, it.off.height);
    drawRig(o, it.rig, t);
    const v = it.view.getContext("2d");
    v.imageSmoothingEnabled = false;
    v.clearRect(0, 0, it.view.width, it.view.height);
    v.drawImage(it.off, 0, 0, it.view.width, it.view.height);
  }
  if (runBox.checked) requestAnimationFrame(render);
}
runBox.addEventListener("change", () => requestAnimationFrame(render));
render(0);
</script>
</body>
</html>
`;

const outFile = path.join(dir, "rig-preview.html");
writeFileSync(outFile, html);
console.log(`✓ wrote ${outFile} (${groups.length} cartridge(s), ${groups.reduce((n, g) => n + g.entries.length, 0)} rigs)`);
