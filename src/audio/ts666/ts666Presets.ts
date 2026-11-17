import type {
  Ts666ClipStep,
  Ts666EnvelopeConfig,
  Ts666FilterConfig,
  Ts666LfoConfig,
  Ts666MacroConfig,
  Ts666MixConfig,
  Ts666OscillatorConfig,
  Ts666Patch,
  Ts666Pattern,
  Ts666SequencerState,
} from '../../types/ts666';
import { mirrorKeyToIndexedDb } from '../tarekIndexedDb';

const TS666_ACTIVE_PATCH_KEY = 'tarek_666ts_active_patch_v1';
const TS666_USER_PRESETS_KEY = 'tarek_666ts_user_presets_v1';

export function makeDefaultOscillator(
  id: 'A' | 'B' | 'C',
  enabled: boolean,
  wtPosition = 0
): Ts666OscillatorConfig {
  return {
    id,
    enabled,
    mode: 'wavetable',
    wavetableId: 'basic_shapes',
    sampleId: 'finger_bass',
    multisampleId: 'ms_clean_bass',
    octave: 0,
    semitone: 0,
    fine: 0,
    coarse: 0,
    unison: 1,
    detune: 0.14,
    blend: 0.5,
    wtPosition,
    phase: 0,
    random: 0,
    warp1Mode: 'none',
    warp1Amount: 0,
    warp2Mode: 'none',
    warp2Amount: 0,
    pan: 0,
    level: id === 'A' ? 0.85 : 0.7,
    grainSize: 0.08,
    density: 0.45,
  };
}

export function makeDefaultFilter(id: 1 | 2): Ts666FilterConfig {
  return {
    id,
    enabled: false,
    category: 'Normal',
    type: id === 1 ? 'lp24' : 'hp12',
    cutoff: id === 1 ? 16000 : 80,
    resonance: 0.7,
    pan: 0,
    drive: 0,
    fat: 0,
    mix: 1,
    routeA: id === 1,
    routeB: id === 1,
    routeC: id === 1,
    routeN: id === 1,
    routeS: false,
  };
}

export function makeDefaultEnvelopes(): [
  Ts666EnvelopeConfig,
  Ts666EnvelopeConfig,
  Ts666EnvelopeConfig,
  Ts666EnvelopeConfig
] {
  return [
    {
      id: 1,
      attack: 0.008,
      hold: 0,
      decay: 0.45,
      sustain: 1,
      release: 0.16,
      attackCurve: 0,
      decayCurve: -0.25,
      releaseCurve: -0.2,
    },
    {
      id: 2,
      attack: 0.015,
      hold: 0,
      decay: 0.55,
      sustain: 0.2,
      release: 0.28,
      attackCurve: 0,
      decayCurve: -0.35,
      releaseCurve: -0.25,
    },
    {
      id: 3,
      attack: 0.04,
      hold: 0.08,
      decay: 0.8,
      sustain: 0.4,
      release: 0.45,
      attackCurve: 0.1,
      decayCurve: -0.2,
      releaseCurve: -0.2,
    },
    {
      id: 4,
      attack: 0.12,
      hold: 0.15,
      decay: 1.1,
      sustain: 0.6,
      release: 0.7,
      attackCurve: 0,
      decayCurve: 0,
      releaseCurve: 0,
    },
  ];
}

export function makeDefaultLfo(id: number): Ts666LfoConfig {
  const shapes: number[][] = [
    [0, 1, 0, -1, 0], // triangle
    [-1, 1, -1], // ramp up/down
    [1, 0, -0.5, 0, 1], // plunge
    [-1, -1, 1, 1, -1], // gate
  ];
  const points = [...(shapes[(id - 1) % shapes.length] ?? [0, 1, 0, -1, 0])];
  return {
    id,
    points,
    bends: Array(Math.max(1, points.length - 1)).fill(0),
    gridSize: 8,
    pathMode: true,
    rateHz: id % 2 === 1 ? 1.5 : 3.0,
    sync: true,
    division: id <= 2 ? '1/4' : id <= 5 ? '1/8' : '1/2',
    rise: 0,
    delay: 0,
    smooth: 0.05,
    mode: 'trigger',
    anchored: false,
    bipolar: false,
  };
}

