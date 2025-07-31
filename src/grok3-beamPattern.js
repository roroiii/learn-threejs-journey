import gsap from 'gsap';
import GUI from 'lil-gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Antenna parameters
const antennaParams = {
  mainBeamWidth: 1.2,
  sideLobeLevel: 0.3,
  beamDirection: 0,
  elevationAngle: 0,
  opacity: 0.9,
  wireframe: false,
  colorScheme: 'rainbow', // Options: 'rainbow', 'thermal', 'plasma', 'electric', 'fire'
  autoRotate: false,
};

// Color schemes for vibrant, lighting-independent effect
const colorSchemes = {
  rainbow: (intensity) => {
    const hue = 1 - intensity;
    const saturation = 1.0; // 提高飽和度到最大值
    const lightness = 0.5;

    return new THREE.Color().setHSL(hue, saturation, lightness);
  },
  thermal: (intensity) => {
    let hue, saturation, lightness;
    if (intensity < 0.2) {
      hue = 0.67;
      saturation = 1.0; // 提高飽和度
      lightness = 0.3 + intensity * 2.5;
    } else if (intensity < 0.4) {
      hue = 0.67 - (intensity - 0.2) * 0.17 * 5;
      saturation = 1.0; // 提高飽和度
      lightness = 0.6;
    } else if (intensity < 0.6) {
      hue = 0.5 - (intensity - 0.4) * 0.17 * 5;
      saturation = 1.0; // 提高飽和度
      lightness = 0.6;
    } else if (intensity < 0.8) {
      hue = 0.33 - (intensity - 0.6) * 0.17 * 5;
      saturation = 1.0; // 提高飽和度
      lightness = 0.6;
    } else {
      hue = 0.16 - (intensity - 0.8) * 0.16 * 5;
      saturation = 1.0; // 提高飽和度
      lightness = 0.5 + (intensity - 0.8) * 1.5;
    }
    return new THREE.Color().setHSL(hue, saturation, lightness);
  },
  plasma: (intensity) => {
    const hue = (intensity * 0.8 + Math.sin(intensity * Math.PI * 3) * 0.1) % 1;
    const saturation = 1.0; // 設定為最大飽和度
    const lightness = 0.5 + intensity * 0.3;
    return new THREE.Color().setHSL(hue, saturation, lightness);
  },
  electric: (intensity) => {
    const hue = 0.75 - intensity * 0.25;
    const saturation = 1.0; // 提高飽和度
    const lightness = 0.4 + intensity * 0.4; // 調整亮度使顏色更鮮豔
    return new THREE.Color().setHSL(hue, saturation, lightness);
  },
  fire: (intensity) => {
    let hue, saturation, lightness;
    if (intensity < 0.5) {
      hue = 0;
      saturation = 1.0; // 提高飽和度
      lightness = 0.3 + intensity * 0.8; // 調整亮度範圍
    } else {
      hue = (intensity - 0.5) * 0.16;
      saturation = 1.0; // 提高飽和度
      lightness = 0.6 + (intensity - 0.5) * 0.3; // 調整亮度
    }
    return new THREE.Color().setHSL(hue, saturation, lightness);
  },
};

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);
const canvas = document.querySelector('canvas.webgl');
if (!canvas) {
  console.error('Canvas with class "webgl" not found');
  throw new Error('Canvas not found');
}
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};
const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100);
camera.position.set(5, 5, 5);
scene.add(camera);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Orbit controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Variables
let beamMesh = null;
let wireframeMesh = null;
let animationId = null;

