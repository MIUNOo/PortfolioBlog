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
    const WORLD_H = 60;            // world units visible vertically
    const FOV = 35;
    const STEP = 1 / 60;
    const ITERATIONS = 4;
    const GRAVITY = -130;
    const DAMPING = 0.982;
    const WIND_AMP = 5;
    const COV_COLS = 32, COV_ROWS = 20;

    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const COLS = small ? 44 : 80;
    const ROWS = small ? 30 : 50;

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

    scene.add(new THREE.HemisphereLight(0xfff5e6, 0x3a2a1c, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffeeda, 2.2);
    keyLight.position.set(-45, 65, 90);
    scene.add(keyLight);

    const textures = makeLeatherTextures();
    const material = new THREE.MeshStandardMaterial({
      map: textures.albedo,
      normalMap: textures.normal,
      roughnessMap: textures.roughness,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 1.0,
      metalness: 0.0,
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
    const cA = [], cB = [], cRest = [], cAlive = [], cFace1 = [], cFace2 = [];
    let indexDirty = true;
    let baseW = window.innerWidth, baseH = window.innerHeight;

    const vid = (r, c) => r * NX + c;

    function addConstraint(a, b, f1, f2) {
      cA.push(a); cB.push(b);
      const dx = px[a] - px[b], dy = py[a] - py[b];
      cRest.push(Math.sqrt(dx * dx + dy * dy));
      cAlive.push(1); cFace1.push(f1); cFace2.push(f2);
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

      cA.length = cB.length = cRest.length = cAlive.length = cFace1.length = cFace2.length = 0;
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
      // diagonals (A-D belongs to both triangles of its cell; B-C is physics-only)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          addConstraint(vid(r, c), vid(r + 1, c + 1), cellF0(r, c), cellF0(r, c) + 1);
          addConstraint(vid(r, c + 1), vid(r + 1, c), -1, -1);
        }
      }
      indexDirty = true;
      baseW = window.innerWidth; baseH = window.innerHeight;

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
    const indexArr = new Uint16Array(FACES * 3);
    geometry.setIndex(new THREE.BufferAttribute(indexArr, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 5000);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);

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
        const wz = (Math.sin(t * 0.8 + x * 0.06 + y * 0.04) +
                    0.5 * Math.sin(t * 1.7 + y * 0.09)) * WIND_AMP * h2;
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
    }

    function updateGeometry() {
      if (indexDirty) rebuildIndex();
      const pos = geometry.attributes.position.array;
      for (let i = 0; i < N; i++) {
        pos[i * 3] = px[i]; pos[i * 3 + 1] = py[i]; pos[i * 3 + 2] = pz[i];
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
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

    function killConstraint(c) {
      cAlive[c] = 0;
      const f1 = cFace1[c], f2 = cFace2[c];
      if (f1 >= 0 && faceAlive[f1]) { faceAlive[f1] = 0; indexDirty = true; }
      if (f2 >= 0 && faceAlive[f2]) { faceAlive[f2] = 0; indexDirty = true; }
      // small pop toward the camera so the slit opens visibly
      const a = cA[c], b = cB[c];
      if (!pinned[a]) oz[a] -= 0.5 + Math.random() * 0.3;
      if (!pinned[b]) oz[b] -= 0.5 + Math.random() * 0.3;
    }

    function cutSegment(x0, y0, x1, y1) {
      projectAll();
      const minX = Math.min(x0, x1) - 1, maxX = Math.max(x0, x1) + 1;
      const minY = Math.min(y0, y1) - 1, maxY = Math.max(y0, y1) + 1;
      const M = cA.length;
      let cutAny = false;
      for (let c = 0; c < M; c++) {
        if (!cAlive[c]) continue;
        const a = cA[c], b = cB[c];
        const ax = scrX[a], ay = scrY[a], bx = scrX[b], by = scrY[b];
        if ((ax < minX && bx < minX) || (ax > maxX && bx > maxX) ||
            (ay < minY && by < minY) || (ay > maxY && by > maxY)) continue;
        if (segmentsIntersect(ax, ay, bx, by, x0, y0, x1, y1)) {
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
      material.transparent = true;
      material.needsUpdate = true;
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
      textures.albedo.dispose();
      textures.normal.dispose();
      textures.roughness.dispose();
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

    function toCanvas(fill) {
      const cv = document.createElement('canvas');
      cv.width = SIZE; cv.height = SIZE;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(SIZE, SIZE);
      fill(img.data);
      ctx.putImageData(img, 0, 0);
      return cv;
    }

    // albedo: warm brown, mottled, darker in creases, speckled pores
    const albedoCv = toCanvas((d) => {
      for (let i = 0; i < n; i++) {
        const t = mottle[i] * 1.06; // ~[0,1]
        let r = 74 + (126 - 74) * t;
        let g = 44 + (82 - 44) * t;
        let b = 26 + (50 - 26) * t;
        const shade = 0.72 + 0.28 * (1 - creaseM[i]);
        r *= shade; g *= shade; b *= shade;
        if (hash2(i % SIZE, (i / SIZE) | 0, 21.7) > 0.985) { r *= 0.82; g *= 0.82; b *= 0.82; }
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

    // roughness (green channel is what MeshStandardMaterial samples)
    const roughCv = toCanvas((d) => {
      for (let i = 0; i < n; i++) {
        const v = Math.min(1, 0.68 + mottle[i] * 0.22 + creaseM[i] * 0.10) * 255;
        d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
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
      roughness: mk(roughCv, false),
    };
  }
}
