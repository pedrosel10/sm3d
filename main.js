// ══════════════════════════════════════════════════════════════════════
//  São Miguel — 3D Logo Site
//  main.js — Three.js + GSAP ScrollTrigger
// ══════════════════════════════════════════════════════════════════════

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

gsap.registerPlugin(ScrollTrigger)

// ── Detecção mobile (uma vez, no boot) ─────────────────────────────
const _isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ── Lenis Smooth Scroll — DESKTOP ONLY ─────────────────────────────
// No mobile, scroll nativo roda na compositor thread (off main thread, 60fps garantido)
// Lenis no mobile puxa scroll para main thread via scrollTo(), competindo com Three.js
let lenis = null;
if (!_isTouchDevice) {
  lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    infinite: false,
  })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => {
    lenis.raf(time * 1000)
  })
  gsap.ticker.lagSmoothing(0)
}

// ── Anti-Zoom: Previne gesture zoom residual no Safari iOS ───────────
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false })
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false })
document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false })

// Previne pinch-to-zoom (2+ dedos) mesmo durante scroll
window.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) {
    e.preventDefault()
  }
}, { passive: false, capture: true })

window.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1 || (e.scale && e.scale !== 1)) {
    e.preventDefault()
  }
}, { passive: false, capture: true })

// Previne double-tap to zoom
let lastTouchEnd = 0
document.addEventListener('touchend', (e) => {
  const now = (new Date()).getTime()
  if (now - lastTouchEnd <= 300) {
    e.preventDefault()
  }
  lastTouchEnd = now
}, { passive: false, capture: true })

// ── GLOBAL SIZING HELPERS ────────────────────────────────────────────

// ── DOM References ───────────────────────────────────────────────────
const canvas = document.querySelector('#app-canvas')
const loaderEl = document.getElementById('loader')
const loaderFill = document.getElementById('loader-fill')
const loaderNumber = document.getElementById('loader-number')
const scrollIndicator = document.getElementById('scroll-indicator')

let thirdFoldWords = null;
let lastTThirdFold = -1;
// ── Scene ────────────────────────────────────────────────────────────
const scene = new THREE.Scene()
scene.background = null // Transparent so HTML background shows through

// ── Renderer (best practices from guide) ─────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false, // Desabilitado para performance
  alpha: true, // Allow HTML background to show
  powerPreference: 'high-performance',
})
const isMobileDevice = window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
// PixelRatio MUITO BAIXO para teste de performance brutal
renderer.setPixelRatio(isMobileDevice ? 0.8 : 1.0)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = false // Sombras desabilitadas para performance
renderer.shadowMap.type = THREE.BasicShadowMap
renderer.shadowMap.autoUpdate = false

// ── Camera (fallback — GLB camera overrides) ─────────────────────────
let baseFov = 30;
let camera = new THREE.PerspectiveCamera(baseFov, window.innerWidth / window.innerHeight, 0.1, 1000)
// Ajuste inicial do FOV
const initAspect = window.innerWidth / window.innerHeight;
camera.fov = Math.atan( Math.tan( baseFov * Math.PI / 360 ) * (1.7777 / initAspect) ) * 360 / Math.PI;
camera.updateProjectionMatrix();

camera.position.set(0, 1.5, 3.5)
const cameraBasePos = new THREE.Vector3(0, 1.5, 3.5);

// ── Environment Map — Ferndale Studio EXR (metallic reflections) ─────
const pmrem = new THREE.PMREMGenerator(renderer)
pmrem.compileEquirectangularShader()

// Track loading of both assets (EXR + GLB)
let exrReady = false
let glbReady = false

function checkAllLoaded() {
  if (exrReady && glbReady) {
    targetProgress = 100
  }
}

const rgbeLoader = new RGBELoader()
rgbeLoader.load('./ferndale_studio_01_1k.hdr', (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping

  const envMap = pmrem.fromEquirectangular(texture).texture
  scene.environment = envMap  // Reflexos metálicos em todos os materiais
  // Fundo permanece branco — HDR só para reflexos

  // Cleanup
  texture.dispose()
  pmrem.dispose()

  console.log('🌍 HDR Environment Map loaded: ferndale_studio_01_1k.hdr')
  exrReady = true
  checkAllLoaded()
})

// ── Shadow-receiving floor (backup for shadow projection) ────────────
const shadowFloorGeo = new THREE.PlaneGeometry(100, 100)
const shadowFloorMat = new THREE.ShadowMaterial({ opacity: 0.35 })
const shadowFloor = new THREE.Mesh(shadowFloorGeo, shadowFloorMat)
shadowFloor.rotation.x = -Math.PI / 2
shadowFloor.position.y = -2
shadowFloor.receiveShadow = true
scene.add(shadowFloor)

// Shadow-catching wall behind the gear (for projected shadow)
const shadowWallGeo = new THREE.PlaneGeometry(100, 100)
const shadowWallMat = new THREE.ShadowMaterial({ opacity: 0.25 })
const shadowWall = new THREE.Mesh(shadowWallGeo, shadowWallMat)
shadowWall.position.z = -3
shadowWall.receiveShadow = true
scene.add(shadowWall)

// ── Fallback Lighting ────────────────────────────────────────────────
let usingGLBLights = false

const ambientLight = new THREE.AmbientLight(0xffffff, 0.35)
scene.add(ambientLight)

const hemiLight = new THREE.HemisphereLight(0xd6d6d6, 0x404040, 0.25)
scene.add(hemiLight)

const keyLight = new THREE.DirectionalLight(0xffffff, 1.5)
keyLight.position.set(-1.5, 3.5, 6)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(isMobileDevice ? 512 : 2048, isMobileDevice ? 512 : 2048)
keyLight.shadow.camera.near = 0.5
keyLight.shadow.camera.far = 100
keyLight.shadow.bias = -0.0026
keyLight.shadow.normalBias = 0.04
keyLight.shadow.radius = 3.5
const sd = 30
keyLight.shadow.camera.left = -sd
keyLight.shadow.camera.right = sd
keyLight.shadow.camera.top = sd
keyLight.shadow.camera.bottom = -sd
keyLight.shadow.camera.updateProjectionMatrix()
scene.add(keyLight)

const rimLight = new THREE.DirectionalLight(0xfff5c0, 1.0)
rimLight.position.set(-5, 3, -5)
scene.add(rimLight)

// Active lights tracking for real-time GUI controls
const activeDirectionalLights = [keyLight]
let activeAmbientLight = ambientLight

// ── Loading Manager ──────────────────────────────────────────────────
let targetProgress = 0
let currentProgress = 0
let isLoaded = false

function updateLoaderUI() {
  if (isLoaded) return

  currentProgress += (targetProgress - currentProgress) * 0.08
  if (targetProgress >= 100 && currentProgress > 99.5) {
    currentProgress = 100
  }

  const pct = Math.round(currentProgress)
  if (loaderFill) loaderFill.style.width = `${pct}%`
  if (loaderNumber) loaderNumber.textContent = pct

  if (pct >= 100) {
    isLoaded = true
    setTimeout(() => {
      loaderEl.classList.add('loaded')
      setTimeout(() => loaderEl.remove(), 1000)
      playHeroAnimations()
      setupScrollAnimations()
    }, 400)
    return
  }
  requestAnimationFrame(updateLoaderUI)
}
requestAnimationFrame(updateLoaderUI)

// ── Model Loading ────────────────────────────────────────────────────
let gearMesh = null
let backgroundMesh = null
let modelGroup = null
let mixer = null

// Rodrigo portrait image transition state
let imageGroup = null
let sliceMeshes = [];

let card1Group = null;
let card1Slices = [];

let card2Group = null;
let card2Slices = [];

// Gear position & rotation state
let gearOriginalX = 0
let gearOriginalY = 0
let cachedTextAnchorOffset = 0;
let cachedVHeight = 0;
let cachedInnerHeight = window.innerHeight;
let gearOriginalQuat = new THREE.Quaternion()
const gearRotationAxis = new THREE.Vector3(-1, 0, 0) // -X axis (confirmed)
let gearScrollAngle = 0

// GSAP Infinite Scroll Timeline
let scrollTimeline = null
const animationState = { gearX: 0.02 } // 0.02 = Left, 0.92 = Right
const loopHeight = 2600 // Scroll pixels representing max scroll


// Mouse tilt state
const mouseTiltTarget = { x: 0, y: 0 }
const mouseTiltCurrent = { x: 0, y: 0 }
let TILT_STRENGTH = 0.24
let GEAR_SHIFT_X = 0.9 // Centered
let GEAR_SHIFT_Y = -1.65 // Centered visually, slightly down to accommodate text

let SPIN_SPEED = 3.0 // Multiplier for target angle
let SPIN_LIMIT = 15.0 // Max radians per second allowed
let currentGearAngle = 0 // For smooth velocity limiting


// ── Signature Animation Logic ──────────────────────────────────────────
let signatureVisible = false;
let signatureAnimating = false;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-1000, -1000); // init off-screen

function checkSignatureHover() {
  if (signatureAnimating) return;

  // Make sure we're actually in the phase where image is visible
  if (scrollCurrent < window.innerHeight * 0.5) return; 

  // Wait for the image slicing animation to finish
  const zoomStart = window.innerHeight * 0.45;
  const zoomEnd = window.innerHeight * 1.0;
  const tZoom = Math.max(0, Math.min((scrollCurrent - zoomStart) / (zoomEnd - zoomStart), 1));
  if (tZoom < 0.95) return;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(sliceMeshes.map(s => s.mesh), false);
  
  if (intersects.length > 0 && !signatureVisible) {
    showSignature();
  }
}