// Calculate antenna pattern (upper hemisphere)
function calculateAntennaPattern(theta, phi) {
  const { mainBeamWidth, sideLobeLevel, beamDirection, elevationAngle } = antennaParams;
  const beamDirRad = (beamDirection * Math.PI) / 180;
  const elevRad = (elevationAngle * Math.PI) / 180;
  const mainBeamTheta = Math.PI / 2 - elevRad;
  const mainBeamPhi = beamDirRad;

  const thetaDiff = Math.abs(theta - mainBeamTheta);
  const phiDiff = Math.abs(phi - mainBeamPhi);
  const phiDiffNormalized = Math.min(phiDiff, 2 * Math.PI - phiDiff);

  const mainBeamAngle = Math.sqrt(thetaDiff * thetaDiff + phiDiffNormalized * phiDiffNormalized);
  let mainBeamIntensity = 0;
  if (mainBeamAngle < mainBeamWidth) {
    mainBeamIntensity = Math.exp(-Math.pow(mainBeamAngle / (mainBeamWidth * 0.5), 2));
  }

  const sideLobeTheta = Math.PI - mainBeamTheta;
  const sideLobePhi = mainBeamPhi + Math.PI;
  const sideLobePhiNormalized = sideLobePhi > 2 * Math.PI ? sideLobePhi - 2 * Math.PI : sideLobePhi;
  const sideLobePhiDiff = Math.abs(phi - sideLobePhiNormalized);
  const sideLobePhiDiffNorm = Math.min(sideLobePhiDiff, 2 * Math.PI - sideLobePhiDiff);
  const sideLobeThetaDiff = Math.abs(theta - sideLobeTheta);
  const sideLobeAngle = Math.sqrt(sideLobeThetaDiff * sideLobeThetaDiff + sideLobePhiDiffNorm * sideLobePhiDiffNorm);

  let sideLobeIntensity = 0;
  if (sideLobeAngle < mainBeamWidth * 1.5 && theta <= Math.PI / 2) {
    sideLobeIntensity = sideLobeLevel * Math.exp(-Math.pow(sideLobeAngle / (mainBeamWidth * 0.8), 2));
  }

  let totalIntensity = Math.max(mainBeamIntensity, sideLobeIntensity);
  totalIntensity = Math.max(0.05, totalIntensity);
  return Math.min(1, totalIntensity);
}

// Create beam pattern geometry (upper hemisphere)
function createBeamPatternGeometry() {
  const phiSegments = 64 * 4;
  const thetaSegments = 32;
  const vertices = [];
  const colors = [];
  const indices = [];

  for (let i = 0; i <= thetaSegments; i++) {
    const theta = ((i / thetaSegments) * Math.PI) / 2; // 只計算上半球
    for (let j = 0; j <= phiSegments; j++) {
      const phi = (j / phiSegments) * Math.PI * 2;
      const intensity = calculateAntennaPattern(theta, phi);
      const radius = intensity * 2.5 + 0.1;
      const x = radius * Math.sin(theta) * Math.cos(phi);
      const y = radius * Math.cos(theta);
      const z = radius * Math.sin(theta) * Math.sin(phi);
      vertices.push(x, y, z);
      const color = colorSchemes[antennaParams.colorScheme](intensity);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let i = 0; i < thetaSegments; i++) {
    for (let j = 0; j < phiSegments; j++) {
      const a = i * (phiSegments + 1) + j;
      const b = a + phiSegments + 1;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Create beam pattern mesh
function createBeamPatternMesh() {
  if (beamMesh) {
    scene.remove(beamMesh);
    beamMesh.geometry.dispose();
    beamMesh.material.dispose();
  }
  if (wireframeMesh) {
    scene.remove(wireframeMesh);
    wireframeMesh.geometry.dispose();
    wireframeMesh.material.dispose();
  }

  const geometry = createBeamPatternGeometry();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: antennaParams.opacity,
    side: THREE.DoubleSide,
    // wireframe: true,
  });
  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.2,
  });

  beamMesh = new THREE.Mesh(geometry, material);
  wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
  scene.add(beamMesh);
  if (antennaParams.wireframe) {
    scene.add(wireframeMesh);
  }
}

// Update beam pattern
function updateBeamPattern() {
  createBeamPatternMesh();
}

