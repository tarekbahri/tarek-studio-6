# AetherWave Synth — Mobile Landscape Wavetable Synthesizer

A professional, polyphonic Web Audio API wavetable synthesizer inspired by Xfer Serum and modern studio VST instruments, engineered specifically for low-latency Android mobile landscape touch performance and responsive desktop use.

## User Review & Critical Decisions

> [!IMPORTANT]
> The interactive clarification prompts were skipped, so the plan proceeds with the recommended studio architecture and visual defaults outlined below. Please approve to begin implementation, or request revisions if you prefer an alternative layout or theme.

- **Workspace Layout (Default)**: Compact tabbed studio rack (`Oscillators`, `Modulation`, `Effects`, `Matrix`) paired with a persistent bottom multitouch piano keyboard and an always-visible Master & Filter strip, ensuring zero cramped scrolling on mobile landscape viewports while expanding into a multi-column studio console on wider screens.
- **Touch & Modulation Ergonomics (Default)**: Vertical pointer-drag rotary knobs with fine-control precision and live tabular numeric readouts, paired with a tap-to-assign modulation matrix and interactive LFO shape canvas editor.
- **Aesthetic & Sound Bank (Default)**: Deep obsidian-slate studio hardware chassis (`#0B0E14` / `#131822`) with electric cyan (`#22D3EE`) and amber-gold (`#F59E0B`) functional accents, loaded with 12 playable factory presets across Bass, Lead, Pad, Pluck, and FX categories.

---

## 1. Overview & Core Concept

- **What It Does**: Delivers a real-time polyphonic wavetable synthesizer directly in the mobile and desktop browser using the Web Audio API. Musicians can sculpt sounds across three independent wavetable oscillators, route them through a resonant multimode filter with saturation drive, shape dynamics and timbre with dual ADSR envelopes and two drawable LFOs, process audio through five studio effects, and perform polyphonically with multitouch glissando on an interactive multi-octave keyboard.
- **Target Audience / Persona**: Mobile electronic music producers, sound designers, and performers using Android phones in landscape orientation (as well as tablet and desktop producers) who want genuine Serum-grade sound design rather than a toy keyboard.
- **Key Value**: Zero-install, low-latency polyphonic audio synthesis with tactile touch ergonomics, live oscilloscope/wavetable visualization, and persistent custom preset management.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Immediate Performance & Audio Unlock**: Tapping any piano key or control seamlessly resumes the browser `AudioContext` on the first gesture, triggering real-time polyphonic audio with live oscilloscope feedback in the top transport bar.
  2. **Oscillator & Wavetable Sculpting**: On the Oscillators rack, users toggle OSC A, OSC B, and OSC C independently, swipe or scrub the wavetable position knob to morph harmonics in real time, and adjust octave, semitone, fine detune, unison/stereo spread, and level.
  3. **Filter & Envelope Shaping**: Users switch filter topologies (Lowpass 12dB/24dB, Highpass, Bandpass, Notch), sweep Cutoff/Resonance/Drive knobs, and sculpt Amplitude ADSR and Modulation ADSR curves with draggable or knob-controlled breakpoints reflected on an interactive SVG envelope curve.
  4. **LFO & Modulation Routing**: Users edit LFO 1 and LFO 2 waveforms directly on a touch canvas (with preset shapes: Sine, Triangle, Saw, Ramp, Square, S&H, or custom points), set Sync/Free rate and depth, and assign modulation targets (Osc Pitch, Wavetable Pos, Filter Cutoff, Amp Level, Pan) with bipolar depth sliders in the Modulation Matrix.
  5. **Effects Rack & Mastering**: Users enable, reorder/configure, and dial wet/dry and DSP parameters for Distortion, Chorus, Delay (with stereo feedback), Algorithmic Reverb, and Master Compressor.
  6. **Preset Management**: Users browse factory and user patches from a clean Preset Drawer, save current sound parameters under custom names, duplicate/rename/delete user patches, and export/import JSON patch banks.
  7. **Multitouch Landscape Keyboard**: Pinned along the bottom 32–36% of the landscape screen (`touch-action: none`), supporting simultaneous multi-finger chords, smooth finger-slide glissando across keys, octave shift (`C1`–`C6`), sustain/hold latch, and pitch/mod touch strips on the left flank.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Precision modern VST hardware workstation—dark anodized aluminum panels, crisp hairline dividers, illuminated parameter arcs, and live waveform/spectrum telemetry.
  - *Color Palette & Mood (60-30-10)*:
    - **60% Canvas**: Deep obsidian slate (`#0B0E14`) background canvas.
    - **30% Structural Surfaces**: Brushed studio panel surfaces (`#131822` and `#1A2130`) with subtle `1px` borders (`#263042`) and crisp `#E2E8F0` / `#94A3B8` typography.
    - **10% Functional Accent**: Electric Cyan (`#22D3EE`) for active oscillators, waveform traces, and knob value arcs; Warm Amber (`#F59E0B`) for filter drive, modulation intensity, and active audio indicators.
  - *Typography & Hierarchy*:
    - Display / Brand & Section Titles: `Outfit` (SemiBold 600, tight tracking).
    - Controls & Body Labels: `Plus Jakarta Sans` (Medium 500, crisp legibility on dark surfaces with optical tracking).
    - Numeric Parameter Readouts: `JetBrains Mono` with `tabular-nums` so values (`1240 Hz`, `-12.4 dB`, `+7 st`) never jitter during live knob drags.
  - *Component Styling & Layout*:
    - Compact top header bar (`48px` height on mobile landscape) containing: Synth Wordmark, Preset Selector trigger, Live Mini Oscilloscope, Master Volume, and Voice/Audio Panic button.
    - Middle studio rack (`flex-1` responsive grid/tabs): Module switcher tabs (`OSC`, `FILTER / ENV`, `LFO / MATRIX`, `FX`) on compact landscape phone screens, expanding to multi-panel side-by-side racks on tablets and desktop viewports (`lg:` shows OSC + Filter/Env or tabbed sub-decks cleanly without dead space).
    - Interactive touch targets $\ge 44\text{px}$ on all switches, octave buttons, and preset items; custom pointer-capture vertical drag rotary knobs with double-tap reset to default value.
    - Clean anti-slop discipline: no decorative pulsing dots, no fake telemetry bars, no nested card clutter, and single-line `whitespace-nowrap` tab/button labels.