function showSignature() {
  signatureVisible = true;
  signatureAnimating = true;
  
  const overlay = document.getElementById('signature-overlay');
  const paths = document.querySelectorAll('.sig-path');
  if (!overlay || paths.length === 0) return;

  gsap.killTweensOf(overlay);
  gsap.killTweensOf(paths);
  
  gsap.set(overlay, { autoAlpha: 1 });
  
  // Animate each path from left to right sequentially to simulate handwriting
  gsap.fromTo(paths, 
    { clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)", opacity: 1 },
    { 
      clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)", 
      duration: 0.35, 
      stagger: 0.08,
      ease: "power2.inOut",
      onComplete: () => {
        gsap.to(overlay, { 
          opacity: 0, 
          duration: 1.0, 
          delay: 1.2, 
          onComplete: () => {
            gsap.set(overlay, { autoAlpha: 0 });
            signatureVisible = false;
            signatureAnimating = false;
          }
        });
      }
    }
  );
}

window.addEventListener('mousemove', (e) => {
  mouseTiltTarget.x = (e.clientX / window.innerWidth) * 2 - 1  // -1 to 1
  mouseTiltTarget.y = (e.clientY / window.innerHeight) * 2 - 1 // -1 to 1
  
  mouse.x = mouseTiltTarget.x;
  mouse.y = -mouseTiltTarget.y;
  checkSignatureHover();
  
  // Update CSS variables for interactive mesh mask
  document.body.style.setProperty('--mouse-x', `${e.clientX}px`)
  document.body.style.setProperty('--mouse-y', `${e.clientY}px`)
})

window.addEventListener('click', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  checkSignatureHover();
})

window.addEventListener('touchstart', (e) => {
  if (e.touches.length > 0) {
    mouse.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
    checkSignatureHover();
  }
}, { passive: true })

// ── Mobile Background Simulated Cursor ─────────────────────────────────
let simMouseX = window.innerWidth / 2;
let simMouseY = window.innerHeight / 2;
let simMouseTargetX = simMouseX;
let simMouseTargetY = simMouseY;

function animateMobileSimMouse() {
  requestAnimationFrame(animateMobileSimMouse);
  if (window.innerWidth >= 768) return;
  
  if (Math.random() < 0.03) {
    simMouseTargetX = Math.random() * window.innerWidth;
    simMouseTargetY = Math.random() * window.innerHeight;
  }
  
  simMouseX += (simMouseTargetX - simMouseX) * 0.02;
  simMouseY += (simMouseTargetY - simMouseY) * 0.02;
  
  document.body.style.setProperty('--mouse-x', `${simMouseX}px`);
  document.body.style.setProperty('--mouse-y', `${simMouseY}px`);
}
animateMobileSimMouse();

// ── Textures Loading ──────────────────────────────────────────────────
const textureLoader = new THREE.TextureLoader()

const baseColorMap = textureLoader.load(
  './logo_basecolor.jpg',
  undefined,
  undefined,
  (err) => console.error('Error loading basecolor texture:', err)
)
const normalMap = textureLoader.load(
  './logo_normal.jpg',
  undefined,
  undefined,
  (err) => console.error('Error loading normal texture:', err)
)
const rmMap = textureLoader.load(
  './logo_rm.jpg',
  undefined,
  undefined,
  (err) => console.error('Error loading roughness/metallic texture:', err)
)

// Setup texture parameters matching GLTF specifications
baseColorMap.flipY = false
baseColorMap.colorSpace = THREE.SRGBColorSpace

normalMap.flipY = false

rmMap.flipY = false

// ── Custom Shader for Rodrigo's Image Slices ────────────────────────
const imageVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const imageFragmentShader = `
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uOpacity;
  uniform float uAberrationStrength;
  uniform vec2 uMouseTilt;

  void main() {
    vec2 centerDist = vUv - vec2(0.5);
    float edgeFactor = dot(centerDist, centerDist);
    float tiltFactor = length(uMouseTilt);
    
    // Aberração cromática que responde às bordas e à inclinação do mouse
    float shift = uAberrationStrength * (edgeFactor * 1.5 + tiltFactor * 0.7);
    
    vec2 uvR = vUv + vec2(shift, 0.0);
    vec2 uvG = vUv;
    vec2 uvB = vUv - vec2(shift, 0.0);
    
    float r = texture2D(uTexture, clamp(uvR, 0.0, 1.0)).r;
    float g = texture2D(uTexture, clamp(uvG, 0.0, 1.0)).g;
    float b = texture2D(uTexture, clamp(uvB, 0.0, 1.0)).b;
    float a = texture2D(uTexture, uvG).a;
    
    gl_FragColor = vec4(r, g, b, a * uOpacity);
  }
`;

const imageShaderMaterial = new THREE.ShaderMaterial({
  vertexShader: imageVertexShader,
  fragmentShader: imageFragmentShader,
  uniforms: {
    uTexture: { value: null },
    uOpacity: { value: 0.0 },
    uAberrationStrength: { value: 0.024 },
    uMouseTilt: { value: new THREE.Vector2(0, 0) }
  },
  transparent: true,
  depthWrite: false
});

// Inicialização do grupo da imagem tridimensional
imageGroup = new THREE.Group();
imageGroup.position.set(0, 1.5, -6.0); // Posicionado atrás do plano da engrenagem
scene.add(imageGroup);

function buildGroupSlices(group, slicesArray, texture) {
  // Construir a malha base com escala 1.0. 
  // O dimensionamento responsivo exato (ex: 330px no mobile) será feito via .scale no loop animate()
  const imgScale = 1.0;
  const totalHeight = 1.6 * imgScale;
  const totalWidth = 1.17 * imgScale;
  const numSlices = 10;
  const sliceHeight = totalHeight / numSlices;
  
  for (let i = 0; i < numSlices; i++) {
    const geom = new THREE.PlaneGeometry(totalWidth, sliceHeight);
    
    const uvAttr = geom.attributes.uv;
    for (let j = 0; j < uvAttr.count; j++) {
      let v = uvAttr.getY(j);
      let newV = (i + v) / numSlices;
      uvAttr.setY(j, newV);
    }
    geom.attributes.uv.needsUpdate = true;
    
    const mat = imageShaderMaterial.clone();
    mat.uniforms.uTexture.value = texture;
    
    const mesh = new THREE.Mesh(geom, mat);
    const localY = -totalHeight / 2 + i * sliceHeight + sliceHeight / 2;
    mesh.position.set(0, localY, 0);
    
    group.add(mesh);
    slicesArray.push({
      mesh: mesh,
      localY: localY,
      index: i
    });
  }
}

const imageTexture = textureLoader.load(
  './foto_rodrigo_1.webp',
  (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    buildGroupSlices(imageGroup, sliceMeshes, texture);
    console.log('📷 Loaded and sliced foto_rodrigo_1.webp successfully.');
  },
  undefined,
  (err) => console.error('Error loading foto_rodrigo_1.webp:', err)
);

// Track all active logo materials for dynamic GUI parameter adjustments
const logoMaterials = new Set()

// Helper to configure or replace materials with standard PBR metallic ones
function applyMaterialSettings(mat) {
  if (!mat) return mat

  const targetColor = new THREE.Color('#001e57') // Nice premium blue from user config

  if (!mat.isMeshPhysicalMaterial) {
    const newMat = new THREE.MeshPhysicalMaterial({
      color: targetColor,
      map: baseColorMap,
      normalMap: normalMap,
      normalScale: new THREE.Vector2(2.0, 2.0),
      roughnessMap: rmMap,
      metalnessMap: rmMap,
      metalness: 1.0,
      roughness: 0.2, // Shiny metallic surface (0.2)
      clearcoat: 1.0, // Full lacquer clearcoat coating
      clearcoatRoughness: 0.0, // Ultra-glossy clearcoat
      shadowSide: THREE.FrontSide
    })
    logoMaterials.add(newMat)
    mat.dispose()
    return newMat
  } else {
    // Modify existing physical material
    mat.color.copy(targetColor)
    mat.map = baseColorMap
    mat.normalMap = normalMap
    if (mat.normalScale) mat.normalScale.set(2.0, 2.0)
    mat.roughnessMap = rmMap
    mat.metalnessMap = rmMap
    mat.metalness = 1.0
    mat.roughness = 0.2
    mat.clearcoat = 1.0
    mat.clearcoatRoughness = 0.0
    if (mat.emissive) mat.emissive.set(0x000000) // Ensure no glowing white emissive
    mat.shadowSide = THREE.FrontSide
    mat.needsUpdate = true
    logoMaterials.add(mat)
    return mat
  }
}

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')

const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