export function makeDefaultMacros(): Ts666MacroConfig[] {
  return Array.from({ length: 8 }, (_, idx) => ({
    id: idx + 1,
    name: `MACRO ${idx + 1}`,
    value: 0,
    bindings: [],
  }));
}

export function makeDefaultMix(): Ts666MixConfig {
  return {
    oscA: { volume: 1, pan: 0, mute: false, solo: false, bus: 'main' },
    oscB: { volume: 1, pan: 0, mute: false, solo: false, bus: 'main' },
    oscC: { volume: 1, pan: 0, mute: false, solo: false, bus: 'main' },
    sub: { volume: 1, pan: 0, mute: false, solo: false, bus: 'main' },
    noise: { volume: 0.85, pan: 0, mute: false, solo: false, bus: 'main' },
    filter1: { volume: 1, pan: 0, mute: false, solo: false, bus: 'main' },
    filter2: { volume: 1, pan: 0, mute: false, solo: false, bus: 'main' },
    bus1Return: { volume: 0.85, pan: 0, mute: false },
    bus2Return: { volume: 0.85, pan: 0, mute: false },
    mainLevel: 1,
  };
}

function makeDefaultClipSteps(): Ts666ClipStep[] {
  const bassNotes = [36, 36, 39, 36, 41, 36, 43, 39, 36, 36, 48, 36, 43, 41, 39, 38];
  return Array.from({ length: 32 }, (_, idx) => ({
    active: idx % 2 === 0 && idx < 16,
    midi: bassNotes[idx % bassNotes.length],
    velocity: idx % 4 === 0 ? 0.92 : 0.72,
    lengthSteps: 1,
  }));
}

/**
 * CLEAN BASS INIT — pure clean Sine oscillator ready on A, Clean Saw ready on B,
 * neutral tuning, zero warp/randomness, filters off, all FX empty and bypassed.
 */
export function createCleanBassInit666(): Ts666Patch {
  const oscA = makeDefaultOscillator('A', true, 0);
  oscA.octave = -1;
  oscA.level = 0.88;

  const oscB = makeDefaultOscillator('B', false, 0.67); // Clean Sawtooth ready when toggled on
  oscB.octave = -1;
  oscB.level = 0.75;

  const oscC = makeDefaultOscillator('C', false, 0.34); // Triangle ready
  oscC.level = 0.6;

  return {
    id: 'clean_bass_init_666',
    name: 'CLEAN BASS INIT',
    category: 'Init / Clean',
    isFactory: true,
    oscillators: [oscA, oscB, oscC],
    sub: {
      enabled: false,
      shape: 'sine',
      octave: -1,
      pan: 0,
      level: 0.7,
      directOut: true,
    },
    noise: {
      enabled: false,
      sampleId: 'pink',
      pitch: 0.5,
      phase: 0,
      pan: 0,
      level: 0.25,
      keyboardTracking: false,
      oneShot: false,
      phaseRandomization: 0,
      directOut: false,
    },
    filters: [makeDefaultFilter(1), makeDefaultFilter(2)],
    filterRouting: 'serial',
    filterLink: false,
    envelopes: makeDefaultEnvelopes(),
    lfos: Array.from({ length: 10 }, (_, idx) => makeDefaultLfo(idx + 1)),
    arp: {
      enabled: false,
      mode: 'up',
      division: '1/16',
      sync: true,
      rateHz: 8,
      gate: 0.75,
      swing: 0,
      octaves: 1,
    },
    clipSeq: {
      enabled: false,
      stepCount: 16,
      division: '1/16',
      swing: 0,
      steps: makeDefaultClipSteps(),
    },
    macros: makeDefaultMacros(),
    performance: {
      portamentoTimeMs: 0,
      portamentoCurve: 0,
      pitchBendUp: 2,
      pitchBendDown: 2,
      masterVolume: 0.85,
      pitchBendValue: 0,
      modWheelValue: 0,
    },
    mix: makeDefaultMix(),
    fx: {
      main: [],
      bus1: [],
      bus2: [],
      mainBypass: false,
      bus1Bypass: false,
      bus2Bypass: false,
    },
    modMatrix: [],
    global: {
      oversampling: 2,
      polyphony: 8,
      monoLegato: false,
      masterTuningHz: 440,
      microtuningScale: 'equal_12',
      microtuningCents: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      chaos1: { rateHz: 1.4, smooth: 0.6, bipolar: true, mono: true },
      chaos2: { rateHz: 3.1, smooth: 0.45, bipolar: true, mono: false },
    },
  };
}