- **Interactive Feedback & Motion**:
  - Knob rotation arcs and numeric readouts update synchronously at 60fps during pointer drags; double-tap smoothly resets a parameter to its default.
  - Subtle `150ms` cubic-bezier transitions on module switches and active key presses (`scale` / glow luminance via compositor properties only).
  - Visual modulation rings around destination knobs show real-time LFO/Env modulation offsets.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: True Polyphonic Voice Pool with Custom `PeriodicWave` Wavetables**
  - *Chosen Approach*: Maintain a pre-allocated polyphonic voice manager (up to 8–10 simultaneous voices with voice-stealing) where each voice builds 3 Web Audio `OscillatorNode`s using synthesized `PeriodicWave` tables derived from morphable wavetable frames (Analog, Digital PWM, Formant, FM Bell, Acid, Sub Harmonic, Metallic, Vocal), routed into per-voice `BiquadFilterNode` + `WaveShaperNode` + `GainNode` ADSR envelopes.
  - *Why*: Standard `sawtooth`/`square` oscillators alone cannot deliver Serum-style wavetable morphing. Real-time Fourier-coefficient interpolation via `createPeriodicWave` produces rich harmonic morphing with low CPU overhead and zero AudioWorklet compatibility issues on mobile Android Chrome.
  - *Alternatives Considered*: `AudioWorkletProcessor` custom sample-by-sample DSP; avoided as primary path due to strict bundler/CORS quirks and mobile battery overhead, though `PeriodicWave` + native C++ Web Audio nodes run reliably at hardware buffer latency across all Android browsers.