gltfLoader.load(
  './smlogo3d.glb',
  (gltf) => {
    const root = gltf.scene

    // ── Extract cameras from the model ───────────────────────────
    const glbCameras = []
    root.traverse((child) => {
      if (child.isCamera) {
        glbCameras.push(child)
      }
    })

    if (glbCameras.length > 0) {
      const glbCam = glbCameras[0]
      glbCam.updateMatrixWorld(true)
      camera.copy(glbCam)
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      console.log('📷 Using camera from GLB:', glbCam.name)
      
      cameraBasePos.copy(camera.position)
      
      // Re-apply GUI overrides for FOV and Z distance if they exist, to respect mobile vs desktop
      if (typeof activeGUIState !== 'undefined' && typeof guiSettings !== 'undefined') {
        const s = guiSettings[activeGUIState];
        if (s && s['val-camera-z'] !== undefined) {
          cameraBasePos.z = s['val-camera-z'];
          camera.position.z = s['val-camera-z'];
          baseFov = s['val-fov'];
          camera.fov = Math.atan( Math.tan( baseFov * Math.PI / 360 ) * (1.7777 / camera.aspect) ) * 360 / Math.PI;
          camera.updateProjectionMatrix();
        }
      }
    }

    // ── Extract lights from the model ────────────────────────────
    const glbLights = []
    root.traverse((child) => {
      if (child.isLight) {
        glbLights.push(child)
        console.log('💡 GLB light:', child.type, child.name)
        if (child.isDirectionalLight || child.isSpotLight) {
          child.castShadow = true
          child.shadow.mapSize.set(isMobileDevice ? 512 : 2048, isMobileDevice ? 512 : 2048)
          child.shadow.bias = -0.0002
          child.shadow.normalBias = 0.02
          child.shadow.radius = 3.0
          if (child.shadow.camera) {
            const s = 30
            child.shadow.camera.left = -s
            child.shadow.camera.right = s
            child.shadow.camera.top = s
            child.shadow.camera.bottom = -s
            child.shadow.camera.near = 0.5
            child.shadow.camera.far = 100
            child.shadow.camera.updateProjectionMatrix()
          }
        }
      }
    })

    if (glbLights.length > 0) {
      usingGLBLights = true
      // Keep keyLight and ambientLight active so that fallback shadows are preserved!
      scene.remove(hemiLight)
      scene.remove(rimLight)

      // Add GLB lights to directional tracking so GUI controls them too
      glbLights.forEach(light => {
        if (light.isDirectionalLight || light.isSpotLight || light.isPointLight) {
          activeDirectionalLights.push(light)
        }
      })
    }

    // ── Setup meshes — shadows & materials ────────────────────────
    root.traverse((child) => {
      if (child.isMesh) {
        const nameLower = (child.name || '').toLowerCase()
        const isBackgroundMesh = nameLower.includes('fundo') || nameLower.includes('plane') || nameLower.includes('background')

        if (isBackgroundMesh) {
          backgroundMesh = child
          // Keep background mesh matte white and disable metallic reflections
          child.castShadow = false
          child.receiveShadow = true
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material]
            mats.forEach(mat => {
              mat.color.set(0xffffff)
              mat.metalness = 0.0
              mat.roughness = 1.0
              mat.map = null
              mat.normalMap = null
              mat.roughnessMap = null
              mat.metalnessMap = null
              mat.needsUpdate = true
            })
          }
          return
        }

        // It is the logo mesh
        child.castShadow = true
        child.receiveShadow = true
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material = child.material.map(applyMaterialSettings)
          } else {
            child.material = applyMaterialSettings(child.material)
          }
        }
      }
    })

    // ── Find the gear/engrenagem ──────────────────────────────────
    console.log('── GLB Scene Graph ──')
    root.traverse((child) => {
      const type = child.isMesh ? 'Mesh' : child.isLight ? 'Light' : child.isCamera ? 'Camera' : child.isGroup ? 'Group' : 'Object3D'
      console.log(`  ${type}: "${child.name}" pos(${child.position.x.toFixed(2)}, ${child.position.y.toFixed(2)}, ${child.position.z.toFixed(2)})`)
    })

    // Collect all meshes to find the best candidate for the gear
    const meshCandidates = []
    root.traverse((child) => {
      if (child.isMesh) {
        const box = new THREE.Box3().setFromObject(child)
        const size = box.getSize(new THREE.Vector3())
        meshCandidates.push({ mesh: child, volume: size.x * size.y * size.z, size })
      }
    })

    // Strategy: look by name first, then fall back to largest mesh
    root.traverse((child) => {
      if (child.isMesh || child.isGroup) {
        const name = (child.name || '').toLowerCase()
        if (
          name.includes('gear') ||
          name.includes('engrenagem') ||
          name.includes('logo') ||
          name.includes('cog') ||
          name.includes('roda') ||
          name.includes('sm')
        ) {
          gearMesh = child
          console.log('⚙ Found gear by name:', child.name)
        }
      }
    })

    // Fallback: use the largest mesh (by volume)
    if (!gearMesh && meshCandidates.length > 0) {
      meshCandidates.sort((a, b) => b.volume - a.volume)
      gearMesh = meshCandidates[0].mesh
      console.log('⚙ Using largest mesh as gear:', gearMesh.name)
    }

    // Last resort: use root
    if (!gearMesh) {
      gearMesh = root
      console.log('⚙ Fallback: rotating entire model')
    }

    // Store original orientation (rotation axis is -X, confirmed by user)
    gearOriginalQuat.copy(gearMesh.quaternion)
    gearOriginalX = gearMesh.position.x
    gearOriginalY = gearMesh.position.y

    // ── Animations from GLB ──────────────────────────────────────
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(root)
      gltf.animations.forEach((clip) => {
        const action = mixer.clipAction(clip)
        action.play()
      })
      console.log(`🎬 Playing ${gltf.animations.length} animation(s)`)
    }

    // Add model to scene
    modelGroup = root
    scene.add(root)

    // Position shadow surfaces based on model bounding box
    const box = new THREE.Box3().setFromObject(root)
    shadowFloor.position.y = box.min.y - 0.01
    shadowWall.position.z = box.min.z - 1

    // Signal GLB loaded — loader waits for both GLB + EXR
    glbReady = true
    firstFrames = 30
    updateResponsiveCache();
    checkAllLoaded()
  },
  (progress) => {
    if (progress.total > 0) {
      // GLB progress fills up to 90%, EXR completion gives the final 10%
      const pct = (progress.loaded / progress.total) * 90
      targetProgress = Math.max(targetProgress, pct)
    }
  },
  (error) => {
    console.error('❌ Error loading GLB:', error)
  }
)

// ── Smooth Scroll (híbrido: Lenis desktop / nativo mobile) ───────────
let scrollCurrent = 0
let _mobileScrollTarget = 0

if (_isTouchDevice) {
  // Mobile: scroll nativo na compositor thread + leitura direta no rAF
  // NÃO usar evento scroll (baixa frequência no Safari) — ler scrollY direto no rAF
}

// ── Text Splitter Utilities ──────────────────────────────────────────
function splitTextToChars(element) {
  const childNodes = Array.from(element.childNodes)
  element.innerHTML = ''
  
  const chars = []
  childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent
      for (let i = 0; i < text.length; i++) {
        const span = document.createElement('span')
        // Preserve HTML spaces for layout
        if (text[i] === ' ') {
          span.innerHTML = '&nbsp;'
        } else {
          span.innerText = text[i]
        }
        span.style.display = 'inline-block'
        span.style.opacity = '0'
        span.style.willChange = 'opacity'
        element.appendChild(span)
        chars.push(span)
      }
    } else if (node.nodeName.toLowerCase() === 'br') {
      element.appendChild(document.createElement('br'))
    } else {
      element.appendChild(node.cloneNode(true))
    }
  })
  return chars
}

function splitTextToLines(element) {
  // If the element has children (like <p>), process them recursively to preserve margins
  if (element.children.length > 0) {
    let allLines = [];
    Array.from(element.children).forEach(child => {
      allLines = allLines.concat(splitTextToLines(child));
    });
    return allLines;
  }

  // Save original text and clear
  const text = element.innerText;
  const words = text.trim().split(/\s+/);
  element.innerHTML = '';
  
  // Create spans for each word to measure their positions
  const spans = words.map(w => {
    const span = document.createElement('span');
    span.innerText = w + ' ';
    element.appendChild(span);
    return span;
  });
  
  // Group words into lines based on their vertical offset
  let lines = [];
  let currentLine = [];
  let currentTop = -1;
  
  spans.forEach(span => {
    // If the top offset changes significantly, it's a new line
    if (currentTop === -1 || Math.abs(span.offsetTop - currentTop) > 5) {
      currentTop = span.offsetTop;
      currentLine = [];
      lines.push(currentLine);
    }
    currentLine.push(span);
  });
  
  // Reconstruct the DOM with line wrappers
  element.innerHTML = '';
  const lineDivs = lines.map((lineArray, idx) => {
    const lineDiv = document.createElement('div');
    lineDiv.style.opacity = '0';
    lineDiv.style.transform = 'translateY(20px)';
    lineDiv.style.willChange = 'opacity, transform';
    lineDiv.style.overflow = 'hidden'; // optional, helps with clean reveals
    
    if (idx !== lines.length - 1) {
      lineDiv.style.textAlign = 'justify';
      lineDiv.style.textAlignLast = 'justify';
    }
    
    lineArray.forEach(span => {
      lineDiv.appendChild(span);
    });
    
    element.appendChild(lineDiv);
    return lineDiv;
  });
  
  return lineDivs;
}

function splitTextToWords(element) {
  const words = element.innerText.split(' ')
  element.innerHTML = ''
  const spans = words.map((w, i) => {
    const span = document.createElement('span')
    span.innerText = w
    span.style.display = 'inline-block'
    span.style.opacity = '0'
    span.style.willChange = 'opacity'
    element.appendChild(span)
    if (i < words.length - 1) {
      element.appendChild(document.createTextNode(' '))
    }
    return span
  })
  return spans
}
function splitTextToParticles(element) {
  const html = element.innerHTML
  element.innerHTML = ''
  // Split considering <br> and spaces
  const parts = html.split(/(<br>|\s+)/i)
  
  const chars = []
  parts.forEach(part => {
    if (part.toLowerCase() === '<br>') {
      element.appendChild(document.createElement('br'))
    } else if (part.trim() === '') {
      element.appendChild(document.createTextNode(part))
    } else {
      // Split into characters
      for (let i = 0; i < part.length; i++) {
        const span = document.createElement('span')
        span.innerText = part[i]
        span.style.display = 'inline-block'
        span.style.opacity = '0'
        span.style.willChange = 'transform, opacity, filter'
        element.appendChild(span)
        chars.push(span)
      }
    }
  })
  return chars
}