export function createFactoryPresets666(): Ts666Patch[] {
  const init = createCleanBassInit666();

  // 2. Dual-Filter Analog Reese Bass
  const reese = createCleanBassInit666();
  reese.id = 'factory_666_analog_reese';
  reese.name = 'ANALOG REESE 666';
  reese.category = 'Bass';
  reese.oscillators[0] = {
    ...reese.oscillators[0],
    enabled: true,
    wavetableId: 'analog_bass',
    wtPosition: 0.65,
    unison: 5,
    detune: 0.24,
    random: 0.35,
    level: 0.78,
  };
  reese.oscillators[1] = {
    ...reese.oscillators[1],
    enabled: true,
    wavetableId: 'basic_shapes',
    wtPosition: 0.67,
    octave: -1,
    fine: 7,
    unison: 3,
    detune: 0.16,
    level: 0.55,
  };
  reese.sub.enabled = true;
  reese.sub.level = 0.65;
  reese.filters[0] = {
    ...reese.filters[0],
    enabled: true,
    category: 'Normal',
    type: 'lp24',
    cutoff: 520,
    resonance: 2.8,
    drive: 0.25,
    fat: 0.35,
    routeA: true,
    routeB: true,
    routeC: false,
    routeN: false,
    routeS: false,
  };
  reese.macros[0] = {
    id: 1,
    name: 'FILTER CUTOFF',
    value: 0.25,
    bindings: [{ target: 'F1_CUTOFF', amount: 0.7 }],
  };
  reese.modMatrix = [
    {
      id: 'm1',
      enabled: true,
      source: 'LFO1',
      target: 'F1_CUTOFF',
      amount: 0.25,
      direction: 'uni',
      curve: 0,
      auxSource: 'NONE',
    },
  ];
  reese.fx.main = [
    {
      id: 'fx_reese_comp',
      type: 'compressor',
      name: 'Compressor',
      enabled: true,
      params: { threshold: -16, ratio: 4, attack: 0.015, release: 0.14, gain: 3 },
    },
    {
      id: 'fx_reese_cab',
      type: 'cabinet',
      name: 'Cabinet Sim',
      enabled: true,
      params: { size: 0.55, tone: 0.62, drive: 0.12, mix: 0.35 },
    },
  ];

  // 3. Spectral Glass Pad
  const spectralPad = createCleanBassInit666();
  spectralPad.id = 'factory_666_spectral_glass';
  spectralPad.name = 'SPECTRAL CATHEDRAL';
  spectralPad.category = 'Spectral / Pad';
  spectralPad.oscillators[0] = {
    ...spectralPad.oscillators[0],
    enabled: true,
    mode: 'spectral',
    wavetableId: 'spectral_glass',
    wtPosition: 0.4,
    octave: 0,
    unison: 4,
    detune: 0.18,
    grainSize: 0.16,
    density: 0.55,
    level: 0.72,
  };
  spectralPad.oscillators[1] = {
    ...spectralPad.oscillators[1],
    enabled: true,
    mode: 'granular',
    sampleId: 'choir_ah',
    wtPosition: 0.35,
    octave: 1,
    grainSize: 0.14,
    density: 0.65,
    level: 0.45,
  };
  spectralPad.envelopes[0] = {
    ...spectralPad.envelopes[0],
    attack: 0.45,
    hold: 0.15,
    decay: 1.2,
    sustain: 0.85,
    release: 1.6,
  };
  spectralPad.mix.oscA.bus = 'bus1';
  spectralPad.mix.oscB.bus = 'bus2';
  spectralPad.fx.bus1 = [
    {
      id: 'fx_spec_echo',
      type: 'echobode',
      name: 'Echobode',
      enabled: true,
      params: { freqShiftHz: 6, delayMs: 280, feedback: 0.42, tone: 0.7, mix: 0.45 },
    },
  ];
  spectralPad.fx.bus2 = [
    {
      id: 'fx_spec_rev',
      type: 'conv_reverb',
      name: 'Conv Reverb',
      enabled: true,
      params: { irIndex: 1, decay: 0.78, preDelayMs: 24, damping: 0.65, mix: 0.52 },
    },
  ];
  spectralPad.modMatrix = [
    {
      id: 'm_spec_1',
      enabled: true,
      source: 'LFO2',
      target: 'OSC_A_WT',
      amount: 0.35,
      direction: 'uni',
      curve: 0,
      auxSource: 'NONE',
    },
    {
      id: 'm_spec_2',
      enabled: true,
      source: 'CHAOS1',
      target: 'OSC_B_WT',
      amount: 0.25,
      direction: 'bi',
      curve: 0,
      auxSource: 'NONE',
    },
  ];

  // 4. Multisample Electric Tine Piano + Tremolo
  const tines = createCleanBassInit666();
  tines.id = 'factory_666_tines';
  tines.name = 'STUDIO TINES 5-ZONE';
  tines.category = 'Keys / Multi';
  tines.oscillators[0] = {
    ...tines.oscillators[0],
    enabled: true,
    mode: 'multisample',
    multisampleId: 'ms_electric_piano',
    octave: 0,
    unison: 2,
    detune: 0.06,
    level: 0.86,
  };
  tines.fx.main = [
    {
      id: 'fx_tines_trem',
      type: 'tremolo',
      name: 'Tremolo',
      enabled: true,
      params: { rateHz: 4.5, depth: 0.42, stereo: 0.8, sync: 1, divisionIndex: 9, mix: 0.8 },
    },
    {
      id: 'fx_tines_rev',
      type: 'reverb',
      name: 'Reverb',
      enabled: true,
      params: { size: 0.5, damping: 0.68, mix: 0.28 },
    },
  ];

  // 5. Dual Comb / Formant Dubstep Growl Lead
  const growl = createCleanBassInit666();
  growl.id = 'factory_666_dual_formant';
  growl.name = 'DUAL FORMANT BASS';
  growl.category = 'Bass / FX';
  growl.oscillators[0] = {
    ...growl.oscillators[0],
    enabled: true,
    wavetableId: 'vocal_formant',
    wtPosition: 0.35,
    octave: -1,
    warp1Mode: 'fm',
    warp1Amount: 0.25,
    level: 0.84,
  };
  growl.sub.enabled = true;
  growl.sub.level = 0.72;
  growl.filterRouting = 'parallel';
  growl.filters[0] = {
    ...growl.filters[0],
    enabled: true,
    category: 'Multi',
    type: 'multi_formant',
    cutoff: 680,
    resonance: 4.2,
    drive: 0.35,
    fat: 0.45,
    routeA: true,
    routeB: false,
    routeC: false,
    routeN: false,
    routeS: false,
  };
  growl.filters[1] = {
    ...growl.filters[1],
    enabled: true,
    category: 'Combs',
    type: 'comb_plus',
    cutoff: 320,
    resonance: 5.5,
    drive: 0.15,
    fat: 0.3,
    mix: 0.55,
    routeA: true,
    routeB: false,
    routeC: false,
    routeN: false,
    routeS: false,
  };
  growl.modMatrix = [
    {
      id: 'mg_1',
      enabled: true,
      source: 'LFO1',
      target: 'F1_CUTOFF',
      amount: 0.42,
      direction: 'uni',
      curve: 0,
      auxSource: 'NONE',
    },
    {
      id: 'mg_2',
      enabled: true,
      source: 'ENV2',
      target: 'OSC_A_WT',
      amount: 0.5,
      direction: 'uni',
      curve: 0,
      auxSource: 'NONE',
    },
  ];

  // 6. 666TS Growl Monster (Triple-Osc + Growl Engine + Cabinet + Tremolo)
  const growlMonster = createCleanBassInit666();
  growlMonster.id = 'factory_666_growl_monster';
  growlMonster.name = '666 GROWL MONSTER';
  growlMonster.category = 'Riddim / Dubstep';
  growlMonster.oscillators[0] = {
    ...growlMonster.oscillators[0],
    enabled: true,
    wavetableId: 'vocal_formant',
    wtPosition: 0.42,
    octave: -1,
    unison: 3,
    detune: 0.16,
    warp1Mode: 'fm',
    warp1Amount: 0.28,
    level: 0.82,
  };
  growlMonster.oscillators[1] = {
    ...growlMonster.oscillators[1],
    enabled: true,
    wavetableId: 'analog_bass',
    wtPosition: 0.58,
    octave: -1,
    semitone: 0,
    unison: 2,
    detune: 0.14,
    warp1Mode: 'bend+',
    warp1Amount: 0.22,
    level: 0.68,
  };
  growlMonster.oscillators[2] = {
    ...growlMonster.oscillators[2],
    enabled: true,
    wavetableId: 'sub_harmonics',
    wtPosition: 0.66,
    octave: 0,
    semitone: 7,
    level: 0.36,
  };
  growlMonster.sub.enabled = true;
  growlMonster.sub.level = 0.72;
  growlMonster.filters[0] = {
    ...growlMonster.filters[0],
    enabled: true,
    category: 'Multi',
    type: 'multi_formant',
    cutoff: 780,
    resonance: 3.4,
    drive: 0.22,
    fat: 0.4,
    routeA: true,
    routeB: true,
    routeC: true,
    routeN: false,
    routeS: false,
  };
  growlMonster.fx.main = [
    {
      id: 'fx_gm_growl',
      type: 'growl_engine',
      name: 'WONKEY',
      enabled: true,
      params: {
        volume: 0.88,
        drive: 0.62,
        gain: 1.25,
        metal: 0.74,
        fmMetal: 0.64,
        wobbleRate: 3.2,
        wobbleDepth: 0.68,
        wobbleSync: 1,
        wobbleDivIdx: 9,
        cutoff: 520,
        resonance: 6.0,
        filterMode: 1,
      },
    },
    {
      id: 'fx_gm_cab',
      type: 'cabinet',
      name: 'Cabinet Simulator',
      enabled: true,
      params: { size: 0.54, tone: 0.66, drive: 0.14, mix: 0.38 },
    },
    {
      id: 'fx_gm_trem',
      type: 'tremolo',
      name: 'Tremolo',
      enabled: false,
      params: { rateHz: 4, depth: 0.35, stereo: 0.5, sync: 1, divisionIndex: 10, mix: 0.75 },
    },
  ];
  growlMonster.modMatrix = [
    {
      id: 'mgm_1',
      enabled: true,
      source: 'LFO1',
      target: 'GROWL_CUTOFF',
      amount: 0.28,
      direction: 'uni',
      curve: 0,
      auxSource: 'NONE',
    },
    {
      id: 'mgm_2',
      enabled: true,
      source: 'ENV2',
      target: 'OSC_A_WT',
      amount: 0.42,
      direction: 'uni',
      curve: 0,
      auxSource: 'NONE',
    },
  ];

  return [init, reese, spectralPad, tines, growl, growlMonster];
}