- **Decision 2: Landscape-First Tabbed Studio Rack + Persistent Filter & Keyboard**
  - *Chosen Approach*: On mobile landscape (`height < 520px`), keep the top transport bar (`44–48px`) and bottom multitouch keyboard (`34%` height) anchored, while the central studio rack switches cleanly between `Oscillators (A/B/C)`, `Filter & Envelopes`, `LFO & Mod Matrix`, and `Effects (5-Unit Rack)`. On wider/taller screens (`md:` / `lg:`), display multiple modules simultaneously.
  - *Why*: Attempting to cram 35+ rotary knobs, 3 wavetable scopes, 2 ADSRs, 2 LFOs, 5 effects, and a playable piano into a 360px-tall phone viewport all at once shrinks knobs below usable finger size. Tabbed studio racks preserve generous $\ge 44\text{px}$ touch targets while keeping the keyboard always playable for real-time sound tweaking.
  - *Alternatives Considered*: Long vertical scrolling page; rejected because dragging rotary knobs vertically conflicts with vertical page scrolling on mobile browsers.

- **Decision 3: Pointer Events Multitouch Keyboard (`pointerdown`/`pointermove`/`pointerup`)**
  - *Chosen Approach*: Implement the piano keyboard using unified Pointer Events with `touch-action: none` and pointer ID tracking (`Map<pointerId, midiNote>`), enabling true multi-finger chords and smooth finger-slide glissando between adjacent keys, plus optional QWERTY keyboard mapping on desktop.
  - *Why*: Standard React `onClick` or single-touch handlers fail on mobile chords and cause stuck notes when fingers slide off keys. Tracking `pointerId` across the keyboard surface guarantees zero stuck notes and low-latency Android touch response.

- **Decision 4: LocalStorage Persistence & JSON Bank Export**
  - *Chosen Approach*: Store user-created presets and active patch state in `localStorage` alongside 12 curated factory presets, with import/export JSON support.
  - *Why*: Instant zero-latency saving/loading offline on Android browsers without requiring account sign-in.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### System Architecture & Audio Signal Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          SYNTH UI SHELL (React)                              │