// ── Interactive Canvas Particle Text ──────────────────────────────────
class ParticleText {
  constructor(canvasId, textElementId) {
    this.canvas = document.getElementById(canvasId)
    this.textEl = document.getElementById(textElementId)
    if (!this.canvas || !this.textEl) return

    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    this.particles = []
    this.chars = []
    this.mouse = { x: -1000, y: -1000, radius: 45 }
    this.dpr = Math.min(window.devicePixelRatio, 2)
    // Usar step = 2 (pixels lógicos) para balancear performance e granularidade
    this.step = 2 * this.dpr
    
    this.ready = new Promise(resolve => {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          this.setup(false);
          resolve();
        });
      } else {
        setTimeout(() => { this.setup(false); resolve(); }, 100);
      }
      // Fallback in case document.fonts.ready hangs (Safari bug)
      setTimeout(() => {
        if (this.particles.length === 0) {
          this.setup(false);
          resolve();
        }
      }, 600);
    });
    
    this.sweepEnabled = true;
    
    const container = this.textEl.parentElement
    container.addEventListener('mousemove', (e) => {
      const crect = this.canvas.getBoundingClientRect()
      this.mouse.x = e.clientX - crect.left
      this.mouse.y = e.clientY - crect.top
    })
    container.addEventListener('mouseleave', () => {
      this.mouse.x = -1000
      this.mouse.y = -1000
    })
    
    this.canvas.style.opacity = '1'
    
    let ptLastWidth = window.innerWidth;
    let ptResizeTimeout;
    window.addEventListener('resize', () => {
      // Ignorar redimensionamentos puramente verticais (típico no mobile com barra de endereço)
      if (window.innerWidth !== ptLastWidth) {
        ptLastWidth = window.innerWidth;
        clearTimeout(ptResizeTimeout);
        ptResizeTimeout = setTimeout(() => {
          this.setup(true);
        }, 250);
      }
    })

    this.animate()
  }

  setup(isResize) {
    const oldOpacities = {};
    if (this.chars) this.chars.forEach(c => {
      oldOpacities[c.char + Math.round(c.x)] = c.opacity;
    });
    
    this.particles = []
    this.chars = []
    
    // Padding para as partículas voarem livremente para fora da caixa do texto sem sumirem
    this.padding = 120
    const rect = this.textEl.getBoundingClientRect()
    
    this.canvas.width = (rect.width + this.padding * 2) * this.dpr
    this.canvas.height = (rect.height + this.padding * 2) * this.dpr
    this.canvas.style.width = `${rect.width + this.padding * 2}px`
    this.canvas.style.height = `${rect.height + this.padding * 2}px`
    this.canvas.style.top = `-${this.padding}px`
    this.canvas.style.left = `-${this.padding}px`
    
    this.ctx.scale(this.dpr, this.dpr)
    
    const computedStyle = window.getComputedStyle(this.textEl)
    this.fontSize = parseFloat(computedStyle.fontSize)
    this.fontFamily = computedStyle.fontFamily
    this.fontWeight = computedStyle.fontWeight
    this.color = computedStyle.color
    
    this.ctx.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`
    this.ctx.fillStyle = this.color
    this.ctx.textBaseline = 'top'
    
    // Build chars array and draw for extraction
    const spans = this.textEl.querySelectorAll('span')
    spans.forEach(span => {
      const rectS = span.getBoundingClientRect()
      const x = rectS.left - rect.left + this.padding
      const y = rectS.top - rect.top + this.padding
      const charStr = (span.textContent || span.innerText) === '\u00A0' ? ' ' : (span.textContent || span.innerText)
      if (charStr.trim() !== '') {
        const key = charStr + Math.round(x);
        this.chars.push({
          char: charStr,
          x: x,
          y: y,
          opacity: oldOpacities[key] !== undefined ? oldOpacities[key] : (isResize ? 1 : 0)
        })
        this.ctx.fillText(charStr, x, y)
      }
    })
    
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data
    
    for (let y = 0; y < this.canvas.height; y += this.step) {
      for (let x = 0; x < this.canvas.width; x += this.step) {
        let maxAlpha = 0
        let bestR = 0, bestG = 0, bestB = 0
        
        // Scan all physical pixels within this step x step block to ensure NO pixel is left behind
        for (let dy = 0; dy < this.step; dy++) {
          for (let dx = 0; dx < this.step; dx++) {
            if (y + dy >= this.canvas.height || x + dx >= this.canvas.width) continue
            const index = ((y + dy) * this.canvas.width + (x + dx)) * 4
            const alpha = imageData[index + 3]
            if (alpha > maxAlpha) {
              maxAlpha = alpha
              bestR = imageData[index]
              bestG = imageData[index + 1]
              bestB = imageData[index + 2]
            }
          }
        }
        
        if (maxAlpha > 8) { // Ultra-low threshold to capture all smooth anti-aliased edges
          this.particles.push({
            x: x / this.dpr,
            y: y / this.dpr,
            originX: x / this.dpr,
            originY: y / this.dpr,
            color: `rgba(${bestR}, ${bestG}, ${bestB}, ${maxAlpha / 255})`,
            vx: 0,
            vy: 0,
            active: false
          })
        }
      }
    }
    
    this.ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr)
  }
  
  animate() {
    requestAnimationFrame(() => this.animate())
    
    // Retry extraction if font was delayed
    if (this.particles.length === 0 && this.chars.length > 0) {
      if (!this.lastRetry) this.lastRetry = 0;
      if (Date.now() - this.lastRetry > 1000) {
        this.setup(true);
        this.lastRetry = Date.now();
      }
    }
    
    const rect = this.canvas.getBoundingClientRect()
    this.ctx.clearRect(0, 0, rect.width, rect.height)
    
    this.ctx.globalCompositeOperation = 'source-over'
    this.ctx.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`
    this.ctx.fillStyle = this.color
    this.ctx.textBaseline = 'top'
    
    // 1. Draw solid text per char with individual opacity
    this.chars.forEach(c => {
      if (c.opacity > 0) {
        this.ctx.globalAlpha = c.opacity
        this.ctx.fillText(c.char, c.x, c.y)
      }
    })
    this.ctx.globalAlpha = 1.0 // Reset
    
    const activeParticles = []
    
    const isMobile = typeof isMobileDevice !== 'undefined' ? isMobileDevice : window.innerWidth < 768;
    if (isMobile) {
      if (this.sweepEnabled !== false) {
        // Começa em -Math.PI / 2 para que o seno seja -1 (cursor exatamente na borda esquerda fora da tela)
        if (!this.sweepTime && this.sweepTime !== 0) this.sweepTime = -Math.PI / 2;
        this.sweepTime += 0.018; // ~3s por passagem
        
        // Movimento senoidal indo e vindo, passando por todo o texto
        this.simSweepX = (Math.sin(this.sweepTime) * 0.5 + 0.5) * (rect.width + 100) - 50;
        // Oscila o Y levemente (reduzido)
        this.simSweepY = rect.height / 2 + Math.cos(this.sweepTime * 1.5) * 30; 
      } else {
        // Mantém o cursor fora da tela enquanto a animação de entrada roda
        this.simSweepX = -1000;
        this.simSweepY = -1000;
      }
    }
    
    // 2. Physics logic and Activation
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      
      if (isMobile) {
        const dx = this.simSweepX - p.x;
        const dy = this.simSweepY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const sweepRadius = 75; // Raio reduzido para uma animação menor e mais contida
        if (dist < sweepRadius) {
          const force = (sweepRadius - dist) / sweepRadius;
          const angle = Math.atan2(dy, dx);
          p.vx -= Math.cos(angle) * force * 4.0; // Empurrão mais sutil
          p.vy -= Math.sin(angle) * force * 4.0;
          p.active = true;
        }
      } else {
        const dx = this.mouse.x - p.x
        const dy = this.mouse.y - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        
        if (dist < this.mouse.radius) {
          const force = (this.mouse.radius - dist) / this.mouse.radius
          const angle = Math.atan2(dy, dx)
          p.vx -= Math.cos(angle) * force * 5
          p.vy -= Math.sin(angle) * force * 5
          p.active = true
        }
      }
      
      if (p.active) {
        p.vx += (p.originX - p.x) * 0.1
        p.vy += (p.originY - p.y) * 0.1
        
        p.vx *= 0.85
        p.vy *= 0.85
        
        p.x += p.vx
        p.y += p.vy
        
        const isDisplaced = Math.abs(p.vx) > 0.1 || Math.abs(p.vy) > 0.1 || Math.abs(p.x - p.originX) > 0.5 || Math.abs(p.y - p.originY) > 0.5
        
        if (isDisplaced) {
          activeParticles.push(p)
        } else {
          p.active = false
          p.x = p.originX
          p.y = p.originY
        }
      }
    }
    
    // 3. Subtrai apenas os pontos de origem exatos das partículas deslocadas do texto sólido!
    // Isso evita camadas duplicadas.
    if (activeParticles.length > 0) {
      this.ctx.globalCompositeOperation = 'destination-out'
      this.ctx.fillStyle = '#000'
      const eraseSize = this.step / this.dpr
      activeParticles.forEach(p => {
        // Apaga o tile exato correspondente a essa partícula no texto sólido
        this.ctx.fillRect(p.originX, p.originY, eraseSize, eraseSize)
      })
      
      // 4. Desenha as partículas voando com suas cores anti-aliased originais
      this.ctx.globalCompositeOperation = 'source-over'
      activeParticles.forEach(p => {
        this.ctx.fillStyle = p.color
        this.ctx.fillRect(p.x, p.y, eraseSize, eraseSize)
      })
    }
  }

  assemble() {
    this.particles.forEach(p => {
      p.x = p.originX + (Math.random() - 0.5) * 1000;
      p.y = p.originY + (Math.random() - 0.5) * 1000;
      p.vx = (Math.random() - 0.5) * 30;
      p.vy = (Math.random() - 0.5) * 30;
      p.active = true;
    });
    this.chars.forEach(c => c.opacity = 0);
  }
}

