/**
 * Per-room combat state: entities, hits (always via resolveHit), projectiles,
 * beams, regen, deaths. One instance per initRoom, disposed in endRoom.
 *
 * No Arcade overlaps/colliders are used for combat: all hit tests are manual
 * geometry on live entities, so nothing can fire on a despawned body.
 */
import Phaser from "phaser";
import { resolveHit, regenPerSecond, REGEN_DELAY_S } from "../../shared/combat";
import type { AttackTag, DamageType } from "../../shared/schema";
import { TILE } from "../../shared/schema";
import type { EngineContext, HitInfo, RuntimeEntity } from "../types";
import { Fx } from "./fx";
import { centerOf, distPointRect, norm, rectOf, segmentHitsRect, type Rect } from "./geom";

/** Anything that can hit: an Ability, an EnemyAttack, a boss move. */
export type AttackSpec = {
  damageType: DamageType;
  ratio: number;
  attackTags: readonly AttackTag[];
  knockback: number; // px/s, negative pulls toward the attacker / along -dir
};

export type HitOutcome = "hit" | "blocked" | "ignored";

type Projectile = {
  owner: RuntimeEntity;
  attack: AttackSpec;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  travelled: number;
  range: number;
  radius: number;
  color: number;
  fadeUntil: number; // >0: stopped (INFINITY), fading out
};

type Beam = {
  owner: RuntimeEntity;
  attack: AttackSpec;
  angle: number;
  length: number;
  width: number;
  start: number;
  until: number;
  color: number;
  hit: Set<string>;
};

/** Hits along a moving owner (dash), once per target. */
type Sweep = { owner: RuntimeEntity; attack: AttackSpec; until: number; hit: Set<string> };

export interface Brain {
  readonly e: RuntimeEntity;
  update(now: number, dt: number): void;
}

const PLAYER_IFRAMES_MS = 500;
/** Enemies wake within ~1.5 visible widths (world camera is zoomed, so ask it). */
function activateRange(ctx: EngineContext): number {
  const cam = ctx.scene.cameras.main;
  const view = cam.width / (cam.zoom || 1);
  return Number.isFinite(view) && view > 0 ? 1.5 * view : 600;
}

export class CombatWorld {
  readonly fx: Fx;
  readonly npcs: RuntimeEntity[] = [];
  readonly brains = new Map<string, Brain>();
  bossEntity: RuntimeEntity | null = null;
  bossBarVisible = false;
  onHit?: (hit: HitInfo) => void;

  private projectiles: Projectile[] = [];
  private beams: Beam[] = [];
  private sweeps: Sweep[] = [];
  private regenAcc = new Map<string, number>();
  private pending: (() => void)[] = [];
  private playerDeathQueued = false;
  private bossDeathQueued = false;
  disposed = false;

  constructor(readonly ctx: EngineContext) {
    this.fx = new Fx(ctx.scene, (o) => ctx.addToHud(o));
  }

  get player(): RuntimeEntity {
    return this.ctx.player;
  }

  now(): number {
    return this.ctx.now();
  }

  /** Live opponents of `e`. */
  opponents(e: RuntimeEntity): RuntimeEntity[] {
    if (e.team === "player") return this.npcs.filter((n) => n.alive);
    return this.player.alive ? [this.player] : [];
  }

  isActive(e: RuntimeEntity): boolean {
    return this.player.alive && Math.abs(centerOf(e).x - centerOf(this.player).x) < activateRange(this.ctx);
  }

  addNpc(e: RuntimeEntity, brain: Brain | null) {
    this.npcs.push(e);
    if (brain) this.brains.set(e.id, brain);
  }

  // ------------------------------------------------------------------ hits

