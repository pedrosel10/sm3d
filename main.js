// ══════════════════════════════════════════════════════════════════════
//  São Miguel — 3D Logo Site
//  main.js — Three.js + GSAP ScrollTrigger
// ══════════════════════════════════════════════════════════════════════

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { gsap } from 'gsap'

// ── GLOBAL SIZING HELPERS ────────────────────────────────────────────

// ── DOM References ───────────────────────────────────────────────────
const canvas = document.querySelector('#app-canvas')
const loaderEl = document.getElementById('loader')
const loaderFill = document.getElementById('loader-fill')
const loaderNumber = document.getElementById('loader-number')
const scrollIndicator = document.getElementById('scroll-indicator')

// ── Scene ────────────────────────────────────────────────────────────
const scene = new THREE.Scene()
scene.background = null // Transparent so HTML background shows through

// ── Renderer (best practices from guide) ─────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true, // Allow HTML background to show
  powerPreference: 'high-performance',
})
const isMobileDevice = window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
renderer.setPixelRatio(isMobileDevice ? 1.0 : Math.min(window.devicePixelRatio, 1.5))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.shadowMap.autoUpdate = false

// ── Camera (fallback — GLB camera overrides) ─────────────────────────
let baseFov = 30;
let camera = new THREE.PerspectiveCamera(baseFov, window.innerWidth / window.innerHeight, 0.1, 1000)
// Ajuste inicial do FOV
const initAspect = window.innerWidth / window.innerHeight;
camera.fov = Math.atan( Math.tan( baseFov * Math.PI / 360 ) * (1.7777 / initAspect) ) * 360 / Math.PI;
camera.updateProjectionMatrix();

camera.position.set(0, 1.5, 3.5)

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
keyLight.shadow.mapSize.set(isMobileDevice ? 1024 : 2048, isMobileDevice ? 1024 : 2048)
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