// ── Hero Animations State ───────────────────────────────────────────
let heroTimeline = null;
let heroParticleText = null;

// ── Scroll Animations (GSAP Timeline Loop) ───────────────────────────
async function playHeroAnimations() {
  const h1 = document.getElementById('hero-title')
  const topText = document.getElementById('hero-top')
  const h2 = document.getElementById('hero-subtitle')
  const scrollInd = document.getElementById('scroll-indicator')
  const ampersand = document.getElementById('hero-amp')

  if (!h1 || !topText || !h2) return

  let h1Chars = [];
  if (!heroParticleText) {
    splitTextToChars(h1) // Setup layout spans
    h1.style.opacity = '0' // DOM text is permanently invisible
    heroParticleText = new ParticleText('hero-canvas-particles', 'hero-title')
    await heroParticleText.ready // Wait for font and extraction
    
    // Ensure canvas is visible even on mobile
    const canvasEl = document.getElementById('hero-canvas-particles')
    if (canvasEl) canvasEl.style.display = 'block'
  }
  
  requestAnimationFrame(() => {
    const h2Words = splitTextToWords(h2)
    
    // reset opacities if looping
    const targets = [topText, scrollInd, ampersand].filter(Boolean);
    if (targets.length) gsap.set(targets, { opacity: 0 });
    
    if (heroTimeline) heroTimeline.kill();
    heroTimeline = gsap.timeline()
    
    // Top text fades in
    heroTimeline.to(topText, { opacity: 1, duration: 1.0, ease: 'power2.out' }, 0.2)
  
    // Ampersand fades in
    heroTimeline.to(ampersand, { opacity: 1, duration: 1.5, ease: 'power2.out' }, 0.4)

    if (heroParticleText) {
      heroParticleText.sweepEnabled = false; // Desativa varredura enquanto entra
      
      // H1 letters solid text fades in randomly
      heroTimeline.to(heroParticleText.chars, 
        { opacity: 1, duration: 1.0, stagger: { amount: 1.0, from: "random" }, ease: 'power1.inOut' }, 
        0.4
      )
      
      // Reativa a varredura do cursor apenas quando terminar de entrar (0.4s inicio + 2.0s animacao)
      heroTimeline.call(() => {
        if (heroParticleText) heroParticleText.sweepEnabled = true;
      }, null, 2.5);
    }
  
    // H2 fades word by word
    heroTimeline.to(h2Words, { opacity: 1, duration: 1.0, stagger: 0.02, ease: 'power2.out' }, 1.2)
    
    // Scroll indicator fades in
    if (scrollInd) {
      heroTimeline.to(scrollInd, { opacity: 1, duration: 1.0, ease: 'power2.out' }, 1.8)
    }
  })
}

function setupScrollAnimations() {
  // OBSOLETO: painéis HTML removidos em favor dos cards WebGL.
  // setupStatsAnimations();
}

function setupStatsAnimations() {
  const statItems = document.querySelectorAll('.stat-item');
  if (!statItems.length) return;

  // Guardar referências globais para o loop animate()
  window._statItemEls = Array.from(statItems);
  window._smoothScrollVelocity = 0;

  statItems.forEach(item => {
    const contentHtml = item.innerHTML;
    item.innerHTML = '';
    
    const numSlices = 4;
    for (let i = 0; i < numSlices; i++) {
      const slice = document.createElement('div');
      slice.className = 'stat-slice';
      
      slice.innerHTML = contentHtml;
      
      // Recorta a fatia horizontalmente
      const top = (i / numSlices) * 100;
      const bottom = 100 - ((i + 1) / numSlices) * 100;
      slice.style.clipPath = `inset(${top}% 0 ${bottom}% 0)`;
      
      item.appendChild(slice);
    }
    
    // Animação de entrada: todas da ESQUERDA, stagger de BAIXO pra CIMA
    const slices = item.querySelectorAll('.stat-slice');
    const slicesArray = Array.from(slices);
    
    // Inverter a ordem: a última fatia (mais abaixo) entra primeiro
    const reversedSlices = [...slicesArray].reverse();
    
    reversedSlices.forEach(slice => {
      gsap.set(slice, { x: '-120%', opacity: 0 });
    });
    
    gsap.to(reversedSlices, {
      scrollTrigger: {
        trigger: item,
        start: 'top 50%',
        end: 'top 20%',
        scrub: 1.5
      },
      x: '0%',
      opacity: 1,
      stagger: 0.08,
      ease: 'power3.out'
    });
  });
}

// ── Resize (blindado contra pinch zoom + address bar Safari) ──────────
let lastKnownLayoutWidth = window.innerWidth;
// Altura estável: no mobile, capturar na inicialização e só mudar em rotação de tela
let stableHeight = window.innerHeight;

function handleResize() {
  // Detectar se é zoom de pinch (não resize real)
  const isZoom = window.visualViewport && Math.abs(window.visualViewport.scale - 1) > 0.01;
  if (isZoom) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  
  if (_isTouchDevice) {
    // MOBILE: A barra de endereço do Safari muda a altura em ~50-88px ao scrollar.
    // Isso causa resize events espúrios que recalculam FOV/aspect e fazem tudo "pular".
    // Solução: só reagir se a LARGURA mudar (rotação de tela real).
    if (Math.abs(w - lastKnownLayoutWidth) < 10) return;
    
    // Rotação de tela detectada — atualizar altura estável
    lastKnownLayoutWidth = w;
    stableHeight = h;
  } else {
    // DESKTOP: reagir normalmente a qualquer resize significativo
    if (Math.abs(w - lastKnownLayoutWidth) < 5 && Math.abs(h - stableHeight) < 5) return;
    lastKnownLayoutWidth = w;
    stableHeight = h;
  }

  const aspect = w / stableHeight;
  camera.aspect = aspect;
  
  // Maintain constant horizontal FOV relative to 16:9 (1.7777)
  camera.fov = Math.atan( Math.tan( baseFov * Math.PI / 360 ) * (1.7777 / aspect) ) * 360 / Math.PI;
  
  camera.updateProjectionMatrix()
  renderer.setSize(w, stableHeight)
  renderer.setPixelRatio(isMobileDevice ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2))
}

window.addEventListener('resize', handleResize)

// ── Projeção do centro da tela no espaço 3D ──────────────────────────
function getScreenCenterWorld(targetZ) {
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  if (Math.abs(camDir.z) > 0.0001) {
    const t = (targetZ - cameraBasePos.z) / camDir.z;
    return new THREE.Vector3().copy(cameraBasePos).addScaledVector(camDir, t);
  }
  return new THREE.Vector3(cameraBasePos.x, cameraBasePos.y, targetZ);
}

// ── Render Loop (delta time) ─────────────────────────────────────────
const timer = new THREE.Timer()
const spinQuat = new THREE.Quaternion()
const tiltQuat = new THREE.Quaternion()
const tiltEuler = new THREE.Euler()
const lastGearQuat = new THREE.Quaternion()
let firstFrames = 30

// Pre-allocated vectors for render loop (avoids GC pressure on mobile)
const _cameraDirection = new THREE.Vector3()
const _gearToCam = new THREE.Vector3()
const _targetCamPos = new THREE.Vector3()

