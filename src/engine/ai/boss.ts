/**
 * Boss brain: dormant until the player comes near (bossIntro dialogue), then
 * cycles def.pattern with idle gaps; 30% faster below phaseAt HP.
 */
import type { BossDef, EnemyDef } from "../../shared/schema";
import { GRAVITY } from "../../shared/schema";
import type { RuntimeEntity } from "../types";
import type { AttackSpec, Brain, CombatWorld } from "../combat/world";
import { centerOf, rectOf, rectsOverlap } from "../combat/geom";
import { faceToward, shotColor, spec, tryBasicAttack } from "./common";

const INTRO_RANGE = 200;
const MAX_SUMMONS = 3;

type State =
  | { s: "dormant" }
  | { s: "idle"; until: number }
  | { s: "chargeWindup"; until: number }
  | { s: "charge"; until: number; dir: -1 | 1; hit: boolean }
  | { s: "jump"; start: number; launched: boolean; hit: boolean }
  | { s: "shoot"; until: number; fired: boolean }
  | { s: "beamWindup"; until: number; angle: number }
  | { s: "beam"; until: number };

export class BossBrain implements Brain {
  private state: State = { s: "dormant" };
  private patternIdx = 0;
  private nextAttackAt = 0;
  private summons: RuntimeEntity[] = [];

  constructor(
    private w: CombatWorld,
    readonly e: RuntimeEntity,
    private def: BossDef,
    private makeEnemyBrain: (e: RuntimeEntity, def: EnemyDef) => Brain,
  ) {}

  private get body() {
    return this.e.body.body;
  }

  private mult(): number {
    return this.e.maxHP > 0 && this.e.hp / this.e.maxHP < this.def.phaseAt ? 1.3 : 1;
  }

  private contactAttack(knockback: number): AttackSpec {
    return spec(this.def.attack, knockback);
  }

  update(now: number) {
    const w = this.w;
    const p = w.player;
    const b = this.body;
    const m = this.mult();
    const me = centerOf(this.e);
    const pc = centerOf(p);
    const dx = pc.x - me.x;

    if (this.state.s === "dormant") {
      b.setVelocityX(0);
      if (p.alive && Math.hypot(dx, pc.y - me.y) < INTRO_RANGE) {
        this.state = { s: "idle", until: now + 900 };
        w.bossBarVisible = true;
        const lines = w.ctx.session.dialogue.bossIntro;
        if (lines.length > 0) void w.ctx.showDialogue(lines);
      }
      return;
    }
    if (!p.alive) {
      b.setVelocityX(0);
      return;
    }
    if (now < this.e.stunUntil && this.state.s !== "charge") return;

    const st = this.state;
    switch (st.s) {
      case "idle": {
        faceToward(this.e, p);
        b.setVelocityX(Math.abs(dx) > 24 ? Math.sign(dx) * this.def.speed * m : 0);
        this.nextAttackAt = tryBasicAttack(w, this.e, this.def.attack, this.nextAttackAt, now, false, m);
        if (now >= st.until) this.startNext(now);
        break;
      }
      case "chargeWindup": {
        b.setVelocityX(0);
        faceToward(this.e, p);
        this.e.attackAnim = { kind: "swing", angle: this.e.facing < 0 ? Math.PI : 0, until: now + 60 };
        if (now >= st.until) this.state = { s: "charge", until: now + 1000, dir: this.e.facing, hit: false };
        break;
      }
      case "charge": {
        b.setVelocityX(st.dir * Math.max(120, this.def.speed * 3) * m);
        this.e.facing = st.dir;
        if (!st.hit && rectsOverlap(this.grow(rectOf(this.e), 2), rectOf(p))) {
          st.hit = true;
          w.applyHit(this.e, this.contactAttack(350), p, st.dir, -0.3);
        }
        const wall = (st.dir < 0 && b.blocked.left) || (st.dir > 0 && b.blocked.right);
        if (now >= st.until || wall) this.toIdle(now);
        break;
      }
      case "jump": {
        if (!st.launched) {
          if (b.blocked.down) {
            faceToward(this.e, p);
            const vx = Math.max(-this.def.speed * 2.5, Math.min(this.def.speed * 2.5, dx * 1.1)) * m;
            b.setVelocity(vx, -Math.sqrt(2 * GRAVITY * 110)); // ~110 px apex
            st.launched = true;
            st.start = now;
          } else if (now - st.start > 1200) this.toIdle(now);
          break;
        }
        if (!st.hit && rectsOverlap(this.grow(rectOf(this.e), 2), rectOf(p))) {
          st.hit = true;
          w.applyHit(this.e, this.contactAttack(300), p, dx, -1);
        }
        if (now - st.start > 200 && b.blocked.down) {
          // Landing shockwave.
          const r = rectOf(this.e);
          const radius = Math.max(40, r.w);
          w.fx.add({ kind: "ring", x: me.x, y: r.y + r.h, r: radius, color: 0xffffff, born: now, until: now + 300 });
          if (!st.hit) w.hitCircle(this.e, this.contactAttack(300), me.x, r.y + r.h, radius);
          b.setVelocityX(0);
          this.toIdle(now);
        } else if (now - st.start > 2500) this.toIdle(now);
        break;
      }
      case "shoot": {
        b.setVelocityX(0);
        faceToward(this.e, p);
        if (!st.fired && now >= st.until - 250 / m) {
          st.fired = true;
          this.e.attackAnim = { kind: "shoot", angle: this.e.aimAngle, until: now + 250 };
          const range = Math.max(this.def.attack.range, 320);
          for (const off of [-0.18, 0, 0.18]) {
            w.fireProjectile({
              owner: this.e,
              attack: this.contactAttack(150),
              x: me.x,
              y: me.y,
              angle: this.e.aimAngle + off,
              speed: 260 * m,
              range,
              radius: 4,
              color: shotColor(this.def.attack),
            });
          }
        }
        if (now >= st.until) this.toIdle(now);
        break;
      }
      case "beamWindup": {
        b.setVelocityX(0);
        const len = Math.max(this.def.attack.range, 260);
        w.fx.add({
          kind: "line",
          x1: me.x,
          y1: me.y,
          x2: me.x + Math.cos(st.angle) * len,
          y2: me.y + Math.sin(st.angle) * len,
          width: 1,
          color: 0xff3030,
          born: now,
          until: now + 30,
        });
        this.e.attackAnim = { kind: "beam", angle: st.angle, until: now + 60 };
        if (now >= st.until) {
          w.fireBeam({ owner: this.e, attack: this.contactAttack(400), angle: st.angle, length: len, width: 8, durationMs: 450, color: shotColor(this.def.attack) });
          this.e.attackAnim = { kind: "beam", angle: st.angle, until: now + 450 };
          this.state = { s: "beam", until: now + 450 };
        }
        break;
      }
      case "beam": {
        b.setVelocityX(0);
        if (now >= st.until) this.toIdle(now);
        break;
      }
    }
  }