export function normalizeTs666Patch(raw?: Partial<Ts666Patch> | null): Ts666Patch {
  const base = createCleanBassInit666();
  if (!raw || typeof raw !== 'object') return base;

  const oscs: [Ts666OscillatorConfig, Ts666OscillatorConfig, Ts666OscillatorConfig] = [
    { ...base.oscillators[0], ...(raw.oscillators?.[0] ?? {}), id: 'A' },
    { ...base.oscillators[1], ...(raw.oscillators?.[1] ?? {}), id: 'B' },
    { ...base.oscillators[2], ...(raw.oscillators?.[2] ?? {}), id: 'C' },
  ];

  const filters: [Ts666FilterConfig, Ts666FilterConfig] = [
    { ...base.filters[0], ...(raw.filters?.[0] ?? {}), id: 1 },
    { ...base.filters[1], ...(raw.filters?.[1] ?? {}), id: 2 },
  ];

  const envs: [
    Ts666EnvelopeConfig,
    Ts666EnvelopeConfig,
    Ts666EnvelopeConfig,
    Ts666EnvelopeConfig
  ] = [
    { ...base.envelopes[0], ...(raw.envelopes?.[0] ?? {}), id: 1 },
    { ...base.envelopes[1], ...(raw.envelopes?.[1] ?? {}), id: 2 },
    { ...base.envelopes[2], ...(raw.envelopes?.[2] ?? {}), id: 3 },
    { ...base.envelopes[3], ...(raw.envelopes?.[3] ?? {}), id: 4 },
  ];

  const lfos = base.lfos.map((def, idx) => ({
    ...def,
    ...(raw.lfos?.[idx] ?? {}),
    id: idx + 1,
  }));

  const macros = base.macros.map((def, idx) => ({
    ...def,
    ...(raw.macros?.[idx] ?? {}),
    id: idx + 1,
  }));

  return {
    ...base,
    ...raw,
    oscillators: oscs,
    sub: { ...base.sub, ...(raw.sub ?? {}) },
    noise: { ...base.noise, ...(raw.noise ?? {}) },
    filters,
    envelopes: envs,
    lfos,
    arp: { ...base.arp, ...(raw.arp ?? {}) },
    clipSeq: {
      ...base.clipSeq,
      ...(raw.clipSeq ?? {}),
      steps:
        Array.isArray(raw.clipSeq?.steps) && raw.clipSeq.steps.length === 32
          ? raw.clipSeq.steps
          : base.clipSeq.steps,
    },
    macros,
    performance: { ...base.performance, ...(raw.performance ?? {}) },
    mix: {
      ...base.mix,
      ...(raw.mix ?? {}),
      oscA: { ...base.mix.oscA, ...(raw.mix?.oscA ?? {}) },
      oscB: { ...base.mix.oscB, ...(raw.mix?.oscB ?? {}) },
      oscC: { ...base.mix.oscC, ...(raw.mix?.oscC ?? {}) },
      sub: { ...base.mix.sub, ...(raw.mix?.sub ?? {}) },
      noise: { ...base.mix.noise, ...(raw.mix?.noise ?? {}) },
      filter1: { ...base.mix.filter1, ...(raw.mix?.filter1 ?? {}) },
      filter2: { ...base.mix.filter2, ...(raw.mix?.filter2 ?? {}) },
      bus1Return: { ...base.mix.bus1Return, ...(raw.mix?.bus1Return ?? {}) },
      bus2Return: { ...base.mix.bus2Return, ...(raw.mix?.bus2Return ?? {}) },
    },
    fx: {
      main: Array.isArray(raw.fx?.main)
        ? raw.fx.main.map((m) =>
            m.type === 'growl_engine' && m.name === '666TS Growl Engine'
              ? { ...m, name: 'WONKEY' }
              : m
          )
        : base.fx.main,
      bus1: Array.isArray(raw.fx?.bus1)
        ? raw.fx.bus1.map((m) =>
            m.type === 'growl_engine' && m.name === '666TS Growl Engine'
              ? { ...m, name: 'WONKEY' }
              : m
          )
        : base.fx.bus1,
      bus2: Array.isArray(raw.fx?.bus2)
        ? raw.fx.bus2.map((m) =>
            m.type === 'growl_engine' && m.name === '666TS Growl Engine'
              ? { ...m, name: 'WONKEY' }
              : m
          )
        : base.fx.bus2,
      mainBypass: Boolean(raw.fx?.mainBypass),
      bus1Bypass: Boolean(raw.fx?.bus1Bypass),
      bus2Bypass: Boolean(raw.fx?.bus2Bypass),
    },
    modMatrix: Array.isArray(raw.modMatrix) ? raw.modMatrix.slice(0, 64) : base.modMatrix,
    global: {
      ...base.global,
      ...(raw.global ?? {}),
      chaos1: { ...base.global.chaos1, ...(raw.global?.chaos1 ?? {}) },
      chaos2: { ...base.global.chaos2, ...(raw.global?.chaos2 ?? {}) },
      microtuningCents:
        Array.isArray(raw.global?.microtuningCents) &&
        raw.global.microtuningCents.length === 12
          ? raw.global.microtuningCents
          : base.global.microtuningCents,
    },
  };
}