function animate() {
  requestAnimationFrame(animate)
  timer.update()
  const delta = timer.getDelta()

  // ── Scroll: desktop via Lenis, mobile via nativo + interpolação ───
  if (_isTouchDevice) {
    // Mobile: ler scrollY diretamente no rAF (atualiza a cada frame mesmo durante inércia)
    _mobileScrollTarget = window.scrollY;
    // Interpolação exponencial frame-rate-independent (suave e responsiva)
    scrollCurrent += (_mobileScrollTarget - scrollCurrent) * (1 - Math.exp(-12 * delta));
  } else {
    // Desktop: Lenis já fornece scroll suavizado
    scrollCurrent = lenis.scroll
  }

  // --- Lógica para Perspectiva 3D e Distorção Curva (Stats) ---
  const scrollVelocity = scrollCurrent - (window._lastScrollForSkew || scrollCurrent);
  window._lastScrollForSkew = scrollCurrent;
  
  // Suavizar a velocidade de scroll com lerp (igual à imagem do Rodrigo)
  if (typeof window._smoothScrollVelocity === 'undefined') window._smoothScrollVelocity = 0;
  window._smoothScrollVelocity += (scrollVelocity - window._smoothScrollVelocity) * 0.08;
  
  // Distorção curva — rotateX baseado na velocidade suavizada
  const distortRaw = window._smoothScrollVelocity * -0.08;
  const clampedDistort = Math.max(-12, Math.min(12, distortRaw));
  
  // Perspectiva do mouse (igual à foto do Rodrigo: rotateX/Y suaves)
  const mouseRotY = mouseTiltCurrent.x * 8;
  const mouseRotX = -mouseTiltCurrent.y * 8;
  
  // Intensidade da aberração: proporcional ao movimento do mouse + scroll velocity
  const aberrationStrength = Math.abs(mouseTiltCurrent.x) + Math.abs(window._smoothScrollVelocity) * 0.02;
  const clampedAberration = Math.min(aberrationStrength, 1.5);
  
  // Aplicar nos retângulos de estatísticas
  if (window._statItemEls) {
    window._statItemEls.forEach(item => {
      item.style.transform = `perspective(800px) rotateX(${(mouseRotX + clampedDistort).toFixed(2)}deg) rotateY(${mouseRotY.toFixed(2)}deg)`;
      item.style.setProperty('--aberration', clampedAberration.toFixed(3));
    });
  }
  // ---------------------------------------------------------

  // Update scroll indicator visibility
  if (Math.abs(scrollCurrent) > 50) {
    scrollIndicator?.classList.add('hidden')
  } else {
    scrollIndicator?.classList.remove('hidden')
  }

  // Fade out hero section on scroll natively
  const heroSection = document.getElementById('hero-section');
  if (heroSection) {
    const fadeStart = 100;
    const fadeEnd = 400;
    const opacity = 1 - Math.max(0, Math.min((scrollCurrent - fadeStart) / (fadeEnd - fadeStart), 1));
    heroSection.style.opacity = opacity;
  }

  let gearMoved = false

  // ── Gear rotation + mouse tilt ─────────────────────────────────
  if (gearMesh) {
    // Smooth mouse interpolation
    mouseTiltCurrent.x += (mouseTiltTarget.x - mouseTiltCurrent.x) * 0.04
    mouseTiltCurrent.y += (mouseTiltTarget.y - mouseTiltCurrent.y) * 0.04

    // 1. Scroll spin — Target angle based on scroll
    const targetAngle = -(scrollCurrent / loopHeight) * Math.PI * SPIN_SPEED;
    
    const isMobile = window.innerWidth < 768;
    
    if (isMobile) {
      // Mobile: follow scrollCurrent directly (it's already smoothed)
      currentGearAngle = targetAngle;
    } else {
      // Desktop: apply speed limit (max radians per second)
      const angleDelta = targetAngle - currentGearAngle;
      const maxDelta = SPIN_LIMIT * delta;
      
      if (Math.abs(angleDelta) > maxDelta) {
        currentGearAngle += Math.sign(angleDelta) * maxDelta;
      } else {
        currentGearAngle = targetAngle;
      }
    }
    
    gearScrollAngle = currentGearAngle;
    spinQuat.setFromAxisAngle(gearRotationAxis, gearScrollAngle)

    // Define scroll thresholds relative to window height
    const centeringEnd = cachedInnerHeight * 0.45;
    const zoomStart = centeringEnd;
    const zoomEnd = cachedInnerHeight * 1.0;

    // Phase 1: Centering factor (0 to 1)
    const tCentering = Math.max(0, Math.min(scrollCurrent / centeringEnd, 1));
    const easeCentering = tCentering * tCentering * (3 - 2 * tCentering); // smoothstep

    // Phase 2: Zoom factor (0 to 1)
    const tZoom = Math.max(0, Math.min((scrollCurrent - zoomStart) / (zoomEnd - zoomStart), 1));
    const easeZoom = tZoom * tZoom; // quadratic ease-in (starts slow, speeds up through the gear)

    // Phase 3: Third Fold Text
    const thirdFoldStart = zoomEnd + cachedInnerHeight * 0.3;
    const thirdFoldEnd = thirdFoldStart + cachedInnerHeight * 0.7;
    const tThirdFold = Math.max(0, Math.min((scrollCurrent - thirdFoldStart) / (thirdFoldEnd - thirdFoldStart), 1));

    // Fade out shadows on scroll zoom to prevent massive shadows from darkening the screen
    const baseFloorOpacity = (typeof guiSettings !== 'undefined' && guiSettings[activeGUIState]) ? (guiSettings[activeGUIState]['val-shadow-floor'] ?? 0.35) : 0.35;
    const baseWallOpacity = (typeof guiSettings !== 'undefined' && guiSettings[activeGUIState]) ? (guiSettings[activeGUIState]['val-shadow-wall'] ?? 0.25) : 0.25;

    if (shadowFloorMat) {
      shadowFloorMat.opacity = baseFloorOpacity * (1 - tZoom);
      shadowFloorMat.needsUpdate = true;
    }
    if (shadowWallMat) {
      shadowWallMat.opacity = baseWallOpacity * (1 - tZoom);
      shadowWallMat.needsUpdate = true;
    }

    // 2. Mouse tilt — subtle inclination following cursor, which fades out as the gear centers
    const currentTiltStrength = TILT_STRENGTH * (1 - tCentering);
    tiltEuler.set(
      -mouseTiltCurrent.y * currentTiltStrength,  // pitch (tilt up/down)
       mouseTiltCurrent.x * currentTiltStrength,  // yaw (tilt left/right)
      0,
      'YXZ'
    )
    tiltQuat.setFromEuler(tiltEuler)

    // 3. Compose: tilt × original × spin
    gearMesh.quaternion
      .copy(tiltQuat)
      .multiply(gearOriginalQuat)
      .multiply(spinQuat)

    // 4. Update Gear Position
    // Starting offset position (scroll = 0)
    const startX = gearOriginalX + GEAR_SHIFT_X;
    const startY = gearOriginalY + cachedTextAnchorOffset + GEAR_SHIFT_Y;
    const startZ = gearMesh.position.z;

    // Target centered position in world space
    const screenCenter = getScreenCenterWorld(startZ);

    // Interpolate gear position to center during Phase 1
    const targetX = THREE.MathUtils.lerp(startX, screenCenter.x, easeCentering);
    const targetY = THREE.MathUtils.lerp(startY, screenCenter.y, easeCentering);
    const targetZ = THREE.MathUtils.lerp(startZ, screenCenter.z, easeCentering);

    const lerpFactor = isMobile ? 1.0 : (1 - Math.exp(-8 * delta));
    gearMesh.position.x += (targetX - gearMesh.position.x) * lerpFactor;
    gearMesh.position.y += (targetY - gearMesh.position.y) * lerpFactor;
    gearMesh.position.z += (targetZ - gearMesh.position.z) * lerpFactor;

    // 5. Camera Zoom (Phase 2)
    // Find direction from camera base position to gear position
    camera.getWorldDirection(_cameraDirection);

    // Distance from camera base to gear center
    _gearToCam.subVectors(gearMesh.position, cameraBasePos);
    const baseDistance = _gearToCam.dot(_cameraDirection);

    // Zoom distance: move camera past the gear by an overshoot value
    const overshoot = 0.8;
    const zoomDistance = (baseDistance + overshoot) * easeZoom;

    // Smoothly interpolate camera position
    _targetCamPos
      .copy(cameraBasePos)
      .addScaledVector(_cameraDirection, zoomDistance);

    camera.position.x += (_targetCamPos.x - camera.position.x) * lerpFactor;
    camera.position.y += (_targetCamPos.y - camera.position.y) * lerpFactor;
    camera.position.z += (_targetCamPos.z - camera.position.z) * lerpFactor;

    // Check if gear or camera actually moved to trigger lazy shadow updates
    const posDiff = Math.abs(gearMesh.position.x - targetX);
    if (!gearMesh.quaternion.equals(lastGearQuat) || posDiff > 0.001 || tZoom > 0) {
      gearMoved = true;
      lastGearQuat.copy(gearMesh.quaternion);
    }

    // 6. Animador das fatias da foto e dos cards (Fase 2 de scroll)
    if (imageGroup) {
      const targetCenter = getScreenCenterWorld(-6.0);
      
      // Scroll the images UP if we scroll past the second fold
      const extraScroll = Math.max(0, scrollCurrent - zoomEnd);
      const dist = camera.position.z - (-6.0);
      const fovRad = THREE.MathUtils.degToRad(camera.fov / 2);
      const visibleHeightAtZ = 2 * dist * Math.tan(fovRad);
      const worldUnitsPerPixel = visibleHeightAtZ / cachedInnerHeight;
      
      targetCenter.y += extraScroll * worldUnitsPerPixel;
      
      imageGroup.position.copy(targetCenter);
      
      // Dimensionamento Dinâmico (Mobile = 330px de largura)
      const isMobileImage = window.innerWidth <= 768;
      let currentScale = 1.0;
      
      if (isMobileImage) {
        // Converter 330px para unidades do mundo 3D
        const targetWorldWidth = 330 * worldUnitsPerPixel;
        currentScale = targetWorldWidth / 1.17; // 1.17 é a largura base não-escalada
      }
      
      imageGroup.scale.setScalar(currentScale);
      
      // Offset dimensions (used for calculating total scrolling offset for the single image)
      const cardHeight = 1.6 * currentScale;
      const gap = 0.4 * currentScale;
      const totalOffset = cardHeight + gap;

      // Calculate stagger progress dynamically
      const scrollGapPixels = totalOffset / worldUnitsPerPixel;
      
      function getEaseProgress(baseScrollOffset) {
         const zs = zoomStart + baseScrollOffset;
         const ze = zoomEnd + baseScrollOffset;
         return Math.max(0, Math.min((scrollCurrent - zs) / (ze - zs), 1));
      }

      const tZoom0 = tZoom;
      const tZoom1 = getEaseProgress(scrollGapPixels);
      const tZoom2 = getEaseProgress(scrollGapPixels * 2);

      function updateSlices(slicesArr, progress) {
        const numSlices = 10;
        slicesArr.forEach(slice => {
          const delay = (slice.index / numSlices) * 0.25;
          const localProgress = Math.max(0, Math.min((progress - 0.38 - delay) / 0.30, 1));
          const ease = localProgress * localProgress * (3 - 2 * localProgress); // smoothstep
          const slideX = -3.5 * (1 - ease);
          
          slice.mesh.position.x = slideX;
          slice.mesh.material.uniforms.uOpacity.value = ease;
          slice.mesh.material.uniforms.uMouseTilt.value.set(mouseTiltCurrent.x, mouseTiltCurrent.y);
        });
      }

      updateSlices(sliceMeshes, tZoom0);
      updateSlices(card1Slices, tZoom1);
      updateSlices(card2Slices, tZoom2);
      
      // Rotação sutil de inclinação interativa (mouse tilt) de todo o grupo em 3D
      imageGroup.rotation.y = mouseTiltCurrent.x * 0.12;
      imageGroup.rotation.x = -mouseTiltCurrent.y * 0.12;

      // Update the HTML signature overlay so it matches the 3D tilt of the image
      const sigOverlay = document.getElementById('signature-overlay');
      if (sigOverlay && (signatureVisible || signatureAnimating)) {
        if (tZoom0 < 0.95) {
          const paths = document.querySelectorAll('.sig-path');
          gsap.killTweensOf(sigOverlay);
          gsap.killTweensOf(paths);
          gsap.set(sigOverlay, { autoAlpha: 0 });
          signatureVisible = false;
          signatureAnimating = false;
        } else {
          const baseDistance = 9.5; // 3.5 - (-6.0)
          const currentDistance = camera.position.z - (-6.0);
          const distScale = currentDistance > 0.01 ? baseDistance / currentDistance : 1000;
          const yOffsetPixels = -extraScroll; // Move UP in pixels to match 3D scroll
          
          // O scale do HTML deve acompanhar o scale do grupo 3D no mobile
          const finalSigScale = distScale * currentScale;
          sigOverlay.style.transform = `translate(-50%, calc(-50% + ${yOffsetPixels}px)) perspective(1000px) scale(${finalSigScale}) rotateX(${-mouseTiltCurrent.y * 0.12}rad) rotateY(${mouseTiltCurrent.x * 0.12}rad)`;
        }
      }
    }

    // ── Update Third Fold Text ──────────────────────────────────────────
    if (tThirdFold !== lastTThirdFold) {
      lastTThirdFold = tThirdFold;
      const el = document.getElementById('third-fold-text');
      if (el) {
        if (!thirdFoldWords) {
          // Agora vamos animar por LINHA
          thirdFoldWords = splitTextToLines(el);
        }
        
        // Stagger animation for LINES based on scroll
        const numLines = thirdFoldWords.length;
        if (numLines > 0) {
          const staggerOverlap = 0.3; // How much of the scroll is dedicated to fading a single line
          thirdFoldWords.forEach((lineDiv, idx) => {
            const lineStart = (idx / numLines) * (1 - staggerOverlap);
            const lineEnd = lineStart + staggerOverlap;
            const tLine = Math.max(0, Math.min((tThirdFold - lineStart) / (lineEnd - lineStart), 1));
            
            if (tLine === 0) {
              lineDiv.style.opacity = 0;
              lineDiv.style.transform = `translateY(20px)`;
            } else if (tLine === 1) {
              lineDiv.style.opacity = 1;
              lineDiv.style.transform = `translateY(0px)`;
            } else {
              const easeLine = tLine * (2 - tLine); // out-quad
              lineDiv.style.opacity = easeLine;
              lineDiv.style.transform = `translateY(${20 * (1 - easeLine)}px)`;
            }
          });
        }
      }
    }
    
    // Sync third-fold visual scrolling with the smoothed scrollCurrent
    const thirdFoldTextWrapper = document.getElementById('third-fold-text');
    if (thirdFoldTextWrapper) {
      // O Lenis já gerencia scroll suavizado, então não precisamos de compensar scrollDiff
      thirdFoldTextWrapper.style.transform = `translateY(0px)`;
    }
  }

  // Update animation mixer
  if (mixer) {
    mixer.update(delta)
    // If animations are active, keep updating shadows
    gearMoved = true
  }

  // Shadow map lazy update to reduce GPU rendering load
  if (firstFrames > 0) {
    renderer.shadowMap.needsUpdate = true
    firstFrames--
  } else if (gearMoved) {
    renderer.shadowMap.needsUpdate = true
  }

  renderer.render(scene, camera)
}