window.addEventListener('mousemove', (e) => {
  mouseTiltTarget.x = (e.clientX / window.innerWidth) * 2 - 1  // -1 to 1
  mouseTiltTarget.y = (e.clientY / window.innerHeight) * 2 - 1 // -1 to 1
  
  // Update CSS variables for interactive mesh mask
  document.body.style.setProperty('--mouse-x', `${e.clientX}px`)
  document.body.style.setProperty('--mouse-y', `${e.clientY}px`)
})

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
      
      // Re-apply GUI overrides for FOV and Z distance if they exist, to respect mobile vs desktop
      if (typeof activeGUIState !== 'undefined' && typeof guiSettings !== 'undefined') {
        const s = guiSettings[activeGUIState];
        if (s && s['val-camera-z'] !== undefined) {
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
          child.shadow.mapSize.set(isMobileDevice ? 1024 : 2048, isMobileDevice ? 1024 : 2048)
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

// ── Smooth Scroll ────────────────────────────────────────────────────
let scrollTarget = window.scrollY || 0
let scrollCurrent = window.scrollY || 0

window.addEventListener('scroll', () => {
  scrollTarget = window.scrollY
}, { passive: true })

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
    
    this.ready = document.fonts.ready.then(() => {
      this.setup(false)
    })
    
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
    
    window.addEventListener('resize', () => {
      this.setup(true)
    })

    this.animate()
  }

  setup(isResize) {
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
      const charStr = span.innerText === '\u00A0' ? ' ' : span.innerText
      if (charStr.trim() !== '') {
        this.chars.push({
          char: charStr,
          x: x,
          y: y,
          opacity: isResize ? 1 : 0
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
    
    this.ctx.clearRect(0, 0, rect.width, rect.height)
  }
  
  animate() {
    requestAnimationFrame(() => this.animate())
    
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
    
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      if (!this.sweepTime) this.sweepTime = 0;
      this.sweepTime += 0.018; // ~3s por passagem (meio ciclo de seno)
      
      // Movimento senoidal indo e vindo, passando por todo o texto
      this.simSweepX = (Math.sin(this.sweepTime) * 0.5 + 0.5) * (rect.width + 100) - 50;
      this.simSweepY = rect.height / 2; // Passando pelo meio verticalmente
    }
    
    // 2. Physics logic and Activation
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      
      if (isMobile) {
        const dx = this.simSweepX - p.x;
        const dy = this.simSweepY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 45) {
          const force = (45 - dist) / 45;
          const angle = Math.atan2(dy, dx);
          p.vx -= Math.cos(angle) * force * 5; // Empurrão igual ao desktop
          p.vy -= Math.sin(angle) * force * 5;
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
    gsap.set([topText, scrollInd, ampersand], { opacity: 0 });
    
    if (heroTimeline) heroTimeline.kill();
    heroTimeline = gsap.timeline()
    
    // Top text fades in
    heroTimeline.to(topText, { opacity: 1, duration: 1.0, ease: 'power2.out' }, 0.2)
  
    // Ampersand fades in
    heroTimeline.to(ampersand, { opacity: 1, duration: 1.5, ease: 'power2.out' }, 0.4)

    if (heroParticleText) {
      // H1 letters solid text fades in randomly
      heroTimeline.to(heroParticleText.chars, 
        { opacity: 1, duration: 1.0, stagger: { amount: 1.0, from: "random" }, ease: 'power1.inOut' }, 
        0.4
      )
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
  const panel1 = document.querySelector('.info-panel[data-panel="1"]')
  const panel2 = document.querySelector('.info-panel[data-panel="2"]')
  const panel3 = document.querySelector('.info-panel[data-panel="3"]')
  const panels = [panel1, panel2, panel3]

  // Hide panels temporarily
  gsap.set(panels, { opacity: 0 })
}

// ── Resize ───────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  
  // Maintain constant horizontal FOV relative to 16:9 (1.7777)
  // This ensures the 3D model scales with screen width (like vw units), 
  // preventing it from shrinking when the window is flattened vertically.
  camera.fov = Math.atan( Math.tan( baseFov * Math.PI / 360 ) * (1.7777 / aspect) ) * 360 / Math.PI;
  
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
})

// ── Render Loop (delta time) ─────────────────────────────────────────
const timer = new THREE.Timer()
const spinQuat = new THREE.Quaternion()
const tiltQuat = new THREE.Quaternion()
const tiltEuler = new THREE.Euler()
const lastGearQuat = new THREE.Quaternion()
let firstFrames = 30

function animate() {
  requestAnimationFrame(animate)
  timer.update()
  const delta = timer.getDelta()

  // Smooth scroll interpolation (frame-rate independent to avoid jitter)
  scrollCurrent += (scrollTarget - scrollCurrent) * (1 - Math.exp(-8 * delta))

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
    
    // Apply speed limit (max radians per second)
    const angleDelta = targetAngle - currentGearAngle;
    const maxDelta = SPIN_LIMIT * delta; // allowed change this frame
    
    if (Math.abs(angleDelta) > maxDelta) {
      currentGearAngle += Math.sign(angleDelta) * maxDelta;
    } else {
      currentGearAngle = targetAngle;
    }
    
    gearScrollAngle = currentGearAngle;
    spinQuat.setFromAxisAngle(gearRotationAxis, gearScrollAngle)

    // 2. Mouse tilt — subtle inclination following cursor
    tiltEuler.set(
      -mouseTiltCurrent.y * TILT_STRENGTH,  // pitch (tilt up/down)
       mouseTiltCurrent.x * TILT_STRENGTH,  // yaw (tilt left/right)
      0,
      'YXZ'
    )
    tiltQuat.setFromEuler(tiltEuler)

    // 3. Compose: tilt × original × spin
    gearMesh.quaternion
      .copy(tiltQuat)
      .multiply(gearOriginalQuat)
      .multiply(spinQuat)

    // 4. Update vertical position (follows scroll) and center horizontally
    const targetX = gearOriginalX + GEAR_SHIFT_X
    
    // Map scroll pixels to 3D units using cached values (avoids jitter on mobile resize)
    const scrollOffset = (scrollCurrent / cachedInnerHeight) * cachedVHeight;
    
    // The target Y combines the original center, the cached text anchor, the manual GUI shift, and the scroll
    const targetY = gearOriginalY + cachedTextAnchorOffset + GEAR_SHIFT_Y + scrollOffset

    // Interpolate gear positions for butter-smooth shifts, using delta to make it frame-rate independent
    const isMobile = window.innerWidth < 768;
    const lerpFactor = isMobile ? 1.0 : (1 - Math.exp(-8 * delta));
    gearMesh.position.x += (targetX - gearMesh.position.x) * lerpFactor
    gearMesh.position.y += (targetY - gearMesh.position.y) * lerpFactor

    // Check if gear actually moved (rotation, tilt or position changed)
    const posDiff = Math.abs(gearMesh.position.x - targetX)
    if (!gearMesh.quaternion.equals(lastGearQuat) || posDiff > 0.001) {
      gearMoved = true
      lastGearQuat.copy(gearMesh.quaternion)
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
  cachedInnerHeight = window.innerHeight;
  if (typeof gearMesh !== 'undefined' && gearMesh) {
    const dist = camera.position.z - gearMesh.position.z;
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

// ── GUI Control Panel Logic ──────────────────────────────────────────
function setupGUI() {
  const guiToggle = document.getElementById('gui-toggle')
  const guiPanel = document.getElementById('gui-panel')
  if (guiToggle && guiPanel) {
    guiToggle.addEventListener('click', () => {
      guiPanel.classList.toggle('gui-collapsed')
    })
  }

  // --- DUAL STATE SYSTEM ---
  window.guiInputsRegistry = [];
  function getScreenMode() { 
     return window.innerWidth < 768 ? 'mobile' : 'desktop'; 
  }
  window.activeGUIState = getScreenMode();
  window.guiSettings = { desktop: {}, mobile: {} };

  function updateModeButtons() {
    const dBtn = document.getElementById('gui-mode-desktop');
    const mBtn = document.getElementById('gui-mode-mobile');
    if(dBtn && mBtn) {
      if(activeGUIState === 'desktop') { dBtn.classList.add('active'); mBtn.classList.remove('active'); }
      else { mBtn.classList.add('active'); dBtn.classList.remove('active'); }
    }
  }

  const dBtn = document.getElementById('gui-mode-desktop');
  const mBtn = document.getElementById('gui-mode-mobile');
  if(dBtn) dBtn.addEventListener('click', () => { 
     activeGUIState = 'desktop'; 
          updateModeButtons(); 
     applySettingsState(guiSettings.desktop); 
     
  });
  if(mBtn) mBtn.addEventListener('click', () => { 
     activeGUIState = 'mobile'; 
          updateModeButtons(); 
     applySettingsState(guiSettings.mobile); 
     
  });

  function applySettingsState(s) {
    guiInputsRegistry.forEach(item => {
       const el = document.getElementById(item.id);
       const disp = item.dispId ? document.getElementById(item.dispId) : null;
       if (el && s[item.id] !== undefined) {
          if (item.type === 'checkbox') el.checked = s[item.id];
          else el.value = s[item.id];
          if (disp && item.format) disp.innerText = item.format(s[item.id]);
          item.callback(s[item.id]);
       }
    });
  }

  window.addEventListener('resize', () => {
     const screenMode = getScreenMode();
     if (window._lastScreenMode !== screenMode) {
       window._lastScreenMode = screenMode;
       // Switch actual visual state AND gui toggle automatically
       activeGUIState = screenMode;
       updateModeButtons();
       applySettingsState(guiSettings[screenMode]);
     }
  });
  window._lastScreenMode = getScreenMode();

  function registerInput(id, dispId, type, callback, format) {
    guiInputsRegistry.push({ id, dispId, callback, format, type });
  }

  function handleInputEvent(id, dispId, type, e, callback, format) {
    let val = type === 'checkbox' ? e.target.checked : (type === 'number' || type === 'range' ? Number(e.target.value) : e.target.value);
    if (dispId) {
      const disp = document.getElementById(dispId);
      if (disp && format) disp.innerText = format(val);
    }
    guiSettings[activeGUIState][id] = val;
    if (activeGUIState === getScreenMode()) {
      callback(val);
    }
  }

  function bindRange(id, dispId, callback, format = (v) => v.toFixed(2)) {
    registerInput(id, dispId, 'range', callback, format);
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', (e) => handleInputEvent(id, dispId, 'range', e, callback, format));
  }

  function bindColor(id, callback) {
    registerInput(id, null, 'color', callback, null);
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', (e) => handleInputEvent(id, null, 'color', e, callback, null));
  }

  function bindCheckbox(id, callback) {
    registerInput(id, null, 'checkbox', callback, null);
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', (e) => handleInputEvent(id, null, 'checkbox', e, callback, null));
  }

  function bindSelect(id, callback) {
    registerInput(id, null, 'select', callback, null);
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', (e) => handleInputEvent(id, null, 'select', e, callback, null));
  }

  function bindCssVarSlider(id, dispId, cssVar, suffix = '') {
    const updateText = (val) => {
      document.documentElement.style.setProperty(cssVar, `${val}${suffix}`);
      if (typeof heroParticleText !== 'undefined' && heroParticleText) {
        heroParticleText.setup(true);
      }
    };
    registerInput(id, dispId, 'range', updateText, (v) => v.toFixed(2));
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', (e) => handleInputEvent(id, dispId, 'range', e, updateText, (v) => v.toFixed(2)));
  }

  // --- MATERIAL SETTINGS ---
  bindRange('val-metalness', 'disp-metalness', (val) => { logoMaterials.forEach(mat => mat.metalness = val); })
  bindRange('val-roughness', 'disp-roughness', (val) => { logoMaterials.forEach(mat => mat.roughness = val); })
  
  bindColor('val-color', (val) => { logoMaterials.forEach(mat => mat.color.set(val)); });
  bindColor('val-emissive', (val) => { logoMaterials.forEach(mat => { if(mat.emissive) mat.emissive.set(val); }); });
  
  bindRange('val-normal', 'disp-normal', (val) => { logoMaterials.forEach(mat => { if(mat.normalScale) mat.normalScale.set(val, val); }); })
  bindRange('val-clearcoat', 'disp-clearcoat', (val) => { logoMaterials.forEach(mat => mat.clearcoat = val); })
  bindRange('val-clearcoat-rough', 'disp-clearcoat-rough', (val) => { logoMaterials.forEach(mat => mat.clearcoatRoughness = val); })

  // --- LIGHTING SETTINGS ---
  bindRange('val-exposure', 'disp-exposure', (val) => { renderer.toneMappingExposure = val; })
  bindRange('val-keylight', 'disp-keylight', (val) => { keyLight.intensity = val; })
  bindColor('val-keylight-color', (val) => { keyLight.color.set(val) });
  bindRange('val-light-x', 'disp-light-x', (val) => { keyLight.position.x = val; })
  bindRange('val-light-y', 'disp-light-y', (val) => { keyLight.position.y = val; })
  bindRange('val-light-z', 'disp-light-z', (val) => { keyLight.position.z = val; })
  bindRange('val-ambient', 'disp-ambient', (val) => { if (activeAmbientLight) activeAmbientLight.intensity = val; })
  bindColor('val-ambient-color', (val) => { if (activeAmbientLight) activeAmbientLight.color.set(val) });

  bindColor('val-bg-color', (val) => {
    document.documentElement.style.setProperty('--color-bg', val);
  });

  bindCheckbox('val-bg-visible', (val) => { if (backgroundMesh) backgroundMesh.visible = val });

  bindRange('val-shadow-floor', 'disp-shadow-floor', (val) => { if (shadowFloorMat) { shadowFloorMat.opacity = val; shadowFloorMat.needsUpdate = true; } })
  bindRange('val-shadow-wall', 'disp-shadow-wall', (val) => { if (shadowWallMat) { shadowWallMat.opacity = val; shadowWallMat.needsUpdate = true; } })

  const resSelect = document.getElementById('val-shadow-res')
  if (resSelect && keyLight.shadow.mapSize) resSelect.value = keyLight.shadow.mapSize.x
  bindSelect('val-shadow-res', (val) => {
    activeDirectionalLights.forEach(light => {
      light.shadow.mapSize.set(Number(val), Number(val))
      if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
    })
  });

  bindRange('val-shadow-blur', 'disp-shadow-blur', (val) => { activeDirectionalLights.forEach(light => light.shadow.radius = val); })
  bindRange('val-shadow-bias', 'disp-shadow-bias', (val) => { activeDirectionalLights.forEach(light => light.shadow.bias = val); }, (v) => v.toFixed(4))
  bindRange('val-shadow-nbias', 'disp-shadow-nbias', (val) => { activeDirectionalLights.forEach(light => light.shadow.normalBias = val); })

  // --- CAMERA SETTINGS ---
  bindRange('val-fov', 'disp-fov', (val) => {
    baseFov = val;
    const aspect = window.innerWidth / window.innerHeight;
    camera.fov = Math.atan( Math.tan( baseFov * Math.PI / 360 ) * (1.7777 / aspect) ) * 360 / Math.PI;
    camera.updateProjectionMatrix();
  }, (v) => v.toFixed(0))

  bindRange('val-camera-z', 'disp-camera-z', (val) => { camera.position.z = val; })

  // --- INTERACTION ---
  bindRange('val-tilt', 'disp-tilt', (val) => { TILT_STRENGTH = val; })
  bindRange('val-shift-x', 'disp-shift-x', (val) => { GEAR_SHIFT_X = val; })
  bindRange('val-shift-y', 'disp-shift-y', (val) => { GEAR_SHIFT_Y = val; })

  const centerBtn = document.getElementById('gui-btn-center-y')
  if (centerBtn) {
    centerBtn.addEventListener('click', () => {
      GEAR_SHIFT_Y = 0;
      guiSettings[activeGUIState]['val-shift-y'] = 0;
      applySettingsState(guiSettings[activeGUIState]);
    })
  }

  bindRange('val-spin-speed', 'disp-spin-speed', (val) => { SPIN_SPEED = val; })
  bindRange('val-spin-limit', 'disp-spin-limit', (val) => { SPIN_LIMIT = val; })

  bindSelect('val-axis', (val) => {
      if (val === 'x') gearRotationAxis.set(1, 0, 0)
      else if (val === '-x') gearRotationAxis.set(-1, 0, 0)
      else if (val === 'y') gearRotationAxis.set(0, 1, 0)
      else if (val === '-y') gearRotationAxis.set(0, -1, 0)
      else if (val === 'z') gearRotationAxis.set(0, 0, 1)
      else if (val === '-z') gearRotationAxis.set(0, 0, -1)
  });

  // --- TEXT SPACING ---
  bindCssVarSlider('val-font-top', 'disp-font-top', '--hero-font-top', 'rem');
  bindCssVarSlider('val-font-h1', 'disp-font-h1', '--hero-font-h1', 'rem');
  bindCssVarSlider('val-font-h2', 'disp-font-h2', '--hero-font-h2', 'rem');
  bindCssVarSlider('val-pad-top', 'disp-pad-top', '--hero-padding-top', 'rem');
  bindCssVarSlider('val-mar-top-text', 'disp-mar-top-text', '--hero-top-mt', 'rem');
  bindCssVarSlider('val-mar-top', 'disp-mar-top', '--hero-top-margin', 'rem');
  bindCssVarSlider('val-mar-scroll-top', 'disp-mar-scroll-top', '--scroll-mt', 'rem');
  bindCssVarSlider('val-mar-scroll-bot', 'disp-mar-scroll-bot', '--scroll-mb', 'rem');
  bindCssVarSlider('val-lh', 'disp-lh', '--hero-title-lh', '');
  bindCssVarSlider('val-mar-sub', 'disp-mar-sub', '--hero-subtitle-margin', 'rem');
  bindCssVarSlider('val-sub-width', 'disp-sub-width', '--hero-subtitle-width', 'ch');

  // --- INITIALIZE DUAL STATE ---
  function extractInitialSettings() {
    const s = {};
    guiInputsRegistry.forEach(item => {
      const el = document.getElementById(item.id);
      if (el) {
        if (item.type === 'checkbox') s[item.id] = el.checked;
        else if (item.type === 'number' || item.type === 'range') s[item.id] = Number(el.value);
        else s[item.id] = el.value;
      }
    });
    return s;
  }
  guiSettings.desktop = extractInitialSettings();
  
  // Apply desktop-specific overrides from user JSON
  Object.assign(guiSettings.desktop, {
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
  });

  guiSettings.mobile = JSON.parse(JSON.stringify(guiSettings.desktop));

  // Apply mobile-specific overrides from user JSON
  Object.assign(guiSettings.mobile, {
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
    'val-font-h2': 0.7,
    'val-pad-top': 5,
    'val-mar-top-text': 2,
    'val-mar-top': 1.5,
    'val-lh': 1.2,
    'val-mar-sub': 1.4,
    'val-sub-width': 50,
    'val-mar-scroll-top': 1.5,
    'val-mar-scroll-bot': 4
  });

  updateModeButtons();
  applySettingsState(guiSettings[getScreenMode()]);

  // --- COPY JSON ---
  const copyBtn = document.getElementById('gui-copy-btn')
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      function formatSettings(s) {
        return {
          metalness: s['val-metalness'], roughness: s['val-roughness'],
          color: s['val-color'], emissiveColor: s['val-emissive'],
          normalScale: s['val-normal'], clearcoat: s['val-clearcoat'], clearcoatRoughness: s['val-clearcoat-rough'],
          exposure: s['val-exposure'], keyLightIntensity: s['val-keylight'], keyLightColor: s['val-keylight-color'],
          lightX: s['val-light-x'], lightY: s['val-light-y'], lightZ: s['val-light-z'],
          ambientLightIntensity: s['val-ambient'], ambientLightColor: s['val-ambient-color'],
          backgroundColor: s['val-bg-color'], background3DVisible: s['val-bg-visible'],
          shadowFloorOpacity: s['val-shadow-floor'], shadowWallOpacity: s['val-shadow-wall'],
          shadowResolution: s['val-shadow-res'], shadowBlurRadius: s['val-shadow-blur'],
          shadowBias: s['val-shadow-bias'], shadowNormalBias: s['val-shadow-nbias'],
          fov: s['val-fov'], cameraZ: s['val-camera-z'], tiltStrength: s['val-tilt'],
          gearShiftX: s['val-shift-x'], gearShiftY: s['val-shift-y'],
          spinSpeed: s['val-spin-speed'], spinLimit: s['val-spin-limit'], axis: s['val-axis'],
          fontTop: s['val-font-top'], fontH1: s['val-font-h1'], fontH2: s['val-font-h2'],
          padTop: s['val-pad-top'], marginTopText: s['val-mar-top-text'], marginTop: s['val-mar-top'], titleLh: s['val-lh'],
          marginSub: s['val-mar-sub'], subWidth: s['val-sub-width'],
          scrollMt: s['val-mar-scroll-top'], scrollMb: s['val-mar-scroll-bot']
        };
      }
      
      const dsStr = JSON.stringify(formatSettings(guiSettings.desktop), null, 4).replace(/\n/g, '\n  ');
      const mbStr = JSON.stringify(formatSettings(guiSettings.mobile), null, 4).replace(/\n/g, '\n  ');
      const text = `Configurações da Logo 3D:\n\`\`\`json\n{\n  "desktop": ${dsStr},\n  "mobile": ${mbStr}\n}\n\`\`\``;
      
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.classList.add('copied')
        copyBtn.textContent = '✓ Copiado!'
        setTimeout(() => {
          copyBtn.classList.remove('copied')
          copyBtn.textContent = '📋 Copiar Configurações'
        }, 2000)
      })
    })
  }

  // --- DRAGGABLE GUI ---
  const header = document.getElementById('gui-drag-handle');
  if (header && guiPanel) {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      const rect = guiPanel.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      guiPanel.style.transition = 'none'; // Disable transition while dragging
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      let x = e.clientX - offsetX;
      let y = e.clientY - offsetY;
      
      // Prevent dragging completely off screen
      x = Math.max(0, Math.min(x, window.innerWidth - guiPanel.offsetWidth));
      y = Math.max(0, Math.min(y, window.innerHeight - 30));
      
      guiPanel.style.left = `${x}px`;
      guiPanel.style.top = `${y}px`;
      guiPanel.style.bottom = 'auto'; // Release bottom constraint
      guiPanel.style.transform = 'none'; // Release Y transform if any
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      guiPanel.style.transition = 'transform 0.3s ease, background 0.3s ease, left 0.3s ease, top 0.3s ease';
    });
  }

}
setupGUI()


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
