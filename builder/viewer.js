// viewer.js (type="module")
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const container = document.getElementById("knifeViewer");
if (!container) {
  console.error("viewer.js: #knifeViewer not found");
}

// ---- public ready promise ----
let _resolveReady;
const ready = new Promise((r) => (_resolveReady = r));

// ---- loading events for builder.js to hook loader UI ----
function emitLoading(loading, text = "Loading…") {
  window.dispatchEvent(
    new CustomEvent("knifeviewer:loading", { detail: { loading, text } })
  );
}
function emitError(message) {
  window.dispatchEvent(
    new CustomEvent("knifeviewer:error", { detail: { message } })
  );
}

// ---- helpers ----
function waitForNonZeroSize(el) {
  return new Promise((resolve) => {
    const tick = () => {
      const w = el?.clientWidth ?? 0;
      const h = el?.clientHeight ?? 0;
      if (w > 10 && h > 10) return resolve({ w, h });
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function frameObject(camera, controls, object, fitOffset = 1.25) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * fitOffset;

  camera.position.set(center.x, center.y, center.z + cameraZ);
  camera.near = Math.max(maxDim / 1000, 0.001);
  camera.far = Math.max(maxDim * 100, 10);
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(center);
    controls.update();
  } else {
    camera.lookAt(center);
  }
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          // dispose textures
          for (const k in m) {
            const v = m[k];
            if (v && v.isTexture) v.dispose();
          }
          m.dispose?.();
        });
      }
    }
  });
}

// ---- Three.js core ----
let renderer, scene, camera, controls;
let currentModel = null;
let loadToken = 0;
const loader = new GLTFLoader();

async function init() {
  if (!container) return;

  // Wait until the container actually has a size (fixes “blank until refresh”)
function waitForStableSize(el) {
  return new Promise((resolve) => {
    let lastW = 0, lastH = 0, stableFrames = 0;

    const tick = () => {
      const w = el?.clientWidth ?? 0;
      const h = el?.clientHeight ?? 0;

      if (w > 10 && h > 10) {
        if (w === lastW && h === lastH) stableFrames++;
        else stableFrames = 0;

        lastW = w; lastH = h;

        if (stableFrames >= 1) return resolve({ w, h }); // stable for 2 frames
      } else {
        stableFrames = 0;
        lastW = w; lastH = h;
      }

      requestAnimationFrame(tick);
    };

    tick();
  });
}

  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(35, w / h, 0.01, 1000);
  camera.position.set(0, 0.2, 2);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);

  // ensure a clean mount
  container.innerHTML = "";
  container.appendChild(renderer.domElement);
requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
setTimeout(() => window.dispatchEvent(new Event("resize")), 120);

  // Lights (simple, reliable)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x111111, 1.1);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2, 3, 4);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(-3, 1.5, 2);
  scene.add(fill);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 0.5;
  controls.maxDistance = 10;

  // Resize handling: ResizeObserver + window resize + iOS visualViewport
  const doResize = () => {
    if (!container || !renderer || !camera) return;
    const ww = container.clientWidth;
    const hh = container.clientHeight;
    if (ww < 10 || hh < 10) return;
    renderer.setSize(ww, hh, false);
    camera.aspect = ww / hh;
    camera.updateProjectionMatrix();
  };

  const ro = new ResizeObserver(() => doResize());
  ro.observe(container);

  window.addEventListener("resize", doResize, { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(doResize, 50), {
    passive: true,
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", doResize, { passive: true });
  }

  // WebGL context loss handling
  renderer.domElement.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      emitError("WebGL context lost. Tap refresh if it doesn’t recover.");
    },
    false
  );

  renderer.domElement.addEventListener(
    "webglcontextrestored",
    () => {
      // a resize usually kicks it back
      setTimeout(doResize, 50);
    },
    false
  );

  // render loop
  const animate = () => {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  };
  animate();

  _resolveReady();
}

async function loadModel(url) {
  const token = ++loadToken;
  emitLoading(true, "Loading model…");

  try {
    // Hard fetch guard: if URL 404s intermittently due to path issues, you'll see it.
    const gltf = await new Promise((resolve, reject) => {
      loader.load(
        url,
        resolve,
        undefined,
        (err) => reject(err)
      );
    });

    // Ignore stale loads
    if (token !== loadToken) return;

    // Clear previous model
    if (currentModel) {
      scene.remove(currentModel);
      disposeObject(currentModel);
      currentModel = null;
    }

    currentModel = gltf.scene;
    scene.add(currentModel);

    // Frame it (fixes “too big / off center”)
    frameObject(camera, controls, currentModel, 1.22);

  } catch (err) {
    console.error("viewer.js loadModel error:", err);
    emitError("Model failed to load. Check path + console.");
  } finally {
    // Only end loading if this is still the latest token
    if (token === loadToken) emitLoading(false);
  }
}

// ---- public API ----
// Your state has: state.category, state.knife, state.options
// We'll map knifeId -> model path. Adjust this ONE LINE if your folder differs.
function getModelUrlFromState(state) {
  const knifeId = state?.knife;
  if (!knifeId) return null;

  // ✅ Adjust if needed:
  // If your models are: /builder/assets/models/<knifeId>.glb
  return `./assets/models/${knifeId}.glb`;
}

async function applyState(state) {
  await ready;
  const url = getModelUrlFromState(state);
  if (!url) return;
  await loadModel(url);
}

// Expose globally for builder.js
window.KnifeViewer = {
  ready,
  applyState
};

// kick init immediately
document.addEventListener("DOMContentLoaded", () => init());
