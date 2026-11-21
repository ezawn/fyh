// Draws every rig (characters, enemies, bosses, NPCs), every prop and a thumbnail of every room
// from content/*.json into one self-contained page.
// Run: npx tsx scripts/preview-rigs.ts   -> writes content/rig-preview.html
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Cartridge, Rig } from "../src/shared/schema";
import { RIG_SCALE, RIG_SIZES, TILE } from "../src/shared/schema";

type Entry = { name: string; role: string; rig: Rig };
type Group = { id: string; title: string; entries: Entry[]; world: Cartridge["world"]; character: Entry };

const dir = "content";
const groups: Group[] = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  try {
    const cart = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Cartridge;
    if (!cart?.character?.rig || !cart?.world) continue;
    const character = { name: cart.character.name, role: "character", rig: cart.character.rig };
    groups.push({
      id: cart.id,
      title: `${cart.source?.title ?? cart.id} (${f})`,
      character,
      world: cart.world,
      entries: [
        character,
        ...cart.world.enemies.map((e) => ({ name: e.name, role: "enemy", rig: e.rig })),
        { name: cart.world.boss.name, role: "boss", rig: cart.world.boss.rig },
        ...(cart.world.npcs ?? []).map((n) => ({ name: n.name, role: "npc", rig: n.rig })),
      ],
    });
  } catch (e) {
    console.warn(`skipping ${f}: ${(e as Error).message}`);
  }
}

