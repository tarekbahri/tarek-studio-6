import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { studioAudio } from '../../audio/StudioAudio';
import {
  applyAvatarPose,
  createTarekAvatarRig,
  type AvatarAnimState,
  type AvatarPoseParams,
  type TarekAvatarRig,
} from './TarekAvatarModel';

export interface AvatarPerchCoord {
  id: string;
  /** Normalized viewport/container coordinates (0..1 left->right, 0..1 top->bottom) */
  normX: number;
  normY: number;
}

export interface AvatarLaunchRequest {
  pluginId: string;
  targetNormX: number;
  targetNormY: number;
  nonce: number;
}

interface TarekAvatarStageProps {
  active: boolean;
  /** Idle perch coordinates near currently hovered/last-visited plugin or center stage */
  initialNormX: number;
  initialNormY: number;
  hoverTarget: AvatarPerchCoord | null;
  availablePerches: AvatarPerchCoord[];
  launchRequest: AvatarLaunchRequest | null;
  onLaunchSequenceComplete: (pluginId: string) => void;
  onPhaseChange?: (state: AvatarAnimState) => void;
}

function detectSoftwareGl(gl: WebGLRenderingContext | WebGL2RenderingContext | null): boolean {
  if (!gl) return false;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
      return /swiftshader|llvmpipe|software|mesa|microsoft basic/i.test(rendererStr);
    }
    const vendorStr = String(gl.getParameter(gl.RENDERER) ?? '');
    return /swiftshader|llvmpipe|software/i.test(vendorStr);
  } catch {
    return false;
  }
}

function createEnvironmentKey(renderer: THREE.WebGLRenderer): {
  envMap: THREE.Texture;
  dispose: () => void;
} {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const room = new RoomEnvironment();
  const rt = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  return {
    envMap: rt.texture,
    dispose: () => rt.dispose(),
  };
}

/**
 * Zero-allocation real-time audio analyzer reading studioAudio.getMasterAnalyser()
 * and Beatbox kick events. Never allocates in rAF and never modifies the audio graph.
 */
class AvatarAudioReactiveTracker {
  private freqBins: Uint8Array<ArrayBuffer> | null = null;
  private kickBaseline = 0;
  private snareBaseline = 0;
  private lastKickAt = -10;
  private lastSnareAt = -10;
  private estimatedBeatPeriod = 0.484; // ~124 BPM default fallback
  private beatPhase = 0;
  private recentMusicHold = 0;
  private pendingEngineKickVel = 0;

  public kickPulse = 0;
  public snarePulse = 0;
  public snareSign = 1;
  public musicEnergy = 0;
  public beatOsc = 0;
  public musicActive = false;

  public notifyEngineKick(velocity: number): void {
    this.pendingEngineKickVel = Math.max(this.pendingEngineKickVel, Math.min(1, velocity));
  }

  public reset(): void {
    this.kickPulse = 0;
    this.snarePulse = 0;
    this.musicEnergy = 0;
    this.beatOsc = 0;
    this.musicActive = false;
    this.recentMusicHold = 0;
    this.pendingEngineKickVel = 0;
  }

