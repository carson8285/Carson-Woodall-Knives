import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

class KnifeViewer {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0.35, 2.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 4.0;
    this.controls.target.set(0, 0.20, 0);

    // Lights (minimal, reflections come from env)
    const dir = new THREE.DirectionalLight(0xffffff, 0.35);
    dir.position.set(3, 6, 3);
    this.scene.add(dir);

    // Environment (critical for mirror steel)
    new RGBELoader().load(
      'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr',
      (hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        this.scene.environment = hdr;
      }
    );

    this.loader = new GLTFLoader();
    this.current = null;
    this.currentUrl = null;

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // Loads a GLB and centers it
  loadModel(url) {
    if (!url || url === this.currentUrl) return;
    this.currentUrl = url;

    // remove previous
    if (this.current) {
      this.scene.remove(this.current);
      this.current.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            // Don't dispose textures if you reuse; ok for now.
            m.dispose?.();
          });
        }
      });
      this.current = null;
    }

    this.loader.load(
      url,
      (gltf) => {
        this.current = gltf.scene;
        this.scene.add(this.current);

        // center + frame
this.current = gltf.scene;
this.scene.add(this.current);

// ---- RESET TRANSFORMS (important) ----
this.current.position.set(0, 0, 0);
this.current.rotation.set(0, 0, 0);
this.current.scale.set(1, 1, 1);
this.current.updateWorldMatrix(true, true);

// ---- 1) CENTER FIRST ----
let box = new THREE.Box3().setFromObject(this.current);
let center = box.getCenter(new THREE.Vector3());

// move model so its center is at origin
this.current.position.sub(center);
this.current.updateWorldMatrix(true, true);

// ---- 2) SCALE TO A TARGET SIZE ----
box = new THREE.Box3().setFromObject(this.current);
const size = box.getSize(new THREE.Vector3());
const maxDim = Math.max(size.x, size.y, size.z);

const targetMaxDim = 1.2; // tweak: 1.0 smaller, 1.5 bigger
const s = targetMaxDim / maxDim;

this.current.scale.setScalar(s);
this.current.updateWorldMatrix(true, true);

// ---- 3) RE-CENTER AGAIN (scaling can shift bounds slightly) ----
box = new THREE.Box3().setFromObject(this.current);
center = box.getCenter(new THREE.Vector3());
this.current.position.sub(center);
this.current.updateWorldMatrix(true, true);

// ---- 4) SET ORBIT TARGET TO THE MODEL (NOT THE VIEWPORT CENTER) ----
box = new THREE.Box3().setFromObject(this.current);
const finalSize = box.getSize(new THREE.Vector3());

// orbit around the knife center (slightly above center feels better)
this.controls.target.set(0, finalSize.y * 0.12, 0);
this.controls.update();

// ---- 5) PLACE CAMERA TO FRAME IT ----
const dist = targetMaxDim * 1.8;
this.camera.position.set(0, finalSize.y * 0.20, dist);
this.camera.lookAt(this.controls.target);

      },
      undefined,
      (err) => console.error('GLB load error:', err)
    );
  }

  // Hook for your builder state
  applyState(state) {
    // 1) Decide which model file to load for the selected knife
    // Adjust this path to match your project.
    // Example expects: /builder/assets/models/<knifeId>.glb
const knifeId = state?.knife;
if (knifeId) {
  this.loadModel(`./assets/models/${knifeId}.glb`);
}

    // 2) Later: toggle meshes/material variants based on options
    // state.options.handle / filework / finish
    // For now we just load the knife model.
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Create viewer and expose it globally so builder.js can call it
const container = document.getElementById('knifeViewer');
const viewer = new KnifeViewer(container);
window.KnifeViewer = viewer;