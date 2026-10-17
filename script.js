/* CS42 Week 07 - Assignment 8: Using Level Maps + Tiles
   "Whispering Vale" - walk around a tile-based world and find the hidden treasure chest.

   Concepts used (following the Phaser + Tiled tutorial):
   - Tileset spritesheet image : assets/tiles.png (my own pixel art, 32x32 tiles)
   - Player spritesheet        : assets/player.png (my own pixel art, 32x32 frames)
   - Tilemap made in Tiled     : assets/map.json (50 x 36 tiles = 1600 x 1152 pixel world)
   - Layers                    : Ground, Walls, Obstacles, Above (+ an Objects layer)
   - Cameras                   : main camera follows the player; second camera is a mini-map
   - Keyboard input            : arrow keys or WASD to move, M toggles the mini-map
*/

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const PLAYER_SPEED = 150;
const CHEST_CLOSED = 21; // tile id (gid) of the closed chest in the tileset
const CHEST_OPEN = 22;   // tile id (gid) of the open chest in the tileset

class WorldScene extends Phaser.Scene {
  constructor() {
    super('WorldScene');
  }

  preload() {
    // The tileset image, the Tiled map (JSON) and the player spritesheet
    this.load.image('tiles', 'assets/tiles.png');
    this.load.tilemapTiledJSON('map', 'assets/map.json');
    this.load.spritesheet('player', 'assets/player.png', { frameWidth: 32, frameHeight: 32 });
  }

  create() {
    // ---------- tilemap + layers ----------
    const map = this.make.tilemap({ key: 'map' });
    // first name = tileset name inside Tiled, second = the key used in preload()
    const tileset = map.addTilesetImage('tiles', 'tiles');

    this.groundLayer = map.createLayer('Ground', tileset, 0, 0);       // grass, paths, water, bridge
    this.wallsLayer = map.createLayer('Walls', tileset, 0, 0);         // border wall, house, fence
    this.obstaclesLayer = map.createLayer('Obstacles', tileset, 0, 0); // tree trunks, bushes, rocks, chest
    this.aboveLayer = map.createLayer('Above', tileset, 0, 0);         // tree tops, drawn over the player
    this.aboveLayer.setDepth(10);

    // Tiles with the custom property "collides = true" (set in Tiled) are solid
    this.groundLayer.setCollisionByProperty({ collides: true });
    this.wallsLayer.setCollisionByProperty({ collides: true });
    this.obstaclesLayer.setCollisionByProperty({ collides: true });

    this.worldW = map.widthInPixels;
    this.worldH = map.heightInPixels;
    this.map = map;

    // ---------- objects from the Tiled "Objects" layer ----------
    const spawn = map.findObject('Objects', (obj) => obj.name === 'Spawn Point');
    this.treasure = map.findObject('Objects', (obj) => obj.name === 'Treasure');
    this.treasureFound = false;

    // ---------- player ----------
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'player', 0);
    this.player.setDepth(5);
    this.player.body.setSize(14, 10).setOffset(9, 20); // small hitbox around the feet
    this.player.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    this.physics.add.collider(this.player, this.groundLayer);
    this.physics.add.collider(this.player, this.wallsLayer);
    this.physics.add.collider(this.player, this.obstaclesLayer);

    // ---------- animations (spritesheet rows: down, left, right, up) ----------
    this.facing = 'down';
    this.idleFrame = { down: 0, left: 3, right: 6, up: 9 };
    ['down', 'left', 'right', 'up'].forEach((dir, row) => {
      const f = row * 3;
      this.anims.create({
        key: 'walk-' + dir,
        frames: this.anims.generateFrameNumbers('player', { frames: [f + 1, f, f + 2, f] }),
        frameRate: 8,
        repeat: -1
      });
    });

    // ---------- keyboard ----------
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.input.keyboard.on('keydown-M', () => {
      this.miniMap.setVisible(!this.miniMap.visible);
      this.marker.setVisible(this.miniMap.visible);
    });

    // ---------- camera 1: main camera follows the player ----------
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldW, this.worldH);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.fadeIn(600);

    // ---------- on-screen text (fixed to the screen) ----------
    this.hint = this.add.text(GAME_WIDTH / 2, 10, 'Arrow keys / WASD: move    M: mini-map    Find the treasure chest!', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', backgroundColor: '#00000099', padding: { x: 8, y: 4 }
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20);
    this.message = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
      fontFamily: 'monospace', fontSize: '28px', color: '#ffe066', backgroundColor: '#000000bb', padding: { x: 14, y: 10 }, align: 'center'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20).setVisible(false);

    // ---------- camera 2: mini-map showing the whole world ----------
    const mmW = 200;
    const mmH = Math.round(mmW * this.worldH / this.worldW);
    this.miniMap = this.cameras.add(GAME_WIDTH - mmW - 10, 40, mmW, mmH);
    this.miniMap.setZoom(mmW / this.worldW);
    this.miniMap.centerOn(this.worldW / 2, this.worldH / 2);
    this.miniMap.setBackgroundColor(0x000000);

    // a red dot that only the mini-map can see, marking the player
    this.marker = this.add.circle(0, 0, 55, 0xff3030).setDepth(30);
    cam.ignore(this.marker);
    this.miniMap.ignore([this.hint, this.message]);
  }

  update() {
    const body = this.player.body;
    const c = this.cursors;
    const k = this.wasd;
    const left = c.left.isDown || k.A.isDown;
    const right = c.right.isDown || k.D.isDown;
    const up = c.up.isDown || k.W.isDown;
    const down = c.down.isDown || k.S.isDown;

    const vx = (right ? 1 : 0) - (left ? 1 : 0);
    const vy = (down ? 1 : 0) - (up ? 1 : 0);
    body.setVelocity(vx, vy);
    body.velocity.normalize().scale(PLAYER_SPEED); // same speed on diagonals

    if (vx < 0) this.facing = 'left';
    else if (vx > 0) this.facing = 'right';
    else if (vy < 0) this.facing = 'up';
    else if (vy > 0) this.facing = 'down';

    if (vx !== 0 || vy !== 0) {
      this.player.anims.play('walk-' + this.facing, true);
    } else {
      this.player.anims.stop();
      this.player.setFrame(this.idleFrame[this.facing]);
    }

    this.marker.setPosition(this.player.x, this.player.y);

    // reached the treasure chest?
    if (!this.treasureFound &&
        Phaser.Math.Distance.Between(this.player.x, this.player.y, this.treasure.x, this.treasure.y) < 40) {
      this.treasureFound = true;
      const tx = Math.floor(this.treasure.x / this.map.tileWidth);
      const ty = Math.floor(this.treasure.y / this.map.tileHeight);
      this.obstaclesLayer.putTileAt(CHEST_OPEN, tx, ty); // swap the tile to the open chest
      this.message.setText('You found the treasure!\nWell done, explorer.').setVisible(true);
      this.cameras.main.flash(500);
      this.time.delayedCall(4000, () => this.message.setVisible(false));
    }
  }
}

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1d2b1d',
  pixelArt: true,                       // crisp pixel art, no smoothing
  render: { pixelArt: true, roundPixels: true },
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [WorldScene]
};

new Phaser.Game(config);
