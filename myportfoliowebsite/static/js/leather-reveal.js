/*
 * Leather Reveal — homepage intro effect.
 *
 * A leather curtain (Verlet cloth on a spring lattice, rendered with three.js)
 * covers the viewport. Dragging cuts the springs along the pointer path like a
 * knife; flaps sag open under gravity. Once >= OPEN_THRESHOLD of the viewport
 * is exposed, the page underneath unlocks and clicks pass through the holes
 * (raycast decides whether a click landed on remaining leather or on a hole).
 */
import * as THREE from './vendor/three.module.min.js';

window.__leatherReady = true;
if (window.__leatherCancelWatchdog) window.__leatherCancelWatchdog();

const overlay = document.getElementById('leather-overlay');
const canvas = document.getElementById('leather-canvas');

if (overlay && canvas) {
  const prevBodyOverflow = document.body.style.overflow;

  const removeOverlay = () => {
    document.body.style.overflow = prevBodyOverflow;
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    removeOverlay();
  } else {
    try {
      init();
    } catch (err) {
      console.warn('leather-reveal disabled:', err);
      removeOverlay();
    }
  }

  function init() {
    const hintEl = overlay.querySelector('.leather-hint');
    const progressFill = overlay.querySelector('.leather-progress-fill');
    const skipBtn = overlay.querySelector('.leather-skip');

    // ---------------------------------------------------------------- config
    const OPEN_THRESHOLD = 0.35;   // exposed viewport fraction that unlocks links
    const KNIFE_RADIUS = 8;        // px; the blade is a capsule, not a zero-width line
    const WORLD_H = 60;            // world units visible vertically
    const FOV = 35;
    const STEP = 1 / 60;
    const ITERATIONS = 5;      // stiffer lattice: thick leather barely stretches
    const GRAVITY = -170;      // heavy drape
    const DAMPING = 0.975;     // swallows oscillation: mass, not springiness
    const WIND_AMP = 2.2;      // thick leather barely flutters
    const COV_COLS = 32, COV_ROWS = 20;

    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const COLS = small ? 44 : 80;
    const ROWS = small ? 30 : 50;
    // slab thickness in world units; at this scale (~2m tall curtain in a
    // 60-unit viewport) 1 unit reads as roughly 3cm of hide
    const THICKNESS = 1.0;

    // ----------------------------------------------------------------- state
    let unlocked = false;
    let skipping = false;
    let disposed = false;
    let firstRendered = false;
    let hintFaded = false;
    let gravityMult = 1;
    let fadeStart = 0;
    let simTime = 0;
    let rafId = 0;

    // ------------------------------------------------------------- rendering
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 1, 500);
    camera.position.set(0, 0, (WORLD_H / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    camera.updateMatrixWorld();

    scene.add(new THREE.HemisphereLight(0xfff0dc, 0x141008, 0.6));
    const keyLight = new THREE.DirectionalLight(0xfff0d8, 2.4);
    keyLight.position.set(-45, 65, 90);
    scene.add(keyLight);
    // warm low fill so the gold flecks glint on the black hide
    const fillLight = new THREE.DirectionalLight(0xc9a25a, 1.0);
    fillLight.position.set(55, -25, 65);
    scene.add(fillLight);

    const textures = makeLeatherTextures();
    const material = new THREE.MeshStandardMaterial({
      map: textures.albedo,
      normalMap: textures.normal,
      roughnessMap: textures.orm,   // G channel
      metalnessMap: textures.orm,   // B channel (gold flecks)
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 1.0,
      metalness: 1.0,
      vertexColors: true,           // cut edges get a pale fiber fringe
      side: THREE.DoubleSide,
    });

    // ------------------------------------------------------------ cloth data
    const NX = COLS + 1, NY = ROWS + 1, N = NX * NY;
    const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
    const ox = new Float32Array(N), oy = new Float32Array(N), oz = new Float32Array(N);
    const pinned = new Uint8Array(N);
    const scrX = new Float32Array(N), scrY = new Float32Array(N); // screen projections

    const FACES = ROWS * COLS * 2;
    const faceVerts = new Uint16Array(FACES * 3);
    const faceAlive = new Uint8Array(FACES);

    // constraints (plain arrays; ~16k entries)
    const cA = [], cB = [], cRest = [], cAlive = [], cFace1 = [], cFace2 = [], cAnti = [];
    let indexDirty = true;
    let baseW = window.innerWidth, baseH = window.innerHeight;

    const vid = (r, c) => r * NX + c;

    function addConstraint(a, b, f1, f2, anti) {
      cA.push(a); cB.push(b);
      const dx = px[a] - px[b], dy = py[a] - py[b];
      cRest.push(Math.sqrt(dx * dx + dy * dy));
      cAlive.push(1); cFace1.push(f1); cFace2.push(f2); cAnti.push(anti ? 1 : 0);
    }

    function buildCloth() {
      const aspect = window.innerWidth / window.innerHeight;
      const worldW = WORLD_H * aspect;
      const clothW = worldW * 1.10;   // oversize so edges/pins sit off-screen
      const clothH = WORLD_H * 1.16;
      const dx = clothW / COLS, dy = clothH / ROWS;
      const topY = WORLD_H / 2 + (clothH - WORLD_H) * 0.5;

      for (let r = 0; r < NY; r++) {
        for (let c = 0; c < NX; c++) {
          const i = vid(r, c);
          px[i] = -clothW / 2 + c * dx;
          py[i] = topY - r * dy;
          pz[i] = 0;
          ox[i] = px[i]; oy[i] = py[i]; oz[i] = pz[i];
          pinned[i] = r === 0 ? 1 : 0;
        }
      }

      // faces: cell (r,c) -> f0 = (A,C,D), f1 = (A,D,B); CCW facing +z
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const f0 = (r * COLS + c) * 2, f1 = f0 + 1;
          const A = vid(r, c), B = vid(r, c + 1), C = vid(r + 1, c), D = vid(r + 1, c + 1);
          faceVerts[f0 * 3] = A; faceVerts[f0 * 3 + 1] = C; faceVerts[f0 * 3 + 2] = D;
          faceVerts[f1 * 3] = A; faceVerts[f1 * 3 + 1] = D; faceVerts[f1 * 3 + 2] = B;
          faceAlive[f0] = 1; faceAlive[f1] = 1;
        }
      }

      cA.length = cB.length = cRest.length = cAlive.length = cFace1.length = cFace2.length = cAnti.length = 0;
      const cellF0 = (r, c) => (r * COLS + c) * 2;
      // horizontal edges
      for (let r = 0; r < NY; r++) {
        for (let c = 0; c < COLS; c++) {
          addConstraint(vid(r, c), vid(r, c + 1),
            r < ROWS ? cellF0(r, c) + 1 : -1,
            r > 0 ? cellF0(r - 1, c) : -1);
        }
      }
      // vertical edges
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < NX; c++) {
          addConstraint(vid(r, c), vid(r + 1, c),
            c < COLS ? cellF0(r, c) : -1,
            c > 0 ? cellF0(r, c - 1) + 1 : -1);
        }
      }
      // diagonals: A-D is a rendered edge of both triangles; the anti-diagonal
      // B-C is physics-only but still clears the cell's faces when severed,
      // so any cut crossing the cell interior opens it
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          addConstraint(vid(r, c), vid(r + 1, c + 1), cellF0(r, c), cellF0(r, c) + 1);
          addConstraint(vid(r, c + 1), vid(r + 1, c), cellF0(r, c), cellF0(r, c) + 1, 1);
        }
      }
      indexDirty = true;
      baseW = window.innerWidth; baseH = window.innerHeight;
      geometry.attributes.color.array.fill(1);
      geometry.attributes.color.needsUpdate = true;
      resetDanglers();

      // UVs sized for square texels
      const repU = 3.2, repV = repU * clothH / clothW;
      const uvArr = geometry.attributes.uv.array;
      for (let r = 0; r < NY; r++) {
        for (let c = 0; c < NX; c++) {
          const i = vid(r, c);
          uvArr[i * 2] = (c / COLS) * repU;
          uvArr[i * 2 + 1] = (1 - r / ROWS) * repV;
        }
      }
      geometry.attributes.uv.needsUpdate = true;
    }

    // -------------------------------------------------------------- geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 2), 2));
    geometry.setAttribute('color',
      new THREE.BufferAttribute(new Float32Array(N * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage));
    const indexArr = new Uint16Array(FACES * 3);
    geometry.setIndex(new THREE.BufferAttribute(indexArr, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 5000);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);

    // --------------------------------------------------- slab thickness
    // Back face: same lattice pushed inward along vertex normals, darker.
    // Shares uv/color/normal/index attributes with the front geometry.
    const backGeo = new THREE.BufferGeometry();
    backGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    backGeo.setAttribute('uv', geometry.attributes.uv);
    backGeo.setAttribute('color', geometry.attributes.color);
    backGeo.setIndex(geometry.index);
    backGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 5000);
    const backMat = new THREE.MeshStandardMaterial({
      // no albedo map: the underside is raw suede, not finished hide
      normalMap: textures.normal,
      color: new THREE.Color(0.26, 0.22, 0.17),
      roughness: 1.0,
      metalness: 0.0,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    const backMesh = new THREE.Mesh(backGeo, backMat);
    backMesh.frustumCulled = false;
    scene.add(backMesh);

    // Cut cross-section: a wall of quads along every boundary edge (outer rim
    // and torn edges), connecting front to back. Reads as raw leather fiber.
    const TRI_EDGES = NY * COLS + ROWS * NX + ROWS * COLS; // H + V + diagonal
    const wallEdges = new Int32Array(TRI_EDGES);
    let wallCount = 0;
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(TRI_EDGES * 6 * 3), 3)
        .setUsage(THREE.DynamicDrawUsage));
    wallGeo.setDrawRange(0, 0);
    wallGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 5000);
    const wallMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.35, 0.29, 0.22), // pale raw fiber
      side: THREE.DoubleSide,
    });
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.frustumCulled = false;
    scene.add(wallMesh);

    function rebuildWalls() {
      wallCount = 0;
      const M = cA.length;
      for (let c = 0; c < M; c++) {
        if (cAnti[c]) continue; // anti-diagonal is not a surface edge
        const f1 = cFace1[c], f2 = cFace2[c];
        const alive = (f1 >= 0 && faceAlive[f1] ? 1 : 0) + (f2 >= 0 && faceAlive[f2] ? 1 : 0);
        if (alive === 1) wallEdges[wallCount++] = c;
      }
      wallGeo.setDrawRange(0, wallCount * 6);
    }

    // ------------------------------------------------------- bare tendons
    // Constraints that survived a cut but whose faces are all gone are what
    // invisibly holds a nearly-severed flap. Render them as gold fiber
    // strands so the player can see — and slice — what still connects.
    const MAX_TENDONS = TRI_EDGES + ROWS * COLS; // every constraint can render
    const TENDON_HALF_W = 0.22;
    const tendonEdges = new Int32Array(MAX_TENDONS);
    let tendonCount = 0;
    const tendonGeo = new THREE.BufferGeometry();
    tendonGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(MAX_TENDONS * 6 * 3), 3)
        .setUsage(THREE.DynamicDrawUsage));
    tendonGeo.setDrawRange(0, 0);
    tendonGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 5000);
    const tendonMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.78, 0.6, 0.26), // gold: visible on the hide and on the page
      side: THREE.DoubleSide,
    });
    const tendonMesh = new THREE.Mesh(tendonGeo, tendonMat);
    tendonMesh.frustumCulled = false;
    scene.add(tendonMesh);

    function rebuildTendons() {
      tendonCount = 0;
      const M = cA.length;
      for (let c = 0; c < M; c++) {
        if (!cAlive[c]) continue;
        const f1 = cFace1[c], f2 = cFace2[c];
        if ((f1 < 0 || !faceAlive[f1]) && (f2 < 0 || !faceAlive[f2])) {
          tendonEdges[tendonCount++] = c;
        }
      }
      tendonGeo.setDrawRange(0, tendonCount * 6);
    }

    function updateTendonBuffer() {
      if (!tendonCount) return;
      const pos = geometry.attributes.position.array;
      const tp = tendonGeo.attributes.position.array;
      let o = 0;
      for (let w = 0; w < tendonCount; w++) {
        const c = tendonEdges[w];
        const a3 = cA[c] * 3, b3 = cB[c] * 3;
        const ax = pos[a3], ay = pos[a3 + 1], az = pos[a3 + 2];
        const bx = pos[b3], by = pos[b3 + 1], bz = pos[b3 + 2];
        let ex = -(by - ay), ey = bx - ax; // screen-plane perpendicular
        const el = Math.sqrt(ex * ex + ey * ey) || 1;
        ex = (ex / el) * TENDON_HALF_W; ey = (ey / el) * TENDON_HALF_W;
        tp[o++] = ax + ex; tp[o++] = ay + ey; tp[o++] = az;
        tp[o++] = ax - ex; tp[o++] = ay - ey; tp[o++] = az;
        tp[o++] = bx + ex; tp[o++] = by + ey; tp[o++] = bz;
        tp[o++] = ax - ex; tp[o++] = ay - ey; tp[o++] = az;
        tp[o++] = bx - ex; tp[o++] = by - ey; tp[o++] = bz;
        tp[o++] = bx + ex; tp[o++] = by + ey; tp[o++] = bz;
      }
      tendonGeo.attributes.position.needsUpdate = true;
    }

    function updateThicknessBuffers() {
      const pos = geometry.attributes.position.array;
      const nrm = geometry.attributes.normal.array;
      const bp = backGeo.attributes.position.array;
      for (let i = 0; i < N * 3; i++) bp[i] = pos[i] - nrm[i] * THICKNESS;
      backGeo.attributes.position.needsUpdate = true;

      const wp = wallGeo.attributes.position.array;
      let o = 0;
      for (let w = 0; w < wallCount; w++) {
        const c = wallEdges[w];
        const a3 = cA[c] * 3, b3 = cB[c] * 3;
        const fax = pos[a3], fay = pos[a3 + 1], faz = pos[a3 + 2];
        const fbx = pos[b3], fby = pos[b3 + 1], fbz = pos[b3 + 2];
        const bax = bp[a3], bay = bp[a3 + 1], baz = bp[a3 + 2];
        const bbx = bp[b3], bby = bp[b3 + 1], bbz = bp[b3 + 2];
        wp[o++] = fax; wp[o++] = fay; wp[o++] = faz;
        wp[o++] = fbx; wp[o++] = fby; wp[o++] = fbz;
        wp[o++] = bbx; wp[o++] = bby; wp[o++] = bbz;
        wp[o++] = fax; wp[o++] = fay; wp[o++] = faz;
        wp[o++] = bbx; wp[o++] = bby; wp[o++] = bbz;
        wp[o++] = bax; wp[o++] = bay; wp[o++] = baz;
      }
      wallGeo.attributes.position.needsUpdate = true;
    }

    // ---------------------------------------------- frayed edges: danglers
    // Threads and fabric strips spawned along cuts. Each dangler is a short
    // Verlet rope anchored to a cloth particle on the torn edge; both kinds
    // render as camera-facing ribbons (threads are just narrower and longer).
    const D_SEGS = 4;
    const MAX_DANGLERS = small ? 280 : 620;
    const danglers = [];
    let danglerCount = 0;

    const stripGeo = new THREE.BufferGeometry();
    stripGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(MAX_DANGLERS * D_SEGS * 6 * 3), 3)
        .setUsage(THREE.DynamicDrawUsage));
    stripGeo.setAttribute('color',
      new THREE.BufferAttribute(new Float32Array(MAX_DANGLERS * D_SEGS * 6 * 3), 3));
    stripGeo.setDrawRange(0, 0);
    stripGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 5000);
    const stripMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const stripMesh = new THREE.Mesh(stripGeo, stripMat);
    stripMesh.frustumCulled = false;
    scene.add(stripMesh);

    const THREAD_COLORS = [
      [0.85, 0.64, 0.24], [0.85, 0.64, 0.24], [0.70, 0.52, 0.20], // gold thread
      [0.90, 0.86, 0.78], [0.90, 0.86, 0.78],                     // ivory thread
      [0.30, 0.26, 0.21],                                          // dark fiber
    ];
    const STRIP_COLORS = [
      [0.22, 0.19, 0.15], [0.14, 0.12, 0.10], [0.62, 0.47, 0.20],
    ];

    function resetDanglers() {
      danglers.length = 0;
      danglerCount = 0;
      stripGeo.setDrawRange(0, 0);
    }

    function spawnDangler(anchor, nx, ny) {
      if (danglerCount >= MAX_DANGLERS) return;
      const asStrip = Math.random() < 0.28;
      const slot = danglerCount++;
      const segLen = asStrip ? 0.5 + Math.random() * 0.55 : 0.7 + Math.random() * 0.9;
      const width = asStrip ? 0.32 + Math.random() * 0.3 : 0.13 + Math.random() * 0.1;
      const pts = new Float32Array(D_SEGS * 3);
      const old = new Float32Array(D_SEGS * 3);
      const dirZ = 0.3 + Math.random() * 0.4;
      for (let k = 0; k < D_SEGS; k++) {
        const f = (k + 1) * segLen;
        pts[k * 3] = px[anchor] + nx * f + (Math.random() - 0.5) * 0.3;
        pts[k * 3 + 1] = py[anchor] + ny * f + (Math.random() - 0.5) * 0.3;
        pts[k * 3 + 2] = pz[anchor] + dirZ * f;
        old[k * 3] = pts[k * 3]; old[k * 3 + 1] = pts[k * 3 + 1]; old[k * 3 + 2] = pts[k * 3 + 2];
      }
      const palette = asStrip ? STRIP_COLORS : THREAD_COLORS;
      const col = palette[(Math.random() * palette.length) | 0];
      danglers.push({ slot, anchor, segLen, width, pts, old });

      // per-vertex colors are static: write them once at spawn
      const ca = stripGeo.attributes.color.array;
      for (let v = 0; v < D_SEGS * 6; v++) {
        const o = (slot * D_SEGS * 6 + v) * 3;
        ca[o] = col[0]; ca[o + 1] = col[1]; ca[o + 2] = col[2];
      }
      stripGeo.attributes.color.needsUpdate = true;
      stripGeo.setDrawRange(0, danglerCount * D_SEGS * 6);
    }

    function danglerStep(h) {
      const g = GRAVITY * 0.7 * gravityMult * h * h;
      const t = simTime;
      for (let d = 0; d < danglers.length; d++) {
        const dg = danglers[d];
        const pts = dg.pts, old = dg.old;
        for (let k = 0; k < D_SEGS; k++) {
          const i3 = k * 3;
          const x = pts[i3], y = pts[i3 + 1], z = pts[i3 + 2];
          const wz = Math.sin(t * 1.1 + x * 0.2 + d) * 0.6 * h * h;
          pts[i3] = x + (x - old[i3]) * 0.93;
          pts[i3 + 1] = y + (y - old[i3 + 1]) * 0.93 + g;
          pts[i3 + 2] = z + (z - old[i3 + 2]) * 0.93 + wz;
          old[i3] = x; old[i3 + 1] = y; old[i3 + 2] = z;
        }
        // inextensible rope: clamp each point to segLen from its predecessor
        let ax = px[dg.anchor], ay = py[dg.anchor], az = pz[dg.anchor];
        for (let k = 0; k < D_SEGS; k++) {
          const i3 = k * 3;
          const dx = pts[i3] - ax, dy = pts[i3 + 1] - ay, dz = pts[i3 + 2] - az;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > dg.segLen) {
            const s = dg.segLen / dist;
            pts[i3] = ax + dx * s;
            pts[i3 + 1] = ay + dy * s;
            pts[i3 + 2] = az + dz * s;
          }
          ax = pts[i3]; ay = pts[i3 + 1]; az = pts[i3 + 2];
        }
      }
    }

    function updateDanglerBuffers() {
      if (!danglers.length) return;
      const sp = stripGeo.attributes.position.array;
      for (let d = 0; d < danglers.length; d++) {
        const dg = danglers[d];
        const pts = dg.pts;
        let ax = px[dg.anchor], ay = py[dg.anchor], az = pz[dg.anchor];
        let o = dg.slot * D_SEGS * 6 * 3;
        for (let k = 0; k < D_SEGS; k++) {
          const bx = pts[k * 3], by = pts[k * 3 + 1], bz = pts[k * 3 + 2];
          let ex = -(by - ay), ey = bx - ax; // screen-plane perpendicular
          const el = Math.sqrt(ex * ex + ey * ey) || 1;
          const w = dg.width * (1 - k / (D_SEGS + 0.5)) / el;
          ex *= w; ey *= w;
          // two triangles: (a+,a-,b+), (a-,b-,b+)
          sp[o++] = ax + ex; sp[o++] = ay + ey; sp[o++] = az;
          sp[o++] = ax - ex; sp[o++] = ay - ey; sp[o++] = az;
          sp[o++] = bx + ex; sp[o++] = by + ey; sp[o++] = bz;
          sp[o++] = ax - ex; sp[o++] = ay - ey; sp[o++] = az;
          sp[o++] = bx - ex; sp[o++] = by - ey; sp[o++] = bz;
          sp[o++] = bx + ex; sp[o++] = by + ey; sp[o++] = bz;
          ax = bx; ay = by; az = bz;
        }
      }
      stripGeo.attributes.position.needsUpdate = true;
    }

    buildCloth();

    function rebuildIndex() {
      let k = 0;
      for (let f = 0; f < FACES; f++) {
        if (!faceAlive[f]) continue;
        indexArr[k++] = faceVerts[f * 3];
        indexArr[k++] = faceVerts[f * 3 + 1];
        indexArr[k++] = faceVerts[f * 3 + 2];
      }
      // zero the tail: computeVertexNormals walks the whole buffer, degenerate
      // (0,0,0) triangles contribute nothing
      indexArr.fill(0, k);
      geometry.index.needsUpdate = true;
      geometry.setDrawRange(0, k);
      backGeo.setDrawRange(0, k);
      rebuildWalls();
      rebuildTendons();
      indexDirty = false;
    }

    // --------------------------------------------------------------- physics
    function physicsStep(h) {
      simTime += h;
      const h2 = h * h;
      const g = GRAVITY * gravityMult * h2;
      const t = simTime;
      for (let i = 0; i < N; i++) {
        if (pinned[i]) continue;
        const x = px[i], y = py[i], z = pz[i];
        const wz = (Math.sin(t * 0.45 + x * 0.05 + y * 0.03) +
                    0.5 * Math.sin(t * 0.9 + y * 0.07)) * WIND_AMP * h2;
        px[i] = x + (x - ox[i]) * DAMPING;
        py[i] = y + (y - oy[i]) * DAMPING + g;
        pz[i] = z + (z - oz[i]) * DAMPING + wz;
        ox[i] = x; oy[i] = y; oz[i] = z;
      }
      const M = cA.length;
      for (let it = 0; it < ITERATIONS; it++) {
        for (let c = 0; c < M; c++) {
          if (!cAlive[c]) continue;
          const a = cA[c], b = cB[c];
          const wa = pinned[a] ? 0 : 1, wb = pinned[b] ? 0 : 1;
          const wsum = wa + wb;
          if (wsum === 0) continue;
          const dx = px[b] - px[a], dy = py[b] - py[a], dz = pz[b] - pz[a];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d === 0) continue;
          const s = (d - cRest[c]) / (d * wsum);
          px[a] += dx * s * wa; py[a] += dy * s * wa; pz[a] += dz * s * wa;
          px[b] -= dx * s * wb; py[b] -= dy * s * wb; pz[b] -= dz * s * wb;
        }
      }
      // bare fibers (no faces left) give way one by one — ~0.8s expected life,
      // so a flap hanging on gold strands visibly rips free on its own
      for (let c = 0; c < M; c++) {
        if (!cAlive[c]) continue;
        const f1 = cFace1[c], f2 = cFace2[c];
        if ((f1 >= 0 && faceAlive[f1]) || (f2 >= 0 && faceAlive[f2])) continue;
        if (Math.random() < 0.02) killConstraint(c);
      }
      danglerStep(h);
    }

    function updateGeometry() {
      if (indexDirty) rebuildIndex();
      const pos = geometry.attributes.position.array;
      for (let i = 0; i < N; i++) {
        pos[i * 3] = px[i]; pos[i * 3 + 1] = py[i]; pos[i * 3 + 2] = pz[i];
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
      updateThicknessBuffers();
      updateTendonBuffer();
      updateDanglerBuffers();
    }

    // ------------------------------------------------------------ projection
    let projStamp = -1, frameStamp = 0;
    function projectAll() {
      if (projStamp === frameStamp) return;
      projStamp = frameStamp;
      camera.updateMatrixWorld();
      const m = new THREE.Matrix4()
        .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const e = m.elements;
      const hw = window.innerWidth / 2;
      for (let i = 0; i < N; i++) {
        const x = px[i], y = py[i], z = pz[i];
        const w = e[3] * x + e[7] * y + e[11] * z + e[15];
        scrX[i] = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w + 1) * hw;
        scrY[i] = (1 - ((e[1] * x + e[5] * y + e[9] * z + e[13]) / w + 1) / 2) * window.innerHeight;
      }
    }

    // ----------------------------------------------------------------- knife
    const orient = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

    function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
      const o1 = orient(ax, ay, bx, by, cx, cy);
      const o2 = orient(ax, ay, bx, by, dx, dy);
      const o3 = orient(cx, cy, dx, dy, ax, ay);
      const o4 = orient(cx, cy, dx, dy, bx, by);
      return o1 * o2 < 0 && o3 * o4 < 0;
    }

    function pointSegDist2(x, y, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const ex = ax + dx * t - x, ey = ay + dy * t - y;
      return ex * ex + ey * ey;
    }

    // min distance² between two non-intersecting segments
    function segSegDist2(ax, ay, bx, by, cx, cy, dx, dy) {
      return Math.min(
        pointSegDist2(ax, ay, cx, cy, dx, dy),
        pointSegDist2(bx, by, cx, cy, dx, dy),
        pointSegDist2(cx, cy, ax, ay, bx, by),
        pointSegDist2(dx, dy, ax, ay, bx, by),
      );
    }

    function killConstraint(c) {
      cAlive[c] = 0;
      const f1 = cFace1[c], f2 = cFace2[c];
      if (f1 >= 0 && faceAlive[f1]) faceAlive[f1] = 0;
      if (f2 >= 0 && faceAlive[f2]) faceAlive[f2] = 0;
      indexDirty = true; // faces and/or the visible tendon list changed
      // muted pop toward the camera: thick leather parts, it doesn't flick
      const a = cA[c], b = cB[c];
      if (!pinned[a]) oz[a] -= 0.3 + Math.random() * 0.2;
      if (!pinned[b]) oz[b] -= 0.3 + Math.random() * 0.2;
      // torn edge shows pale exposed fiber
      const colors = geometry.attributes.color.array;
      colors[a * 3] = 2.6; colors[a * 3 + 1] = 2.2; colors[a * 3 + 2] = 1.6;
      colors[b * 3] = 2.6; colors[b * 3 + 1] = 2.2; colors[b * 3 + 2] = 1.6;
      geometry.attributes.color.needsUpdate = true;
      // fray: often a thread or fabric strip hangs from the cut
      if (Math.random() < 0.55) {
        // perpendicular to the severed edge, random side
        let nx = -(py[b] - py[a]), ny = px[b] - px[a];
        const nl = Math.sqrt(nx * nx + ny * ny) || 1;
        const sgn = Math.random() < 0.5 ? 1 : -1;
        nx = (nx / nl) * sgn; ny = (ny / nl) * sgn;
        spawnDangler(pinned[a] ? b : (pinned[b] || Math.random() < 0.5 ? a : b), nx, ny);
      }
    }

    function cutSegment(x0, y0, x1, y1) {
      projectAll();
      const r = KNIFE_RADIUS, r2 = r * r;
      const minX = Math.min(x0, x1) - r, maxX = Math.max(x0, x1) + r;
      const minY = Math.min(y0, y1) - r, maxY = Math.max(y0, y1) + r;
      const M = cA.length;
      let cutAny = false;
      for (let c = 0; c < M; c++) {
        if (!cAlive[c]) continue;
        const a = cA[c], b = cB[c];
        const ax = scrX[a], ay = scrY[a], bx = scrX[b], by = scrY[b];
        if ((ax < minX && bx < minX) || (ax > maxX && bx > maxX) ||
            (ay < minY && by < minY) || (ay > maxY && by > maxY)) continue;
        if (segmentsIntersect(ax, ay, bx, by, x0, y0, x1, y1) ||
            segSegDist2(ax, ay, bx, by, x0, y0, x1, y1) < r2) {
          killConstraint(c);
          cutAny = true;
        }
      }
      if (cutAny && !hintFaded) {
        hintFaded = true;
        overlay.classList.add('hint-faded');
      }
    }

    // -------------------------------------------------------------- coverage
    const covCells = new Uint8Array(COV_COLS * COV_ROWS);
    function updateCoverage() {
      projectAll();
      covCells.fill(0);
      const w = window.innerWidth, h = window.innerHeight;
      const cw = w / COV_COLS, ch = h / COV_ROWS;
      for (let f = 0; f < FACES; f++) {
        if (!faceAlive[f]) continue;
        const a = faceVerts[f * 3], b = faceVerts[f * 3 + 1], c = faceVerts[f * 3 + 2];
        let minX = Math.min(scrX[a], scrX[b], scrX[c]);
        let maxX = Math.max(scrX[a], scrX[b], scrX[c]);
        let minY = Math.min(scrY[a], scrY[b], scrY[c]);
        let maxY = Math.max(scrY[a], scrY[b], scrY[c]);
        if (maxX < 0 || minX > w || maxY < 0 || minY > h) continue;
        const c0 = Math.max(0, Math.floor(minX / cw)), c1 = Math.min(COV_COLS - 1, Math.floor(maxX / cw));
        const r0 = Math.max(0, Math.floor(minY / ch)), r1 = Math.min(COV_ROWS - 1, Math.floor(maxY / ch));
        for (let r = r0; r <= r1; r++) {
          for (let cc = c0; cc <= c1; cc++) covCells[r * COV_COLS + cc] = 1;
        }
      }
      let covered = 0;
      for (let i = 0; i < covCells.length; i++) covered += covCells[i];
      const open = 1 - covered / covCells.length;
      if (progressFill) {
        progressFill.style.width = Math.min(100, (open / OPEN_THRESHOLD) * 100) + '%';
      }
      if (open >= OPEN_THRESHOLD) unlock();
    }

    function unlock() {
      if (unlocked) return;
      unlocked = true;
      document.body.style.overflow = prevBodyOverflow;
      canvas.style.touchAction = 'pan-y';
      if (progressFill) progressFill.style.width = '100%';
      if (hintEl) {
        hintEl.textContent = 'Links unlocked · 链接已生效';
        overlay.classList.remove('hint-faded');
      }
      setTimeout(() => { if (!disposed) overlay.classList.add('unlocked'); }, 1500);
    }

    // ------------------------------------------------------------- picking
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function hitsCloth(clientX, clientY) {
      ndc.x = (clientX / window.innerWidth) * 2 - 1;
      ndc.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(mesh, false).length > 0;
    }

    function elementBelow(clientX, clientY) {
      overlay.style.pointerEvents = 'none';
      const el = document.elementFromPoint(clientX, clientY);
      overlay.style.pointerEvents = '';
      return el;
    }

    // ---------------------------------------------------------------- input
    let dragging = false, dragId = -1, lastX = 0, lastY = 0, dragDist = 0;
    let lastHover = 0;

    canvas.addEventListener('pointerdown', (e) => {
      if (skipping) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      dragId = e.pointerId;
      lastX = e.clientX; lastY = e.clientY;
      dragDist = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* no-op */ }
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (dragging && e.pointerId === dragId) {
        const x = e.clientX, y = e.clientY;
        dragDist += Math.abs(x - lastX) + Math.abs(y - lastY);
        if (x !== lastX || y !== lastY) cutSegment(lastX, lastY, x, y);
        lastX = x; lastY = y;
        return;
      }
      if (!unlocked) return;
      const now = performance.now();
      if (now - lastHover < 60) return;
      lastHover = now;
      if (hitsCloth(e.clientX, e.clientY)) {
        canvas.style.cursor = 'crosshair';
      } else {
        const el = elementBelow(e.clientX, e.clientY);
        canvas.style.cursor = el && el.closest('a, button') ? 'pointer' : 'default';
      }
    });

    const endDrag = (e) => {
      if (e.pointerId === dragId) { dragging = false; dragId = -1; }
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.addEventListener('click', (e) => {
      if (!unlocked || skipping) return;
      if (dragDist > 6) return; // it was a cut gesture, not a click
      if (hitsCloth(e.clientX, e.clientY)) return; // landed on remaining leather
      const el = elementBelow(e.clientX, e.clientY);
      if (el) el.click();
    });

    // ----------------------------------------------------------------- skip
    function skip() {
      if (skipping || disposed) return;
      skipping = true;
      pinned.fill(0);
      gravityMult = 3.5;
      for (const m of [material, backMat, wallMat, stripMat, tendonMat]) {
        m.transparent = true;
        m.needsUpdate = true;
      }
      fadeStart = performance.now();
    }

    skipBtn.addEventListener('click', skip);
    const onKeydown = (e) => {
      if (e.key === 'Escape' && !unlocked) skip();
    };
    window.addEventListener('keydown', onKeydown);

    // --------------------------------------------------------------- resize
    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (disposed) return;
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        const grew = Math.abs(window.innerWidth - baseW) / baseW > 0.18 ||
                     Math.abs(window.innerHeight - baseH) / baseH > 0.18;
        if (grew && !unlocked && !skipping) buildCloth(); // restart uncut at new size
        projStamp = -1;
      }, 250);
    };
    window.addEventListener('resize', onResize);

    // -------------------------------------------------------------- teardown
    function dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('resize', onResize);
      geometry.dispose();
      material.dispose();
      backGeo.dispose();
      backMat.dispose();
      wallGeo.dispose();
      wallMat.dispose();
      tendonGeo.dispose();
      tendonMat.dispose();
      stripGeo.dispose();
      stripMat.dispose();
      textures.albedo.dispose();
      textures.normal.dispose();
      textures.orm.dispose();
      renderer.dispose();
      removeOverlay();
    }

    // ------------------------------------------------------------- main loop
    document.body.style.overflow = 'hidden';
    let lastT = performance.now();
    let acc = 0, covTimer = 0;

    function frame(now) {
      if (disposed) return;
      rafId = requestAnimationFrame(frame);
      frameStamp++;
      let dt = (now - lastT) / 1000;
      lastT = now;
      if (dt > 0.05) dt = 0.05;
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 3) {
        physicsStep(STEP);
        acc -= STEP;
        steps++;
      }
      if (steps === 3) acc = 0;

      if (skipping) {
        const k = (now - fadeStart) / 900;
        if (k >= 1) { dispose(); return; }
        material.opacity = 1 - k;
        backMat.opacity = 1 - k;
        wallMat.opacity = 1 - k;
        stripMat.opacity = 1 - k;
        tendonMat.opacity = 1 - k;
      }

      updateGeometry();
      renderer.render(scene, camera);

      if (!firstRendered) {
        firstRendered = true;
        overlay.style.background = 'transparent';
      }

      if (!unlocked && !skipping) {
        covTimer += dt;
        if (covTimer > 0.3) {
          covTimer = 0;
          updateCoverage();
        }
      }
    }
    rafId = requestAnimationFrame(frame);
  }

  // ------------------------------------------------------ procedural leather
  // Near-black hide flecked with gold and ivory. Returns { albedo, normal, orm }
  // where orm packs roughness in G and metalness in B.
  function makeLeatherTextures() {
    const SIZE = 512;
    const n = SIZE * SIZE;

    const fract = (v) => v - Math.floor(v);
    const hash2 = (ix, iy, seed) =>
      fract(Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453);

    // tileable value noise, frequency f (integer cells per tile side)
    function vnoise(u, v, f, seed) {
      const x = u * f, y = v * f;
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const x0 = ix % f, x1 = (ix + 1) % f, y0 = iy % f, y1 = (iy + 1) % f;
      const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
      const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }

    function fbm(u, v, seed) {
      let s = 0, amp = 0.5, f = 4;
      for (let o = 0; o < 4; o++) {
        s += amp * vnoise(u, v, f, seed + o * 13.7);
        amp *= 0.5; f *= 2;
      }
      return s; // ~[0, 0.94]
    }

    // tileable jittered-grid Voronoi (F2 - F1) for the crease network
    const VG = 14;
    const jx = new Float32Array(VG * VG), jy = new Float32Array(VG * VG);
    for (let gy = 0; gy < VG; gy++) {
      for (let gx = 0; gx < VG; gx++) {
        jx[gy * VG + gx] = hash2(gx, gy, 5.1);
        jy[gy * VG + gx] = hash2(gx, gy, 9.3);
      }
    }
    function creaseAt(u, v) {
      const cx = Math.floor(u * VG), cy = Math.floor(v * VG);
      let f1 = 1e9, f2 = 1e9;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const gx = cx + dx, gy = cy + dy;
          const wx = ((gx % VG) + VG) % VG, wy = ((gy % VG) + VG) % VG;
          const sx = (gx + jx[wy * VG + wx]) / VG;
          const sy = (gy + jy[wy * VG + wx]) / VG;
          const ddx = u - sx, ddy = v - sy;
          const d = ddx * ddx + ddy * ddy;
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
        }
      }
      const gap = Math.sqrt(f2) - Math.sqrt(f1);
      let m = 1 - gap / 0.016; // 1 at the cell border, 0 away from it
      if (m < 0) m = 0;
      return m * m;
    }

    // height field & masks
    const height = new Float32Array(n);
    const creaseM = new Float32Array(n);
    const mottle = new Float32Array(n);
    for (let y = 0; y < SIZE; y++) {
      const v = y / SIZE;
      for (let x = 0; x < SIZE; x++) {
        const u = x / SIZE;
        const i = y * SIZE + x;
        const cm = creaseAt(u, v);
        const fb = fbm(u, v, 3.3);
        creaseM[i] = cm;
        mottle[i] = fb;
        height[i] = fb * 0.55 + (1 - cm) * 0.45;
      }
    }

    // speckle mask: 0 = plain hide, 1 = gold fleck, 2 = ivory fleck
    // (coordinates wrap so the texture stays tileable)
    const fleck = new Uint8Array(n);
    const putFleck = (x, y, v) => {
      fleck[(((y % SIZE) + SIZE) % SIZE) * SIZE + (((x % SIZE) + SIZE) % SIZE)] = v;
    };
    let fseed = 7.7;
    const frand = () => (fseed = fract(Math.sin(fseed * 12.9898) * 43758.5453));
    for (let k = 0; k < 950; k++) {
      const cx = (frand() * SIZE) | 0, cy = (frand() * SIZE) | 0;
      const s = 1 + ((frand() * 2.4) | 0);
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          if (frand() < 0.8) putFleck(cx + dx, cy + dy, 1);
        }
      }
    }
    for (let k = 0; k < 320; k++) {
      const cx = (frand() * SIZE) | 0, cy = (frand() * SIZE) | 0;
      const s = 1 + ((frand() * 1.8) | 0);
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          if (frand() < 0.75) putFleck(cx + dx, cy + dy, 2);
        }
      }
    }

    function toCanvas(fill) {
      const cv = document.createElement('canvas');
      cv.width = SIZE; cv.height = SIZE;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(SIZE, SIZE);
      fill(img.data);
      ctx.putImageData(img, 0, 0);
      return cv;
    }

    // albedo: near-black hide, mottled, darker in creases, gold/ivory flecks
    const albedoCv = toCanvas((d) => {
      for (let i = 0; i < n; i++) {
        const t = mottle[i] * 1.06; // ~[0,1]
        let r, g, b;
        if (fleck[i] === 1) {
          r = 168 + t * 44; g = 126 + t * 36; b = 50 + t * 18;   // gold
        } else if (fleck[i] === 2) {
          r = 204 + t * 24; g = 196 + t * 24; b = 180 + t * 22;  // ivory
        } else {
          // neutral charcoal, matching the site's dark scheme (#212121)
          r = 14 + (38 - 14) * t;
          g = 13 + (36 - 13) * t;
          b = 12 + (33 - 12) * t;
          const shade = 0.5 + 0.5 * (1 - creaseM[i]);
          r *= shade; g *= shade; b *= shade;
          if (hash2(i % SIZE, (i / SIZE) | 0, 21.7) > 0.985) { r *= 0.7; g *= 0.7; b *= 0.7; }
        }
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
      }
    });

    // normal map from the height field (wrapped sobel)
    const normalCv = toCanvas((d) => {
      const S = 2.2;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const i = y * SIZE + x;
          const xl = height[y * SIZE + ((x - 1 + SIZE) % SIZE)];
          const xr = height[y * SIZE + ((x + 1) % SIZE)];
          const yu = height[((y - 1 + SIZE) % SIZE) * SIZE + x];
          const yd = height[((y + 1) % SIZE) * SIZE + x];
          const nx = (xl - xr) * S, ny = (yd - yu) * S;
          const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
          d[i * 4] = (nx * inv * 0.5 + 0.5) * 255;
          d[i * 4 + 1] = (ny * inv * 0.5 + 0.5) * 255;
          d[i * 4 + 2] = (inv * 0.5 + 0.5) * 255;
          d[i * 4 + 3] = 255;
        }
      }
    });

    // packed roughness (G) + metalness (B); gold flecks are shiny and metallic
    const ormCv = toCanvas((d) => {
      for (let i = 0; i < n; i++) {
        let rough, metal = 0;
        if (fleck[i] === 1) { rough = 0.32; metal = 0.75; }
        else if (fleck[i] === 2) { rough = 0.5; }
        else rough = Math.min(1, 0.6 + mottle[i] * 0.26 + creaseM[i] * 0.12);
        d[i * 4] = 0;
        d[i * 4 + 1] = rough * 255;
        d[i * 4 + 2] = metal * 255;
        d[i * 4 + 3] = 255;
      }
    });

    const mk = (cv, srgb) => {
      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    };

    return {
      albedo: mk(albedoCv, true),
      normal: mk(normalCv, false),
      orm: mk(ormCv, false),
    };
  }
}