  /**
   * The one place entity-vs-entity damage happens. Goes through resolveHit,
   * respects i-frames, applies knockback × knockbackScale, shows the number.
   * (dirX, dirY) is the push direction (attacker → target); it is normalised.
   */
  applyHit(attacker: RuntimeEntity, attack: AttackSpec, target: RuntimeEntity, dirX: number, dirY: number): HitOutcome {
    if (this.disposed || !target.alive) return "ignored";
    const now = this.now();
    if (now < target.invulnUntil) return "ignored";

    const res = resolveHit(attacker, attack, target);
    const info: HitInfo = { attacker, target, damage: res.damage, blocked: res.blocked, reason: res.reason };

    if (res.blocked) {
      this.fx.immune(target, now);
    } else {
      target.hp = Math.max(0, target.hp - res.damage);
      target.lastHitAt = now;
      target.hurtUntil = now + 140;
      this.regenAcc.delete(target.id);
      this.fx.damage(target, res.damage, now);
      if (target.team === "player") target.invulnUntil = now + PLAYER_IFRAMES_MS;
    }

    const kb = attack.knockback * res.knockbackScale;
    if (kb !== 0 && target.alive) this.knock(target, dirX, dirY, kb);

    this.onHit?.(info);
    if (target.hp <= 0) this.kill(target);
    return res.blocked ? "blocked" : "hit";
  }

  /** Raw damage that bypasses the formula (spikes). */
  rawHurt(target: RuntimeEntity, amount: number, kx: number, ky: number) {
    if (this.disposed || !target.alive) return;
    const now = this.now();
    if (now < target.invulnUntil) return;
    const dmg = Math.max(0, amount);
    target.hp = Math.max(0, target.hp - dmg);
    target.lastHitAt = now;
    target.hurtUntil = now + 140;
    target.invulnUntil = now + PLAYER_IFRAMES_MS;
    this.regenAcc.delete(target.id);
    this.fx.damage(target, dmg, now);
    if (kx !== 0 || ky !== 0) {
      target.body.body.setVelocity(kx, ky);
      target.stunUntil = now + 200;
    }
    this.onHit?.({ attacker: null, target, damage: dmg, blocked: false });
    if (target.hp <= 0) this.kill(target);
  }

  private knock(target: RuntimeEntity, dx: number, dy: number, kb: number) {
    const d = norm(dx, dy);
    let vx = d.x * kb;
    let vy = d.y * kb;
    // Outward knockback pops the target up a bit so it leaves the ground.
    if (kb > 0) vy = Math.min(vy, -Math.abs(kb) * 0.35);
    const body = target.body.body;
    if (!body) return;
    body.setVelocity(vx, vy);
    target.stunUntil = this.now() + 220;
    // Knockback cancels an ongoing dash so it does not override it.
    if (target.dash) target.dash = null;
  }

  kill(e: RuntimeEntity) {
    if (!e.alive) return;
    e.alive = false;
    e.hp = 0;
    if (e.kind === "player") {
      if (!this.playerDeathQueued) {
        this.playerDeathQueued = true;
        this.pending.push(() => this.ctx.onPlayerDied());
      }
      return;
    }
    const i = this.npcs.indexOf(e);
    if (i >= 0) this.npcs.splice(i, 1);
    this.brains.delete(e.id);
    this.ctx.despawnEntity(e, true);
    if (e.kind === "boss" && !this.bossDeathQueued) {
      this.bossDeathQueued = true;
      this.pending.push(() => this.ctx.onBossDefeated());
    }
  }

  /** Room-flow callbacks run after the current frame's combat work finishes. */
  flush() {
    const p = this.pending;
    this.pending = [];
    for (const fn of p) fn();
  }

  // ------------------------------------------------------------ attackers

  /** One-shot hitbox (melee / aoe rect). Breaks tiles. Returns targets touched. */
  hitRect(owner: RuntimeEntity, attack: AttackSpec, r: Rect, from = centerOf(owner)): number {
    this.ctx.breakTilesIn(new Phaser.Geom.Rectangle(r.x, r.y, r.w, r.h));
    let n = 0;
    for (const t of this.opponents(owner)) {
      const tr = rectOf(t);
      if (tr.x < r.x + r.w && tr.x + tr.w > r.x && tr.y < r.y + r.h && tr.y + tr.h > r.y) {
        const c = centerOf(t);
        this.applyHit(owner, attack, t, c.x - from.x, c.y - from.y);
        n++;
      }
    }
    return n;
  }