// Escape "<" so cartridge text can never close the <script> tag.
const data = JSON.stringify({ groups, sizes: RIG_SIZES, rigScale: RIG_SCALE, tile: TILE }).replace(/</g, "\\u003c");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rig Preview</title>
<style>
  body { margin: 0; padding: 16px; background: #808080; color: #111; font: 14px/1.4 system-ui, sans-serif; }
  h1 { margin: 0 0 8px; font-size: 20px; }
  h2 { margin: 28px 0 8px; font-size: 18px; border-bottom: 2px solid #444; padding-bottom: 4px; }
  h3 { margin: 16px 0 6px; font-size: 14px; text-transform: uppercase; letter-spacing: .05em; color: #222; }
  .row { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; }
  figure { margin: 0; text-align: center; }
  canvas { display: block; image-rendering: pixelated; }
  .rig canvas, .prop canvas { background: #8c8c8c; outline: 1px dashed #666; }
  .room { margin: 0 0 14px; }
  .room .name { font-weight: 600; margin-bottom: 4px; }
  .scroll { overflow-x: auto; max-width: 100%; }
  figcaption { margin-top: 4px; }
  .tag { font-size: 12px; color: #2a2a2a; }
  label { user-select: none; cursor: pointer; margin-right: 16px; }
</style>
</head>
<body>
<h1>Rig preview</h1>
<label><input type="checkbox" id="run"> run animation (legs ±30° around hip, arms ±20° around shoulder)</label>
<label><input type="checkbox" id="zoom" checked> rooms at 2x</label>
<div id="out"></div>
<script>
const DATA = ${data};
const RIG_ZOOM = 4, PROP_ZOOM = 2, T = DATA.tile, RS = DATA.rigScale;
const items = [];
const rooms = [];

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
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function figure(cls, canvas, title, sub) {
  const fig = el("figure", cls);
  const cap = el("figcaption");
  cap.append(el("div", null, title), el("div", "tag", sub));
  fig.append(canvas, cap);
  return fig;
}

// Room thumbnail: tiles at 16 px, props and rigs at RIG_SCALE, feet on the bottom of their tile.
function drawRoom(ctx, room, g) {
  const pal = g.world.visualStyle.palette;
  const rows = room.layout.length, cols = room.layout[0].length;
  const at = (c, r) => (r < 0 || r >= rows || c < 0 || c >= cols ? "." : room.layout[r][c]);
  const sky = ctx.createLinearGradient(0, 0, 0, rows * T);
  sky.addColorStop(0, pal.sky); sky.addColorStop(1, pal.skyBottom);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, cols * T, rows * T);
  const propById = Object.fromEntries((g.world.props || []).map((p) => [p.id, p]));
  const drawProps = (layer) => {
    for (const pl of room.props || []) {
      const p = propById[pl.prop];
      if (!p || (p.layer || "back") !== layer) continue;
      ctx.save();
      ctx.translate(pl.col * T, (pl.row + 1) * T - p.size.h * RS);
      ctx.scale(RS, RS);
      drawShapes(ctx, p.shapes);
      ctx.restore();
    }
  };
  drawProps("back");
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const t = at(c, r), x = c * T, y = r * T;
    if (t === "#") {
      ctx.fillStyle = pal.ground; ctx.fillRect(x, y, T, T);
      if (at(c, r - 1) !== "#") { ctx.fillStyle = pal.groundTop; ctx.fillRect(x, y, T, 4); }
    } else if (t === "=") {
      ctx.fillStyle = pal.platform; ctx.fillRect(x, y, T, 6);
      ctx.fillStyle = pal.groundTop; ctx.fillRect(x, y, T, 1);
    } else if (t === "X") {
      ctx.fillStyle = "#8a6a3a"; ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
      ctx.strokeStyle = "#4a3418"; ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + T - 2, y + T - 2); ctx.moveTo(x + T - 2, y + 2); ctx.lineTo(x + 2, y + T - 2); ctx.stroke();
    } else if (t === "^") {
      ctx.fillStyle = "#d8d8e0";
      for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.moveTo(x + k * 8, y + T); ctx.lineTo(x + k * 8 + 4, y + 6); ctx.lineTo(x + k * 8 + 8, y + T); ctx.fill(); }
    } else if (t === "E") {
      ctx.fillStyle = pal.accent; ctx.fillRect(x + 2, y - T, T - 4, 2 * T);
      ctx.fillStyle = "#000"; ctx.fillRect(x + 4, y - T + 3, T - 8, 2 * T - 3);
    } else if (t === "C") {
      ctx.fillStyle = "#ddd"; ctx.fillRect(x + 7, y, 2, T);
      ctx.fillStyle = pal.accent; ctx.fillRect(x + 9, y, 6, 5);
    }
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const t = at(c, r);
    let rig = null;
    if (t === "S") rig = g.character.rig;
    else if (t === "B") rig = g.world.boss.rig;
    else if (t >= "1" && t <= "5") rig = (g.world.enemies[+t - 1] || {}).rig;
    else if (t >= "a" && t <= "c") rig = ((g.world.npcs || [])["abc".indexOf(t)] || {}).rig;
    if (!rig) continue;
    const s = DATA.sizes[rig.sizeClass];
    ctx.save();
    ctx.translate(c * T + T / 2 - (s.w * RS) / 2, (r + 1) * T - s.h * RS);
    ctx.scale(RS, RS);
    drawRig(ctx, rig, 0);
    ctx.restore();
  }
  drawProps("front");
}

const out = document.getElementById("out");
if (!DATA.groups.length) out.textContent = "No cartridges found in content/.";
for (const g of DATA.groups) {
  out.appendChild(el("h2", null, g.title));
  out.appendChild(el("h3", null, "Rigs (4x)"));
  const row = el("div", "row");
  out.appendChild(row);
  for (const e of g.entries) {
    const size = DATA.sizes[e.rig.sizeClass];
    const off = document.createElement("canvas");
    off.width = size.w; off.height = size.h;
    const view = document.createElement("canvas");
    view.width = size.w * RIG_ZOOM; view.height = size.h * RIG_ZOOM;
    row.appendChild(figure("rig", view, e.name, e.role + " · " + e.rig.sizeClass + " (" + size.w + "×" + size.h + ")"));
    items.push({ rig: e.rig, off, view });
  }

  const propList = g.world.props || [];
  if (propList.length) {
    out.appendChild(el("h3", null, "Props (2x)"));
    const prow = el("div", "row");
    out.appendChild(prow);
    for (const p of propList) {
      const c = document.createElement("canvas");
      c.width = p.size.w * PROP_ZOOM; c.height = p.size.h * PROP_ZOOM;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.scale(PROP_ZOOM, PROP_ZOOM);
      drawShapes(ctx, p.shapes);
      prow.appendChild(figure("prop", c, p.name, p.id + " · " + (p.layer || "back") + " · " + p.size.w + "×" + p.size.h));
    }
  }

  out.appendChild(el("h3", null, "Rooms (16 px tiles, rigs and props at RIG_SCALE)"));
  for (const room of g.world.rooms) {
    const wrap = el("div", "room");
    wrap.appendChild(el("div", "name", room.name + (room.isBossRoom ? " (boss)" : "")));
    const sc = el("div", "scroll");
    const c = document.createElement("canvas");
    const cols = room.layout[0].length, rows = room.layout.length;
    // Draw at 2x internal resolution so 2x-detail rigs stay sharp; CSS size toggles 1x/2x.
    c.width = cols * T * 2; c.height = rows * T * 2;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.scale(2, 2);
    drawRoom(ctx, room, g);
    sc.appendChild(c);
    wrap.appendChild(sc);
    out.appendChild(wrap);
    rooms.push({ c, cols, rows });
  }
}

const zoomBox = document.getElementById("zoom");
function applyZoom() {
  const z = zoomBox.checked ? 2 : 1;
  for (const r of rooms) { r.c.style.width = r.cols * T * z + "px"; r.c.style.height = r.rows * T * z + "px"; }
}
zoomBox.addEventListener("change", applyZoom);
applyZoom();

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
const rigCount = groups.reduce((n, g) => n + g.entries.length, 0);
const propCount = groups.reduce((n, g) => n + (g.world.props?.length ?? 0), 0);
console.log(`✓ wrote ${outFile} (${groups.length} cartridge(s), ${rigCount} rigs, ${propCount} props, ${groups.length * 3} rooms)`);
