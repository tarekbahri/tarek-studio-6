import * as THREE from 'three';

export type AvatarAnimState =
  | 'idle'
  | 'walking'
  | 'thinking'
  | 'surrender'
  | 'head_scratch'
  | 'headbang'
  | 'grabbed'
  | 'drop_land'
  | 'notice'
  | 'crouch_prep'
  | 'web_launch'
  | 'web_swing'
  | 'angry_far'
  | 'running'
  | 'jumping'
  | 'landing'
  | 'facing_user'
  | 'emote';

export type AvatarMood = 'neutral' | 'curious' | 'angry' | 'happy' | 'surprised' | 'confused';

export interface TarekAvatarRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  headGroup: THREE.Group;
  headHitTarget: THREE.Mesh;
  bodyHitTarget: THREE.Mesh;
  leftHandTip: THREE.Object3D;
  rightHandTip: THREE.Object3D;
  leftBrow: THREE.Mesh;
  rightBrow: THREE.Mesh;
  leftEyelid: THREE.Mesh;
  rightEyelid: THREE.Mesh;
  leftPupil: THREE.Group;
  rightPupil: THREE.Group;
  mouthSmile: THREE.Mesh;
  mouthFrown: THREE.Mesh;
  mouthSurprised: THREE.Mesh;
  mouthConfused: THREE.Mesh;
  earringGroup: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  shadowDisc: THREE.Mesh;
  dispose: () => void;
}

export interface AvatarPoseParams {
  time: number;
  walkPhase: number;
  state: AvatarAnimState;
  stateProgress: number; // 0..1 within current discrete phase
  moveSpeed: number; // horizontal speed / drag velocity magnitude
  moveDirX: number; // -1 left, +1 right
  jumpArcY: number; // vertical arc elevation above floor
  gazeX: number; // -1..1 horizontal look offset
  gazeY: number; // -1..1 vertical look offset
  blinkAmount: number; // 0 open .. 1 closed
  winkLeft: number; // 0 open .. 1 closed
  kickIntensity: number; // 0..1 low-frequency kick transient pulse
  snareIntensity: number; // 0..1 mid/high snare transient pulse
  snareSign: number; // -1 or +1 alternating snare accent direction
  beatIntensity: number; // 0..1 sustained music energy
  beatOsc: number; // -1..1 beat-locked oscillation for headbang
  jumpVariation: number; // 0 | 1 | 2 Spider-Man jump style variation
  swingArmSide: -1 | 1; // -1 right hand shoots web, +1 left hand shoots web
  dragTiltX: number; // -1..1 drag velocity horizontal inertia for tilt
}

function createCanvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  srgb = true
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createFishnetTexture(): THREE.CanvasTexture {
  return createCanvasTexture(512, (ctx, s) => {
    // Warm tan leg skin tone
    ctx.fillStyle = '#efc09a';
    ctx.fillRect(0, 0, s, s);

    // Subtle soft vertical thigh highlight
    const grad = ctx.createLinearGradient(0, 0, s, 0);
    grad.addColorStop(0, 'rgba(180, 115, 78, 0.22)');
    grad.addColorStop(0.5, 'rgba(255, 224, 198, 0.14)');
    grad.addColorStop(1, 'rgba(180, 115, 78, 0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    // Diamond fishnet mesh pattern
    ctx.strokeStyle = '#15151a';
    ctx.lineWidth = 4.2;
    const step = 32;
    ctx.beginPath();
    for (let x = -s; x < s * 2; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x + s, s);
      ctx.moveTo(x + s, 0);
      ctx.lineTo(x, s);
    }
    ctx.stroke();

    // Solid black thigh-high top cuff & subtle ankle trim
    ctx.fillStyle = '#14151a';
    ctx.fillRect(0, 0, s, s * 0.1);
  });
}

function createFaceTexture(): THREE.CanvasTexture {
  return createCanvasTexture(512, (ctx, s) => {
    // Base warm cartoon skin
    ctx.fillStyle = '#f3c7a3';
    ctx.fillRect(0, 0, s, s);

    // Soft cheek peach warmth
    const drawBlush = (cx: number, cy: number) => {
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 46);
      g.addColorStop(0, 'rgba(232, 132, 118, 0.32)');
      g.addColorStop(1, 'rgba(232, 132, 118, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 50, cy - 50, 100, 100);
    };
    drawBlush(s * 0.37, s * 0.56);
    drawBlush(s * 0.63, s * 0.56);

    // Tiny black heart tattoo under her right eye (viewer-left on front UV center=0.5)
    ctx.save();
    ctx.translate(s * 0.415, s * 0.565);
    ctx.scale(0.85, 0.85);
    ctx.fillStyle = '#141318';
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.bezierCurveTo(-11, -3, -12, -13, -5, -13);
    ctx.bezierCurveTo(-1, -13, 0, -9, 0, -7);
    ctx.bezierCurveTo(0, -9, 1, -13, 5, -13);
    ctx.bezierCurveTo(12, -13, 11, -3, 0, 8);
    ctx.fill();
    ctx.restore();
  });
}

function createTorsoTopTexture(): THREE.CanvasTexture {
  return createCanvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#eceef2';
    ctx.fillRect(0, 0, s, s);
    // Bold black horizontal chest stripe
    ctx.fillStyle = '#15161b';
    ctx.fillRect(0, s * 0.42, s, s * 0.24);
  });
}

function createShadowTexture(): THREE.CanvasTexture {
  return createCanvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    g.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

function buildSculptedSkull(
  colorHex: number,
  disposables: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] }
): THREE.Group {
  const g = new THREE.Group();
  const boneMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.48,
    metalness: 0.06,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x161922,
    roughness: 0.7,
    metalness: 0.05,
  });
  disposables.materials.push(boneMat, darkMat);

  const craniumGeo = new THREE.SphereGeometry(0.11, 14, 12);
  const jawGeo = new THREE.BoxGeometry(0.12, 0.075, 0.08);
  const eyeGeo = new THREE.SphereGeometry(0.026, 10, 8);
  const noseGeo = new THREE.ConeGeometry(0.015, 0.026, 6);
  disposables.geometries.push(craniumGeo, jawGeo, eyeGeo, noseGeo);

  const cranium = new THREE.Mesh(craniumGeo, boneMat);
  cranium.scale.set(1.05, 0.98, 0.85);

  const jaw = new THREE.Mesh(jawGeo, boneMat);
  jaw.position.set(0, -0.078, 0.014);

  const leftSocket = new THREE.Mesh(eyeGeo, darkMat);
  leftSocket.position.set(-0.042, 0.005, 0.078);
  leftSocket.scale.set(1, 1.15, 0.5);

  const rightSocket = new THREE.Mesh(eyeGeo, darkMat);
  rightSocket.position.set(0.042, 0.005, 0.078);
  rightSocket.scale.set(1, 1.15, 0.5);

  const nose = new THREE.Mesh(noseGeo, darkMat);
  nose.position.set(0, -0.028, 0.088);
  nose.scale.set(1, 1, 0.5);

  g.add(cranium, jaw, leftSocket, rightSocket, nose);
  return g;
}