export function loadTs666ActivePatch(): Ts666Patch {
  try {
    const raw = localStorage.getItem(TS666_ACTIVE_PATCH_KEY);
    if (raw) return normalizeTs666Patch(JSON.parse(raw) as Partial<Ts666Patch>);
  } catch {
    // ignore
  }
  return createCleanBassInit666();
}

export function saveTs666ActivePatch(patch: Ts666Patch): void {
  const serialized = JSON.stringify(patch);
  try {
    localStorage.setItem(TS666_ACTIVE_PATCH_KEY, serialized);
  } catch {
    // ignore
  }
  void mirrorKeyToIndexedDb(TS666_ACTIVE_PATCH_KEY, serialized);
}

export function loadTs666UserPresets(): Ts666Patch[] {
  try {
    const raw = localStorage.getItem(TS666_USER_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => normalizeTs666Patch(p as Partial<Ts666Patch>));
  } catch {
    return [];
  }
}

export function saveTs666UserPresets(presets: Ts666Patch[]): void {
  const serialized = JSON.stringify(presets);
  try {
    localStorage.setItem(TS666_USER_PRESETS_KEY, serialized);
  } catch {
    // ignore
  }
  void mirrorKeyToIndexedDb(TS666_USER_PRESETS_KEY, serialized);
}