  private grow(r: { x: number; y: number; w: number; h: number }, n: number) {
    return { x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n };
  }

  private toIdle(now: number) {
    this.state = { s: "idle", until: now + 1100 / this.mult() };
  }

  private startNext(now: number) {
    const pattern = this.def.pattern.length > 0 ? this.def.pattern : (["charge"] as const);
    const move = pattern[this.patternIdx % pattern.length];
    this.patternIdx++;
    const m = this.mult();
    switch (move) {
      case "charge":
        this.state = { s: "chargeWindup", until: now + 450 / m };
        break;
      case "jump":
        this.state = { s: "jump", start: now, launched: false, hit: false };
        break;
      case "shoot":
        this.state = { s: "shoot", until: now + 700 / m, fired: false };
        break;
      case "beam": {
        faceToward(this.e, this.w.player);
        // Horizontal-ish beam toward the player.
        const a = this.e.aimAngle;
        const angle = Math.cos(a) < 0 ? Math.PI + clamp(normAngle(a - Math.PI), -0.35, 0.35) : clamp(a, -0.35, 0.35);
        this.state = { s: "beamWindup", until: now + 650 / m, angle: normAngle(angle) };
        break;
      }
      case "summon":
        this.summon(now);
        this.toIdle(now);
        break;
    }
  }

  private summon(now: number) {
    const w = this.w;
    this.summons = this.summons.filter((s) => s.alive);
    const def = w.ctx.session.world.enemies[0];
    if (!def || this.summons.length >= MAX_SUMMONS) return;
    const r = rectOf(this.e);
    const feetY = r.y + r.h;
    for (const side of [-1, 1] as const) {
      const x = side < 0 ? r.x - def.collisionBox.w / 2 - 4 : r.x + r.w + def.collisionBox.w / 2 + 4;
      if (w.ctx.isSolidAt(x, feetY - 2) || w.ctx.isSolidAt(x, feetY - def.collisionBox.h + 1)) continue;
      const e = w.ctx.spawnEntity(def, "enemy", x, feetY);
      w.addNpc(e, this.makeEnemyBrain(e, def));
      this.summons.push(e);
      this.e.attackAnim = { kind: "cast", angle: -Math.PI / 2, until: now + 300 };
      w.fx.add({ kind: "ring", x, y: feetY - def.collisionBox.h / 2, r: 12, color: 0xffffff, born: now, until: now + 300 });
      return;
    }
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function normAngle(a: number) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
