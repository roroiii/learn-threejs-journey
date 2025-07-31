import gsap from 'gsap';
import GUI from 'lil-gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Debug GUI
 */
const gui = new GUI({
  width: 320,
  title: '天線輻射圖案控制',
  closeFolders: false,
});

window.addEventListener('keydown', (event) => {
  if (event.key == 'h') gui.show(gui._hidden);
});

/**
 * 天線參數物件
 */
const antennaParams = {
  mainBeamWidth: 1.2,
  sideLobeLevel: 0.3,
  beamDirection: 0,
  elevationAngle: 0,
  frequency: 2.4, // GHz
  gain: 8, // dBi
  polarization: 'vertical',
  wireframe: false,
  opacity: 0.85,
  autoRotate: false,
  colorScheme: 'thermal',
};

/**
 * 顏色方案
 */
const colorSchemes = {
  rainbow: (intensity) => {
    // 更鮮豔的彩虹色彩
    const hue = (1 - intensity) * 0.85; // 從紫紅到紅
    const saturation = 0.9 + intensity * 0.1; // 高飽和度
    const lightness = 0.3 + intensity * 0.4; // 適中亮度
    return new THREE.Color().setHSL(hue, saturation, lightness);
  },
  thermal: (intensity) => {
    // 熱力圖配色
    if (intensity < 0.2) {
      return new THREE.Color().lerpColors(
        new THREE.Color(0x000033), // 深藍
        new THREE.Color(0x0066ff), // 亮藍
        intensity * 5
      );
    } else if (intensity < 0.4) {
      return new THREE.Color().lerpColors(
        new THREE.Color(0x0066ff), // 亮藍
        new THREE.Color(0x00ffff), // 青
        (intensity - 0.2) * 5
      );
    } else if (intensity < 0.6) {
      return new THREE.Color().lerpColors(
        new THREE.Color(0x00ffff), // 青
        new THREE.Color(0x00ff00), // 綠
        (intensity - 0.4) * 5
      );
    } else if (intensity < 0.8) {
      return new THREE.Color().lerpColors(
        new THREE.Color(0x00ff00), // 綠
        new THREE.Color(0xffff00), // 黃
        (intensity - 0.6) * 5
      );
    } else {
      return new THREE.Color().lerpColors(
        new THREE.Color(0xffff00), // 黃
        new THREE.Color(0xff0000), // 紅
        (intensity - 0.8) * 5
      );
    }
  },
  plasma: (intensity) => {
    // 等離子效果
    const angle = intensity * Math.PI * 2;
    const r = 0.5 + 0.5 * Math.sin(angle);
    const g = 0.5 + 0.5 * Math.sin(angle + (Math.PI * 2) / 3);
    const b = 0.5 + 0.5 * Math.sin(angle + (Math.PI * 4) / 3);
    return new THREE.Color(Math.pow(r, 0.8), Math.pow(g, 0.8), Math.pow(b, 0.8));
  },
};

/**
 * Base
 */
