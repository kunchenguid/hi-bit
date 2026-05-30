// engine3d.js - tiny no-framework helpers for a 3D game in the browser.
// Built on Three.js. Drop this file (and three.min.js) next to your game and add,
// in this order, before your game script:
//
//   <script src="three.min.js"></script>   <!-- gives you the global THREE -->
//   <script src="engine3d.js"></script>     <!-- gives you the global HiBit3D -->
//   <script src="game.js"></script>
//
// It gives you:
//   HiBit3D.createWorld(canvas, opts)        - scene + camera + renderer + lights
//   HiBit3D.run(world, { update, step })     - a game loop with delta time
//   HiBit3D.input                            - keyboard + pointer + optional mouse-look
//   HiBit3D.overlap(a, b)                    - do two 3D boxes touch (AABB)
//   HiBit3D.moveAndCollide(e, move, solids)  - move a box and stop it on solids
//   world.addBox/addSphere/addGround/texture - friendly primitives to build with
//   HiBit3D.followCamera / firstPerson / pick
//
// A box is any object with x, y, z (its min corner) and w, h, d (size on each axis).
// The box is the truth of the game (movement, collision); the mesh is what is seen.

const HiBit3D = (() => {
  const held = new Set(); // keys held down right now
  const pressed = new Set(); // keys that went down this frame
  const pointer = { x: 0, y: 0, down: false, clicked: false };
  const look = { dx: 0, dy: 0 }; // mouse-look movement since the last update

  // Action names you ask about, mapped to the keys that trigger them.
  // Override or extend with HiBit3D.input.setKeys({ ... }).
  let actionKeys = {
    left: ["ArrowLeft", "a", "A"],
    right: ["ArrowRight", "d", "D"],
    up: ["ArrowUp", "w", "W"],
    down: ["ArrowDown", "s", "S"],
    jump: [" ", "ArrowUp", "w", "W"],
    action: [" ", "Enter", "z", "Z"],
  };

  function isTextEntryTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function isGameplayKey(key) {
    return Object.values(actionKeys).some((keys) => keys.includes(key));
  }

  window.addEventListener("keydown", (e) => {
    if (isGameplayKey(e.key) && !isTextEntryTarget(e.target) && e.preventDefault) e.preventDefault();
    if (!held.has(e.key)) pressed.add(e.key);
    held.add(e.key);
  });
  window.addEventListener("keyup", (e) => held.delete(e.key));

  const input = {
    // True while the action's key is held.
    isDown(action) {
      return (actionKeys[action] || [action]).some((k) => held.has(k));
    },
    // True only on the single frame the key first goes down (jump, shoot, start).
    wasPressed(action) {
      return (actionKeys[action] || [action]).some((k) => pressed.has(k));
    },
    pointer,
    look,
    setKeys(map) {
      actionKeys = { ...actionKeys, ...map };
    },
    // Click the canvas to capture the mouse for first-person look. Call once.
    // Esc releases it - the browser handles that for you.
    lockPointer(canvas) {
      canvas.addEventListener("click", () => {
        if (canvas.requestPointerLock) canvas.requestPointerLock();
      });
      document.addEventListener("mousemove", (e) => {
        look.dx += e.movementX || 0;
        look.dy += e.movementY || 0;
      });
    },
  };

  function attachPointer(canvas) {
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - r.left) * (canvas.width / r.width);
      pointer.y = (e.clientY - r.top) * (canvas.height / r.height);
    };
    canvas.addEventListener("mousemove", toLocal);
    canvas.addEventListener("mousedown", (e) => {
      toLocal(e);
      pointer.down = true;
      pointer.clicked = true;
    });
    window.addEventListener("mouseup", () => {
      pointer.down = false;
    });
  }

  // ---- building blocks --------------------------------------------------

  // Make a scene, a camera, a renderer that draws into the canvas, and soft
  // daylight so things are visible without any setup. Returns the world you
  // pass to run(). opts: { background, fog } are CSS-style colors (optional).
  function createWorld(canvas, opts = {}) {
    const THREE = window.THREE;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(opts.background || "#8ecae6");
    if (opts.fog) scene.fog = new THREE.Fog(opts.fog, 20, 120);

    const camera = new THREE.PerspectiveCamera(60, canvas.width / canvas.height, 0.1, 500);
    camera.position.set(0, 6, 12);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(canvas.width, canvas.height, false);

    // Friendly lighting: sky/ground fill plus one sun for shape.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(8, 18, 10);
    scene.add(sun);

    const world = { THREE, scene, camera, renderer, canvas, _loader: null };

    // Put a flat image (from generate_image) onto materials. Returns a THREE
    // texture you can pass as `texture:` to addBox/addSphere/addGround.
    world.texture = (url) => {
      world._loader = world._loader || new THREE.TextureLoader();
      return world._loader.load(url);
    };
    world.addBox = (o = {}) => addBox(world, o);
    world.addSphere = (o = {}) => addSphere(world, o);
    world.addGround = (o = {}) => addGround(world, o);
    return world;
  }

  function makeMaterial(THREE, o) {
    if (o.texture) return new THREE.MeshStandardMaterial({ map: o.texture });
    return new THREE.MeshStandardMaterial({ color: o.color || "#ef476f" });
  }

  // Give a mesh a collider box that follows it. The box uses its min corner
  // (x,y,z) and size (w,h,d); reading or writing x/y/z moves the mesh center.
  function withBody(mesh, w, h, d) {
    return {
      mesh,
      w,
      h,
      d,
      get x() {
        return mesh.position.x - w / 2;
      },
      set x(v) {
        mesh.position.x = v + w / 2;
      },
      get y() {
        return mesh.position.y - h / 2;
      },
      set y(v) {
        mesh.position.y = v + h / 2;
      },
      get z() {
        return mesh.position.z - d / 2;
      },
      set z(v) {
        mesh.position.z = v + d / 2;
      },
    };
  }

  function addBox(world, o) {
    const THREE = world.THREE;
    const w = o.w ?? 1;
    const h = o.h ?? 1;
    const d = o.d ?? 1;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeMaterial(THREE, o));
    mesh.position.set((o.x ?? 0) + w / 2, (o.y ?? 0) + h / 2, (o.z ?? 0) + d / 2);
    world.scene.add(mesh);
    return withBody(mesh, w, h, d);
  }

  function addSphere(world, o) {
    const THREE = world.THREE;
    const r = o.r ?? 0.5;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), makeMaterial(THREE, o));
    mesh.position.set((o.x ?? 0) + r, (o.y ?? 0) + r, (o.z ?? 0) + r);
    world.scene.add(mesh);
    return withBody(mesh, r * 2, r * 2, r * 2);
  }

  // A big flat floor. size is its width and depth; its top surface sits at o.y
  // (default 0), so things placed at y = 0 rest on it.
  function addGround(world, o) {
    const THREE = world.THREE;
    const size = o.size ?? 40;
    const h = o.h ?? 1;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, h, size),
      makeMaterial(THREE, { color: o.color || "#52796f", texture: o.texture }),
    );
    world.scene.add(mesh);
    const body = withBody(mesh, size, h, size);
    body.x = -size / 2;
    body.z = -size / 2;
    body.y = (o.y ?? 0) - h; // top of the slab lands exactly at o.y
    return body;
  }

  // ---- the loop ---------------------------------------------------------

  // Start the loop.
  //   update(dt) gets the seconds since the last update; the scene is drawn for you.
  //   maxDt caps the time handled in one frame (the safety guard against spirals).
  //   step (optional, seconds): fixed timestep, like the 2D engine - good for
  //     gravity and fast things (step: 1 / 60). update() still just uses dt.
  // Returns { input, stop }. Call stop() to end the loop (restart, or cleanup).
  function run(world, { update, draw, maxDt = 0.05, step = 0 } = {}) {
    attachPointer(world.canvas);
    let last = null;
    let leftover = 0;
    let raf = 0;
    let running = true;

    function frame(now) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (last === null) last = now;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > maxDt) dt = maxDt;

      let consumedEdgeInputs = !update;
      if (update) {
        if (step > 0) {
          leftover += dt;
          while (leftover >= step) {
            update(step);
            leftover -= step;
            consumedEdgeInputs = true;
          }
        } else {
          update(dt);
          consumedEdgeInputs = true;
        }
      }

      if (consumedEdgeInputs) {
        pressed.clear(); // edge presses last exactly one frame
        pointer.clicked = false;
        look.dx = 0; // mouse-look deltas are consumed each update too
        look.dy = 0;
      }
      if (draw) draw(world);
      world.renderer.render(world.scene, world.camera);
    }

    raf = requestAnimationFrame(frame);
    return {
      input,
      stop() {
        running = false;
        cancelAnimationFrame(raf);
      },
    };
  }

  // ---- collision --------------------------------------------------------

  // Do two boxes overlap in 3D? Each box is { x, y, z, w, h, d } (min corner + size).
  function overlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y &&
      a.z < b.z + b.d &&
      a.z + a.d > b.z
    );
  }

  // Move an entity by `move` {x,y,z} (already multiplied by dt), one axis at a
  // time, stopping it against any solid it hits. Returns which sides hit and
  // whether it landed on something (onGround). The entity is mutated in place.
  function moveAndCollide(entity, move, solids) {
    const hit = { x: 0, y: 0, z: 0, onGround: false };

    entity.x += move.x || 0;
    for (const s of solids) {
      if (overlap(entity, s)) {
        if (move.x > 0) entity.x = s.x - entity.w;
        else if (move.x < 0) entity.x = s.x + s.w;
        hit.x = move.x > 0 ? 1 : -1;
      }
    }

    entity.z += move.z || 0;
    for (const s of solids) {
      if (overlap(entity, s)) {
        if (move.z > 0) entity.z = s.z - entity.d;
        else if (move.z < 0) entity.z = s.z + s.d;
        hit.z = move.z > 0 ? 1 : -1;
      }
    }

    // Y is up: moving down (move.y < 0) and hitting a solid means we landed.
    entity.y += move.y || 0;
    for (const s of solids) {
      if (overlap(entity, s)) {
        if (move.y > 0) {
          entity.y = s.y - entity.h; // bonked head on the underside
          hit.y = 1;
        } else if (move.y < 0) {
          entity.y = s.y + s.h; // rest on top
          hit.y = -1;
          hit.onGround = true;
        }
      }
    }
    return hit;
  }

  // ---- cameras ----------------------------------------------------------

  // Third-person: keep the camera behind and above a target body each frame.
  function followCamera(world, target, opts = {}) {
    const distance = opts.distance ?? 10;
    const height = opts.height ?? 6;
    const m = target.mesh;
    world.camera.position.set(m.position.x, m.position.y + height, m.position.z + distance);
    world.camera.lookAt(m.position.x, m.position.y, m.position.z);
  }

  // First-person: put the camera at the target's eye height and aim it with the
  // mouse-look deltas. Pass the returned state back in next frame.
  function firstPerson(world, target, state = {}) {
    state.yaw = (state.yaw ?? 0) - (input.look.dx || 0) * 0.0025;
    state.pitch = Math.max(
      -1.2,
      Math.min(1.2, (state.pitch ?? 0) - (input.look.dy || 0) * 0.0025),
    );
    const m = target.mesh;
    const eye = (target.h || 1) * 0.4;
    world.camera.position.set(m.position.x, m.position.y + eye, m.position.z);
    world.camera.rotation.set(state.pitch, state.yaw, 0, "YXZ");
    return state;
  }

  // ---- picking ----------------------------------------------------------

  // Ray-cast from the pointer into the scene and return the first body hit, or
  // null. Pass the bodies you care about (the ones addBox/addSphere returned).
  function pick(world, bodies) {
    const THREE = world.THREE;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2(
      (pointer.x / world.canvas.width) * 2 - 1,
      -(pointer.y / world.canvas.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, world.camera);
    const meshes = bodies.map((b) => b.mesh);
    const hits = ray.intersectObjects(meshes, false);
    if (!hits.length) return null;
    return bodies.find((b) => b.mesh === hits[0].object) || null;
  }

  return {
    createWorld,
    run,
    input,
    overlap,
    moveAndCollide,
    followCamera,
    firstPerson,
    pick,
  };
})();
