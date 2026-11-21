/**
 * Boot scene: renders one room from its ASCII layout (SPEC §4.5) and runs a
 * placeholder player with time-based Arcade movement. The CORE agent grows
 * this into the full game loop.
 */
import Phaser from "phaser";
import type { Room, Session } from "../session";

export const TILE = 16;
export const VIEW_W = 400;
export const VIEW_H = 224;
export const GRAVITY = 900; // px/s²

export type SceneInit = { session: Session; roomIndex: number; onExit: (r: { outcome: "won" | "died" | "quit" }) => void };

export class GameScene extends Phaser.Scene {
  private init_!: SceneInit;
  private player!: Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body };
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private oneWays!: Phaser.Physics.Arcade.StaticGroup;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  private exits!: Phaser.Physics.Arcade.StaticGroup;
  private spawn = { x: 0, y: 0 };
  private keys!: Record<"W" | "A" | "S" | "D" | "SPACE" | "ESC", Phaser.Input.Keyboard.Key>;
  private hp = 0;
  private invulnUntil = 0;
  private hud!: Phaser.GameObjects.Text;
  private finished = false;

  constructor() {
    super("game");
  }

  init(data: SceneInit) {
    this.init_ = data;
    this.finished = false;
  }

  create() {
    const { session, roomIndex } = this.init_;
    const room = session.world.rooms[roomIndex];
    const pal = session.world.visualStyle.palette;
    const cols = room.layout[0].length;
    const rows = room.layout.length;
    const worldW = cols * TILE;
    const worldH = rows * TILE;

    // Sky gradient, fixed to the camera.
    const sky = this.add.graphics().setScrollFactor(0).setDepth(-10);
    sky.fillGradientStyle(hex(pal.sky), hex(pal.sky), hex(pal.skyBottom), hex(pal.skyBottom), 1);
    sky.fillRect(0, 0, VIEW_W, VIEW_H);

    this.solids = this.physics.add.staticGroup();
    this.oneWays = this.physics.add.staticGroup();
    this.spikes = this.physics.add.staticGroup();
    this.exits = this.physics.add.staticGroup();
    this.buildTiles(room, pal);

    // Placeholder player: the collision box itself (rig renderer comes from CORE).
    const cb = session.character.collisionBox;
    const p = this.add.rectangle(this.spawn.x, this.spawn.y - cb.h / 2, cb.w, cb.h, 0xff8c1a);
    this.physics.add.existing(p);
    this.player = p as typeof this.player;
    this.player.body.setCollideWorldBounds(true);
    this.hp = session.character.stats.HP;

    this.physics.world.setBounds(0, 0, worldW, worldH + 64); // open bottom: falling = death
    this.physics.world.gravity.y = GRAVITY;
    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.player, this.oneWays);
    this.physics.add.overlap(this.player, this.spikes, () => this.hurt(Math.ceil(session.character.stats.HP * 0.2)));
    this.physics.add.overlap(this.player, this.exits, () => this.finish("won"));

    this.cameras.main.setBounds(0, 0, worldW, worldH).startFollow(this.player, true, 1, 1).setRoundPixels(true);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ W: "W", A: "A", S: "S", D: "D", SPACE: "SPACE", ESC: "ESC" }) as typeof this.keys;
    kb.addCapture("SPACE");

    this.hud = this.add.text(4, 4, "", { fontFamily: "monospace", fontSize: "8px", color: "#ffffff" }).setScrollFactor(0).setDepth(100);
  }

  private buildTiles(room: Room, pal: Session["world"]["visualStyle"]["palette"]) {
    room.layout.forEach((line, r) => {
      [...line].forEach((ch, c) => {
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        switch (ch) {
          case "#": {
            const above = room.layout[r - 1]?.[c];
            const top = above !== "#" && above !== "X";
            this.solids.add(this.add.rectangle(x, y, TILE, TILE, hex(top ? pal.groundTop : pal.ground)));
            break;
          }
          case "X":
            this.solids.add(this.add.rectangle(x, y, TILE, TILE, hex(pal.accent)).setStrokeStyle(1, 0x000000));
            break;
          case "=": {
            const plat = this.add.rectangle(x, r * TILE + 2, TILE, 4, hex(pal.platform));
            this.oneWays.add(plat);
            const b = plat.body as Phaser.Physics.Arcade.StaticBody;
            b.checkCollision.down = b.checkCollision.left = b.checkCollision.right = false;
            break;
          }
          case "^": {
            const s = this.add.triangle(x, y + 4, 0, 8, 8, 0, 16, 8, 0xdddddd);
            this.spikes.add(s);
            (s.body as Phaser.Physics.Arcade.StaticBody).setSize(12, 6).setOffset(2, 2);
            break;
          }
          case "E":
            this.exits.add(this.add.rectangle(x, y, TILE, TILE * 2, hex(pal.accent), 0.6));
            break;
          case "C":
            this.add.rectangle(x, y, 4, TILE, 0xffffff);
            break;
          case "S":
            this.spawn = { x, y: (r + 1) * TILE };
            break;
          case "1":
          case "2":
          case "3":
          case "B":
            this.add.text(x, y, ch, { fontFamily: "monospace", fontSize: "10px", color: "#ff3030" }).setOrigin(0.5);
            break;
        }
      });
    });
  }

  update(time: number) {
    if (this.finished) return;
    const { movement, stats, name } = this.init_.session.character;
    const body = this.player.body;
    const k = this.keys;

    const dir = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0);
    body.setVelocityX(dir * movement.speed); // px/s: Arcade integrates with delta, so frame-rate independent
    if (Phaser.Input.Keyboard.JustDown(k.SPACE) && body.blocked.down) body.setVelocityY(-movement.jumpStrength);
    if (Phaser.Input.Keyboard.JustDown(k.ESC)) return this.finish("quit");

    if (this.player.y > this.physics.world.bounds.height - 40) this.hurt(this.hp); // fell off

    this.player.setAlpha(time < this.invulnUntil && Math.floor(time / 60) % 2 ? 0.4 : 1);
    this.hud.setText(`${name}  HP ${this.hp}/${stats.HP}`);
  }

  private hurt(amount: number) {
    if (this.time.now < this.invulnUntil || this.finished) return;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = this.time.now + 500;
    this.player.body.setVelocityY(-200);
    if (this.hp <= 0) this.scene.restart(this.init_); // SPEC §4.5: death restarts the room
  }

  private finish(outcome: "won" | "quit") {
    if (this.finished) return;
    this.finished = true;
    this.init_.onExit({ outcome });
  }
}

function hex(c: string): number {
  return parseInt(c.replace("#", ""), 16);
}