const canvas = document.querySelector('canvas.webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

/**
 * 變數宣告
 */
let beamMesh = null;
let wireframeMesh = null;
let animationId = null;

/**
 * 天線方向圖計算函數 - 熱氣球形狀 (一個主瓣 + 一個旁瓣)
 */
function calculateAntennaPattern(theta, phi) {
  const { mainBeamWidth, sideLobeLevel, beamDirection, elevationAngle, gain } = antennaParams;

  // 轉換角度為弧度
  const beamDirRad = (beamDirection * Math.PI) / 180;
  const elevRad = (elevationAngle * Math.PI) / 180;

  // 主瓣方向 (向上，theta = 0)
  const mainBeamTheta = Math.PI / 2 - elevRad;
  const mainBeamPhi = beamDirRad;

  // 計算與主瓣方向的角度差
  const thetaDiff = Math.abs(theta - mainBeamTheta);
  const phiDiff = Math.abs(phi - mainBeamPhi);
  const phiDiffNormalized = Math.min(phiDiff, 2 * Math.PI - phiDiff);

  // 主瓣計算 (熱氣球的上半部)
  const mainBeamAngle = Math.sqrt(thetaDiff * thetaDiff + phiDiffNormalized * phiDiffNormalized);
  let mainBeamIntensity = 0;

  if (mainBeamAngle < mainBeamWidth) {
    // 使用高斯函數創建平滑的主瓣
    mainBeamIntensity = Math.exp(-Math.pow(mainBeamAngle / (mainBeamWidth * 0.5), 2));
  }

  // 旁瓣計算 (熱氣球的下半部 - 反向)
  const sideLobeTheta = Math.PI - mainBeamTheta; // 相對方向
  const sideLobePhi = mainBeamPhi + Math.PI; // 相對方向

  const sideLobePhiNormalized = sideLobePhi > 2 * Math.PI ? sideLobePhi - 2 * Math.PI : sideLobePhi;
  const sideLobePhiDiff = Math.abs(phi - sideLobePhiNormalized);
  const sideLobePhiDiffNorm = Math.min(sideLobePhiDiff, 2 * Math.PI - sideLobePhiDiff);

  const sideLobeThetaDiff = Math.abs(theta - sideLobeTheta);
  const sideLobeAngle = Math.sqrt(sideLobeThetaDiff * sideLobeThetaDiff + sideLobePhiDiffNorm * sideLobePhiDiffNorm);

  let sideLobeIntensity = 0;
  if (sideLobeAngle < mainBeamWidth * 1.5) {
    // 旁瓣較寬但強度較低
    sideLobeIntensity = sideLobeLevel * Math.exp(-Math.pow(sideLobeAngle / (mainBeamWidth * 0.8), 2));
  }

  // 合併主瓣和旁瓣
  let totalIntensity = Math.max(mainBeamIntensity, sideLobeIntensity);

  // 應用增益
  totalIntensity *= Math.pow(10, gain / 20) * 0.4;

  // 確保有最小值，形成熱氣球的基本形狀
  const baseIntensity = 0.05;
  totalIntensity = Math.max(baseIntensity, totalIntensity);

  return Math.min(1, totalIntensity);
}

/**
 * 創建天線輻射圖案幾何體
 */
function createBeamPatternGeometry() {
  const phiSegments = 64; // 方位角分割數
  const thetaSegments = 32; // 仰角分割數

  const vertices = [];
  const colors = [];
  const indices = [];

  // 生成頂點
  for (let i = 0; i <= thetaSegments; i++) {
    const theta = (i / thetaSegments) * Math.PI; // 0 到 π

    for (let j = 0; j <= phiSegments; j++) {
      const phi = (j / phiSegments) * Math.PI * 2; // 0 到 2π

      // 計算輻射強度
      const intensity = calculateAntennaPattern(theta, phi);

      // 將球座標轉換為笛卡爾座標，半徑由強度決定
      const radius = intensity * 2.5 + 0.1; // 最小半徑避免塌陷
      const x = radius * Math.sin(theta) * Math.cos(phi);
      const y = radius * Math.cos(theta);
      const z = radius * Math.sin(theta) * Math.sin(phi);

      vertices.push(x, y, z);

      // 使用選定的顏色方案，確保顏色鮮豔
      const color = colorSchemes[antennaParams.colorScheme](intensity);
      colors.push(color.r, color.g, color.b);
    }
  }

  // 生成三角形索引
  for (let i = 0; i < thetaSegments; i++) {
    for (let j = 0; j < phiSegments; j++) {
      const a = i * (phiSegments + 1) + j;
      const b = a + phiSegments + 1;
      const c = a + 1;
      const d = b + 1;

      // 兩個三角形組成一個四邊形
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

/**
 * 創建天線輻射圖案網格
 */
function createBeamPatternMesh() {
  // 移除舊的網格
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

  // 主要材質 - 增強發光效果
  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    opacity: antennaParams.opacity,
    side: THREE.DoubleSide,
    shininess: 300,
    specular: 0x888888,
    emissive: 0x111111, // 添加自發光
    emissiveIntensity: 0.2,
  });

  // 線框材質
  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.2,
  });

  beamMesh = new THREE.Mesh(geometry.clone(), material);
  wireframeMesh = new THREE.Mesh(geometry.clone(), wireframeMaterial);

  scene.add(beamMesh);

  if (antennaParams.wireframe) {
    scene.add(wireframeMesh);
  }
}