export function createTarekAvatarRig(): TarekAvatarRig {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };

  // Textures
  const faceTex = trackTex(createFaceTexture());
  const fishnetTex = trackTex(createFishnetTexture());
  const topTex = trackTex(createTorsoTopTexture());
  const shadowTex = trackTex(createShadowTexture());

  // Materials calibrated for Stylized 3D Cartoon Game Look
  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf3c7a3,
      roughness: 0.62,
      metalness: 0.02,
    })
  );
  const headSkinMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: faceTex,
      roughness: 0.6,
      metalness: 0.02,
    })
  );
  const greenHairMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x6ce01c,
      roughness: 0.36,
      metalness: 0.08,
    })
  );
  const greenHairDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4aa310,
      roughness: 0.48,
      metalness: 0.06,
    })
  );
  const cyanHairMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x42bce8,
      roughness: 0.35,
      metalness: 0.08,
    })
  );
  const navyHairUnderMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1a2639,
      roughness: 0.45,
      metalness: 0.08,
    })
  );
  const blackJacketMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1b1e25,
      roughness: 0.48,
      metalness: 0.14,
    })
  );
  const limeTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x8be224,
      roughness: 0.42,
      metalness: 0.08,
    })
  );
  const mintCuffMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb6e878,
      roughness: 0.5,
      metalness: 0.05,
    })
  );
  const violetSleeveMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4d47ec,
      roughness: 0.48,
      metalness: 0.06,
    })
  );
  const croppedTopMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: topTex,
      roughness: 0.65,
      metalness: 0.02,
    })
  );
  const shortsMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x15171d,
      roughness: 0.62,
      metalness: 0.08,
    })
  );
  const fishnetMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: fishnetTex,
      roughness: 0.58,
      metalness: 0.04,
    })
  );
  const bootMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x141418,
      roughness: 0.42,
      metalness: 0.16,
    })
  );
  const paleBlueMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9bd6da,
      roughness: 0.45,
      metalness: 0.05,
    })
  );
  const metalSilverMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.25,
      metalness: 0.85,
    })
  );
  const scleraMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbf8f3,
      roughness: 0.25,
      metalness: 0.0,
    })
  );
  const irisMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2a160e,
      roughness: 0.18,
      metalness: 0.04,
    })
  );
  const linerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x121116,
      roughness: 0.4,
      metalness: 0.05,
    })
  );
  const catchlightMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
    })
  );
  const lipMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xba6e72,
      roughness: 0.35,
      metalness: 0.04,
    })
  );

  // Root & Pivots
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // Invisible simplified whole-body hit capsule for forgiving Android grab/drag detection
  const bodyHitGeo = trackGeo(new THREE.CapsuleGeometry(0.46, 0.96, 4, 8));
  const bodyHitMat = trackMat(new THREE.MeshBasicMaterial({ visible: false }));
  const bodyHitTarget = new THREE.Mesh(bodyHitGeo, bodyHitMat);
  bodyHitTarget.position.set(0, 0.78, 0.04);
  bodyPivot.add(bodyHitTarget);

  // Ground contact shadow disc (stays on ground plane)
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(1.15, 0.52));
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    })
  );
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.set(0, 0.015, 0);
  root.add(shadowDisc);

  // HIPS & MODERN STREETWEAR CARGO SHORTS (centered at y = 0.88 above boot soles at y = 0)
  const hips = new THREE.Group();
  hips.position.set(0, 0.88, 0);
  bodyPivot.add(hips);

  const pelvisGeo = trackGeo(new THREE.SphereGeometry(0.18, 20, 16));
  const pelvisMesh = new THREE.Mesh(pelvisGeo, shortsMat);
  pelvisMesh.scale.set(1.06, 0.84, 0.84);
  hips.add(pelvisMesh);

  const waistbandGeo = trackGeo(new THREE.CylinderGeometry(0.166, 0.182, 0.085, 20));
  const waistband = new THREE.Mesh(waistbandGeo, shortsMat);
  waistband.position.y = 0.1;
  waistband.scale.set(1.0, 1, 0.79);
  hips.add(waistband);

  // Neon-green technical belt stripe + front silver buckle
  const beltStripeGeo = trackGeo(new THREE.CylinderGeometry(0.171, 0.174, 0.024, 20));
  const beltStripe = new THREE.Mesh(beltStripeGeo, limeTrimMat);
  beltStripe.position.y = 0.105;
  beltStripe.scale.set(1.01, 1, 0.8);
  hips.add(beltStripe);

  const buckleGeo = trackGeo(new THREE.BoxGeometry(0.052, 0.036, 0.022));
  const beltBuckle = new THREE.Mesh(buckleGeo, metalSilverMat);
  beltBuckle.position.set(0, 0.105, 0.145);
  hips.add(beltBuckle);

  // Side cargo streetwear pocket flaps + subtle hip chain loop
  const cargoPocketGeo = trackGeo(new THREE.BoxGeometry(0.036, 0.085, 0.095));
  const leftCargo = new THREE.Mesh(cargoPocketGeo, blackJacketMat);
  leftCargo.position.set(0.182, -0.01, 0);
  leftCargo.rotation.z = 0.1;
  const rightCargo = new THREE.Mesh(cargoPocketGeo, blackJacketMat);
  rightCargo.position.set(-0.182, -0.01, 0);
  rightCargo.rotation.z = -0.1;
  const pocketTrimGeo = trackGeo(new THREE.BoxGeometry(0.04, 0.015, 0.098));
  const leftCargoTrim = new THREE.Mesh(pocketTrimGeo, limeTrimMat);
  leftCargoTrim.position.set(0.184, 0.024, 0);
  leftCargoTrim.rotation.z = 0.1;
  const rightCargoTrim = new THREE.Mesh(pocketTrimGeo, limeTrimMat);
  rightCargoTrim.position.set(-0.184, 0.024, 0);
  rightCargoTrim.rotation.z = -0.1;
  hips.add(leftCargo, rightCargo, leftCargoTrim, rightCargoTrim);

  const chainGeo = trackGeo(new THREE.TorusGeometry(0.085, 0.006, 6, 14, Math.PI * 0.95));
  const hipChain = new THREE.Mesh(chainGeo, metalSilverMat);
  hipChain.position.set(0.125, 0.055, 0.08);
  hipChain.rotation.set(0.2, 0.45, Math.PI * 1.05);
  hips.add(hipChain);

  // Exposed midriff waist
  const midriffGeo = trackGeo(new THREE.CylinderGeometry(0.132, 0.155, 0.14, 18));
  const midriff = new THREE.Mesh(midriffGeo, skinMat);
  midriff.position.y = 0.18;
  midriff.scale.set(1.0, 1, 0.75);
  hips.add(midriff);

  // TORSO (starts just above waist)
  const torso = new THREE.Group();
  torso.position.set(0, 0.24, 0);
  hips.add(torso);

  // Fitted inner cropped street top with black chest band
  const chestTopGeo = trackGeo(new THREE.CylinderGeometry(0.165, 0.135, 0.26, 20));
  const chestTop = new THREE.Mesh(chestTopGeo, croppedTopMat);
  chestTop.position.y = 0.14;
  chestTop.scale.set(1.02, 1, 0.76);
  torso.add(chestTop);

  // Modern Cropped Black Streetwear Hoodie-Bomber + Neon Green Piping & Tech Straps
  const jacketBackGeo = trackGeo(
    new THREE.CylinderGeometry(0.198, 0.185, 0.34, 20, 1, false, Math.PI * 0.45, Math.PI * 1.1)
  );
  const jacketBack = new THREE.Mesh(jacketBackGeo, blackJacketMat);
  jacketBack.position.set(0, 0.18, -0.01);
  jacketBack.rotation.y = Math.PI * 0.5;
  jacketBack.scale.set(1.06, 1, 0.9);
  torso.add(jacketBack);

  const panelGeo = trackGeo(new THREE.BoxGeometry(0.134, 0.32, 0.152));
  const leftJacketPanel = new THREE.Mesh(panelGeo, blackJacketMat);
  leftJacketPanel.position.set(0.115, 0.18, 0.045);
  leftJacketPanel.rotation.y = -0.22;
  const rightJacketPanel = new THREE.Mesh(panelGeo, blackJacketMat);
  rightJacketPanel.position.set(-0.115, 0.18, 0.045);
  rightJacketPanel.rotation.y = 0.22;
  torso.add(leftJacketPanel, rightJacketPanel);

  // Neon-green streetwear hem band & shoulder piping seams
  const hemBandGeo = trackGeo(new THREE.BoxGeometry(0.138, 0.026, 0.156));
  const leftHem = new THREE.Mesh(hemBandGeo, limeTrimMat);
  leftHem.position.set(0.114, 0.025, 0.044);
  leftHem.rotation.y = -0.22;
  const rightHem = new THREE.Mesh(hemBandGeo, limeTrimMat);
  rightHem.position.set(-0.114, 0.025, 0.044);
  rightHem.rotation.y = 0.22;
  torso.add(leftHem, rightHem);

  // Bright Lime Collar & Sleek Streetwear Lapels
  const lapelGeo = trackGeo(new THREE.BoxGeometry(0.048, 0.265, 0.042));
  const leftLapel = new THREE.Mesh(lapelGeo, limeTrimMat);
  leftLapel.position.set(0.068, 0.22, 0.133);
  leftLapel.rotation.set(-0.15, 0.2, -0.18);
  const rightLapel = new THREE.Mesh(lapelGeo, limeTrimMat);
  rightLapel.position.set(-0.068, 0.22, 0.133);
  rightLapel.rotation.set(-0.15, -0.2, 0.18);
  torso.add(leftLapel, rightLapel);

  // Symmetrical green utility chest/pocket trims + silver buckle clasp
  const pocketStripGeo = trackGeo(new THREE.BoxGeometry(0.022, 0.125, 0.022));
  const leftPocketStrip = new THREE.Mesh(pocketStripGeo, limeTrimMat);
  leftPocketStrip.position.set(0.136, 0.11, 0.126);
  leftPocketStrip.rotation.z = -0.12;
  const rightPocketStrip = new THREE.Mesh(pocketStripGeo, limeTrimMat);
  rightPocketStrip.position.set(-0.136, 0.11, 0.126);
  rightPocketStrip.rotation.z = 0.12;
  torso.add(leftPocketStrip, rightPocketStrip);

  const chestStrapGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.024, 0.024));
  const chestStrap = new THREE.Mesh(chestStrapGeo, limeTrimMat);
  chestStrap.position.set(0.125, 0.23, 0.124);
  const chestSnap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.024, 0.028, 0.028)), metalSilverMat);
  chestSnap.position.set(0.125, 0.23, 0.13);
  torso.add(chestStrap, chestSnap);

  // Draped streetwear hood collar behind shoulders
  const collarGeo = trackGeo(new THREE.TorusGeometry(0.138, 0.04, 10, 20, Math.PI * 1.48));
  const jacketCollar = new THREE.Mesh(collarGeo, limeTrimMat);
  jacketCollar.position.set(0, 0.34, -0.015);
  jacketCollar.rotation.x = Math.PI * 0.5;
  jacketCollar.rotation.z = Math.PI * 0.78;
  torso.add(jacketCollar);

  const hoodFoldGeo = trackGeo(new THREE.TorusGeometry(0.155, 0.055, 10, 18, Math.PI * 1.1));
  const hoodFold = new THREE.Mesh(hoodFoldGeo, blackJacketMat);
  hoodFold.position.set(0, 0.33, -0.045);
  hoodFold.rotation.x = Math.PI * 0.58;
  hoodFold.rotation.z = Math.PI * 0.95;
  torso.add(hoodFold);

  // Neck + Spiked Choker
  const neckGeo = trackGeo(new THREE.CylinderGeometry(0.062, 0.072, 0.12, 14));
  const neck = new THREE.Mesh(neckGeo, skinMat);
  neck.position.set(0, 0.38, 0);
  torso.add(neck);

  const chokerGeo = trackGeo(new THREE.CylinderGeometry(0.073, 0.075, 0.042, 18));
  const choker = new THREE.Mesh(chokerGeo, bootMat);
  choker.position.set(0, 0.385, 0);
  torso.add(choker);

  const spikeGeo = trackGeo(new THREE.ConeGeometry(0.012, 0.032, 6));
  for (let i = 0; i < 6; i++) {
    const angle = -0.95 + (i / 5) * 1.9;
    const spike = new THREE.Mesh(spikeGeo, metalSilverMat);
    spike.position.set(Math.sin(angle) * 0.08, 0.385, Math.cos(angle) * 0.08);
    spike.rotation.x = Math.PI * 0.5;
    spike.rotation.z = -angle;
    torso.add(spike);
  }

  // HEAD GROUP
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.44, 0.01);
  torso.add(headGroup);

  // Head Sphere (sculpted cartoon proportions, aligned so face center is at +Z UV center)
  const headGeo = trackGeo(new THREE.SphereGeometry(0.28, 28, 24));
  const headMesh = new THREE.Mesh(headGeo, headSkinMat);
  // SphereGeometry default front (+Z) sits at u=0.25 or u=0.5? Rotate Y by -PI/2 so UV u=0.5 faces +Z!
  headMesh.rotation.y = -Math.PI / 2;
  headMesh.position.y = 0.25;
  headMesh.scale.set(0.95, 1.02, 0.94);
  headGroup.add(headMesh);

  // Invisible oversized raycast sphere for ergonomic Android touch detection on head
  const headHitGeo = trackGeo(new THREE.SphereGeometry(0.62, 10, 8));
  const headHitMat = trackMat(new THREE.MeshBasicMaterial({ visible: false }));
  const headHitTarget = new THREE.Mesh(headHitGeo, headHitMat);
  headHitTarget.position.set(0, 0.27, 0.04);
  headGroup.add(headHitTarget);

  // Cute tapered nose bridge
  const noseGeo = trackGeo(new THREE.SphereGeometry(0.034, 12, 10));
  const nose = new THREE.Mesh(noseGeo, skinMat);
  nose.position.set(0, 0.225, 0.268);
  nose.scale.set(0.95, 0.85, 1.05);
  headGroup.add(nose);

  // Pale-blue diagonal cheek bandage under her right eye (viewer-left, x < 0)
  const bandageGroup = new THREE.Group();
  bandageGroup.position.set(-0.125, 0.16, 0.238);
  bandageGroup.rotation.set(0.18, -0.45, 0.24);
  const bandageBaseGeo = trackGeo(new THREE.BoxGeometry(0.095, 0.036, 0.014));
  const bandageMesh = new THREE.Mesh(bandageBaseGeo, paleBlueMat);
  bandageGroup.add(bandageMesh);
  headGroup.add(bandageGroup);

  // Ears + Skull Earring on her right ear (viewer-left x = -0.265)
  const earGeo = trackGeo(new THREE.SphereGeometry(0.062, 14, 12));
  const leftEar = new THREE.Mesh(earGeo, skinMat);
  leftEar.position.set(0.265, 0.22, -0.02);
  leftEar.scale.set(0.55, 1.0, 0.72);
  const rightEar = new THREE.Mesh(earGeo, skinMat);
  rightEar.position.set(-0.265, 0.22, -0.02);
  rightEar.scale.set(0.55, 1.0, 0.72);
  headGroup.add(leftEar, rightEar);

  const earringGroup = new THREE.Group();
  earringGroup.position.set(-0.275, 0.145, 0.0);
  const ringGeo = trackGeo(new THREE.TorusGeometry(0.018, 0.004, 8, 14));
  const ring = new THREE.Mesh(ringGeo, metalSilverMat);
  earringGroup.add(ring);
  const earringSkull = buildSculptedSkull(0xa4d7dc, { geometries, materials });
  earringSkull.scale.setScalar(0.36);
  earringSkull.position.set(0, -0.048, 0.008);
  earringGroup.add(earringSkull);
  headGroup.add(earringGroup);

  // EYES (Expressive oversized game eyes with winged lashes + reactive pupils + eyelids)
  const buildEye = (side: -1 | 1) => {
    const eyeRoot = new THREE.Group();
    eyeRoot.position.set(side * 0.102, 0.27, 0.225);
    eyeRoot.rotation.y = side * 0.24;

    const scleraGeo = trackGeo(new THREE.SphereGeometry(0.058, 18, 14));
    const sclera = new THREE.Mesh(scleraGeo, scleraMat);
    sclera.scale.set(1.06, 0.92, 0.55);
    eyeRoot.add(sclera);

    const pupilGroup = new THREE.Group();
    pupilGroup.position.set(0, 0, 0.028);
    const irisGeo = trackGeo(new THREE.SphereGeometry(0.038, 16, 12));
    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.scale.set(1, 1.04, 0.35);
    pupilGroup.add(iris);

    const glintGeo = trackGeo(new THREE.SphereGeometry(0.011, 8, 8));
    const glint1 = new THREE.Mesh(glintGeo, catchlightMat);
    glint1.position.set(0.013, 0.013, 0.012);
    const glint2 = new THREE.Mesh(glintGeo, catchlightMat);
    glint2.scale.setScalar(0.55);
    glint2.position.set(-0.01, -0.01, 0.012);
    pupilGroup.add(glint1, glint2);
    eyeRoot.add(pupilGroup);

    // Winged upper eyeliner
    const lashGeo = trackGeo(new THREE.BoxGeometry(0.115, 0.018, 0.025));
    const lash = new THREE.Mesh(lashGeo, linerMat);
    lash.position.set(side * 0.012, 0.042, 0.018);
    lash.rotation.z = side * 0.14;
    eyeRoot.add(lash);

    // Animated Eyelid Cap (rotates down over front of eye)
    const lidGeo = trackGeo(
      new THREE.SphereGeometry(0.063, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)
    );
    const eyelid = new THREE.Mesh(lidGeo, skinMat);
    eyelid.scale.set(1.08, 0.96, 0.62);
    eyelid.rotation.x = -0.82; // Open by default
    eyeRoot.add(eyelid);

    headGroup.add(eyeRoot);
    return { pupilGroup, eyelid };
  };

  // Viewer-left eye (her right) is side = -1; Viewer-right (her left) is side = 1
  const rightEye = buildEye(-1);
  const leftEye = buildEye(1);

  // Expressive Eyebrows
  const browGeo = trackGeo(new THREE.BoxGeometry(0.105, 0.022, 0.025));
  const rightBrow = new THREE.Mesh(browGeo, linerMat);
  rightBrow.position.set(-0.108, 0.358, 0.242);
  rightBrow.rotation.set(0, -0.22, -0.14);

  const leftBrow = new THREE.Mesh(browGeo, linerMat);
  leftBrow.position.set(0.108, 0.358, 0.242);
  leftBrow.rotation.set(0, 0.22, 0.14);
  headGroup.add(rightBrow, leftBrow);

  // Mouth (Confident smile, Angry frown, Surprised 'O', Confused crooked mouth)
  const smileGeo = trackGeo(new THREE.TorusGeometry(0.048, 0.012, 8, 16, Math.PI * 0.8));
  const mouthSmile = new THREE.Mesh(smileGeo, lipMat);
  mouthSmile.position.set(0, 0.138, 0.252);
  mouthSmile.rotation.z = Math.PI * 1.1;
  headGroup.add(mouthSmile);

  const frownGeo = trackGeo(new THREE.TorusGeometry(0.042, 0.012, 8, 14, Math.PI * 0.78));
  const mouthFrown = new THREE.Mesh(frownGeo, lipMat);
  mouthFrown.position.set(0, 0.122, 0.252);
  mouthFrown.rotation.z = Math.PI * 0.11;
  mouthFrown.visible = false;
  headGroup.add(mouthFrown);

  const surprisedGeo = trackGeo(new THREE.TorusGeometry(0.025, 0.011, 8, 16));
  const mouthSurprised = new THREE.Mesh(surprisedGeo, lipMat);
  mouthSurprised.position.set(0, 0.128, 0.258);
  mouthSurprised.scale.set(0.9, 1.25, 1);
  mouthSurprised.visible = false;
  headGroup.add(mouthSurprised);

  const confusedGeo = trackGeo(new THREE.BoxGeometry(0.068, 0.014, 0.015));
  const mouthConfused = new THREE.Mesh(confusedGeo, lipMat);
  mouthConfused.position.set(0.008, 0.128, 0.258);
  mouthConfused.rotation.z = 0.26;
  mouthConfused.visible = false;
  headGroup.add(mouthConfused);

  // SPLIT TWO-TONE STYLIZED HAIR (Neon Lime Left / Sky Cyan + Dark Navy Curled Right)
  const hairGroup = new THREE.Group();
  headGroup.add(hairGroup);

  // Green Left Sweep (her right side: negative X)
  const greenCurveOuter = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.01, 0.51, 0.09),
    new THREE.Vector3(-0.22, 0.5, 0.08),
    new THREE.Vector3(-0.36, 0.31, 0.02),
    new THREE.Vector3(-0.35, 0.06, 0.04),
    new THREE.Vector3(-0.24, -0.04, 0.09),
  ]);
  const greenTubeOuter = trackGeo(new THREE.TubeGeometry(greenCurveOuter, 20, 0.115, 12, false));
  const greenSweepOuter = new THREE.Mesh(greenTubeOuter, greenHairMat);
  hairGroup.add(greenSweepOuter);

  const greenCurveBack = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.02, 0.49, -0.05),
    new THREE.Vector3(-0.24, 0.43, -0.14),
    new THREE.Vector3(-0.32, 0.18, -0.14),
    new THREE.Vector3(-0.22, -0.03, -0.06),
  ]);
  const greenTubeBack = trackGeo(new THREE.TubeGeometry(greenCurveBack, 16, 0.125, 10, false));
  const greenSweepBack = new THREE.Mesh(greenTubeBack, greenHairDarkMat);
  hairGroup.add(greenSweepBack);

  // Green sharp downward tip accent
  const greenTipGeo = trackGeo(new THREE.ConeGeometry(0.095, 0.22, 10));
  const greenTip = new THREE.Mesh(greenTipGeo, greenHairMat);
  greenTip.position.set(-0.23, -0.05, 0.07);
  greenTip.rotation.set(0.25, 0, -2.55);
  hairGroup.add(greenTip);

  // Cyan Right Sweep with Iconic Upward Curl + Dark Navy Underside (positive X)
  const cyanCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.01, 0.51, 0.09),
    new THREE.Vector3(0.23, 0.51, 0.05),
    new THREE.Vector3(0.35, 0.3, -0.02),
    new THREE.Vector3(0.36, 0.04, -0.02),
    new THREE.Vector3(0.24, -0.05, 0.03),
    new THREE.Vector3(0.41, -0.01, 0.06),
  ]);
  const cyanTube = trackGeo(new THREE.TubeGeometry(cyanCurve, 22, 0.105, 12, false));
  const cyanSweep = new THREE.Mesh(cyanTube, cyanHairMat);
  hairGroup.add(cyanSweep);

  const navyCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.04, 0.47, 0.12),
    new THREE.Vector3(0.24, 0.41, 0.07),
    new THREE.Vector3(0.3, 0.19, 0.02),
    new THREE.Vector3(0.28, 0.0, 0.04),
    new THREE.Vector3(0.37, -0.02, 0.08),
  ]);
  const navyTube = trackGeo(new THREE.TubeGeometry(navyCurve, 20, 0.092, 10, false));
  const navyUnder = new THREE.Mesh(navyTube, navyHairUnderMat);
  hairGroup.add(navyUnder);

  // Cyan upward-curled hook tip
  const cyanTipGeo = trackGeo(new THREE.ConeGeometry(0.078, 0.19, 10));
  const cyanTip = new THREE.Mesh(cyanTipGeo, cyanHairMat);
  cyanTip.position.set(0.44, 0.03, 0.06);
  cyanTip.rotation.set(0, 0, -0.65);
  hairGroup.add(cyanTip);

  // Back crown cap so head has no bald spot when turning
  const backCrownGeo = trackGeo(new THREE.SphereGeometry(0.275, 18, 14, 0, Math.PI, 0, Math.PI * 0.72));
  const backCrownLeft = new THREE.Mesh(backCrownGeo, greenHairDarkMat);
  backCrownLeft.position.set(-0.04, 0.27, -0.05);
  backCrownLeft.rotation.y = Math.PI;
  const backCrownRight = new THREE.Mesh(backCrownGeo, navyHairUnderMat);
  backCrownRight.position.set(0.04, 0.27, -0.05);
  backCrownRight.rotation.y = Math.PI;
  hairGroup.add(backCrownLeft, backCrownRight);

  // ARMS (Articulated Left Arm with Signature Purple-Blue Forearm Sleeve, Right Arm balanced)
  const buildArm = (side: -1 | 1, usePurpleSleeve: boolean) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.24, 0.28, 0);
    torso.add(shoulder);

    // Puffed Black Jacket Sleeve
    const upperArmGeo = trackGeo(new THREE.CapsuleGeometry(0.068, 0.14, 8, 12));
    const upperArm = new THREE.Mesh(upperArmGeo, blackJacketMat);
    upperArm.position.y = -0.1;
    shoulder.add(upperArm);

    // Mint-Lime Jacket Cuff
    const cuffGeo = trackGeo(new THREE.CylinderGeometry(0.064, 0.056, 0.048, 14));
    const cuff = new THREE.Mesh(cuffGeo, mintCuffMat);
    cuff.position.y = -0.21;
    shoulder.add(cuff);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.23, 0);
    shoulder.add(elbow);

    // Forearm (signature vibrant purple-blue sleeve on her left arm, sleek dark/skin on right)
    const forearmGeo = trackGeo(new THREE.CapsuleGeometry(0.045, 0.16, 8, 12));
    const forearm = new THREE.Mesh(
      forearmGeo,
      usePurpleSleeve ? violetSleeveMat : skinMat
    );
    forearm.position.y = -0.1;
    elbow.add(forearm);

    // Articulated Stylized Hand (Palm + Thumb + Fingers)
    const handGroup = new THREE.Group();
    handGroup.position.set(0, -0.23, 0);
    const palmGeo = trackGeo(new THREE.BoxGeometry(0.068, 0.082, 0.042));
    const palm = new THREE.Mesh(palmGeo, skinMat);
    handGroup.add(palm);

    const thumbGeo = trackGeo(new THREE.CapsuleGeometry(0.015, 0.036, 4, 8));
    const thumb = new THREE.Mesh(thumbGeo, skinMat);
    thumb.position.set(-side * 0.04, -0.015, 0.018);
    thumb.rotation.z = side * 0.55;
    handGroup.add(thumb);

    const fingerGeo = trackGeo(new THREE.CapsuleGeometry(0.012, 0.048, 4, 8));
    for (let f = 0; f < 3; f++) {
      const finger = new THREE.Mesh(fingerGeo, skinMat);
      finger.position.set((f - 1) * 0.02, -0.062, 0.005);
      finger.rotation.x = 0.22;
      handGroup.add(finger);
    }

    const handTip = new THREE.Object3D();
    handTip.position.set(0, -0.04, 0.025);
    handGroup.add(handTip);

    elbow.add(handGroup);
    return { shoulder, elbow, handTip };
  };

  // Viewer-right (+X) is her left arm (purple-blue sleeve)
  const leftArm = buildArm(1, true);
  const rightArm = buildArm(-1, false);

  // LEGS (Fishnet thighs/shins + Pale-Blue Skull Knee Pad on her left knee + Chunky Combat Boots)
  const buildLeg = (side: -1 | 1, hasSkullKneePad: boolean) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.115, -0.04, 0);
    hips.add(hip);

    const thighGeo = trackGeo(new THREE.CylinderGeometry(0.086, 0.062, 0.36, 16));
    const thigh = new THREE.Mesh(thighGeo, fishnetMat);
    thigh.position.y = -0.18;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.36, 0);
    hip.add(knee);

    // Optional Pale-Blue Skull Knee Pad (on her left knee = side +1)
    if (hasSkullKneePad) {
      const strapGeo = trackGeo(new THREE.CylinderGeometry(0.066, 0.066, 0.048, 14));
      const strap = new THREE.Mesh(strapGeo, bootMat);
      knee.add(strap);

      const kneeSkull = buildSculptedSkull(0x9bd6da, { geometries, materials });
      kneeSkull.scale.setScalar(0.68);
      kneeSkull.position.set(0, 0.005, 0.058);
      knee.add(kneeSkull);
    }

    const shinGeo = trackGeo(new THREE.CylinderGeometry(0.058, 0.045, 0.32, 16));
    const shin = new THREE.Mesh(shinGeo, fishnetMat);
    shin.position.y = -0.16;
    knee.add(shin);

    // Sock cuff band
    const sockGeo = trackGeo(new THREE.CylinderGeometry(0.052, 0.05, 0.065, 14));
    const sock = new THREE.Mesh(sockGeo, mintCuffMat);
    sock.position.y = -0.31;
    knee.add(sock);

    // Chunky Combat Boot
    const bootGroup = new THREE.Group();
    bootGroup.position.set(0, -0.36, 0.02);

    const shaftGeo = trackGeo(new THREE.CylinderGeometry(0.068, 0.072, 0.16, 14));
    const shaft = new THREE.Mesh(shaftGeo, bootMat);
    shaft.position.set(0, -0.01, -0.01);
    bootGroup.add(shaft);

    const soleGeo = trackGeo(new THREE.BoxGeometry(0.135, 0.065, 0.24));
    const sole = new THREE.Mesh(soleGeo, bootMat);
    sole.position.set(0, -0.09, 0.035);
    bootGroup.add(sole);

    const toeGeo = trackGeo(new THREE.SphereGeometry(0.072, 14, 12));
    const toe = new THREE.Mesh(toeGeo, bootMat);
    toe.position.set(0, -0.058, 0.11);
    toe.scale.set(0.95, 0.72, 1.15);
    bootGroup.add(toe);

    // Pale-blue boot lace bone/skull charms
    const charmGeo = trackGeo(new THREE.BoxGeometry(0.062, 0.018, 0.02));
    const charm1 = new THREE.Mesh(charmGeo, paleBlueMat);
    charm1.position.set(0, 0.025, 0.058);
    const charm2 = new THREE.Mesh(charmGeo, paleBlueMat);
    charm2.position.set(0, -0.012, 0.068);
    bootGroup.add(charm1, charm2);

    knee.add(bootGroup);
    return { hip, knee };
  };

  // Viewer-right (her left) leg has the skull knee pad
  const leftLeg = buildLeg(1, true);
  const rightLeg = buildLeg(-1, false);

  return {
    root,
    bodyPivot,
    hips,
    torso,
    headGroup,
    headHitTarget,
    bodyHitTarget,
    leftHandTip: leftArm.handTip,
    rightHandTip: rightArm.handTip,
    leftBrow,
    rightBrow,
    leftEyelid: leftEye.eyelid,
    rightEyelid: rightEye.eyelid,
    leftPupil: leftEye.pupilGroup,
    rightPupil: rightEye.pupilGroup,
    mouthSmile,
    mouthFrown,
    mouthSurprised,
    mouthConfused,
    earringGroup,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
    shadowDisc,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}