  /** Circle around (cx, cy). Negative knockback pulls toward the centre. */
  hitCircle(owner: RuntimeEntity, attack: AttackSpec, cx: number, cy: number, radius: number): number {
    this.ctx.breakTilesIn(new Phaser.Geom.Rectangle(cx - radius, cy - radius, radius * 2, radius * 2));
    let n = 0;
    for (const t of this.opponents(owner)) {
      if (distPointRect(cx, cy, rectOf(t)) <= radius) {
        const c = centerOf(t);
        this.applyHit(owner, attack, t, c.x - cx, c.y - cy);
        n++;
      }
    }
    return n;
  }

  fireProjectile(o: {
    owner: RuntimeEntity;
    attack: AttackSpec;
    x: number;
    y: number;
    angle: number;
    speed: number;
    range: number;
    radius?: number;
    color: number;
  }) {
    this.projectiles.push({
      owner: o.owner,
      attack: o.attack,
      x: o.x,
      y: o.y,
      vx: Math.cos(o.angle) * o.speed,
      vy: Math.sin(o.angle) * o.speed,
      speed: o.speed,
      travelled: 0,
      range: Math.max(16, o.range),
      radius: o.radius ?? 3,
      color: o.color,
      fadeUntil: 0,
    });
  }

  /** Long thin hitbox from the owner's centre; each target is hit once per beam. */
  fireBeam(o: { owner: RuntimeEntity; attack: AttackSpec; angle: number; length: number; width: number; durationMs: number; color: number }) {
    const now = this.now();
    const beam: Beam = {
      owner: o.owner,
      attack: o.attack,
      angle: o.angle,
      length: Math.max(16, o.length),
      width: o.width,
      start: now,
      until: now + Math.max(150, o.durationMs),
      color: o.color,
      hit: new Set(),
    };
    this.beams.push(beam);
    // Break tiles along the beam once, at fire time.
    const c = centerOf(o.owner);
    const step = 12;
    for (let d = 0; d <= beam.length; d += step) {
      const x = c.x + Math.cos(o.angle) * d;
      const y = c.y + Math.sin(o.angle) * d;
      this.ctx.breakTilesIn(new Phaser.Geom.Rectangle(x - 6, y - 6, 12, 12));
    }
    this.tickBeam(beam);
  }

  sweep(owner: RuntimeEntity, attack: AttackSpec, untilMs: number) {
    this.sweeps.push({ owner, attack, until: untilMs, hit: new Set() });
  }

  // ---------------------------------------------------------------- update

  update(now: number, dt: number) {
    // AI (copy: brains can spawn/kill entities).
    for (const brain of [...this.brains.values()]) {
      if (this.disposed) return;
      if (brain.e.alive) brain.update(now, dt);
    }
    this.updateProjectiles(dt, now);
    for (const b of this.beams) this.tickBeam(b);
    this.beams = this.beams.filter((b) => now < b.until && b.owner.alive);
    this.updateSweeps(now);
    this.regen(dt);
    this.fx.update(now);
    this.draw(now);
  }

  private tickBeam(b: Beam) {
    if (!b.owner.alive) return;
    const c = centerOf(b.owner);
    const x2 = c.x + Math.cos(b.angle) * b.length;
    const y2 = c.y + Math.sin(b.angle) * b.length;
    for (const t of this.opponents(b.owner)) {
      if (b.hit.has(t.id)) continue;
      if (segmentHitsRect(c.x, c.y, x2, y2, b.width, rectOf(t))) {
        const out = this.applyHit(b.owner, b.attack, t, Math.cos(b.angle), Math.sin(b.angle));
        if (out !== "ignored") b.hit.add(t.id);
      }
    }
  }

  private updateSweeps(now: number) {
    this.sweeps = this.sweeps.filter((s) => now < s.until && s.owner.alive);
    for (const s of this.sweeps) {
      const r = rectOf(s.owner);
      const from = centerOf(s.owner);
      for (const t of this.opponents(s.owner)) {
        if (s.hit.has(t.id)) continue;
        const tr = rectOf(t);
        if (tr.x < r.x + r.w + 2 && tr.x + tr.w > r.x - 2 && tr.y < r.y + r.h && tr.y + tr.h > r.y) {
          const c = centerOf(t);
          if (this.applyHit(s.owner, s.attack, t, c.x - from.x, c.y - from.y) !== "ignored") s.hit.add(t.id);
        }
      }
    }
  }

