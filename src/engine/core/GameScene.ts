/**
 * The game scene (CORE): one room at a time. Builds tiles, bodies, rigs, player
 * movement, HUD, dialogue and room flow, and implements EngineContext for COMBAT.
 *
 * Room changes / restarts use scene.restart() with a RunState carried in the init
 * data, so the CombatSystem (created once per game) survives between rooms.
 */
import Phaser from "phaser";
import { GRAVITY, RIG_SCALE, TILE } from "../../shared/schema";
import { jumpVelocity } from "./jump";
import type { BossDef, CharacterDef, DialogueLine, EnemyDef, NpcDef, Room } from "../../shared/schema";
import { createCombat } from "../combat";
import { BackdropView } from "../render/backdrop";
import { rasterShapes } from "../render/rig";
import { RigView } from "../render/RigView";
import { blockTexture, exitTexture, flagTexture, roomTexture } from "../render/tiles";
import type { Session } from "../session";
import type { AbilityUseResult, CombatSystem, EngineContext, RuntimeEntity } from "../types";
import { DialogueBox } from "../ui/DialogueBox";
import { Hud } from "../ui/Hud";
import { HudLayer } from "../ui/hudLayer";
import { Menu, roomBanner } from "../ui/Menu";
import { parseRoom, type ParsedRoom } from "./room";

export { GRAVITY, TILE };
/** Canvas size (2x render). index.ts integer-scales this to the window. */
export const VIEW_W = 800;
export const VIEW_H = 448;
/** World camera zoom: 2 (2x render) × 1.5 (closer view) ≈ 17×9.5 tiles visible. */
export const WORLD_ZOOM = 3;

type Outcome = "won" | "died" | "quit";

/** Per-game state that survives room restarts. */
export interface RunState {
  combat: CombatSystem;
  exited: boolean;
  /** True between combat.initRoom and combat.endRoom. */
  roomActive: boolean;
  checkpoint: { roomIndex: number; x: number; y: number } | null;
  introShown: Set<number>;
  selectedSlot: 1 | 2 | 3 | 4;
}

export type SceneInit = {
  session: Session;
  roomIndex: number;
  onExit: (r: { outcome: Outcome }) => void;
  run?: RunState;
};

type Flow = "play" | "dead" | "won" | "exited";

type ArcadeZone = Phaser.GameObjects.Zone & { body: Phaser.Physics.Arcade.Body };

const DEPTH = { prop: -10, tiles: 0, block: 1, marker: 2, npc: 15, boss: 19, enemy: 20, player: 21, front: 50, fx: 60 };

export class GameScene extends Phaser.Scene {
  private init_!: SceneInit;
  private run!: RunState;
  private token = 0;
  private flow: Flow = "play";

  private room!: Room;
  private parsed!: ParsedRoom;
  private worldW = 0;
  private worldH = 0;
  private solidGrid: boolean[][] = [];
  private blocks = new Map<string, Phaser.GameObjects.Zone & { img: Phaser.GameObjects.Image }>();

  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private oneWays!: Phaser.Physics.Arcade.StaticGroup;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  private exitsGroup!: Phaser.Physics.Arcade.StaticGroup;
  private checkpointGroup!: Phaser.Physics.Arcade.StaticGroup;

  private player!: RuntimeEntity;
  private playerZone!: ArcadeZone;
  private views = new Map<RuntimeEntity, RigView>();
  private dyingViews = new Set<RigView>();
  private colliders = new Map<RuntimeEntity, Phaser.Physics.Arcade.Collider[]>();
  private npcs: { def: NpcDef; view: RigView; x: number; y: number; talked: boolean }[] = [];
  private entityCounter = 0;

  private backdrop!: BackdropView;
  private hudLayer!: HudLayer;
  private hud!: Hud;
  private dialogue!: DialogueBox;
  private menu: Menu | null = null;
  private menuShownAt = 0;
  private menuActions: Record<string, () => void> = {};