export function applyAvatarPose(rig: TarekAvatarRig, p: AvatarPoseParams): void {
  const {
    time,
    walkPhase,
    state,
    stateProgress,
    moveSpeed,
    moveDirX,
    jumpArcY,
    gazeX,
    gazeY,
    blinkAmount,
    winkLeft,
    kickIntensity,
    snareIntensity,
    snareSign,
    beatIntensity,
    beatOsc,
    jumpVariation,
    swingArmSide,
    dragTiltX,
  } = p;

  // Base breathing & shadow scaling
  const breath = Math.sin(time * 2.4);
  const shadowScale = Math.max(0.32, 1 - jumpArcY * 0.35);
  rig.shadowDisc.scale.set(shadowScale, shadowScale, 1);
  (rig.shadowDisc.material as THREE.MeshBasicMaterial).opacity =
    state === 'grabbed' ? 0.32 : 0.72 * shadowScale;

  // Reset secondary joint axes so no pose or flip rotation leaks into another state
  rig.bodyPivot.position.set(0, jumpArcY, 0);
  rig.bodyPivot.rotation.x = 0;
  rig.bodyPivot.scale.set(1, 1, 1);
  rig.hips.rotation.set(0, 0, 0);
  rig.torso.rotation.set(0, 0, 0);
  rig.leftHip.rotation.set(0, 0, 0);
  rig.rightHip.rotation.set(0, 0, 0);
  rig.leftKnee.rotation.set(0, 0, 0);
  rig.rightKnee.rotation.set(0, 0, 0);
  rig.leftElbow.rotation.set(0, 0, 0);
  rig.rightElbow.rotation.set(0, 0, 0);

  // Facial expressions
  const isAngry = state === 'angry_far';
  const isSurprised = state === 'surrender' || state === 'grabbed';
  const isConfused = state === 'head_scratch';
  const isThinking = state === 'thinking';

  rig.mouthSmile.visible = !isAngry && !isSurprised && !isConfused && !isThinking;
  rig.mouthFrown.visible = isAngry;
  rig.mouthSurprised.visible = isSurprised;
  rig.mouthConfused.visible = isConfused || isThinking;
  rig.mouthConfused.rotation.z = isConfused ? 0.26 : 0.1;

  // Eyebrows: arched confident default, V-scowl angry, high arched surprised/grabbed, asymmetrical confused
  if (isSurprised) {
    rig.rightBrow.rotation.z = -0.22;
    rig.leftBrow.rotation.z = 0.22;
    rig.rightBrow.position.y = 0.388;
    rig.leftBrow.position.y = 0.388;
  } else if (isConfused) {
    rig.rightBrow.rotation.z = -0.32;
    rig.leftBrow.rotation.z = -0.05;
    rig.rightBrow.position.y = 0.344;
    rig.leftBrow.position.y = 0.382;
  } else if (isThinking) {
    rig.rightBrow.rotation.z = -0.22;
    rig.leftBrow.rotation.z = 0.24;
    rig.rightBrow.position.y = 0.352;
    rig.leftBrow.position.y = 0.372;
  } else {
    const browTilt = isAngry
      ? 0.36
      : state === 'emote' || state === 'notice' || state === 'web_launch' || state === 'web_swing'
      ? -0.14
      : state === 'headbang'
      ? 0.12 * beatIntensity
      : state === 'crouch_prep'
      ? 0.22
      : -0.05;
    const browDrop = isAngry ? -0.022 : state === 'notice' ? 0.015 : 0;
    rig.rightBrow.rotation.z = -0.14 - browTilt;
    rig.leftBrow.rotation.z = 0.14 + browTilt;
    rig.rightBrow.position.y = 0.358 + browDrop;
    rig.leftBrow.position.y = 0.358 + browDrop;
  }

  // Eyelid blinking + expression squint + wide surprise eyes + playful wink
  const baseSquint =
    isAngry
      ? 0.32
      : isConfused
      ? 0.26
      : state === 'crouch_prep'
      ? 0.16
      : state === 'headbang'
      ? 0.14 * beatIntensity
      : 0;
  const openExtra = isSurprised ? -1.02 : -0.82;
  const rightLidClosed = isSurprised ? 0 : Math.max(baseSquint, blinkAmount);
  const leftLidClosed = isSurprised ? 0 : Math.max(isAngry ? 0.32 : 0, blinkAmount, winkLeft);
  rig.rightEyelid.rotation.x = THREE.MathUtils.lerp(openExtra, 0.24, rightLidClosed);
  rig.leftEyelid.rotation.x = THREE.MathUtils.lerp(openExtra, 0.24, leftLidClosed);

  // Pupil tracking inside eye sockets
  const px = THREE.MathUtils.clamp(gazeX, -1, 1) * 0.018;
  const py = THREE.MathUtils.clamp(gazeY, -1, 1) * 0.012;
  rig.leftPupil.position.set(px, py, 0.028);
  rig.rightPupil.position.set(px, py, 0.028);

  // Earring secondary bounce (amplified cleanly on kicks/headbangs/swings)
  rig.earringGroup.rotation.z =
    Math.sin(time * 3.1) * 0.06 -
    moveDirX * moveSpeed * 0.18 +
    kickIntensity * 0.28 +
    snareSign * snareIntensity * 0.22;

  if (state === 'walking') {
    // Slower, relaxed, natural unhurried stroll
    const stride = walkPhase;
    const swing = Math.sin(stride) * 0.34;
    const stepLift = Math.abs(Math.sin(stride)) * 0.024;
    const hipSway = Math.cos(stride) * 0.032;
    rig.hips.position.y = 0.88 + stepLift;
    rig.hips.rotation.y = Math.sin(stride) * 0.075;
    rig.bodyPivot.rotation.z = hipSway * 0.38 - moveDirX * 0.015;
    const targetYaw = moveDirX * 0.52;
    rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(rig.bodyPivot.rotation.y, targetYaw, 0.12);
    rig.torso.rotation.x = 0.035 + Math.abs(Math.sin(stride)) * 0.018;
    rig.torso.rotation.y = -Math.sin(stride) * 0.065;

    // Smooth heel-toe leg stride
    rig.leftHip.rotation.x = swing;
    rig.rightHip.rotation.x = -swing;
    rig.leftKnee.rotation.x = 0.06 + Math.max(0, -Math.cos(stride) * 0.42);
    rig.rightKnee.rotation.x = 0.06 + Math.max(0, Math.cos(stride) * 0.42);

    // Relaxed natural arm swing
    rig.leftShoulder.rotation.set(-swing * 0.48, 0, 0.17);
    rig.rightShoulder.rotation.set(swing * 0.48, 0, -0.17);
    rig.leftElbow.rotation.x = -0.26 - Math.max(0, swing) * 0.16;
    rig.rightElbow.rotation.x = -0.26 - Math.max(0, -swing) * 0.16;

    rig.headGroup.rotation.set(
      gazeY * 0.15 - 0.015,
      -moveDirX * 0.16 + gazeX * 0.32,
      -hipSway * 0.45 + gazeX * -0.04
    );
  } else if (state === 'grabbed') {
    // User is touching/dragging avatar freely across the screen
    const kick = Math.sin(time * 9.5);
    const flail = Math.sin(time * 7.2);
    const tilt = THREE.MathUtils.clamp(-dragTiltX * 0.46, -0.48, 0.48);

    rig.hips.position.y = 0.88 + Math.sin(time * 5.0) * 0.025;
    rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(rig.bodyPivot.rotation.y, dragTiltX * 0.25, 0.2);
    rig.bodyPivot.rotation.z = THREE.MathUtils.lerp(rig.bodyPivot.rotation.z, tilt, 0.25);
    rig.torso.rotation.x = 0.08 + Math.abs(dragTiltX) * 0.15;

    // Legs dangle and bicycle softly mid-air
    rig.leftHip.rotation.set(-0.2 + kick * 0.34, 0, 0.16);
    rig.rightHip.rotation.set(-0.2 - kick * 0.34, 0, -0.16);
    rig.leftKnee.rotation.x = 0.55 + Math.max(0, -kick) * 0.45;
    rig.rightKnee.rotation.x = 0.55 + Math.max(0, kick) * 0.45;

    // Balanced arms lifted playfully out
    rig.leftShoulder.rotation.set(-0.32 + flail * 0.18, 0, 1.38 + flail * 0.22);
    rig.rightShoulder.rotation.set(-0.32 - flail * 0.18, 0, -1.38 + flail * 0.22);
    rig.leftElbow.rotation.x = -0.52;
    rig.rightElbow.rotation.x = -0.52;

    rig.headGroup.rotation.set(-0.08, gazeX * 0.35, -tilt * 0.45);
  } else if (state === 'drop_land') {
    // Natural landing + quick arm-balancing recovery after finger release
    const squash = Math.sin(Math.min(1, stateProgress * 1.8) * Math.PI);
    const wobble = Math.sin(stateProgress * Math.PI * 3.0) * (1 - stateProgress);
    rig.bodyPivot.scale.set(1 + squash * 0.1, 1 - squash * 0.13, 1 + squash * 0.1);
    rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(rig.bodyPivot.rotation.y, 0.05, 0.22);
    rig.bodyPivot.rotation.z = wobble * 0.12;
    rig.hips.position.y = 0.88 - squash * 0.16;
    rig.torso.rotation.x = squash * 0.18;

    rig.leftHip.rotation.set(-squash * 0.42, 0, 0.18);
    rig.rightHip.rotation.set(-squash * 0.42, 0, -0.18);
    rig.leftKnee.rotation.x = squash * 0.78 + 0.1;
    rig.rightKnee.rotation.x = squash * 0.78 + 0.1;

    // Outstretched arms windmill slightly for balance then relax
    rig.leftShoulder.rotation.set(0.05, 0, 0.72 * (1 - stateProgress) + wobble * 0.4 + 0.22);
    rig.rightShoulder.rotation.set(0.05, 0, -0.72 * (1 - stateProgress) + wobble * 0.4 - 0.22);
    rig.leftElbow.rotation.x = -0.32;
    rig.rightElbow.rotation.x = -0.32;

    rig.headGroup.rotation.set(squash * 0.08, gazeX * 0.25, -wobble * 0.18);
  } else if (state === 'crouch_prep') {
    // Deep Spider-Man athletic crouch before spring launch
    const coil = THREE.MathUtils.clamp(stateProgress * 1.4, 0, 1);
    rig.hips.position.y = 0.88 - coil * 0.32;
    rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(rig.bodyPivot.rotation.y, moveDirX * 0.48, 0.35);
    rig.bodyPivot.rotation.z = -moveDirX * 0.06 * coil;
    rig.torso.rotation.x = 0.48 * coil;

    rig.leftHip.rotation.set(-0.78 * coil, 0, 0.2);
    rig.rightHip.rotation.set(-0.72 * coil, 0, -0.2);
    rig.leftKnee.rotation.x = 1.28 * coil;
    rig.rightKnee.rotation.x = 1.2 * coil;

    // One arm low braced, shooting arm cocked ready
    if (swingArmSide > 0) {
      rig.leftShoulder.rotation.set(0.45 * coil, 0, 0.55);
      rig.leftElbow.rotation.x = -0.82;
      rig.rightShoulder.rotation.set(-0.62 * coil, 0, -0.45);
      rig.rightElbow.rotation.x = -0.35;
    } else {
      rig.rightShoulder.rotation.set(0.45 * coil, 0, -0.55);
      rig.rightElbow.rotation.x = -0.82;
      rig.leftShoulder.rotation.set(-0.62 * coil, 0, 0.45);
      rig.leftElbow.rotation.x = -0.35;
    }

    rig.headGroup.rotation.set(-0.34 * coil, moveDirX * 0.22, 0);
  } else if (state === 'web_launch') {
    // Explosive spring launch upward as web shoots out
    const spring = Math.sin(Math.min(1, stateProgress) * Math.PI * 0.5);
    rig.hips.position.y = 0.88;
    rig.bodyPivot.rotation.y = moveDirX * 0.58;
    rig.bodyPivot.rotation.z = -moveDirX * 0.14;
    rig.torso.rotation.x = 0.12 - spring * 0.18;

    // Tucked lead knee + extended push-off leg
    rig.leftHip.rotation.set(-0.75 * spring, 0, 0.14);
    rig.leftKnee.rotation.x = 1.25 * spring;
    rig.rightHip.rotation.set(0.32 * spring, 0, -0.14);
    rig.rightKnee.rotation.x = 0.25;

    // Shooting arm thrusts skyward aiming web strand
    if (swingArmSide > 0) {
      rig.leftShoulder.rotation.set(-0.48, 0, 2.75);
      rig.leftElbow.rotation.x = -0.16;
      rig.rightShoulder.rotation.set(0.38, 0, -0.85);
      rig.rightElbow.rotation.x = -0.65;
    } else {
      rig.rightShoulder.rotation.set(-0.48, 0, -2.75);
      rig.rightElbow.rotation.x = -0.16;
      rig.leftShoulder.rotation.set(0.38, 0, 0.85);
      rig.leftElbow.rotation.x = -0.65;
    }

    rig.headGroup.rotation.set(-0.18, moveDirX * 0.2, 0);
  } else if (state === 'web_swing') {
    // Spider-Man swing arc with distinct acrobatic release variations
    const isRelease = stateProgress >= 0.78;
    const swingP = Math.min(1, stateProgress / 0.78);
    const releaseP = isRelease ? (stateProgress - 0.78) / 0.22 : 0;

    rig.hips.position.y = 0.88;

    if (!isRelease) {
      const pendulumBank = Math.cos(swingP * Math.PI) * 0.36;
      rig.bodyPivot.rotation.y = moveDirX * 0.56;
      rig.bodyPivot.rotation.z = -moveDirX * pendulumBank;
      rig.torso.rotation.x = 0.18 - Math.sin(swingP * Math.PI) * 0.24;

      // Iconic asymmetrical Spider-Man tucked swing silhouette
      const legSwap = swingArmSide > 0 ? 1 : -1;
      if (legSwap > 0) {
        rig.leftHip.rotation.set(-0.92, 0, 0.15);
        rig.leftKnee.rotation.x = 1.42;
        rig.rightHip.rotation.set(0.38, 0, -0.15);
        rig.rightKnee.rotation.x = 0.42;
      } else {
        rig.rightHip.rotation.set(-0.92, 0, -0.15);
        rig.rightKnee.rotation.x = 1.42;
        rig.leftHip.rotation.set(0.38, 0, 0.15);
        rig.leftKnee.rotation.x = 0.42;
      }

      // Shooting arm stays locked high holding web line; free arm trails stylishly
      if (swingArmSide > 0) {
        rig.leftShoulder.rotation.set(-0.35 + swingP * 0.25, 0, 2.86);
        rig.leftElbow.rotation.x = -0.14;
        rig.rightShoulder.rotation.set(0.42, 0, -1.05 - Math.sin(swingP * Math.PI) * 0.25);
        rig.rightElbow.rotation.x = -0.52;
      } else {
        rig.rightShoulder.rotation.set(-0.35 + swingP * 0.25, 0, -2.86);
        rig.rightElbow.rotation.x = -0.14;
        rig.leftShoulder.rotation.set(0.42, 0, 1.05 + Math.sin(swingP * Math.PI) * 0.25);
        rig.leftElbow.rotation.x = -0.52;
      }

      rig.headGroup.rotation.set(-0.14, moveDirX * 0.22, -moveDirX * 0.08);
    } else if (jumpVariation === 1) {
      // Variation 1: Mid-air forward somersault after releasing web
      rig.bodyPivot.rotation.x = releaseP * Math.PI * 2;
      rig.bodyPivot.rotation.y = moveDirX * 0.45 * (1 - releaseP);
      rig.bodyPivot.rotation.z = 0;
      rig.torso.rotation.x = 0.42;
      rig.leftHip.rotation.set(-0.95, 0, 0.14);
      rig.rightHip.rotation.set(-0.95, 0, -0.14);
      rig.leftKnee.rotation.x = 1.55;
      rig.rightKnee.rotation.x = 1.55;
      rig.leftShoulder.rotation.set(-0.85, 0, 0.42);
      rig.rightShoulder.rotation.set(-0.85, 0, -0.42);
      rig.leftElbow.rotation.x = -1.1;
      rig.rightElbow.rotation.x = -1.1;
      rig.headGroup.rotation.set(0.25, 0, 0);
    } else if (jumpVariation === 2) {
      // Variation 2: Acrobatic corkscrew 360° twist dismount
      rig.bodyPivot.rotation.y = moveDirX * (0.55 + releaseP * Math.PI * 2);
      rig.bodyPivot.rotation.z = -moveDirX * 0.14 * (1 - releaseP);
      rig.torso.rotation.x = 0.2;
      rig.leftHip.rotation.set(-0.55, 0, 0.16);
      rig.rightHip.rotation.set(0.2, 0, -0.16);
      rig.leftKnee.rotation.x = 1.05;
      rig.rightKnee.rotation.x = 0.65;
      rig.leftShoulder.rotation.set(-0.3, 0, 1.15);
      rig.rightShoulder.rotation.set(-0.3, 0, -1.15);
      rig.leftElbow.rotation.x = -0.75;
      rig.rightElbow.rotation.x = -0.75;
      rig.headGroup.rotation.set(0.05, 0, 0);
    } else {
      // Variation 0: Classic poised Spider-Man dive into hero landing
      rig.bodyPivot.rotation.y = moveDirX * 0.45 * (1 - releaseP);
      rig.bodyPivot.rotation.z = 0;
      rig.torso.rotation.x = 0.28;
      rig.leftHip.rotation.set(-0.75, 0, 0.18);
      rig.rightHip.rotation.set(-0.35, 0, -0.18);
      rig.leftKnee.rotation.x = 1.25;
      rig.rightKnee.rotation.x = 0.72;
      rig.leftShoulder.rotation.set(-0.35, 0, 0.92);
      rig.rightShoulder.rotation.set(0.25, 0, -0.85);
      rig.leftElbow.rotation.x = -0.48;
      rig.rightElbow.rotation.x = -0.62;
      rig.headGroup.rotation.set(-0.08, moveDirX * 0.12 * (1 - releaseP), 0);
    }
  } else if (state === 'thinking') {
    const pond = Math.sin(time * 2.1);
    rig.hips.position.y = 0.88 + breath * 0.01;
    rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(rig.bodyPivot.rotation.y, 0.16, 0.16);
    rig.bodyPivot.rotation.z = 0.05;
    rig.torso.rotation.x = -0.02 + breath * 0.02;

    rig.leftHip.rotation.set(-0.04, 0, 0.13);
    rig.rightHip.rotation.set(0.05, 0, -0.11);
    rig.leftKnee.rotation.x = 0.08;
    rig.rightKnee.rotation.x = 0.04;

    rig.leftShoulder.rotation.set(-0.48, 0.32, -0.18);
    rig.leftElbow.rotation.set(-1.15, 0, -0.45);
    rig.rightShoulder.rotation.set(-0.88, -0.28, -0.22);
    rig.rightElbow.rotation.set(-1.72, 0, -0.58);

    rig.headGroup.rotation.set(
      -0.08 + pond * 0.03,
      gazeX * 0.28 + 0.12,
      0.14 + pond * 0.03
    );
  } else if (state === 'surrender') {
    const pop = Math.sin(Math.min(1, stateProgress * 2.4) * Math.PI);
    const wiggle = Math.sin(time * 20) * 0.05;
    rig.hips.position.y = 0.88 + pop * 0.09;
    rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(rig.bodyPivot.rotation.y, 0.02, 0.38);
    rig.bodyPivot.rotation.z = wiggle * 0.4;
    rig.torso.rotation.x = -0.12;

    rig.leftHip.rotation.set(-0.08, 0, 0.18);
    rig.rightHip.rotation.set(-0.08, 0, -0.18);
    rig.leftKnee.rotation.x = 0.16;
    rig.rightKnee.rotation.x = 0.16;

    rig.leftShoulder.rotation.set(-0.34, 0, 2.58 + wiggle);
    rig.rightShoulder.rotation.set(-0.34, 0, -2.58 - wiggle);
    rig.leftElbow.rotation.x = -0.36;
    rig.rightElbow.rotation.x = -0.36;

    rig.headGroup.rotation.set(-0.14, gazeX * 0.16, wiggle * 0.6);
  } else if (state === 'head_scratch') {
    const scratch = Math.sin(time * 22);
    const sway = Math.sin(time * 3.0) * 0.03;
    rig.hips.position.y = 0.88 + breath * 0.01;
    rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(rig.bodyPivot.rotation.y, 0.08, 0.22);
    rig.bodyPivot.rotation.z = -0.05 + sway;
    rig.torso.rotation.x = 0.02;

    rig.leftHip.rotation.set(-0.05, 0, 0.14);
    rig.rightHip.rotation.set(0.05, 0, -0.12);
    rig.leftKnee.rotation.x = 0.08;
    rig.rightKnee.rotation.x = 0.04;

    rig.leftShoulder.rotation.set(0.08, 0, 0.45);
    rig.leftElbow.rotation.x = -1.05;

    rig.rightShoulder.rotation.set(-0.22, 0, -2.58 + scratch * 0.04);
    rig.rightElbow.rotation.set(-0.24 + scratch * 0.1, 0, -0.92 + scratch * 0.18);

    rig.headGroup.rotation.set(0.04, 0.14, -0.22 + scratch * 0.03);
  } else if (state === 'headbang') {
    const intensity = THREE.MathUtils.clamp(0.42 + beatIntensity * 0.72, 0.35, 1.15);
    const downDrive = Math.max(0, beatOsc) * intensity;
    const bounce = Math.abs(beatOsc) * 0.075 * intensity;

    rig.hips.position.y = 0.88 - bounce - kickIntensity * 0.06;
    rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(rig.bodyPivot.rotation.y, 0.08 + beatOsc * 0.08, 0.22);
    rig.bodyPivot.rotation.z = snareSign * snareIntensity * 0.06;

    rig.torso.rotation.x = 0.08 + downDrive * 0.34 + kickIntensity * 0.14;
    rig.torso.rotation.y = snareSign * snareIntensity * 0.14;

    const kneeFlex = 0.16 + bounce * 3.8 + kickIntensity * 0.24;
    rig.leftHip.rotation.set(-kneeFlex * 0.55, 0, 0.16);
    rig.rightHip.rotation.set(-kneeFlex * 0.55, 0, -0.16);
    rig.leftKnee.rotation.x = kneeFlex;
    rig.rightKnee.rotation.x = kneeFlex;

    const armPump = downDrive * 0.36;
    rig.leftShoulder.rotation.set(-0.48 - armPump, 0, 0.36 + snareIntensity * 0.24);
    rig.rightShoulder.rotation.set(-0.48 - armPump, 0, -0.36 - snareIntensity * 0.24);
    rig.leftElbow.rotation.x = -1.12 - armPump * 0.35;
    rig.rightElbow.rotation.x = -1.12 - armPump * 0.35;

    rig.headGroup.rotation.set(
      -0.12 + downDrive * 0.58 + kickIntensity * 0.24,
      gazeX * 0.14 + snareSign * snareIntensity * 0.16,
      snareSign * snareIntensity * 0.18
    );
  } else if (state === 'running') {
    const stride = time * 15.0;
    const swing = Math.sin(stride) * 0.72;
    const bounce = Math.abs(Math.sin(stride)) * 0.08;
    rig.hips.position.y = 0.88 + bounce;
    rig.bodyPivot.rotation.z = -moveDirX * 0.12;
    rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(rig.bodyPivot.rotation.y, moveDirX * 0.85, 0.3);
    rig.torso.rotation.x = 0.22;

    rig.leftHip.rotation.x = swing;
    rig.rightHip.rotation.x = -swing;
    rig.leftKnee.rotation.x = Math.max(0, -Math.cos(stride) * 0.85);
    rig.rightKnee.rotation.x = Math.max(0, Math.cos(stride) * 0.85);

    rig.leftShoulder.rotation.set(-swing * 0.85, 0, 0.22);
    rig.rightShoulder.rotation.set(swing * 0.85, 0, -0.22);
    rig.leftElbow.rotation.x = -0.85;
    rig.rightElbow.rotation.x = -0.85;

    rig.headGroup.rotation.set(-0.08, moveDirX * 0.15, 0);
  } else if (state === 'jumping') {
    const arch = Math.sin(stateProgress * Math.PI);
    rig.hips.position.y = 0.88;
    rig.bodyPivot.rotation.y = moveDirX * 0.68;
    rig.bodyPivot.rotation.z = -moveDirX * 0.08;
    rig.torso.rotation.x = 0.15 - arch * 0.12;

    rig.leftHip.rotation.x = -0.55 * arch;
    rig.rightHip.rotation.x = 0.35 * arch;
    rig.leftKnee.rotation.x = 0.9 * arch;
    rig.rightKnee.rotation.x = 0.55 * arch;

    rig.leftShoulder.rotation.set(-0.4, 0, 1.35 * arch + 0.35);
    rig.rightShoulder.rotation.set(0.2, 0, -1.25 * arch - 0.35);
    rig.leftElbow.rotation.x = -0.5;
    rig.rightElbow.rotation.x = -0.5;

    rig.headGroup.rotation.set(-0.1, moveDirX * 0.18, 0);
  } else if (state === 'landing') {
    // Athletic Spider-Man hero landing cushion into recovery
    const impact = Math.sin(stateProgress * Math.PI);
    rig.bodyPivot.scale.set(1 + impact * 0.12, 1 - impact * 0.15, 1 + impact * 0.12);
    rig.bodyPivot.rotation.y = moveDirX * 0.32 * (1 - stateProgress);
    rig.bodyPivot.rotation.z = 0;
    rig.hips.position.y = 0.88 - impact * 0.2;
    rig.torso.rotation.x = impact * 0.28;

    rig.leftHip.rotation.set(-impact * 0.58, 0, 0.18);
    rig.rightHip.rotation.set(-impact * 0.52, 0, -0.18);
    rig.leftKnee.rotation.x = impact * 1.05;
    rig.rightKnee.rotation.x = impact * 0.98;

    rig.leftShoulder.rotation.set(0.18, 0, 0.56 + impact * 0.28);
    rig.rightShoulder.rotation.set(0.18, 0, -0.56 - impact * 0.28);
    rig.leftElbow.rotation.x = -0.45;
    rig.rightElbow.rotation.x = -0.45;
    rig.headGroup.rotation.set(impact * 0.08, gazeX * 0.2, 0);
  } else if (state === 'angry_far') {
    const shake = Math.sin(time * 28) * 0.08;
    const stomp = Math.abs(Math.sin(time * 14)) * 0.04;
    rig.hips.position.y = 0.88 - stomp;
    rig.bodyPivot.rotation.y = moveDirX * 0.25;
    rig.bodyPivot.rotation.z = shake * 0.45;
    rig.torso.rotation.x = 0.14;

    rig.leftHip.rotation.set(-0.15, 0, 0.14);
    rig.rightHip.rotation.set(-0.15, 0, -0.14);
    rig.leftKnee.rotation.x = 0.26;
    rig.rightKnee.rotation.x = 0.26;

    rig.leftShoulder.rotation.set(-0.45, 0, 0.45 + shake);
    rig.rightShoulder.rotation.set(-0.45, 0, -0.45 - shake);
    rig.leftElbow.rotation.x = -1.25;
    rig.rightElbow.rotation.x = -1.25;

    rig.headGroup.rotation.set(0.08, moveDirX * 0.35 + shake * 0.6, -shake * 0.5);
  } else if (state === 'notice') {
    const pop = Math.sin(stateProgress * Math.PI);
    rig.hips.position.y = 0.88 + pop * 0.05;
    rig.bodyPivot.rotation.y = moveDirX * 0.22 * stateProgress;
    rig.bodyPivot.rotation.z = 0;
    rig.torso.rotation.x = -0.05 * pop;

    rig.leftHip.rotation.set(0, 0, 0.1);
    rig.rightHip.rotation.set(0, 0, -0.1);
    rig.leftKnee.rotation.x = 0.05;
    rig.rightKnee.rotation.x = 0.05;

    rig.leftShoulder.rotation.set(-0.2 * pop, 0, 0.32 + pop * 0.18);
    rig.rightShoulder.rotation.set(-0.2 * pop, 0, -0.32 - pop * 0.18);
    rig.leftElbow.rotation.x = -0.35;
    rig.rightElbow.rotation.x = -0.35;

    rig.headGroup.rotation.set(-0.08 * pop, gazeX * 0.42, -moveDirX * 0.12);
  } else if (state === 'facing_user') {
    const settle = Math.sin(stateProgress * Math.PI * 0.5);
    rig.hips.position.y = 0.88 + breath * 0.015;
    rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(rig.bodyPivot.rotation.y, 0.06, 0.28);
    rig.bodyPivot.rotation.z = 0;
    rig.torso.rotation.x = -0.04;

    rig.leftHip.rotation.set(-0.04, 0, 0.11);
    rig.rightHip.rotation.set(0.05, 0, -0.11);
    rig.leftKnee.rotation.x = 0.08;
    rig.rightKnee.rotation.x = 0.04;

    rig.leftShoulder.rotation.set(0.05, 0, 0.25 + settle * 0.1);
    rig.rightShoulder.rotation.set(0.05, 0, -0.25 - settle * 0.1);
    rig.leftElbow.rotation.x = -0.25;
    rig.rightElbow.rotation.x = -0.25;

    rig.headGroup.rotation.set(0, 0, 0.06 * settle);
  } else if (state === 'emote') {
    const wave = Math.sin(stateProgress * Math.PI * 3.0) * 0.35;
    const bounce = Math.sin(stateProgress * Math.PI) * 0.06;
    rig.hips.position.y = 0.88 + bounce;
    rig.bodyPivot.rotation.y = -0.08;
    rig.bodyPivot.rotation.z = 0.04;
    rig.torso.rotation.x = -0.06;

    rig.leftHip.rotation.set(-0.08, 0, 0.15);
    rig.rightHip.rotation.set(0.08, 0, -0.12);
    rig.leftKnee.rotation.x = 0.12;
    rig.rightKnee.rotation.x = 0.05;

    rig.leftShoulder.rotation.set(-0.35, 0, 2.25 + wave * 0.55);
    rig.leftElbow.rotation.x = -0.55;
    rig.rightShoulder.rotation.set(0.08, 0, -0.45);
    rig.rightElbow.rotation.x = -1.05;

    rig.headGroup.rotation.set(-0.04, 0.04, 0.1);
  } else {
    // IDLE: natural stylized arcade idle sway, gentle breathing, curious glancing
    const sway = Math.sin(time * 1.45) * 0.045;
    rig.hips.position.y = 0.88 + breath * 0.014;
    rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(
      rig.bodyPivot.rotation.y,
      Math.sin(time * 0.7) * 0.1 + gazeX * 0.15,
      0.14
    );
    rig.bodyPivot.rotation.z = sway;
    rig.torso.rotation.x = breath * 0.03;

    rig.leftHip.rotation.set(-0.05 + sway * 0.4, 0, 0.14);
    rig.rightHip.rotation.set(0.06 - sway * 0.4, 0, -0.14);
    rig.leftKnee.rotation.x = 0.07;
    rig.rightKnee.rotation.x = 0.04;

    rig.leftShoulder.rotation.set(0.06 + breath * 0.04, 0, 0.24 + sway * 0.5);
    rig.rightShoulder.rotation.set(-0.05 - breath * 0.04, 0, -0.22 - sway * 0.5);
    rig.leftElbow.rotation.x = -0.28 + breath * 0.05;
    rig.rightElbow.rotation.x = -0.32 - breath * 0.05;

    rig.headGroup.rotation.set(
      gazeY * 0.16 + breath * 0.025,
      gazeX * 0.34,
      -sway * 0.6 + gazeX * -0.06
    );
  }

  // Real-time Kick & Snare reactive overlays across active ambient states (walking / idle / thinking)
  if (state === 'idle' || state === 'walking' || state === 'thinking') {
    if (kickIntensity > 0.01) {
      rig.hips.position.y -= kickIntensity * 0.052;
      rig.leftKnee.rotation.x += kickIntensity * 0.22;
      rig.rightKnee.rotation.x += kickIntensity * 0.22;
      rig.torso.rotation.x += kickIntensity * 0.15;
      rig.headGroup.rotation.x += kickIntensity * 0.36;
    }
    if (snareIntensity > 0.01) {
      rig.torso.rotation.y += snareSign * snareIntensity * 0.14;
      rig.leftShoulder.rotation.z += snareIntensity * 0.2;
      rig.rightShoulder.rotation.z -= snareIntensity * 0.2;
      rig.headGroup.rotation.z += snareSign * snareIntensity * 0.18;
      rig.headGroup.rotation.y += snareSign * snareIntensity * 0.12;
    }
  }
}
