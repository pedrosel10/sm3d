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
let gearOriginalQuat = new THREE.Quaternion()
const gearRotationAxis = new THREE.Vector3(-1, 0, 0) // -X axis (confirmed)
let gearScrollAngle = 0

// GSAP Infinite Scroll Timeline
let scrollTimeline = null
const animationState = { gearX: 0.02 } // 0.02 = Left, 0.92 = Right
const loopHeight = 2600 // Scroll pixels representing max scroll

let gearOriginalY = 0

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
    
    // 2. Physics logic and Activation
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      
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
  if (!heroParticleText && !isMobileDevice) {
    splitTextToChars(h1) // Setup layout spans
    h1.style.opacity = '0' // DOM text is permanently invisible
    heroParticleText = new ParticleText('hero-canvas-particles', 'hero-title')
    await heroParticleText.ready // Wait for font and extraction
  } else if (isMobileDevice) {
    h1Chars = splitTextToChars(h1)
    h1.style.opacity = '1'
    const canvasEl = document.getElementById('hero-canvas-particles')
    if (canvasEl) canvasEl.style.display = 'none'
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

    if (!isMobileDevice && heroParticleText) {
      // H1 letters solid text fades in randomly
      heroTimeline.to(heroParticleText.chars, 
        { opacity: 1, duration: 1.0, stagger: { amount: 1.0, from: "random" }, ease: 'power1.inOut' }, 
        0.4
      )
    } else {
      heroTimeline.to(h1Chars, 
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

  // Smooth scroll interpolation
  scrollCurrent += (scrollTarget - scrollCurrent) * 0.07

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
    
    // Move up based on scroll exactly matching CSS pixel movement
    // Calculate the visible height in 3D units at the gear's depth
    const dist = camera.position.z - gearMesh.position.z;
    const fovRad = camera.fov * Math.PI / 180;
    const vHeight = 2 * Math.tan(fovRad / 2) * dist;
    // Map scroll pixels to 3D units
    const scrollOffset = (scrollCurrent / window.innerHeight) * vHeight;
    
    // Anchor dynamically to the text so it never misaligns on resize
    let textAnchorOffset = 0;
    const heroTitle = document.querySelector('.hero-title-container');
    if (heroTitle) {
      // absolute distance from the top of the document
      const absoluteBottom = heroTitle.getBoundingClientRect().bottom + window.scrollY;
      
      // Calculate where this pixel is relative to the center of the screen
      const offsetFromCenterPixels = (window.innerHeight / 2) - absoluteBottom;
      
      // Convert to 3D units
      textAnchorOffset = offsetFromCenterPixels * (vHeight / window.innerHeight);
    }
    
    // The target Y combines the original center, the text anchor, the manual GUI shift, and the scroll
    const targetY = gearOriginalY + textAnchorOffset + GEAR_SHIFT_Y + scrollOffset

    // Interpolate gear positions for butter-smooth shifts
    gearMesh.position.x += (targetX - gearMesh.position.x) * 0.08
    gearMesh.position.y += (targetY - gearMesh.position.y) * 0.08

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


// ── Responsive Mobile Overrides (formerly GUI) ──────────────────────
function applyResponsiveSettings() {
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    baseFov = 21;
    camera.position.z = 3.4;
    GEAR_SHIFT_Y = -2.15;
    document.documentElement.style.setProperty('--hero-font-h1', '3.3rem');
    document.documentElement.style.setProperty('--hero-padding-top', '5.5rem');
    document.documentElement.style.setProperty('--hero-top-mt', '2rem');
    document.documentElement.style.setProperty('--hero-top-margin', '2rem');
    document.documentElement.style.setProperty('--hero-title-lh', '1.25');
    document.documentElement.style.setProperty('--hero-subtitle-width', '58ch');
    document.documentElement.style.setProperty('--scroll-mt', '4.5rem');
    document.documentElement.style.setProperty('--scroll-mb', '9.5rem');
  } else {
    baseFov = 30;
    camera.position.z = 3.5;
    GEAR_SHIFT_Y = -1.65;
    document.documentElement.style.setProperty('--hero-font-h1', '5.5rem');
    document.documentElement.style.setProperty('--hero-padding-top', '6.5rem');
    document.documentElement.style.setProperty('--hero-top-mt', '0rem');
    document.documentElement.style.setProperty('--hero-top-margin', '1rem');
    document.documentElement.style.setProperty('--hero-title-lh', '1.2');
    document.documentElement.style.setProperty('--hero-subtitle-width', '63ch');
    document.documentElement.style.setProperty('--scroll-mt', '3rem');
    document.documentElement.style.setProperty('--scroll-mb', '0rem');
  }
  
  const aspect = window.innerWidth / window.innerHeight;
  camera.fov = Math.atan( Math.tan( baseFov * Math.PI / 360 ) * (1.7777 / aspect) ) * 360 / Math.PI;
  camera.updateProjectionMatrix();

  if (typeof heroParticleText !== 'undefined' && heroParticleText) {
    heroParticleText.setup(true);
  }
}

window.addEventListener('resize', applyResponsiveSettings);
applyResponsiveSettings();

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
    './imagens%20cursor/01_1x.webp',
    './imagens%20cursor/02_1x.webp',
    './imagens%20cursor/03_1x.webp',
    './imagens%20cursor/04_1x.webp',
    './imagens%20cursor/05_1x.webp',
    './imagens%20cursor/06_1x.webp',
    './imagens%20cursor/07_1x.webp',
    './imagens%20cursor/08_1x.webp'
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