│  ┌──────────────┐  ┌──────────────────────────────┐  ┌────────────────────┐  │
│  │ Top Bar      │  │ Studio Module Rack           │  │ Preset Drawer      │  │
│  │ • Preset Nav │  │ • OSC A / B / C + Wavetable  │  │ • 12 Factory       │  │
│  │ • Scope      │  │ • Multimode Filter + Drive   │  │ • User Save/Delete │  │
│  │ • Master Vol │  │ • Amp & Mod ADSR Envelopes   │  │ • JSON Import/Exp  │  │
│  │ • Panic      │  │ • LFO 1 / LFO 2 + Mod Matrix │  └────────────────────┘  │
│  └──────────────┘  │ • 5-Unit Effects Rack        │                          │
│                    └──────────────────────────────┘                          │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Persistent Multitouch Piano Keyboard (Pointer ID Tracking + Pitch/Mod) │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │ Patch State & Note Events
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     WEB AUDIO SYNTHESIS ENGINE                               │
│                                                                              │
│  [Polyphonic Voice Pool (8 Voices)]                                          │
│   ├─ OSC A (PeriodicWave, Oct/Semi/Detune, WT Pos, Level, Pan)               │
│   ├─ OSC B (PeriodicWave, Oct/Semi/Detune, WT Pos, Level, Pan)               │
│   ├─ OSC C (PeriodicWave, Oct/Semi/Detune, WT Pos, Level, Pan)               │
│   └─ Per-Voice Filter (WaveShaper Drive -> BiquadFilter) -> Amp ADSR Gain    │
│                                      │                                       │
│  [Global Modulation Engine]          │                                       │
│   ├─ LFO 1 & LFO 2 (Custom Shapes) ──┼─► Mod Matrix (Cutoff, Pitch, WT, Amp) │
│   └─ Mod ADSR Envelope ──────────────┘                                       │
│                                      ▼                                       │
│  [Master Effects Bus (Serial Chain with Wet/Dry Mix)]                        │
│   Distortion ─► Chorus ─► Stereo Delay ─► Algorithmic Reverb ─► Compressor   │
│                                      │                                       │
│                                      ▼                                       │
│                        AnalyserNode (Scope) ─► Master Gain ─► Destination    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **`SynthPatch` (Complete Sound Snapshot)**:
  - `id`, `name`, `category` (`Bass` | `Lead` | `Pad` | `Pluck` | `Keys` | `FX`), `isFactory`
  - `oscillators`: Array of 3 `OscillatorConfig` objects (`enabled`, `wavetableId`, `wtPosition` [0–1], `octave` [-3..+3], `semitone` [-12..+12], `detune` [-100..+100 cents], `level` [0..1], `pan` [-1..1], `unisonVoices` [1..3], `unisonDetune` [0..1])
  - `filter`: `{ enabled, type ('lowpass' | 'highpass' | 'bandpass' | 'notch'), slope (12 | 24), cutoff (20–20000 Hz), resonance (0.1–20), drive (0–1), envAmount (-1..1) }`
  - `ampEnv` & `modEnv`: `{ attack, decay, sustain, release }`
  - `lfos`: Tuple of 2 `LfoConfig` objects (`rateHz`, `depth`, `waveform` array of normalized points / preset shape, `retrigger`, `bipolar`)
  - `modMatrix`: Array of active `ModRoute` bindings (`id`, `source` (`LFO1` | `LFO2` | `MOD_ENV`), `target` (`FILTER_CUTOFF` | `OSC_A_PITCH` | `OSC_B_PITCH` | `OSC_C_PITCH` | `OSC_A_WT` | `OSC_B_WT` | `OSC_C_WT` | `AMP_LEVEL`), `amount` [-1..1])
  - `effects`:
    - `distortion`: `{ enabled, drive, tone, mix }`
    - `chorus`: `{ enabled, rate, depth, mix }`
    - `delay`: `{ enabled, time, feedback, mix }`
    - `reverb`: `{ enabled, size, damping, mix }`
    - `compressor`: `{ enabled, threshold, ratio, attack, release, makeup }`
  - `master`: `{ volume, glideMs, pitchBendRange }`

### Interactive Component & State Mapping

- **Rotary Knob & Touch Sliders**: Vertical pointer capture tracks `clientY` delta (`pointermove`) with sensitivity scaling (`shift`/slow-drag precision) and updates patch state immediately; `AudioEngine` applies smooth `setTargetAtTime` parameter ramps to prevent zipper noise.
- **Wavetable Preview & Position Scrubbing**: Updating `wtPosition` or `wavetableId` recomputes interpolated Fourier coefficients into a cached `PeriodicWave` and pushes it live to all active voices and the 2D/3D-stacked harmonic SVG/Canvas display.
- **LFO Shape Editor**: Users tap preset shape buttons or draw points directly on the LFO SVG/Canvas (`pointerdown`/`pointermove` constrained to `[0..1]`), updating the live modulation lookup table for LFO 1 / LFO 2.
- **Modulation Matrix**: Tap `+ Add Route` or select source/target/depth; a 60fps `requestAnimationFrame` modulation loop (and Web Audio node connections where sample-accurate) applies LFO and Mod Envelope offsets to active voices and visual parameter rings.
- **Multitouch Piano Keyboard**: Tracks active pointers by `pointerId` across white and black keys; sliding a finger smoothly releases the previous MIDI note and triggers the new note; includes Hold/Sustain toggle, Octave `-`/`+` buttons, and Pitch Bend / Mod Wheel touch strips.
- **Responsive Viewport Orientation**: CSS viewport lock (`h-dvh overflow-hidden select-none`) prevents accidental rubber-band scrolling during knob drags and keyboard play on Android Chrome, with a responsive landscape hint when held in narrow portrait mode (while remaining usable in portrait too).