/**
 * 更新輻射圖案
 */
function updateBeamPattern() {
  createBeamPatternMesh();
}

/**
 * 設置 GUI 控制項
 */
function setupGUI() {
  // 天線參數資料夾
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

  antennaFolder.add(antennaParams, 'gain').min(0).max(30).step(1).name('增益 (dBi)').onChange(updateBeamPattern);

  antennaFolder
    .add(antennaParams, 'frequency')
    .min(0.1)
    .max(10)
    .step(0.1)
    .name('頻率 (GHz)')
    .onChange(updateBeamPattern);

  // 視覺效果資料夾
  const visualFolder = gui.addFolder('視覺效果');

  visualFolder
    .add(antennaParams, 'wireframe')
    .name('顯示線框')
    .onChange(() => {
      if (antennaParams.wireframe) {
        scene.add(wireframeMesh);
      } else {
        scene.remove(wireframeMesh);
      }
    });

  visualFolder
    .add(antennaParams, 'opacity')
    .min(0.1)
    .max(1.0)
    .step(0.1)
    .name('透明度')
    .onChange(() => {
      if (beamMesh) {
        beamMesh.material.opacity = antennaParams.opacity;
      }
    });

  visualFolder
    .add(antennaParams, 'colorScheme', ['rainbow', 'thermal', 'plasma'])
    .name('顏色方案')
    .onChange(updateBeamPattern);

  visualFolder.add(antennaParams, 'autoRotate').name('自動旋轉');

  // 控制按鈕資料夾
  const controlsFolder = gui.addFolder('控制');

  const actions = {
    resetView: () => {
      gsap.to(camera.position, {
        duration: 1,
        x: 5,
        y: 5,
        z: 5,
        onUpdate: () => {
          controls.update();
        },
      });
    },
    spin: () => {
      if (beamMesh) {
        gsap.to(beamMesh.rotation, {
          duration: 2,
          y: beamMesh.rotation.y + Math.PI * 2,
        });
        if (wireframeMesh) {
          gsap.to(wireframeMesh.rotation, {
            duration: 2,
            y: wireframeMesh.rotation.y + Math.PI * 2,
          });
        }
      }
    },
    exportData: () => {
      console.log('天線參數:', antennaParams);
      // 可以在這裡添加匯出功能
    },
  };

  controlsFolder.add(actions, 'resetView').name('重設視角');
  controlsFolder.add(actions, 'spin').name('旋轉一圈');
  controlsFolder.add(actions, 'exportData').name('匯出參數');
}

/**
 * 場景設置
 */
function setupScene() {
  // 添加燈光
  const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 10, 5);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // 添加點光源增加視覺效果
  const pointLight = new THREE.PointLight(0x00ffff, 0.3, 20);
  pointLight.position.set(0, 8, 0);
  scene.add(pointLight);

  // 添加座標軸
  const axesHelper = new THREE.AxesHelper(4);
  scene.add(axesHelper);

  // 添加網格
  const gridHelper = new THREE.GridHelper(10, 20, 0x333333, 0x111111);
  scene.add(gridHelper);

  // 創建初始天線輻射圖案
  createBeamPatternMesh();
}

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

window.addEventListener('resize', () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/**
 * Camera
 */
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100);
camera.position.set(5, 5, 5);
scene.add(camera);

/**
 * Controls
 */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/**
 * 初始化
 */
function init() {
  setupScene();
  setupGUI();
}

/**
 * Animation loop
 */
const clock = new THREE.Clock();

function tick() {
  const elapsedTime = clock.getElapsedTime();

  // 自動旋轉
  if (antennaParams.autoRotate && beamMesh) {
    beamMesh.rotation.y = elapsedTime * 0.2;
    if (wireframeMesh) {
      wireframeMesh.rotation.y = elapsedTime * 0.2;
    }
  }

  // 更新控制器
  controls.update();

  // 渲染
  renderer.render(scene, camera);

  // 下一幀
  animationId = window.requestAnimationFrame(tick);
}

// 啟動應用程式
init();
tick();

/**
 * 清理函數 (可選)
 */
window.addEventListener('beforeunload', () => {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  gui.destroy();
});