// Setup GUI
function setupGUI() {
  const gui = new GUI({ width: 320, title: '天線輻射圖案控制', closeFolders: false });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'h') gui.show(gui._hidden);
  });

  const antennaFolder = gui.addFolder('天線參數');
  antennaFolder
    .add(antennaParams, 'mainBeamWidth')
    .min(0.5)
    .max(3.0)
    .step(0.1)
    .name('主瓣寬度')
    .onChange(updateBeamPattern);
  antennaFolder
    .add(antennaParams, 'sideLobeLevel')
    .min(0.1)
    .max(0.8)
    .step(0.05)
    .name('旁瓣強度')
    .onChange(updateBeamPattern);
  antennaFolder
    .add(antennaParams, 'beamDirection')
    .min(0)
    .max(360)
    .step(5)
    .name('方位角 (度)')
    .onChange(updateBeamPattern);
  antennaFolder
    .add(antennaParams, 'elevationAngle')
    .min(-90)
    .max(90)
    .step(5)
    .name('仰角 (度)')
    .onChange(updateBeamPattern);
  antennaFolder
    .add(antennaParams, 'opacity')
    .min(0.1)
    .max(1.0)
    .step(0.1)
    .name('透明度')
    .onChange(() => {
      if (beamMesh) beamMesh.material.opacity = antennaParams.opacity;
    });
  antennaFolder
    .add(antennaParams, 'wireframe')
    .name('顯示線框')
    .onChange(() => {
      if (antennaParams.wireframe) {
        scene.add(wireframeMesh);
      } else {
        scene.remove(wireframeMesh);
      }
    });
  antennaFolder
    .add(antennaParams, 'colorScheme', ['rainbow', 'thermal', 'plasma', 'electric', 'fire'])
    .name('顏色方案')
    .onChange(updateBeamPattern);
  antennaFolder.add(antennaParams, 'autoRotate').name('自動旋轉');

  const controlsFolder = gui.addFolder('控制');
  controlsFolder
    .add(
      {
        resetView: () => {
          gsap.to(camera.position, {
            duration: 1,
            x: 5,
            y: 5,
            z: 5,
            onUpdate: () => controls.update(),
          });
        },
      },
      'resetView'
    )
    .name('重設視角');
  controlsFolder
    .add(
      {
        spin: () => {
          if (beamMesh) {
            gsap.to(beamMesh.rotation, { duration: 2, y: beamMesh.rotation.y + Math.PI * 2 });
            if (wireframeMesh) {
              gsap.to(wireframeMesh.rotation, { duration: 2, y: wireframeMesh.rotation.y + Math.PI * 2 });
            }
          }
        },
      },
      'spin'
    )
    .name('旋轉一圈');
}

// Setup scene
function setupScene() {
  const axesHelper = new THREE.AxesHelper(4);
  scene.add(axesHelper);

  function createTextSprite(message) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 128;
    context.font = '48px Arial';
    context.fillStyle = 'white';
    context.fillText(message, 10, 60);
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(1, 0.5, 1);
    return sprite;
  }

  const thetaSprite = createTextSprite('θ (elevation)');
  thetaSprite.position.set(0, 2.5, 0);
  // scene.add(thetaSprite);

  const phiSprite = createTextSprite('φ (azimuth)');
  phiSprite.position.set(2, 0, 2);
  // scene.add(phiSprite);

  const incidentDir = new THREE.Vector3(0, -1, 0);
  const incidentArrow = new THREE.ArrowHelper(incidentDir, new THREE.Vector3(0, 3, 0), 1, 0xff0000, 0.2, 0.1);
  // scene.add(incidentArrow);

  const reflectedDir = new THREE.Vector3(0, 1, 0);
  const reflectedArrow = new THREE.ArrowHelper(reflectedDir, new THREE.Vector3(0, -3, 0), 1, 0x00ff00, 0.2, 0.1);
  // scene.add(reflectedArrow);

  const planeGeometry = new THREE.PlaneGeometry(4, 4);
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0xaaaaaa,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = Math.PI / 2;
  scene.add(plane);

  createBeamPatternMesh();
}

// Handle resize
window.addEventListener('resize', () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// Animation loop
const clock = new THREE.Clock();
function tick() {
  const elapsedTime = clock.getElapsedTime();
  if (antennaParams.autoRotate && beamMesh) {
    beamMesh.rotation.y = elapsedTime * 0.2;
    if (wireframeMesh) wireframeMesh.rotation.y = elapsedTime * 0.2;
  }
  controls.update();
  renderer.render(scene, camera);
  animationId = requestAnimationFrame(tick);
}

// Initialize
function init() {
  setupScene();
  setupGUI();
  tick();
}

// Cleanup
window.addEventListener('beforeunload', () => {
  if (animationId) cancelAnimationFrame(animationId);
});

init();