  private updateProjectiles(dt: number, now: number) {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      if (this.disposed) return;
      if (p.fadeUntil > 0) {
        if (now < p.fadeUntil) keep.push(p);
        continue;
      }
      if (this.stepProjectile(p, dt, now)) keep.push(p);
    }
    this.projectiles = keep;
  }

  /** Returns false when the projectile is gone. Sub-steps so fast shots don't tunnel. */
  private stepProjectile(p: Projectile, dt: number, now: number): boolean {
    const dist = p.speed * dt;
    const steps = Math.max(1, Math.ceil(dist / 4));
    const sx = (p.vx * dt) / steps;
    const sy = (p.vy * dt) / steps;
    const sd = dist / steps;
    // By team, so shots from an owner that died mid-flight still work.
    const targets = this.opponentsOfTeam(p.owner.team);
    for (let i = 0; i < steps; i++) {
      p.x += sx;
      p.y += sy;
      p.travelled += sd;
      if (p.travelled >= p.range) return false;
      if (this.ctx.isSolidAt(p.x, p.y)) {
        this.ctx.breakTilesIn(new Phaser.Geom.Rectangle(p.x - 3, p.y - 3, 6, 6));
        return false;
      }
      for (const t of targets) {
        if (!t.alive) continue;
        const r = rectOf(t);
        const d = distPointRect(p.x, p.y, r);
        // INFINITY: stop and fade 1 tile away (unless the shot bypasses it).
        if (d <= TILE && resolveHit(p.owner, p.attack, t).reason === "INFINITY") {
          this.applyHit(p.owner, p.attack, t, p.vx, p.vy); // shows IMMUNE
          p.fadeUntil = now + 220;
          return true;
        }
        if (d <= p.radius) {
          const out = this.applyHit(p.owner, p.attack, t, p.vx, p.vy);
          if (out !== "ignored") return false; // i-frames: shot passes through
        }
      }
    }
    return true;
  }

  private opponentsOfTeam(team: "player" | "enemy"): RuntimeEntity[] {
    if (team === "player") return this.npcs.filter((n) => n.alive);
    return this.player.alive ? [this.player] : [];
  }

  /** REGENERATION: 2% max HP / s after 2 s without a hit (whole HP points). */
  private regen(dt: number) {
    const now = this.now();
    for (const e of [this.player, ...this.npcs]) {
      if (!e.alive || e.hp >= e.maxHP) continue;
      const rps = regenPerSecond(e);
      if (rps <= 0 || now - e.lastHitAt < REGEN_DELAY_S * 1000) continue;
      const acc = (this.regenAcc.get(e.id) ?? 0) + rps * dt;
      const whole = Math.floor(acc);
      this.regenAcc.set(e.id, acc - whole);
      if (whole > 0) e.hp = Math.min(e.maxHP, e.hp + whole);
    }
  }

  private draw(now: number) {
    this.fx.beginDraw(now);
    for (const p of this.projectiles) {
      const a = p.fadeUntil > 0 ? Math.max(0, (p.fadeUntil - now) / 220) : 1;
      this.fx.drawProjectile(p.x, p.y, p.radius, p.color, a);
    }
    for (const b of this.beams) {
      if (!b.owner.alive) continue;
      const c = centerOf(b.owner);
      const flick = Math.sin((now - b.start) / 25) * 0.5 + 0.5;
      const t = (now - b.start) / Math.max(1, b.until - b.start);
      const width = b.width * (t > 0.75 ? Math.max(0.2, (1 - t) / 0.25) : 1);
      this.fx.drawBeam(c.x, c.y, c.x + Math.cos(b.angle) * b.length, c.y + Math.sin(b.angle) * b.length, width, b.color, flick);
    }
    this.fx.drawBossBar(this.bossBarVisible && this.bossEntity?.alive ? this.bossEntity : null);
  }

  dispose() {
    this.disposed = true;
    this.pending = [];
    this.projectiles = [];
    this.beams = [];
    this.sweeps = [];
    this.brains.clear();
    this.fx.destroy();
    for (const e of [...this.npcs]) {
      try {
        if (e.alive) this.ctx.despawnEntity(e, false);
      } catch {
        // Scene already shut down: CORE's objects are gone with it.
      }
    }
    this.npcs.length = 0;
    this.bossEntity = null;
  }
}