animate()


// ── Responsive Cache ──────────────────────
function updateResponsiveCache() {
  // Mesma proteção contra zoom do handleResize
  const isZoom = window.visualViewport && Math.abs(window.visualViewport.scale - 1) > 0.01;
  if (isZoom) return;

  // No mobile, ignorar se é só mudança de altura (address bar)
  if (_isTouchDevice && Math.abs(window.innerWidth - lastKnownLayoutWidth) < 10) return;
  
  cachedInnerHeight = stableHeight;
  if (typeof gearMesh !== 'undefined' && gearMesh) {
    const dist = cameraBasePos.z - gearMesh.position.z;
    const fovRad = camera.fov * Math.PI / 180;
    cachedVHeight = 2 * Math.tan(fovRad / 2) * dist;

    const heroTitle = document.querySelector('.hero-title-container');
    if (heroTitle) {
      const absoluteBottom = heroTitle.getBoundingClientRect().bottom + window.scrollY;
      const offsetFromCenterPixels = (cachedInnerHeight / 2) - absoluteBottom;
      cachedTextAnchorOffset = offsetFromCenterPixels * (cachedVHeight / cachedInnerHeight);
    }
  }

  if (typeof heroParticleText !== 'undefined' && heroParticleText) {
    heroParticleText.setup(true);
  }
}

window.addEventListener('resize', updateResponsiveCache);
updateResponsiveCache();

// ── Hardcoded Settings (formerly GUI) ──────────────────────────────────
const siteSettings = {
  desktop: {
    'val-metalness': 1,
    'val-roughness': 0.2,
    'val-color': '#001e57',
    'val-emissive': '#000000',
    'val-normal': 2,
    'val-clearcoat': 1,
    'val-clearcoat-rough': 0,
    'val-exposure': 1.2,
    'val-keylight': 1.5,
    'val-keylight-color': '#ffffff',
    'val-light-x': -1.5,
    'val-light-y': 3.5,
    'val-light-z': 6,
    'val-ambient': 0.15,
    'val-ambient-color': '#ffffff',
    'val-bg-color': '#e0e0e0',
    'val-bg-visible': true,
    'val-shadow-floor': 0.35,
    'val-shadow-wall': 0.25,
    'val-shadow-res': '1024',
    'val-shadow-blur': 3.5,
    'val-shadow-bias': -0.0026,
    'val-shadow-nbias': 0.04,
    'val-fov': 30,
    'val-camera-z': 3.5,
    'val-tilt': 0.24,
    'val-shift-x': 0.9,
    'val-shift-y': -1.65,
    'val-spin-speed': 3,
    'val-spin-limit': 15,
    'val-axis': '-x',
    'val-font-top': 0.55,
    'val-font-h1': 5.5,
    'val-font-h2': 0.7,
    'val-pad-top': 6.5,
    'val-mar-top-text': 0,
    'val-mar-top': 1,
    'val-lh': 1.2,
    'val-mar-sub': 1.4,
    'val-sub-width': 63,
    'val-mar-scroll-top': 3,
    'val-mar-scroll-bot': 0
  },
  mobile: {
    'val-metalness': 1,
    'val-roughness': 0.2,
    'val-color': '#001e57',
    'val-emissive': '#000000',
    'val-normal': 2,
    'val-clearcoat': 1,
    'val-clearcoat-rough': 0,
    'val-exposure': 1.2,
    'val-keylight': 1.5,
    'val-keylight-color': '#ffffff',
    'val-light-x': 8,
    'val-light-y': 3.5,
    'val-light-z': 6,
    'val-ambient': 0.15,
    'val-ambient-color': '#ffffff',
    'val-bg-color': '#e0e0e0',
    'val-bg-visible': true,
    'val-shadow-floor': 0.35,
    'val-shadow-wall': 0.25,
    'val-shadow-res': '1024',
    'val-shadow-blur': 3.5,
    'val-shadow-bias': -0.0026,
    'val-shadow-nbias': 0.04,
    'val-fov': 21,
    'val-camera-z': 3.3,
    'val-tilt': 0.24,
    'val-shift-x': 0.9,
    'val-shift-y': -2.25,
    'val-spin-speed': 3,
    'val-spin-limit': 15,
    'val-axis': '-x',
    'val-font-top': 0.5,
    'val-font-h1': 3.3,
    'val-font-h2': 1.0,
    'val-pad-top': 5,
    'val-mar-top-text': 2,
    'val-mar-top': 1.5,
    'val-lh': 1.2,
    'val-mar-sub': 1.4,
    'val-sub-width': 50,
    'val-mar-scroll-top': 1.5,
    'val-mar-scroll-bot': 4
  }
};

window.guiSettings = siteSettings;
window.activeGUIState = window.innerWidth < 768 ? 'mobile' : 'desktop';