  public update(dt: number, nowSec: number): void {
    const analyser = studioAudio.getMasterAnalyser();
    const ctx = studioAudio.getContext();

    if (!analyser || !ctx || ctx.state !== 'running') {
      this.kickPulse = Math.max(0, this.kickPulse - dt * 5.5);
      this.snarePulse = Math.max(0, this.snarePulse - dt * 6.5);
      this.musicEnergy = Math.max(0, this.musicEnergy - dt * 3.0);
      this.recentMusicHold = Math.max(0, this.recentMusicHold - dt);
      this.musicActive = false;
      this.beatOsc = 0;
      this.pendingEngineKickVel = 0;
      return;
    }

    const binCount = analyser.frequencyBinCount;
    if (!this.freqBins || this.freqBins.length !== binCount) {
      this.freqBins = new Uint8Array(new ArrayBuffer(binCount));
    }

    analyser.getByteFrequencyData(this.freqBins);

    const nyquist = (ctx.sampleRate || 48000) * 0.5;
    const hzPerBin = nyquist / binCount;

    // Kick / sub band: ~25 Hz .. 155 Hz
    const kickMin = Math.max(0, Math.floor(25 / hzPerBin));
    const kickMax = Math.min(binCount - 1, Math.max(kickMin + 1, Math.ceil(155 / hzPerBin)));
    let kickSum = 0;
    for (let i = kickMin; i <= kickMax; i++) {
      kickSum += this.freqBins[i];
    }
    const kickLevel = kickSum / ((kickMax - kickMin + 1) * 255);

    // Snare / upper-mid crack band: ~200 Hz .. 4200 Hz
    const snareMin = Math.min(binCount - 1, Math.max(kickMax + 1, Math.floor(200 / hzPerBin)));
    const snareMax = Math.min(binCount - 1, Math.max(snareMin + 1, Math.ceil(4200 / hzPerBin)));
    let snareSum = 0;
    for (let i = snareMin; i <= snareMax; i++) {
      snareSum += this.freqBins[i];
    }
    const snareLevel = snareSum / ((snareMax - snareMin + 1) * 255);

    // Overall musical loudness across 25..6500 Hz
    const totalMax = Math.min(binCount - 1, Math.ceil(6500 / hzPerBin));
    let totalSum = 0;
    for (let i = kickMin; i <= totalMax; i++) {
      totalSum += this.freqBins[i];
    }
    const rawEnergy = Math.min(1, (totalSum / ((totalMax - kickMin + 1) * 255)) * 1.9);
    this.musicEnergy = this.musicEnergy + (rawEnergy - this.musicEnergy) * Math.min(1, dt * 10);

    // Rolling spectral baselines for transient onset isolation
    this.kickBaseline += (kickLevel - this.kickBaseline) * Math.min(1, dt * 4.8);
    this.snareBaseline += (snareLevel - this.snareBaseline) * Math.min(1, dt * 6.5);

    const kickFlux = kickLevel - this.kickBaseline;
    const snareFlux = snareLevel - this.snareBaseline;

    let kickTriggered = false;
    if (
      (kickFlux > 0.085 && kickLevel > 0.24 && nowSec - this.lastKickAt > 0.17) ||
      this.pendingEngineKickVel > 0.15
    ) {
      const impulse = Math.max(
        Math.min(1, kickFlux * 4.2 + kickLevel * 0.45),
        this.pendingEngineKickVel
      );
      this.kickPulse = Math.max(this.kickPulse, impulse);

      const deltaBeat = nowSec - this.lastKickAt;
      if (deltaBeat >= 0.28 && deltaBeat <= 0.85) {
        this.estimatedBeatPeriod = this.estimatedBeatPeriod * 0.72 + deltaBeat * 0.28;
      }
      this.lastKickAt = nowSec;
      this.beatPhase = Math.PI * 0.35;
      kickTriggered = true;
    }
    this.pendingEngineKickVel = 0;

    if (!kickTriggered && snareFlux > 0.055 && snareLevel > 0.14 && nowSec - this.lastSnareAt > 0.16) {
      const snareImpulse = Math.min(1, snareFlux * 5.2 + snareLevel * 0.35);
      this.snarePulse = Math.max(this.snarePulse, snareImpulse);
      this.snareSign = -this.snareSign;
      this.lastSnareAt = nowSec;
    }

    // Smooth exponential transient decays
    this.kickPulse *= Math.exp(-dt * 9.5);
    this.snarePulse *= Math.exp(-dt * 11.5);
    if (this.kickPulse < 0.008) this.kickPulse = 0;
    if (this.snarePulse < 0.008) this.snarePulse = 0;

    if (this.musicEnergy > 0.11 || this.kickPulse > 0.22 || this.snarePulse > 0.22) {
      this.recentMusicHold = 0.85;
    } else {
      this.recentMusicHold = Math.max(0, this.recentMusicHold - dt);
    }

    this.musicActive = this.recentMusicHold > 0.08;

    const omega = (Math.PI * 2) / Math.max(0.28, this.estimatedBeatPeriod);
    this.beatPhase = (this.beatPhase + dt * omega) % (Math.PI * 2);
    this.beatOsc = this.musicActive ? Math.sin(this.beatPhase) : 0;
  }
}

interface SpiderSwingSequence {
  pluginId: string | null; // null = manual Spider-Man jump (do NOT open plugin)
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  variation: 0 | 1 | 2;
  swingArmSide: -1 | 1;
  elapsed: number;
  noticeDur: number;
  crouchDur: number;
  launchDur: number;
  swingDur: number;
  landDur: number;
  faceDur: number;
  emoteDur: number;
  completed: boolean;
}

interface GrabSession {
  pointerId: number;
  hitHead: boolean;
  startClientX: number;
  startClientY: number;
  initialAvatarX: number;
  initialAvatarY: number;
  grabOffsetNormX: number;
  grabOffsetNormY: number;
  targetNormX: number;
  targetNormY: number;
  downAt: number;
  mode: 'pending' | 'dragging';
}

// Pre-allocated scratch math helpers (zero per-frame GC allocations)
const _upVec = new THREE.Vector3(0, 1, 0);
const _handWorld = new THREE.Vector3();
const _anchorWorld = new THREE.Vector3();
const _webDir = new THREE.Vector3();

const CENTER_LANE_Y = 0.51;
const PATROL_RIGHT_X = 0.88;
const PATROL_LEFT_X = 0.12;
const WALK_SPEED_NORM = 0.022; // Slower, relaxed stroll across home screen

