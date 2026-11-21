/** Enemy behaviours (SPEC 9): walker, jumper, flyer, shooter. */
import type { EnemyDef } from "../../shared/schema";
import { GRAVITY, TILE } from "../../shared/schema";
import type { RuntimeEntity } from "../types";
import type { Brain, CombatWorld } from "../combat/world";
import { centerOf, rectOf } from "../combat/geom";
import { faceToward, groundAt, tryBasicAttack } from "./common";

/** Jumper hop: apex about 3 tiles under GRAVITY. */
const HOP_VY = Math.sqrt(2 * GRAVITY * 3 * TILE);

export function createEnemyBrain(w: CombatWorld, e: RuntimeEntity, def: EnemyDef): Brain {
  switch (def.behaviour) {
    case "jumper":
      return new Jumper(w, e, def);
    case "flyer":
      return new Flyer(w, e, def);
    case "shooter":
      return new Shooter(w, e, def);
    case "walker":
    default:
      return new Walker(w, e, def);
  }
}

abstract class EnemyBrain implements Brain {
  protected nextAttackAt = 0;
  constructor(
    protected w: CombatWorld,
    readonly e: RuntimeEntity,
    protected def: EnemyDef,
  ) {}

  get body() {
    return this.e.body.body;
  }

  update(now: number, dt: number) {
    if (!this.w.isActive(this.e)) {
      this.idle();
      return;
    }
    if (now < this.e.stunUntil) return; // let knockback play out
    this.move(now, dt);
    if (this.w.disposed || !this.e.alive) return;
    this.nextAttackAt = tryBasicAttack(this.w, this.e, this.def.attack, this.nextAttackAt, now, this.def.behaviour === "shooter");
  }

  protected idle() {
    this.body.setVelocityX(0);
  }

  protected abstract move(now: number, dt: number): void;
}

/** Patrols; turns at walls and ledge edges. */
class Walker extends EnemyBrain {
  private dir: -1 | 1 = -1;
  private turnLockUntil = 0;

  protected move(now: number) {
    const b = this.body;
    if (now >= this.turnLockUntil) {
      const r = rectOf(this.e);
      const bounds = this.w.ctx.scene.physics.world.bounds;
      const wall =
        (this.dir < 0 && (b.blocked.left || b.touching.left || r.x <= bounds.x + 1)) ||
        (this.dir > 0 && (b.blocked.right || b.touching.right || r.x + r.w >= bounds.right - 1));
      const frontX = this.dir > 0 ? r.x + r.w + 2 : r.x - 2;
      const ledge = b.blocked.down && !groundAt(this.w, frontX, r.y + r.h + 4);
      if (wall || ledge) {
        this.dir = this.dir < 0 ? 1 : -1;
        this.turnLockUntil = now + 250;
      }
    }
    b.setVelocityX(this.dir * this.def.speed);
    this.e.facing = this.dir;
  }
}

/** Hops toward the player when near. */
class Jumper extends EnemyBrain {
  private nextHopAt = 0;

  protected move(now: number) {
    const b = this.body;
    const p = this.w.player;
    const a = centerOf(this.e);
    const c = centerOf(p);
    const dx = c.x - a.x;
    if (b.blocked.down) {
      const near = Math.abs(dx) < 220 && Math.abs(c.y - a.y) < 160;
      if (near && now >= this.nextHopAt) {
        faceToward(this.e, p);
        b.setVelocity(Math.sign(dx || 1) * Math.max(40, this.def.speed), -HOP_VY);
        this.nextHopAt = now + 650;
      } else if (now > this.nextHopAt - 450) {
        b.setVelocityX(0); // landed: stand still until the next hop
      }
    }
  }
}

/** Sine-wave flight toward the player, no gravity. */
class Flyer extends EnemyBrain {
  private phase: number;
  private gravityOff = false;

  constructor(w: CombatWorld, e: RuntimeEntity, def: EnemyDef) {
    super(w, e, def);
    let h = 0;
    for (const ch of e.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    this.phase = (Math.abs(h) % 628) / 100;
    this.noGravity();
  }

  private noGravity() {
    if (!this.gravityOff) {
      this.body.setAllowGravity(false);
      this.gravityOff = true;
    }
  }

  protected idle() {
    this.noGravity();
    this.body.setVelocity(0, 0);
  }

  protected move(now: number) {
    this.noGravity();
    const a = centerOf(this.e);
    const c = centerOf(this.w.player);
    const tx = c.x - a.x;
    const ty = c.y - 22 - a.y; // hover a bit above the player
    const d = Math.hypot(tx, ty);
    const s = this.def.speed;
    const k = d > 6 ? s / d : 0;
    const wave = Math.sin(now / 260 + this.phase) * s * 0.7;
    this.body.setVelocity(tx * k, ty * k + wave);
    faceToward(this.e, this.w.player);
  }
}

/** Stands and fires projectiles at the player within range. */
class Shooter extends EnemyBrain {
  protected move() {
    this.body.setVelocityX(0);
    faceToward(this.e, this.w.player);
  }
}