export function createDefaultTs666SequencerState(): Ts666SequencerState {
  const patterns: Record<string, Ts666Pattern> = {};
  const patternOrder: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const id = `T${i}`;
    patternOrder.push(id);
    patterns[id] = {
      id,
      name: `666 Pattern ${i}`,
      notes: [],
    };
  }
  return {
    activePatternId: 'T1',
    patternOrder,
    patterns,
    showKeyboard: true,
  };
}

export function normalizeTs666SequencerState(raw: unknown): Ts666SequencerState {
  const defaults = createDefaultTs666SequencerState();
  if (!raw || typeof raw !== 'object') return defaults;
  const r = raw as Partial<Ts666SequencerState>;
  const patterns: Record<string, Ts666Pattern> = { ...defaults.patterns };
  if (r.patterns && typeof r.patterns === 'object') {
    for (const [id, pat] of Object.entries(r.patterns)) {
      if (pat && typeof pat === 'object') {
        patterns[id] = {
          id,
          name: typeof pat.name === 'string' && pat.name.trim() ? pat.name : id,
          notes: Array.isArray(pat.notes) ? pat.notes : [],
        };
      }
    }
  }
  const order =
    Array.isArray(r.patternOrder) && r.patternOrder.length > 0
      ? r.patternOrder.filter((id) => Boolean(patterns[id]))
      : defaults.patternOrder;
  const activePatternId =
    typeof r.activePatternId === 'string' && patterns[r.activePatternId]
      ? r.activePatternId
      : order[0] ?? 'T1';
  return {
    activePatternId,
    patternOrder: order.length > 0 ? order : defaults.patternOrder,
    patterns,
    showKeyboard: typeof r.showKeyboard === 'boolean' ? r.showKeyboard : true,
  };
}