export const TarekAvatarStage: React.FC<TarekAvatarStageProps> = React.memo(
  ({
    active,
    initialNormX,
    initialNormY,
    hoverTarget,
    availablePerches,
    launchRequest,
    onLaunchSequenceComplete,
    onPhaseChange,
  }) => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const [contextLost, setContextLost] = useState(false);

    // Refs synced with React props so animation loop never restarts on prop updates
    const activeRef = useRef(active);
    activeRef.current = active;
    const hoverTargetRef = useRef(hoverTarget);
    hoverTargetRef.current = hoverTarget;
    const perchesRef = useRef(availablePerches);
    perchesRef.current = availablePerches;
    const onCompleteRef = useRef(onLaunchSequenceComplete);
    onCompleteRef.current = onLaunchSequenceComplete;
    const onPhaseRef = useRef(onPhaseChange);
    onPhaseRef.current = onPhaseChange;

    // Persistent avatar position across navigation
    const posNormRef = useRef<{ x: number; y: number }>({
      x: initialNormX,
      y: initialNormY,
    });

    const seqRef = useRef<SpiderSwingSequence | null>(null);
    const lastNonceRef = useRef<number>(-1);
    const currentPhaseRef = useRef<AvatarAnimState>('walking');
    const jumpCounterRef = useRef<number>(0);

    const buildSpiderSequence = (
      pluginId: string | null,
      targetNormX: number,
      targetNormY: number
    ): SpiderSwingSequence => {
      const sx = THREE.MathUtils.clamp(posNormRef.current.x, 0.06, 0.94);
      const sy = THREE.MathUtils.clamp(posNormRef.current.y, 0.16, 0.94);

      // Land slightly beside selected icon so card title/icon stay visible
      const sideOffset = targetNormX > 0.5 ? -0.048 : 0.048;
      const ex = THREE.MathUtils.clamp(targetNormX + sideOffset, 0.08, 0.92);
      const ey = THREE.MathUtils.clamp(targetNormY, 0.18, 0.92);

      const dist = Math.hypot(ex - sx, ey - sy);
      const isManual = pluginId === null;
      const isSameSpot = dist < 0.06;

      const variation = (jumpCounterRef.current % 3) as 0 | 1 | 2;
      jumpCounterRef.current += 1;

      // Alternate shooting arm cleanly by travel direction & variation
      const swingArmSide: -1 | 1 =
        variation === 1 ? 1 : ex >= sx ? 1 : -1;

      return {
        pluginId,
        startX: sx,
        startY: sy,
        endX: ex,
        endY: ey,
        variation,
        swingArmSide,
        elapsed: 0,
        noticeDur: isManual || isSameSpot ? 0.06 : 0.11,
        crouchDur: isSameSpot ? 0.08 : 0.14,
        launchDur: isSameSpot ? 0.08 : 0.13,
        swingDur: isSameSpot ? 0.16 : Math.min(0.64, Math.max(0.38, dist * 0.72)),
        landDur: 0.16,
        faceDur: 0.12,
        emoteDur: isManual ? 0.08 : 0.22,
        completed: false,
      };
    };

    // Trigger Spider-Man style jump sequence when user selects a plugin
    useEffect(() => {
      if (!launchRequest || launchRequest.nonce === lastNonceRef.current) return;
      lastNonceRef.current = launchRequest.nonce;
      seqRef.current = buildSpiderSequence(
        launchRequest.pluginId,
        launchRequest.targetNormX,
        launchRequest.targetNormY
      );
    }, [launchRequest]);

    const startLoopFnRef = useRef<(() => void) | null>(null);

    useEffect(() => {
      if (active) {
        startLoopFnRef.current?.();
      }
    }, [active]);

    useEffect(() => {
      const container = hostRef.current;
      if (!container) return;

      let renderer: THREE.WebGLRenderer | null = null;
      let rig: TarekAvatarRig | null = null;
      let envCleanup: (() => void) | null = null;
      let rafId = 0;
      let disposed = false;

      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        });
      } catch {
        setContextLost(true);
        return;
      }

      const gl = renderer.getContext();
      const isSoftwareGl = detectSoftwareGl(gl);
      renderer.setPixelRatio(
        isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.75)
      );

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setClearColor(0x000000, 0);

      const canvas = renderer.domElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.pointerEvents = 'none';
      container.appendChild(canvas);

      const scene = new THREE.Scene();
      const env = createEnvironmentKey(renderer);
      scene.environment = env.envMap;
      envCleanup = env.dispose;

      const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.5, 40);
      camera.position.set(0, 1.15, 9.2);
      camera.lookAt(0, 0.9, 0);

      const hemi = new THREE.HemisphereLight(0xdbeafe, 0x3b2314, 0.85);
      scene.add(hemi);

      const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.45);
      keyLight.position.set(3.5, 5.5, 6.2);
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.95);
      rimLight.position.set(-4.5, 3.2, -3.5);
      scene.add(rimLight);

      const warmRim = new THREE.DirectionalLight(0xe08a3c, 0.65);
      warmRim.position.set(4.2, 2.0, -4.0);
      scene.add(warmRim);

      rig = createTarekAvatarRig();
      scene.add(rig.root);

      // Pre-allocated Stylized Spider-Man Web Strand & Anchor Glow Dot
      const webGroup = new THREE.Group();
      webGroup.visible = false;
      const webBeamGeo = new THREE.CylinderGeometry(0.014, 0.008, 1, 6);
      webBeamGeo.translate(0, 0.5, 0); // Base at origin, grows upward along +Y
      const webBeamMat = new THREE.MeshBasicMaterial({
        color: 0xdcf7ff,
        transparent: true,
        opacity: 0.92,
      });
      const webBeam = new THREE.Mesh(webBeamGeo, webBeamMat);
      const webAnchorGeo = new THREE.SphereGeometry(0.048, 8, 8);
      const webAnchorDot = new THREE.Mesh(webAnchorGeo, webBeamMat);
      webGroup.add(webBeam, webAnchorDot);
      scene.add(webGroup);

      let viewHalfW = 4.5;
      let viewHalfH = 2.7;
      let targetBaseScale = 0.4;

      const updateSize = () => {
        if (!container || !renderer) return;
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        const pr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
        renderer.setPixelRatio(pr);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        const dist = camera.position.z;
        const vFovRad = THREE.MathUtils.degToRad(camera.fov);
        viewHalfH = Math.tan(vFovRad / 2) * dist;
        viewHalfW = viewHalfH * camera.aspect;

        // Increased by 30% over prior size (0.30 * 1.30 = 0.39) keeping exact proportions
        const legacyScale = w < 640 ? 0.98 : h < 440 ? 0.95 : 1.06;
        targetBaseScale = legacyScale * 0.39;
        rig?.root.scale.setScalar(targetBaseScale);
      };

      updateSize();
      const ro = new ResizeObserver(updateSize);
      ro.observe(container);

      const onLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const onRestored = () => {
        setContextLost(false);
        updateSize();
      };
      canvas.addEventListener('webglcontextlost', onLost);
      canvas.addEventListener('webglcontextrestored', onRestored);

      // Audio reactivity tracker + Beatbox kick subscription
      const audioTracker = new AvatarAudioReactiveTracker();
      const unsubKick = studioAudio.onKickTrigger((_when, velocity) => {
        if (activeRef.current) {
          audioTracker.notifyEngineKick(velocity);
        }
      });

      // Touch & Pointer Drag + Head-Scratch Raycasting State
      const raycaster = new THREE.Raycaster();
      const pointerNdc = new THREE.Vector2();
      let headScratchRemaining = 0;
      let dropLandRemaining = 0;
      let postManualHoldTimer = 0;
      let grabSession: GrabSession | null = null;
      let suppressClickUntil = 0;
      let dragTiltSmoothed = 0;

      const clientToNorm = (clientX: number, clientY: number) => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return { x: posNormRef.current.x, y: posNormRef.current.y };
        }
        return {
          x: THREE.MathUtils.clamp((clientX - rect.left) / rect.width, 0, 1),
          y: THREE.MathUtils.clamp((clientY - rect.top) / rect.height, 0, 1),
        };
      };

      const onWindowPointerDown = (e: PointerEvent) => {
        if (disposed || !activeRef.current || !rig || !renderer) return;
        if (e.isPrimary === false) return;

        // Keep header navigation/transport controls and inputs strictly protected
        const el = e.target as HTMLElement | null;
        if (el?.closest('header, input, select, textarea')) {
          return;
        }

        const rect = canvas.getBoundingClientRect();
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        ) {
          return;
        }

        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        rig.root.updateMatrixWorld(true);
        raycaster.setFromCamera(pointerNdc, camera);
        const hits = raycaster.intersectObjects([rig.headHitTarget, rig.bodyHitTarget], false);
        if (hits.length === 0) return;

        const ptrNorm = clientToNorm(e.clientX, e.clientY);
        const offsetX = posNormRef.current.x - ptrNorm.x;
        const offsetY = posNormRef.current.y - ptrNorm.y;

        grabSession = {
          pointerId: e.pointerId,
          hitHead: hits[0].object === rig.headHitTarget,
          startClientX: e.clientX,
          startClientY: e.clientY,
          initialAvatarX: posNormRef.current.x,
          initialAvatarY: posNormRef.current.y,
          grabOffsetNormX: offsetX,
          grabOffsetNormY: offsetY,
          targetNormX: THREE.MathUtils.clamp(ptrNorm.x + offsetX, 0.06, 0.94),
          targetNormY: THREE.MathUtils.clamp(ptrNorm.y + offsetY, 0.16, 0.94),
          downAt: performance.now(),
          mode: 'pending',
        };
      };

      const onWindowPointerMove = (e: PointerEvent) => {
        if (!grabSession || e.pointerId !== grabSession.pointerId) return;

        const movedPx = Math.hypot(
          e.clientX - grabSession.startClientX,
          e.clientY - grabSession.startClientY
        );
        if (
          grabSession.mode === 'pending' &&
          (movedPx > 7 || performance.now() - grabSession.downAt > 140)
        ) {
          grabSession.mode = 'dragging';
          // Cancel any in-flight scripted launch if user grabs the avatar
          if (seqRef.current && !seqRef.current.completed) {
            seqRef.current.completed = true;
            seqRef.current = null;
          }
          headScratchRemaining = 0;
          dropLandRemaining = 0;
        }

        const ptrNorm = clientToNorm(e.clientX, e.clientY);
        grabSession.targetNormX = THREE.MathUtils.clamp(
          ptrNorm.x + grabSession.grabOffsetNormX,
          0.06,
          0.94
        );
        grabSession.targetNormY = THREE.MathUtils.clamp(
          ptrNorm.y + grabSession.grabOffsetNormY,
          0.16,
          0.94
        );
      };

      const finishGrab = (e: PointerEvent) => {
        if (!grabSession || e.pointerId !== grabSession.pointerId) return;
        const finished = grabSession;
        grabSession = null;

        if (finished.mode === 'pending') {
          if (finished.hitHead && !(seqRef.current && !seqRef.current.completed)) {
            headScratchRemaining = 1.2;
            suppressClickUntil = performance.now() + 360;
          }
          return;
        }

        // User was actively dragging: strictly prevent accidental plugin card click on release
        suppressClickUntil = performance.now() + 450;

        const dropX = posNormRef.current.x;
        const dropY = posNormRef.current.y;
        const dragTravel = Math.hypot(
          dropX - finished.initialAvatarX,
          dropY - finished.initialAvatarY
        );

        // Manual Spider-Man Mode: if released near another plugin icon after dragging,
        // perform an optional Spider-Man swing & land beside that icon WITHOUT opening it.
        let nearestPerch: AvatarPerchCoord | null = null;
        let nearestDist = Infinity;
        for (const p of perchesRef.current) {
          const d = Math.hypot(p.normX - dropX, p.normY - dropY);
          if (d < nearestDist) {
            nearestDist = d;
            nearestPerch = p;
          }
        }

        if (nearestPerch && dragTravel > 0.08 && nearestDist >= 0.055 && nearestDist <= 0.26) {
          seqRef.current = buildSpiderSequence(null, nearestPerch.normX, nearestPerch.normY);
          postManualHoldTimer = 2.6;
        } else {
          dropLandRemaining = 0.44;
          postManualHoldTimer = 2.4;
        }
      };

      const onWindowTouchMove = (e: TouchEvent) => {
        if (grabSession) {
          e.preventDefault();
        }
      };

      const onWindowClickCapture = (e: MouseEvent) => {
        if (performance.now() < suppressClickUntil) {
          e.preventDefault();
          e.stopPropagation();
        }
      };

      window.addEventListener('pointerdown', onWindowPointerDown, { capture: true, passive: true });
      window.addEventListener('pointermove', onWindowPointerMove, { capture: true, passive: true });
      window.addEventListener('pointerup', finishGrab, { capture: true, passive: true });
      window.addEventListener('pointercancel', finishGrab, { capture: true, passive: true });
      window.addEventListener('touchmove', onWindowTouchMove, { capture: true, passive: false });
      window.addEventListener('click', onWindowClickCapture, { capture: true });

      const pose: AvatarPoseParams = {
        time: 0,
        walkPhase: 0,
        state: 'walking',
        stateProgress: 0,
        moveSpeed: 0,
        moveDirX: -1,
        jumpArcY: 0,
        gazeX: 0,
        gazeY: 0,
        blinkAmount: 0,
        winkLeft: 0,
        kickIntensity: 0,
        snareIntensity: 0,
        snareSign: 1,
        beatIntensity: 0,
        beatOsc: 0,
        jumpVariation: 0,
        swingArmSide: 1,
        dragTiltX: 0,
      };

      let lastTs = performance.now();
      let idleClock = 0;
      let walkPhase = 0;
      let nextBlinkAt = 2.0;
      let blinkTimer = -1;
      let nextGlanceAt = 1.4;
      let glanceGazeX = -0.35;
      let glanceGazeY = 0.05;

      // Home-screen patrol scheduler: slow relaxed right-to-left stroll with thinking & look-around pauses
      let patrolSubState: 'walking' | 'thinking' | 'idle' = 'walking';
      let patrolTimer = 4.5 + Math.random() * 2.5;

      const normToWorldX = (nx: number) => (nx - 0.5) * 2 * viewHalfW;
      const normToWorldY = (ny: number) => (0.5 - ny) * 2 * viewHalfH - 0.065;

      const setPhase = (st: AvatarAnimState) => {
        if (currentPhaseRef.current !== st) {
          currentPhaseRef.current = st;
          onPhaseRef.current?.(st);
        }
      };

      const renderFrame = (now: number) => {
        if (disposed || !renderer || !rig) return;

        if (!activeRef.current || document.visibilityState === 'hidden') {
          rafId = 0;
          audioTracker.reset();
          webGroup.visible = false;
          return;
        }

        const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
        lastTs = now;
        idleClock += dt;

        audioTracker.update(dt, idleClock);

        // Automatic eye blinking
        if (blinkTimer >= 0) {
          blinkTimer += dt;
          if (blinkTimer < 0.08) {
            pose.blinkAmount = blinkTimer / 0.08;
          } else if (blinkTimer < 0.18) {
            pose.blinkAmount = 1 - (blinkTimer - 0.08) / 0.1;
          } else {
            pose.blinkAmount = 0;
            blinkTimer = -1;
          }
        } else if (idleClock >= nextBlinkAt) {
          blinkTimer = 0;
          nextBlinkAt = idleClock + 2.3 + Math.random() * 2.8;
        }

        pose.time = idleClock;
        pose.walkPhase = walkPhase;
        pose.winkLeft = 0;
        pose.kickIntensity = audioTracker.kickPulse;
        pose.snareIntensity = audioTracker.snarePulse;
        pose.snareSign = audioTracker.snareSign;
        pose.beatIntensity = audioTracker.musicEnergy;
        pose.beatOsc = audioTracker.beatOsc;

        let edgeFadeScale = 1;
        let activeWebExtension = 0; // 0 = hidden, 0..1 = stretched toward overhead anchor
        let webSwingArm: -1 | 1 = 1;
        let webAnchorNormX = 0.5;
        let webAnchorNormY = 0.15;

        // Promote long touch hold to active drag cleanly
        if (
          grabSession &&
          grabSession.mode === 'pending' &&
          performance.now() - grabSession.downAt > 140
        ) {
          grabSession.mode = 'dragging';
          if (seqRef.current && !seqRef.current.completed) {
            seqRef.current.completed = true;
            seqRef.current = null;
          }
          headScratchRemaining = 0;
          dropLandRemaining = 0;
        }

        const seq = seqRef.current;

        if (grabSession && grabSession.mode === 'dragging') {
          // 1. FULL TOUCH DRAG CONTROL
          const prevX = posNormRef.current.x;
          const nextX = THREE.MathUtils.damp(prevX, grabSession.targetNormX, 26, dt);
          const nextY = THREE.MathUtils.damp(
            posNormRef.current.y,
            grabSession.targetNormY,
            26,
            dt
          );
          const instVelX = (nextX - prevX) / Math.max(dt, 0.006);
          dragTiltSmoothed = THREE.MathUtils.damp(
            dragTiltSmoothed,
            THREE.MathUtils.clamp(instVelX * 1.15, -1, 1),
            14,
            dt
          );

          posNormRef.current.x = nextX;
          posNormRef.current.y = nextY;

          pose.state = 'grabbed';
          pose.stateProgress = 0;
          pose.moveSpeed = Math.abs(dragTiltSmoothed);
          pose.moveDirX = dragTiltSmoothed >= 0 ? 1 : -1;
          pose.jumpArcY = 0.04;
          pose.dragTiltX = dragTiltSmoothed;
          pose.gazeX = THREE.MathUtils.clamp(dragTiltSmoothed * 0.65, -0.8, 0.8);
          pose.gazeY = -0.1;
          setPhase('grabbed');
        } else if (seq && !seq.completed) {
          // 2. SPIDER-MAN STYLE PLUGIN JUMP & WEB SWING
          headScratchRemaining = 0;
          dropLandRemaining = 0;
          seq.elapsed += dt;

          const tNoticeEnd = seq.noticeDur;
          const tCrouchEnd = tNoticeEnd + seq.crouchDur;
          const tLaunchEnd = tCrouchEnd + seq.launchDur;
          const tSwingEnd = tLaunchEnd + seq.swingDur;
          const tLandEnd = tSwingEnd + seq.landDur;
          const tFaceEnd = tLandEnd + seq.faceDur;
          const tEmoteEnd = tFaceEnd + seq.emoteDur;

          const dirX = seq.endX >= seq.startX ? 1 : -1;
          pose.moveDirX = dirX;
          pose.jumpVariation = seq.variation;
          pose.swingArmSide = seq.swingArmSide;
          pose.dragTiltX = 0;
          webSwingArm = seq.swingArmSide;

          // Anchor positioned smoothly high overhead along travel arc
          const span = Math.hypot(seq.endX - seq.startX, seq.endY - seq.startY);
          webAnchorNormX = THREE.MathUtils.lerp(seq.startX, seq.endX, 0.54);
          webAnchorNormY = Math.min(seq.startY, seq.endY) - 0.34 - Math.min(0.14, span * 0.16);

          if (seq.elapsed < tNoticeEnd) {
            pose.state = 'notice';
            pose.stateProgress = seq.elapsed / seq.noticeDur;
            pose.moveSpeed = 0;
            pose.jumpArcY = 0;
            pose.gazeX = dirX * 0.85;
            pose.gazeY = THREE.MathUtils.clamp((seq.startY - seq.endY) * 1.4, -0.6, 0.6);
            posNormRef.current.x = seq.startX;
            posNormRef.current.y = seq.startY;
          } else if (seq.elapsed < tCrouchEnd) {
            pose.state = 'crouch_prep';
            pose.stateProgress = (seq.elapsed - tNoticeEnd) / seq.crouchDur;
            pose.moveSpeed = 0;
            pose.jumpArcY = 0;
            pose.gazeX = dirX * 0.65;
            pose.gazeY = 0.35;
            posNormRef.current.x = seq.startX;
            posNormRef.current.y = seq.startY;
          } else if (seq.elapsed < tLaunchEnd) {
            const p = THREE.MathUtils.clamp((seq.elapsed - tCrouchEnd) / seq.launchDur, 0, 1);
            const easeOut = 1 - (1 - p) * (1 - p);
            pose.state = 'web_launch';
            pose.stateProgress = p;
            pose.moveSpeed = 0.8;
            posNormRef.current.x = THREE.MathUtils.lerp(seq.startX, seq.endX, easeOut * 0.12);
            posNormRef.current.y = THREE.MathUtils.lerp(seq.startY, seq.endY, easeOut * 0.12);
            pose.jumpArcY = easeOut * (0.28 + span * 0.18);
            pose.gazeX = dirX * 0.55;
            pose.gazeY = 0.28;
            activeWebExtension = easeOut;
          } else if (seq.elapsed < tSwingEnd) {
            const p = THREE.MathUtils.clamp((seq.elapsed - tLaunchEnd) / seq.swingDur, 0, 1);
            pose.state = 'web_swing';
            pose.stateProgress = p;
            pose.moveSpeed = 1;

            // Smooth pendulum horizontal speed: accelerates through middle of swing & coasts cleanly into landing
            const horizEase = 0.12 + 0.88 * (0.5 - 0.5 * Math.cos(p * Math.PI));
            posNormRef.current.x = THREE.MathUtils.lerp(seq.startX, seq.endX, horizEase);
            posNormRef.current.y = THREE.MathUtils.lerp(seq.startY, seq.endY, horizEase);

            // Curved vertical swing path (high launch -> pendulum swoop -> release arc -> gravity drop to 0)
            const releaseAt = 0.78;
            const swingBaseLift = 0.28 + span * 0.18;
            const apexLift = 0.46 + span * 0.48;
            if (p < releaseAt) {
              const sp = p / releaseAt;
              // Pendulum dip below release peak while gaining momentum, then rising cleanly before release
              const swoop = Math.sin(sp * Math.PI);
              const riseToRelease = sp * sp;
              pose.jumpArcY =
                swingBaseLift * (1 - sp) +
                apexLift * (0.35 * swoop + 0.72 * riseToRelease);
              activeWebExtension = 1;
            } else {
              const rp = (p - releaseAt) / (1 - releaseAt);
              const releaseHeight = apexLift * 0.72;
              // Parabolic gravity drop after releasing web
              const arcPeakBoost = seq.variation === 1 ? 0.16 : 0.08;
              pose.jumpArcY =
                releaseHeight * (1 - rp * rp) + Math.sin(rp * Math.PI) * arcPeakBoost;
              activeWebExtension = Math.max(0, 1 - rp * 2.2);
            }

            pose.gazeX = dirX * 0.45;
            pose.gazeY = -0.1;
          } else if (seq.elapsed < tLandEnd) {
            posNormRef.current.x = seq.endX;
            posNormRef.current.y = seq.endY;
            pose.state = 'landing';
            pose.stateProgress = (seq.elapsed - tSwingEnd) / seq.landDur;
            pose.moveSpeed = 0;
            pose.jumpArcY = 0;
            pose.gazeX = dirX * 0.2;
            pose.gazeY = 0;
          } else if (seq.elapsed < tFaceEnd) {
            posNormRef.current.x = seq.endX;
            posNormRef.current.y = seq.endY;
            pose.state = 'facing_user';
            pose.stateProgress = (seq.elapsed - tLandEnd) / seq.faceDur;
            pose.moveSpeed = 0;
            pose.jumpArcY = 0;
            pose.gazeX = 0;
            pose.gazeY = 0;
          } else if (seq.elapsed < tEmoteEnd) {
            posNormRef.current.x = seq.endX;
            posNormRef.current.y = seq.endY;
            pose.state = seq.pluginId === null ? 'facing_user' : 'emote';
            const ep = (seq.elapsed - tFaceEnd) / seq.emoteDur;
            pose.stateProgress = ep;
            pose.moveSpeed = 0;
            pose.jumpArcY = 0;
            pose.gazeX = 0;
            pose.gazeY = 0.05;
            pose.winkLeft = seq.pluginId !== null && ep > 0.25 && ep < 0.72 ? 0.92 : 0;
          } else {
            seq.completed = true;
            posNormRef.current.x = seq.endX;
            posNormRef.current.y = seq.endY;
            pose.state = 'idle';
            pose.jumpArcY = 0;
            setPhase('idle');
            if (seq.pluginId !== null) {
              onCompleteRef.current(seq.pluginId);
            }
          }

          if (!seq.completed) {
            setPhase(pose.state);
          }
        } else if (dropLandRemaining > 0) {
          // 3. POST-DRAG DROP & BALANCING LANDING
          dropLandRemaining = Math.max(0, dropLandRemaining - dt);
          const p = 1 - dropLandRemaining / 0.44;
          pose.state = 'drop_land';
          pose.stateProgress = p;
          pose.moveSpeed = 0;
          pose.jumpArcY = Math.max(0, (1 - p * 2.5) * 0.14);
          pose.dragTiltX = 0;
          pose.gazeX = THREE.MathUtils.lerp(pose.gazeX, 0, 0.18);
          pose.gazeY = THREE.MathUtils.lerp(pose.gazeY, 0, 0.18);
          setPhase('drop_land');
        } else if (headScratchRemaining > 0) {
          // 4. HEAD SCRATCH ON QUICK HEAD TAP
          headScratchRemaining = Math.max(0, headScratchRemaining - dt);
          pose.state = 'head_scratch';
          pose.stateProgress = 1 - headScratchRemaining / 1.2;
          pose.moveSpeed = 0;
          pose.moveDirX = -1;
          pose.jumpArcY = 0;
          pose.gazeX = -0.55;
          pose.gazeY = 0.35;
          setPhase('head_scratch');
        } else if (audioTracker.musicActive) {
          // 5. MUSIC-REACTIVE HEADBANG MODE
          posNormRef.current.y = THREE.MathUtils.lerp(
            posNormRef.current.y,
            CENTER_LANE_Y,
            Math.min(1, dt * 3.5)
          );
          pose.state = 'headbang';
          pose.stateProgress = 0;
          pose.moveSpeed = 0;
          pose.moveDirX = -1;
          pose.jumpArcY = 0;
          pose.gazeX = THREE.MathUtils.lerp(pose.gazeX, 0, 0.12);
          pose.gazeY = THREE.MathUtils.lerp(pose.gazeY, -0.05, 0.12);
          setPhase('headbang');
        } else if (postManualHoldTimer > 0) {
          // Stay momentarily idle where user manually dropped/swung avatar
          postManualHoldTimer = Math.max(0, postManualHoldTimer - dt);
          pose.state = 'idle';
          pose.stateProgress = 0;
          pose.moveSpeed = 0;
          pose.jumpArcY = 0;
          const hov = hoverTargetRef.current;
          if (hov) {
            glanceGazeX = THREE.MathUtils.clamp((hov.normX - posNormRef.current.x) * 2.1, -1, 1);
            glanceGazeY = THREE.MathUtils.clamp((posNormRef.current.y - hov.normY) * 1.8, -0.7, 0.7);
          } else {
            glanceGazeX = 0;
            glanceGazeY = 0;
          }
          pose.gazeX = THREE.MathUtils.lerp(pose.gazeX, glanceGazeX, 0.1);
          pose.gazeY = THREE.MathUtils.lerp(pose.gazeY, glanceGazeY, 0.1);
          setPhase('idle');
        } else {
          // 6. HOME SCREEN SLOW RELAXED RIGHT-TO-LEFT WALKING PATROL
          posNormRef.current.y = THREE.MathUtils.lerp(
            posNormRef.current.y,
            CENTER_LANE_Y,
            Math.min(1, dt * 1.8)
          );

          patrolTimer -= dt;
          if (patrolTimer <= 0) {
            if (patrolSubState === 'walking') {
              patrolSubState = Math.random() < 0.55 ? 'thinking' : 'idle';
              patrolTimer = 1.8 + Math.random() * 1.6;
            } else {
              patrolSubState = 'walking';
              patrolTimer = 4.2 + Math.random() * 2.8;
            }
          }

          pose.state = patrolSubState;
          pose.stateProgress = 0;
          pose.jumpArcY = 0;
          pose.moveDirX = -1;

          if (patrolSubState === 'walking') {
            posNormRef.current.x -= WALK_SPEED_NORM * dt;
            walkPhase += dt * 3.1;
            pose.walkPhase = walkPhase;
            pose.moveSpeed = 0.25;

            if (posNormRef.current.x < PATROL_LEFT_X - 0.08) {
              posNormRef.current.x = PATROL_RIGHT_X + 0.08;
            }

            if (posNormRef.current.x < PATROL_LEFT_X) {
              edgeFadeScale = THREE.MathUtils.clamp(
                (posNormRef.current.x - (PATROL_LEFT_X - 0.08)) / 0.08,
                0.01,
                1
              );
            } else if (posNormRef.current.x > PATROL_RIGHT_X) {
              edgeFadeScale = THREE.MathUtils.clamp(
                (PATROL_RIGHT_X + 0.08 - posNormRef.current.x) / 0.08,
                0.01,
                1
              );
            }
          } else {
            pose.moveSpeed = 0;
          }

          const hov = hoverTargetRef.current;
          if (hov) {
            glanceGazeX = THREE.MathUtils.clamp((hov.normX - posNormRef.current.x) * 2.1, -1, 1);
            glanceGazeY = THREE.MathUtils.clamp((posNormRef.current.y - hov.normY) * 1.8, -0.7, 0.7);
          } else if (idleClock >= nextGlanceAt) {
            nextGlanceAt = idleClock + 1.8 + Math.random() * 2.4;
            const list = perchesRef.current;
            if (list.length > 0 && Math.random() < 0.65) {
              const pick = list[Math.floor(Math.random() * list.length)];
              glanceGazeX = THREE.MathUtils.clamp((pick.normX - posNormRef.current.x) * 1.6, -0.85, 0.85);
              glanceGazeY = THREE.MathUtils.clamp((posNormRef.current.y - pick.normY) * 1.3, -0.5, 0.5);
            } else {
              glanceGazeX = patrolSubState === 'walking' ? -0.22 : (Math.random() - 0.5) * 0.55;
              glanceGazeY = patrolSubState === 'thinking' ? 0.26 : 0.02;
            }
          }

          pose.gazeX = THREE.MathUtils.lerp(pose.gazeX, glanceGazeX, 0.07);
          pose.gazeY = THREE.MathUtils.lerp(pose.gazeY, glanceGazeY, 0.07);
          setPhase(patrolSubState);
        }

        rig.root.scale.setScalar(targetBaseScale * edgeFadeScale);
        rig.root.position.set(
          normToWorldX(posNormRef.current.x),
          normToWorldY(posNormRef.current.y),
          0
        );

        applyAvatarPose(rig, pose);

        // Update Stylized 3D Web Strand from live shooting hand world coords to overhead anchor
        if (activeWebExtension > 0.02) {
          rig.root.updateMatrixWorld(true);
          const handAnchor = webSwingArm > 0 ? rig.leftHandTip : rig.rightHandTip;
          handAnchor.getWorldPosition(_handWorld);
          _anchorWorld.set(
            normToWorldX(webAnchorNormX),
            normToWorldY(webAnchorNormY),
            0.22
          );
          _webDir.subVectors(_anchorWorld, _handWorld);
          const dist = _webDir.length();
          if (dist > 0.02) {
            webGroup.visible = true;
            webBeam.position.copy(_handWorld);
            webBeam.scale.set(1, dist * activeWebExtension, 1);
            webBeam.quaternion.setFromUnitVectors(_upVec, _webDir.normalize());

            // Anchor latch dot sits at the tip of the extending web strand
            webAnchorDot.position.copy(_handWorld).addScaledVector(_webDir, dist * activeWebExtension);
            webAnchorDot.visible = activeWebExtension > 0.88;
            webBeamMat.opacity = Math.min(0.92, activeWebExtension * 1.15);
          } else {
            webGroup.visible = false;
          }
        } else {
          webGroup.visible = false;
        }

        renderer.render(scene, camera);

        if (isSoftwareGl) {
          window.setTimeout(() => {
            if (!disposed && activeRef.current) {
              rafId = requestAnimationFrame(renderFrame);
            }
          }, 16);
        } else {
          rafId = requestAnimationFrame(renderFrame);
        }
      };

      const startLoop = () => {
        if (rafId || disposed || !activeRef.current) return;
        updateSize();
        lastTs = performance.now();
        rafId = requestAnimationFrame(renderFrame);
      };
      startLoopFnRef.current = startLoop;

      const onVisibility = () => {
        if (document.visibilityState === 'visible' && activeRef.current) {
          startLoop();
        } else if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
          audioTracker.reset();
        }
      };

      document.addEventListener('visibilitychange', onVisibility);
      if (activeRef.current) {
        startLoop();
      }

      return () => {
        disposed = true;
        startLoopFnRef.current = null;
        if (rafId) cancelAnimationFrame(rafId);
        unsubKick();
        window.removeEventListener('pointerdown', onWindowPointerDown, { capture: true });
        window.removeEventListener('pointermove', onWindowPointerMove, { capture: true });
        window.removeEventListener('pointerup', finishGrab, { capture: true });
        window.removeEventListener('pointercancel', finishGrab, { capture: true });
        window.removeEventListener('touchmove', onWindowTouchMove, { capture: true });
        window.removeEventListener('click', onWindowClickCapture, { capture: true });
        document.removeEventListener('visibilitychange', onVisibility);
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestored);
        ro.disconnect();
        webBeamGeo.dispose();
        webAnchorGeo.dispose();
        webBeamMat.dispose();
        rig?.dispose();
        envCleanup?.();
        renderer?.dispose();
        if (canvas.parentElement === container) {
          container.removeChild(canvas);
        }
      };
    }, []);

    return (
      <div
        ref={hostRef}
        aria-hidden="true"
        className="absolute inset-0 z-20 pointer-events-none overflow-hidden"
      >
        {contextLost && (
          <div className="absolute bottom-4 right-4 px-2.5 py-1 rounded bg-[#1A1009]/90 border border-[#6B4427] text-[10px] font-display text-[#E08A3C]">
            TAREK Avatar Standby
          </div>
        )}
      </div>
    );
  }
);
