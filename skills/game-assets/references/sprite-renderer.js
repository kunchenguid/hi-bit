// HiBit sprite player - plays a sprite sheet that Bit made.
// No libraries needed. Drop this file into the creation and load it with a
// plain <script> tag, then point it at the sprite-meta.json that
// process_sprite_sheet wrote.
//
//   <script src="sprite-renderer.js"></script>
//   <script>
//     let hero;
//     HiBitSprite.load("assets/sprites/hero/sprite-meta.json").then((s) => { hero = s; });
//
//     // inside your game loop (ctx is a 2D canvas context):
//     function frame(deltaMs) {
//       if (hero) {
//         hero.update(deltaMs);      // advance the animation
//         hero.draw(ctx, x, y);      // draw the current frame at x, y
//       }
//     }
//   </script>
(function (global) {
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("Could not load image " + src));
      };
      img.src = src;
    });
  }

  // One animated sprite: a sheet image plus the layout from sprite-meta.json.
  function Sprite(image, meta) {
    this.image = image;
    this.frameWidth = meta.frameWidth;
    this.frameHeight = meta.frameHeight;
    this.columns = meta.columns;
    this.frameCount = meta.frameCount;
    this.msPerFrame = 1000 / (meta.fps || 8);
    this.frame = 0;
    this._elapsed = 0;
  }

  // Advance the animation. Call once per game loop with the time since last frame.
  Sprite.prototype.update = function (deltaMs) {
    this._elapsed += deltaMs;
    while (this._elapsed >= this.msPerFrame) {
      this._elapsed -= this.msPerFrame;
      this.frame = (this.frame + 1) % this.frameCount;
    }
  };

  // Draw the current frame with its top-left corner at (x, y). scale is optional.
  Sprite.prototype.draw = function (ctx, x, y, scale) {
    scale = scale || 1;
    var col = this.frame % this.columns;
    var row = Math.floor(this.frame / this.columns);
    ctx.drawImage(
      this.image,
      col * this.frameWidth,
      row * this.frameHeight,
      this.frameWidth,
      this.frameHeight,
      x,
      y,
      this.frameWidth * scale,
      this.frameHeight * scale,
    );
  };

  // Load a sprite from a sprite-meta.json path. Returns a Promise<Sprite>.
  function load(metaUrl) {
    return fetch(metaUrl)
      .then(function (r) {
        return r.json();
      })
      .then(function (meta) {
        var base = metaUrl.slice(0, metaUrl.lastIndexOf("/") + 1);
        return loadImage(base + meta.image).then(function (image) {
          return new Sprite(image, meta);
        });
      });
  }

  global.HiBitSprite = { load: load, Sprite: Sprite };
})(typeof window !== "undefined" ? window : globalThis);