function applySiteSettings() {
  const mode = window.innerWidth < 768 ? 'mobile' : 'desktop';
  window.activeGUIState = mode;
  const s = siteSettings[mode];

  // Material
  logoMaterials.forEach(mat => {
    mat.metalness = s['val-metalness'];
    mat.roughness = s['val-roughness'];
    mat.color.set(s['val-color']);
    if(mat.emissive) mat.emissive.set(s['val-emissive']);
    if(mat.normalScale) mat.normalScale.set(s['val-normal'], s['val-normal']);
    mat.clearcoat = s['val-clearcoat'];
    mat.clearcoatRoughness = s['val-clearcoat-rough'];
  });

  // Lighting
  renderer.toneMappingExposure = s['val-exposure'];
  keyLight.intensity = s['val-keylight'];
  keyLight.color.set(s['val-keylight-color']);
  keyLight.position.set(s['val-light-x'], s['val-light-y'], s['val-light-z']);
  if (activeAmbientLight) {
    activeAmbientLight.intensity = s['val-ambient'];
    activeAmbientLight.color.set(s['val-ambient-color']);
  }
  
  document.documentElement.style.setProperty('--color-bg', s['val-bg-color']);
  if (backgroundMesh) backgroundMesh.visible = s['val-bg-visible'];

  if (shadowFloorMat) { shadowFloorMat.opacity = s['val-shadow-floor']; shadowFloorMat.needsUpdate = true; }
  if (shadowWallMat) { shadowWallMat.opacity = s['val-shadow-wall']; shadowWallMat.needsUpdate = true; }
  
  activeDirectionalLights.forEach(light => {
    light.shadow.mapSize.set(Number(s['val-shadow-res']), Number(s['val-shadow-res']));
    if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
    light.shadow.radius = s['val-shadow-blur'];
    light.shadow.bias = s['val-shadow-bias'];
    light.shadow.normalBias = s['val-shadow-nbias'];
  });

  // Camera
  baseFov = s['val-fov'];
  const aspect = window.innerWidth / window.innerHeight;
  camera.fov = Math.atan( Math.tan( baseFov * Math.PI / 360 ) * (1.7777 / aspect) ) * 360 / Math.PI;
  camera.updateProjectionMatrix();
  cameraBasePos.z = s['val-camera-z'];
  
  // Interaction
  TILT_STRENGTH = s['val-tilt'];
  GEAR_SHIFT_X = s['val-shift-x'];
  GEAR_SHIFT_Y = s['val-shift-y'];
  SPIN_SPEED = s['val-spin-speed'];
  SPIN_LIMIT = s['val-spin-limit'];
  
  const axisMap = {
    'x': [1,0,0], '-x': [-1,0,0], 'y': [0,1,0], '-y': [0,-1,0], 'z': [0,0,1], '-z': [0,0,-1]
  };
  gearRotationAxis.fromArray(axisMap[s['val-axis']]);

  // Text Spacing
  document.documentElement.style.setProperty('--hero-font-top', `${s['val-font-top']}rem`);
  document.documentElement.style.setProperty('--hero-font-h1', `${s['val-font-h1']}rem`);
  document.documentElement.style.setProperty('--hero-font-h2', `${s['val-font-h2']}rem`);
  document.documentElement.style.setProperty('--hero-padding-top', `${s['val-pad-top']}rem`);
  document.documentElement.style.setProperty('--hero-top-mt', `${s['val-mar-top-text']}rem`);
  document.documentElement.style.setProperty('--hero-top-margin', `${s['val-mar-top']}rem`);
  document.documentElement.style.setProperty('--scroll-mt', `${s['val-mar-scroll-top']}rem`);
  document.documentElement.style.setProperty('--scroll-mb', `${s['val-mar-scroll-bot']}rem`);
  document.documentElement.style.setProperty('--hero-title-lh', s['val-lh']);
  document.documentElement.style.setProperty('--hero-subtitle-margin', `${s['val-mar-sub']}rem`);
  document.documentElement.style.setProperty('--hero-subtitle-width', `${s['val-sub-width']}ch`);
}

// Inicializar as configurações após um pequeno delay para garantir que os materiais foram criados
setTimeout(applySiteSettings, 100);

window.addEventListener('resize', () => {
  const currentMode = window.innerWidth < 768 ? 'mobile' : 'desktop';
  if (window._lastMode !== currentMode) {
    window._lastMode = currentMode;
    applySiteSettings();
  }
});
window._lastMode = window.innerWidth < 768 ? 'mobile' : 'desktop';



// ── Text Glitch Hover Effect ─────────────────────────────────────────
function applyGlitchHoverEffect(elements) {
  const glitchChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  elements.forEach(el => {
    if (!el) return;
    
    // Function to recursively wrap text nodes in spans
    function wrapTextNodes(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        // Don't wrap empty or whitespace-only nodes
        if (!text.trim()) return;

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < text.length; i++) {
          const span = document.createElement('span');
          span.classList.add('glitch-char'); // Add specific class
          if (text[i] === ' ') {
            span.innerHTML = '&nbsp;';
            span.dataset.isSpace = 'true';
          } else {
            span.innerText = text[i];
            span.dataset.orig = text[i];
          }
          span.style.display = 'inline-block';
          fragment.appendChild(span);
        }
        node.parentNode.replaceChild(fragment, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Skip elements that are already our single-character spans
        if (!node.classList.contains('glitch-char')) {
          Array.from(node.childNodes).forEach(wrapTextNodes);
        }
      }
    }
    
    if (!el.dataset.glitched) {
      Array.from(el.childNodes).forEach(wrapTextNodes);
      el.dataset.glitched = 'true';
    }

    // Select ONLY the characters we wrapped
    const spans = Array.from(el.querySelectorAll('.glitch-char:not([data-is-space])'));
    
    el.addEventListener('mousemove', (e) => {
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      
      spans.forEach(span => {
        const rect = span.getBoundingClientRect();
        const spanX = rect.left + rect.width / 2;
        const spanY = rect.top + rect.height / 2;
        
        // Euclidean distance from cursor to character center
        const dist = Math.sqrt(Math.pow(mouseX - spanX, 2) + Math.pow(mouseY - spanY, 2));
        
        // ~20px radius covers roughly 5 characters total (2-3 each side)
        if (dist < 20) {
          if (!span.dataset.glitching) {
            span.dataset.glitching = 'true';
            span.innerText = glitchChars[Math.floor(Math.random() * glitchChars.length)];
            
            const interval = setInterval(() => {
              span.innerText = glitchChars[Math.floor(Math.random() * glitchChars.length)];
            }, 50);
            
            span.dataset.interval = interval;
          }
        } else {
          if (span.dataset.glitching) {
            clearInterval(Number(span.dataset.interval));
            span.dataset.glitching = '';
            span.innerText = span.dataset.orig;
          }
        }
      });
    });

    el.addEventListener('mouseleave', () => {
      spans.forEach(span => {
        if (span.dataset.glitching) {
          clearInterval(Number(span.dataset.interval));
          span.dataset.glitching = '';
          span.innerText = span.dataset.orig;
        }
      });
    });
  });
}

// Apply the glitch hover effect
applyGlitchHoverEffect([
  document.getElementById('hero-top'),
  document.querySelector('.scroll-text')
]);

// ── Image Trail Effect ───────────────────────────────────────────────
function setupImageTrail() {
  const images = [
    './imagens_cursor/01_1x.webp',
    './imagens_cursor/02_1x.webp',
    './imagens_cursor/03_1x.webp',
    './imagens_cursor/04_1x.webp',
    './imagens_cursor/05_1x.webp',
    './imagens_cursor/06_1x.webp',
    './imagens_cursor/07_1x.webp',
    './imagens_cursor/08_1x.webp'
  ];

  let lastSpawn = { x: -9999, y: -9999 };
  const threshold = 120; // Pixels to move before dropping a new image

  const heroSection = document.getElementById('hero-section');
  if (!heroSection) return;

  // Create a fixed container so images stay attached to the screen as you scroll slightly
  // and so they don't affect layout
  const trailContainer = document.createElement('div');
  trailContainer.style.position = 'fixed';
  trailContainer.style.top = '0';
  trailContainer.style.left = '0';
  trailContainer.style.width = '100vw';
  trailContainer.style.height = '100vh';
  trailContainer.style.pointerEvents = 'none';
  trailContainer.style.zIndex = '12'; // Behind the hero text (which is 15) but above canvas (1)
  trailContainer.style.overflow = 'hidden';
  document.body.appendChild(trailContainer);

  let zIndexCounter = 1;

  window.addEventListener('mousemove', (e) => {
    // Only drop images if we are near the top of the page (in the first fold)
    if (window.scrollY > window.innerHeight * 0.8) return;

    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Map mouseX into virtual container space if we are in force-mobile-view
    let containerLeft = 0;
    if (document.body && document.body.classList.contains('force-mobile-view')) {
      containerLeft = (window.innerWidth - 440) / 2;
    }
    const relativeMouseX = mouseX - containerLeft;
    const virtualW = window.innerWidth;

    // Only trigger if mouse is in the lateral 20% of the virtual screen
    const isLeft = relativeMouseX > 0 && relativeMouseX < virtualW * 0.2;
    const isRight = relativeMouseX > virtualW * 0.8 && relativeMouseX < virtualW;
    
    if (!isLeft && !isRight) return;
    
    const dist = Math.hypot(mouseX - lastSpawn.x, mouseY - lastSpawn.y);
    
    if (dist > threshold) {
      lastSpawn.x = mouseX;
      lastSpawn.y = mouseY;
      
      const img = document.createElement('img');
      img.src = images[Math.floor(Math.random() * images.length)];
      img.className = 'cursor-trail-img';
      
      // Randomize initial appearance slightly for an organic feel
      const rotation = (Math.random() - 0.5) * 30; // -15 to 15 degrees
      const scale = 0.8 + Math.random() * 0.4; // 0.8x to 1.2x
      
      // Attach below the cursor. 
      // If left side, attach the top-left corner. If right side, attach the top-right corner.
      const xPercent = isLeft ? 0 : -100;
      const yPercent = 0; // Top is attached so it sits below the cursor
      
      // Use GSAP's set for immediate application to avoid FOUC
      gsap.set(img, {
        x: mouseX,
        y: mouseY,
        zIndex: zIndexCounter++,
        rotation: rotation,
        scale: scale,
        xPercent: xPercent,
        yPercent: yPercent,
        transformOrigin: isLeft ? "0% 0%" : "100% 0%"
      });
      
      trailContainer.appendChild(img);
      
      // Animate out: slightly fall down, shrink, and fade out faster
      gsap.to(img, {
        opacity: 0,
        scale: scale * 0.6,
        y: "+=60", // Move down 60px relatively
        duration: 0.8, // Faster fade out
        ease: 'power2.out',
        onComplete: () => {
          if (img.parentNode) {
            img.parentNode.removeChild(img);
          }
        }
      });
    }
  });
}

setupImageTrail();