  private keys!: Record<"W" | "A" | "S" | "D" | "UP" | "LEFT" | "DOWN" | "RIGHT" | "SPACE" | "ENTER", Phaser.Input.Keyboard.Key>;
  private lastGrounded = -1e9;
  private updateErrorLogged = false;

  constructor() {
    super("game");
  }

  init(data: SceneInit) {
    this.init_ = data;
    this.run = data.run ?? {
      combat: createCombat(),
      exited: false,
      roomActive: false,
      checkpoint: null,
      introShown: new Set(),
      selectedSlot: 1,
    };
    data.run = this.run;
    this.flow = "play";
    this.token++;
    this.blocks = new Map();
    this.views = new Map();
    this.dyingViews = new Set();
    this.colliders = new Map();
    this.npcs = [];
    this.menu = null;
    this.menuActions = {};
    this.entityCounter = 0;
    this.lastGrounded = -1e9;
    this.updateErrorLogged = false;
  }

  // ------------------------------------------------------------------ setup

  create() {
    const { session } = this.init_;
    const world = session.world;
    const roomIndex = Math.max(0, Math.min(world.rooms.length - 1, this.init_.roomIndex));
    this.init_.roomIndex = roomIndex;
    this.room = world.rooms[roomIndex];
    const pal = world.visualStyle.palette;
    this.parsed = parseRoom(this.room, world.enemies.length, world.npcs?.length ?? 0);
    const P = this.parsed;
    this.worldW = P.cols * TILE;
    this.worldH = P.rows * TILE;

    // Cameras: zoomed world camera + HUD camera (400×224 logical).
    const cam = this.cameras.main;
    cam.setZoom(WORLD_ZOOM).setBounds(0, 0, this.worldW, this.worldH).setRoundPixels(true);
    this.hudLayer = new HudLayer(this, VIEW_W, VIEW_H);

    // Backdrop (scrollFactor 0, sized to what the zoomed camera shows).
    const vw = VIEW_W / WORLD_ZOOM;
    const vh = VIEW_H / WORLD_ZOOM;
    this.backdrop = new BackdropView(this, world.visualStyle.backdrop, pal, { x: VIEW_W / 2 - vw / 2, y: VIEW_H / 2 - vh / 2, w: vw, h: vh });

    // Physics world: walls left/right, open top and bottom (falling = death).
    this.physics.world.gravity.y = GRAVITY;
    this.physics.world.setBounds(0, -4000, this.worldW, this.worldH + 4400, true, true, false, false);

    this.buildTiles();
    this.buildProps();

    // Player
    const cp = this.run.checkpoint;
    const start = cp && cp.roomIndex === roomIndex ? { x: cp.x, y: cp.y } : P.spawns.player;
    this.player = this.makeEntity(session.character, "player", start.x, start.y);
    this.playerZone = this.player.body as ArcadeZone;
    cam.startFollow(this.playerZone, true, 1, 1);
    cam.centerOn(start.x, start.y);

    this.physics.add.overlap(this.playerZone, this.spikes, () => this.onSpikes());
    this.physics.add.overlap(this.playerZone, this.exitsGroup, () => this.onExitTile());
    this.physics.add.overlap(this.playerZone, this.checkpointGroup, (_p, flag) => this.onCheckpoint(flag as Phaser.GameObjects.Zone));

    this.buildNpcs();

    // UI
    this.hud = new Hud(this.hudLayer, session.character, world, this.room, this.run.combat, this.player, () => this.run.selectedSlot);
    this.dialogue = new DialogueBox(this.hudLayer, () => this.time.now);

    // Input
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      W: "W", A: "A", S: "S", D: "D", UP: "UP", LEFT: "LEFT", DOWN: "DOWN", RIGHT: "RIGHT", SPACE: "SPACE", ENTER: "ENTER",
    }) as typeof this.keys;
    kb.addCapture("SPACE,UP,DOWN,LEFT,RIGHT");
    kb.on("keydown", this.onKeyDown, this);
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.mouse?.disableContextMenu();

    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncVisuals, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.onShutdown, this);

    // Combat
    const combat = this.run.combat;
    combat.onHit = (hit) => {
      if (hit.target === this.player && hit.damage > 0 && this.flow === "play") this.cameras.main.shake(80, 0.004);
    };
    try {
      combat.initRoom(this.makeContext());
      this.run.roomActive = true;
    } catch (err) {
      console.error("[engine] combat.initRoom failed", err);
    }

    roomBanner(this.hudLayer, this.room.name);
    if (!this.run.introShown.has(roomIndex)) {
      this.run.introShown.add(roomIndex);
      void this.showDialogue(session.dialogue?.roomIntro?.[roomIndex] ?? []);
    }
  }

  private buildTiles() {
    const P = this.parsed;
    const world = this.init_.session.world;
    const pal = world.visualStyle.palette;

    this.solidGrid = Array.from({ length: P.rows }, (_, r) => Array.from({ length: P.cols }, (_, c) => P.at(c, r) === "#" || P.at(c, r) === "X"));

    const key = `room-${world.id}-${this.room.id}-${this.init_.roomIndex}-${P.cols}`;
    this.add.image(0, 0, roomTexture(this, key, this.room.layout, pal)).setOrigin(0, 0).setDepth(DEPTH.tiles);

    this.solids = this.physics.add.staticGroup();
    this.oneWays = this.physics.add.staticGroup();
    this.spikes = this.physics.add.staticGroup();
    this.exitsGroup = this.physics.add.staticGroup();
    this.checkpointGroup = this.physics.add.staticGroup();

    for (const r of P.solidRects) this.solids.add(this.add.zone((r.c + r.w / 2) * TILE, (r.r + r.h / 2) * TILE, r.w * TILE, r.h * TILE));

    for (const b of P.destructibles) {
      const z = this.add.zone(b.c * TILE + TILE / 2, b.r * TILE + TILE / 2, TILE, TILE) as Phaser.GameObjects.Zone & { img: Phaser.GameObjects.Image };
      z.img = this.add.image(b.c * TILE, b.r * TILE, blockTexture(this, pal, b.c * 7 + b.r)).setOrigin(0, 0).setDepth(DEPTH.block);
      this.solids.add(z);
      this.blocks.set(`${b.c},${b.r}`, z);
    }

    for (const r of P.oneWayRuns) {
      const z = this.add.zone((r.c + r.w / 2) * TILE, r.r * TILE + 4, r.w * TILE, 8);
      this.oneWays.add(z);
      const body = z.body as Phaser.Physics.Arcade.StaticBody;
      body.checkCollision.down = false;
      body.checkCollision.left = false;
      body.checkCollision.right = false;
    }

    for (const r of P.spikeRuns) {
      const z = this.add.zone((r.c + r.w / 2) * TILE, r.r * TILE + 12, r.w * TILE - 4, 8);
      this.spikes.add(z);
    }

    for (const e of P.exits) {
      this.add.image(e.c * TILE, (e.r + 1) * TILE, exitTexture(this, pal)).setOrigin(0, 1).setDepth(DEPTH.marker);
      this.exitsGroup.add(this.add.zone(e.c * TILE + TILE / 2, e.r * TILE, TILE - 4, TILE * 2 - 4));
    }

    const cp = this.run.checkpoint;
    for (const k of P.checkpoints) {
      const x = k.c * TILE + TILE / 2;
      const y = (k.r + 1) * TILE;
      const on = !!cp && cp.roomIndex === this.init_.roomIndex && cp.x === x && cp.y === y;
      const img = this.add.image(k.c * TILE, y, flagTexture(this, pal, on)).setOrigin(0, 1).setDepth(DEPTH.marker);
      const z = this.add.zone(x, k.r * TILE, TILE, TILE * 2);
      z.setData({ x, y, img });
      this.checkpointGroup.add(z);
    }
  }

  private buildProps() {
    const world = this.init_.session.world;
    const defs = new Map((world.props ?? []).map((p) => [p.id, p]));
    for (const place of this.room.props ?? []) {
      const def = defs.get(place.prop);
      if (!def) continue;
      const key = `prop-${world.id}-${def.id}`;
      if (!this.textures.exists(key)) {
        const tex = this.textures.createCanvas(key, Math.max(1, Math.ceil(def.size.w)), Math.max(1, Math.ceil(def.size.h)));
        if (!tex) continue;
        tex.context.putImageData(rasterShapes(def.shapes, def.size.w, def.size.h), 0, 0);
        tex.refresh();
      }
      this.add
        .image(place.col * TILE, (place.row + 1) * TILE, key)
        .setOrigin(0, 1)
        .setScale(RIG_SCALE)
        .setDepth(def.layer === "front" ? DEPTH.front : DEPTH.prop);
    }
  }

  private buildNpcs() {
    const defs = this.init_.session.world.npcs ?? [];
    for (const n of this.parsed.npcs) {
      const def = defs[n.npcIndex];
      if (!def) continue;
      const view = new RigView(this, def.rig, DEPTH.npc);
      view.place(n.x, n.y, 1);
      this.npcs.push({ def, view, x: n.x, y: n.y, talked: false });
    }
  }

  // ------------------------------------------------------------------ entities

  private makeEntity(def: CharacterDef | EnemyDef | BossDef, kind: RuntimeEntity["kind"], x: number, y: number): RuntimeEntity {
    const cb = def.collisionBox;
    const zone = this.add.zone(x, y - cb.h / 2, cb.w, cb.h);
    this.physics.add.existing(zone);
    const body = zone.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    const faceRight = kind === "player" ? true : !this.player || this.player.body.x > x;
    const stats = { ...def.stats };
    const e: RuntimeEntity = {
      id: kind === "player" ? "player" : `${kind}-${this.init_.roomIndex}-${this.entityCounter++}`,
      kind,
      team: kind === "player" ? "player" : "enemy",
      def,
      name: def.name,
      body: zone as ArcadeZone,
      stats,
      tags: [...def.tags],
      maxHP: stats.HP,
      hp: stats.HP,
      alive: true,
      facing: faceRight ? 1 : -1,
      aimAngle: faceRight ? 0 : Math.PI,
      invulnUntil: 0,
      lastHitAt: -1e9,
      stunUntil: 0,
      cooldownReadyAt: [0, 0, 0, 0],
      dash: null,
      flightUntil: 0,
      superJumpMult: 1,
      anim: "idle",
      attackAnim: null,
      hurtUntil: 0,
    };
    this.colliders.set(e, [this.physics.add.collider(zone, this.solids), this.physics.add.collider(zone, this.oneWays)]);
    const depth = kind === "player" ? DEPTH.player : kind === "boss" ? DEPTH.boss : DEPTH.enemy;
    const view = new RigView(this, def.rig, depth);
    this.views.set(e, view);
    view.sync(e, this.time.now);
    return e;
  }

  private despawnEntity(e: RuntimeEntity, animate: boolean) {
    e.alive = false;
    const body = e.body.body;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }
    for (const c of this.colliders.get(e) ?? []) c.destroy();
    this.colliders.delete(e);
    const view = this.views.get(e);
    if (!view) return;
    this.views.delete(e);
    if (animate) {
      this.dyingViews.add(view);
      view.playDeath(e.facing, () => {
        this.dyingViews.delete(view);
        view.destroy();
      });
    } else view.destroy();
  }

  // ------------------------------------------------------------------ EngineContext

  private makeContext(): EngineContext {
    const scene = this;
    const token = this.token;
    const live = () => token === scene.token;
    return {
      scene: this,
      session: this.init_.session,
      room: this.room,
      roomIndex: this.init_.roomIndex,
      spawns: this.parsed.spawns,
      player: this.player,
      solids: this.solids,
      oneWays: this.oneWays,
      now: () => this.time.now,
      pointerWorld: () => this.pointerWorld(),
      isSolidAt: (x, y) => this.isSolidAt(x, y),
      breakTilesIn: (rect) => {
        if (live()) this.breakTilesIn(rect);
      },
      spawnEntity: (def, kind, x, y) => this.makeEntity(def, kind, x, y),
      despawnEntity: (e, animate) => {
        if (live()) this.despawnEntity(e, animate);
      },
      addToHud: (obj) => {
        this.hudLayer.add(obj);
      },
      showDialogue: (lines) => (live() ? this.showDialogue(lines) : Promise.resolve()),
      get paused() {
        return scene.isPaused();
      },
      onPlayerDied: () => {
        if (live()) this.onPlayerDied();
      },
      onBossDefeated: () => {
        if (live()) this.onBossDefeated();
      },
    };
  }

  private pointerWorld(): { x: number; y: number } {
    const v = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    return { x: v.x, y: v.y };
  }

  private isSolidAt(x: number, y: number): boolean {
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    if (c < 0 || c >= this.parsed.cols) return true;
    if (r < 0 || r >= this.parsed.rows) return false;
    return this.solidGrid[r][c];
  }

  private breakTilesIn(rect: Phaser.Geom.Rectangle) {
    if (!this.blocks.size) return;
    const c0 = Math.max(0, Math.floor(rect.left / TILE));
    const c1 = Math.min(this.parsed.cols - 1, Math.floor((rect.right - 0.001) / TILE));
    const r0 = Math.max(0, Math.floor(rect.top / TILE));
    const r1 = Math.min(this.parsed.rows - 1, Math.floor((rect.bottom - 0.001) / TILE));
    const accent = parseInt(this.init_.session.world.visualStyle.palette.accent.slice(1), 16);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = `${c},${r}`;
        const z = this.blocks.get(k);
        if (!z) continue;
        this.blocks.delete(k);
        this.solidGrid[r][c] = false;
        z.img.destroy();
        this.solids.remove(z, true, true);
        for (let i = 0; i < 6; i++) {
          const bit = this.add.rectangle(c * TILE + 4 + (i % 3) * 4, r * TILE + 4 + Math.floor(i / 3) * 8, 3, 3, accent).setDepth(DEPTH.fx);
          this.tweens.add({
            targets: bit,
            x: bit.x + (i % 3 - 1) * 14 + (Math.random() - 0.5) * 6,
            y: bit.y + 20 + Math.random() * 10,
            alpha: 0,
            angle: 180,
            duration: 450,
            onComplete: () => bit.destroy(),
          });
        }
      }
    }
  }

  private showDialogue(lines: DialogueLine[]): Promise<void> {
    return this.dialogue.show(lines);
  }

  private isPaused(): boolean {
    return this.flow !== "play" || this.dialogue.active;
  }

  // ------------------------------------------------------------------ flow

  private onPlayerDied() {
    if (this.flow !== "play") return;
    this.flow = "dead";
    const p = this.player;
    p.alive = false;
    p.hp = 0;
    p.dash = null;
    this.playerZone.body.setVelocity(0, 0);
    this.views.get(p)?.playDeath(p.facing);
    const token = this.token;
    void this.showDialogue(this.init_.session.dialogue?.playerDefeated ?? []).then(() => {
      if (token !== this.token || this.flow !== "dead") return;
      this.openMenu("DEFEATED", "#ff5050", this.room.name, [
        { id: "restart", label: "[R] Restart room", run: () => this.restartRoom() },
        { id: "back", label: "[Esc] Back to select", run: () => this.exitGame("died") },
      ]);
    });
  }

  private onBossDefeated() {
    if (this.flow !== "play") return;
    this.flow = "won";
    this.cartridgeComplete(this.init_.session.dialogue?.bossDefeated ?? []);
  }

  private cartridgeComplete(lines: DialogueLine[]) {
    const token = this.token;
    void this.showDialogue(lines).then(() => {
      if (token !== this.token || this.flow !== "won") return;
      this.openMenu("CARTRIDGE COMPLETE", "#ffe04a", "Press any key", [{ id: "back", label: "Back to select", run: () => this.exitGame("won") }]);
      this.menuActions.any = () => this.exitGame("won");
    });
  }

  private openMenu(title: string, color: string, subtitle: string, options: { id: string; label: string; run: () => void }[]) {
    this.menu?.destroy();
    this.menu = new Menu(this.hudLayer, title, color, subtitle, options);
    this.menuShownAt = this.time.now;
    this.menuActions = Object.fromEntries(options.map((o) => [o.id, o.run]));
  }

  private endCombatRoom() {
    if (!this.run.roomActive) return;
    this.run.roomActive = false;
    try {
      this.run.combat.endRoom();
    } catch (err) {
      console.error("[engine] combat.endRoom failed", err);
    }
  }

  private restartRoom() {
    this.goToRoom(this.init_.roomIndex, true);
  }

  private goToRoom(index: number, keepCheckpoint: boolean) {
    if (this.flow === "exited") return;
    this.flow = "exited"; // stop everything until the restart happens
    this.endCombatRoom();
    if (!keepCheckpoint) this.run.checkpoint = null;
    this.scene.restart({ ...this.init_, roomIndex: index, run: this.run });
  }

  private exitGame(outcome: Outcome) {
    if (this.run.exited) return;
    this.run.exited = true;
    this.flow = "exited";
    this.endCombatRoom();
    try {
      this.run.combat.music.stop();
    } catch (err) {
      console.error("[engine] music.stop failed", err);
    }
    this.physics.world.pause();
    this.init_.onExit({ outcome });
  }

  private onExitTile() {
    if (this.flow !== "play" || this.dialogue.active || !this.player.alive) return;
    const rooms = this.init_.session.world.rooms;
    const to = this.room.exit.toRoom;
    if (to === "END") {
      this.flow = "won";
      this.cartridgeComplete([]);
      return;
    }
    let idx = rooms.findIndex((r) => r.id === to);
    if (idx < 0) idx = this.init_.roomIndex + 1;
    if (idx >= rooms.length) {
      this.flow = "won";
      this.cartridgeComplete([]);
      return;
    }
    this.goToRoom(idx, false);
  }

  private onCheckpoint(zone: Phaser.GameObjects.Zone) {
    if (this.flow !== "play" || !this.player.alive) return;
    const x = zone.getData("x") as number;
    const y = zone.getData("y") as number;
    const cp = this.run.checkpoint;
    if (cp && cp.roomIndex === this.init_.roomIndex && cp.x === x && cp.y === y) return;
    // deactivate previous flags in this room
    for (const z of this.checkpointGroup.getChildren()) {
      const img = (z as Phaser.GameObjects.Zone).getData("img") as Phaser.GameObjects.Image;
      img.setTexture(flagTexture(this, this.init_.session.world.visualStyle.palette, z === zone));
    }
    this.run.checkpoint = { roomIndex: this.init_.roomIndex, x, y };
    const t = this.add
      .text(x, y - 40, "CHECKPOINT", { fontFamily: "monospace", fontSize: "8px", color: "#ffe04a", resolution: 4 })
      .setOrigin(0.5)
      .setDepth(DEPTH.fx);
    this.tweens.add({ targets: t, y: y - 52, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  private onSpikes() {
    const p = this.player;
    if (this.isPaused() || !p.alive || this.time.now < p.invulnUntil) return;
    const vx = this.playerZone.body.velocity.x;
    const kx = (vx > 0 ? -1 : vx < 0 ? 1 : -p.facing) * 120;
    try {
      this.run.combat.hurt(p, Math.ceil(p.maxHP * 0.2), kx, -320);
    } catch (err) {
      console.error("[engine] combat.hurt failed", err);
    }
  }

  // ------------------------------------------------------------------ input

  private onKeyDown(ev: KeyboardEvent) {
    if (ev.repeat) return;
    const code = ev.code;
    if (this.flow === "exited") return;

    if (this.menu) {
      if (this.time.now - this.menuShownAt < 300) return;
      if (code === "KeyR" && this.menuActions.restart) return this.menuActions.restart();
      if (code === "Escape" && this.menuActions.back) return this.menuActions.back();
      if (this.menuActions.any) return this.menuActions.any();
      return;
    }
    if (code === "Escape") {
      if (this.flow === "dead") return this.exitGame("died");
      if (this.flow === "won") return this.exitGame("won");
      return this.exitGame("quit");
    }
    if (code === "KeyM") {
      this.toggleMute();
      return;
    }
    if (code === "KeyF") {
      this.toggleFullscreen();
      return;
    }
    const slot = ({ Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4 } as Record<string, number | undefined>)[code];
    if (slot) this.run.selectedSlot = slot as 1 | 2 | 3 | 4;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.flow === "exited") return;
    const h = this.hudLayer.pointer(pointer);
    if (this.menu) {
      if (this.time.now - this.menuShownAt < 300) return;
      const id = this.menu.hit(h.x, h.y);
      if (id && this.menuActions[id]) this.menuActions[id]();
      return;
    }
    if (this.hud.hitMute(h.x, h.y)) {
      this.toggleMute();
      return;
    }
    if (this.hud.hitFullscreen(h.x, h.y)) {
      this.toggleFullscreen();
      return;
    }
    if (this.dialogue.active) {
      this.dialogue.advance();
      return;
    }
    if (this.isPaused() || !this.player.alive || !pointer.leftButtonDown()) return;
    let res: AbilityUseResult = "unsupported";
    try {
      res = this.run.combat.useAbility(this.run.selectedSlot);
    } catch (err) {
      console.error("[engine] combat.useAbility failed", err);
    }
    if (res === "unsupported") this.hud.flash(`Slot ${this.run.selectedSlot}: not supported yet`, this.time.now);
  }

  /** F key / HUD button. Browsers only allow this from a user gesture, which both are. */
  private toggleFullscreen() {
    try {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    } catch (err) {
      console.error("[engine] fullscreen failed", err);
    }
  }

  private toggleMute() {
    try {
      this.run.combat.music.toggleMute();
    } catch (err) {
      console.error("[engine] toggleMute failed", err);
    }
  }

  // ------------------------------------------------------------------ frame

  update(_time: number, delta: number) {
    const now = this.time.now;
    let space = Phaser.Input.Keyboard.JustDown(this.keys.SPACE);
    const enter = Phaser.Input.Keyboard.JustDown(this.keys.ENTER);
    if (this.dialogue.active && (space || enter)) {
      this.dialogue.advance();
      space = false;
    }
    this.dialogue.update(now);

    const paused = this.isPaused();
    const world = this.physics.world;
    if (paused && !world.isPaused) world.pause();
    else if (!paused && world.isPaused) world.resume();

    if (!paused) {
      this.updatePlayer(now, space);
      try {
        this.run.combat.update(now, delta);
      } catch (err) {
        if (!this.updateErrorLogged) console.error("[engine] combat.update failed", err);
        this.updateErrorLogged = true;
      }
      if (this.flow === "play" && this.player.alive && this.playerZone.body.top > this.worldH + 8) {
        this.player.hp = 0;
        this.onPlayerDied();
      }
      this.updateNpcs();
    }

    for (const e of this.views.keys()) this.updateAnim(e, now);
    this.backdrop.update(this.cameras.main.scrollX);
    this.hud.update(now);
  }

  private updatePlayer(now: number, space: boolean) {
    const p = this.player;
    if (!p.alive) return;
    const body = this.playerZone.body;
    const k = this.keys;
    const { speed, jumpStrength } = this.init_.session.character.movement;

    const pw = this.pointerWorld();
    p.aimAngle = Math.atan2(pw.y - body.center.y, pw.x - body.center.x);
    p.facing = Math.cos(p.aimAngle) >= 0 ? 1 : -1;

    const grounded = body.blocked.down || body.touching.down;
    if (grounded) this.lastGrounded = now;
    const dirX = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const dirY = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);

    if (p.dash) {
      if (now < p.dash.until) {
        body.setAllowGravity(false);
        body.setVelocity(p.dash.vx, p.dash.vy);
        return;
      }
      p.dash = null;
      body.setVelocity(0, 0);
    }
    const stunned = now < p.stunUntil;
    if (now < p.flightUntil) {
      body.setAllowGravity(false);
      if (!stunned) {
        const len = dirX && dirY ? Math.SQRT1_2 : 1;
        body.setVelocity(dirX * speed * len, dirY * speed * len);
      }
      return;
    }
    body.setAllowGravity(true);
    if (stunned) return;
    body.setVelocityX(dirX * speed);
    if (space && now - this.lastGrounded < 100) {
      body.setVelocityY(-jumpVelocity(jumpStrength, p.superJumpMult || 1)); // normalised: see core/jump.ts
      p.superJumpMult = 1;
      this.lastGrounded = -1e9;
    }
  }

  private updateAnim(e: RuntimeEntity, now: number) {
    if (!e.alive) {
      e.anim = "death";
      return;
    }
    const b = e.body.body;
    if (!b) return;
    const vx = b.velocity.x;
    if (e.kind !== "player" && Math.abs(vx) > 8 && !(e.attackAnim && now < e.attackAnim.until)) e.facing = vx > 0 ? 1 : -1;
    if (this.isPaused()) return;
    if (e.attackAnim && now < e.attackAnim.until) e.anim = "attack";
    else if (now < e.hurtUntil) e.anim = "hurt";
    else if (!(b.blocked.down || b.touching.down) && b.allowGravity) e.anim = "jump";
    else if (Math.abs(vx) > 8 || (!b.allowGravity && Math.abs(b.velocity.y) > 8)) e.anim = "run";
    else e.anim = "idle";
  }

  private updateNpcs() {
    if (!this.npcs.length || this.flow !== "play") return;
    const b = this.playerZone.body;
    for (const n of this.npcs) {
      if (n.talked) continue;
      if (Math.abs(b.center.x - n.x) <= 32 && Math.abs(b.bottom - n.y) <= 40) {
        n.talked = true;
        void this.showDialogue(n.def.lines);
      }
    }
  }

  /** After physics has moved bodies: place rigs over them and redraw changed poses. */
  private syncVisuals() {
    const now = this.time.now;
    for (const [e, view] of this.views) view.sync(e, now);
    if (this.npcs.length) {
      const px = this.playerZone.body.center.x;
      for (const n of this.npcs) {
        n.view.place(n.x, n.y, px >= n.x ? 1 : -1);
        n.view.setPose({ anim: "idle", t: now });
      }
    }
  }

  private onShutdown() {
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncVisuals, this);
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.onShutdown, this);
    try {
      this.input?.keyboard?.off("keydown", this.onKeyDown, this);
      this.input?.off("pointerdown", this.onPointerDown, this);
    } catch {
      /* input plugin already torn down (game destroyed) */
    }
    // Game destroyed from outside (not one of our restarts): tear combat down.
    if (this.run.roomActive) {
      this.endCombatRoom();
      try {
        this.run.combat.music.stop();
      } catch {
        /* ignore */
      }
    }
    this.run.combat.onHit = undefined;
    // Display list is (being) destroyed by Phaser; just free the per-entity textures.
    for (const v of this.views.values()) v.releaseTexture();
    for (const v of this.dyingViews) v.releaseTexture();
    for (const n of this.npcs) n.view.releaseTexture();
    this.views.clear();
    this.dyingViews.clear();
    this.npcs = [];
  }
}
