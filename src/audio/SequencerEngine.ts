import type { BeatboxStep, DrumTrackId } from '../types/beatbox';
import type {
  DawPattern,
  DawSequencerState,
  DawTrackConfig,
  DawTrackId,
  TimeSignatureId,
} from '../types/daw';
import type { MidiNote } from '../types/sequencer';
import { beatboxEngine } from './BeatboxEngine';
import { DRUM_TRACK_ORDER } from './beatboxPresets';
import {
  DAW_TRACK_ORDER,
  evaluateAutomationValue,
  getTimeSignatureInfo,
} from './dawPresets';
import { midiBus } from './MidiBus';
import { studioAudio } from './StudioAudio';
import { subbassEngine } from './SubbassEngine';
import { synthEngine } from './SynthEngine';
import { sixSixSixEngine } from './ts666/SixSixSixEngine';

export class SequencerEngine {
  private isPlaying = false;
  private isPaused = false;
  private pausedGlobalStep = 0;

  private bpm = 124;
  private loop = true;
  private timeSignature: TimeSignatureId = '4/4';
  private metronomeEnabled = false;

  // Existing SERUM, SUBBASS, TS666 & BEATBOX standalone pattern data
  private notes: MidiNote[] = [];
  private subbassNotes: MidiNote[] = [];
  private ts666Notes: MidiNote[] = [];
  private beatboxPianoRollNotes: MidiNote[] = [];
  private beatboxSteps: Record<DrumTrackId, BeatboxStep[]> | null = null;
  private beatboxSwing = 0;
  private midiBeatboxToSerum = false;

  // Unified SEQUENCER plugin state (Step Seq, Piano Roll, Song Mode, Automation)
  private daw: DawSequencerState | null = null;

  private anchorAudioTime = 0;
  private lastScheduledGlobalStep = -0.0001;
  private schedulerTimer: number | null = null;
  private rafId: number | null = null;
  private lastPlayheadEmitTs = 0;
  private lastEmittedIntStep = -1;
  private lastAutoApplyTs = 0;
  private hasActiveAutomation = false;

  private playheadListener:
    | ((step16: number, isPlaying: boolean, dawStep: number) => void)
    | null = null;
  private onAutoStop: (() => void) | null = null;

  public setConfig(bpm: number, loop: boolean, notes: MidiNote[]): void {
    const prevBpm = this.bpm;
    this.bpm = Math.max(40, Math.min(240, bpm));
    this.loop = loop;
    this.notes = notes;

    // Preserve playhead position seamlessly when BPM changes mid-playback
    if (this.isPlaying && prevBpm !== this.bpm) {
      const now = studioAudio.getCurrentTime();
      if (now !== null) {
        const oldStepSec = 60 / prevBpm / 4;
        const currentGlobalStep = (now - this.anchorAudioTime) / oldStepSec;
        const newStepSec = 60 / this.bpm / 4;
        this.anchorAudioTime = now - currentGlobalStep * newStepSec;
        this.lastScheduledGlobalStep = currentGlobalStep;
      }
    }
  }

  public setSubbassNotes(notes: MidiNote[]): void {
    this.subbassNotes = notes;
  }

  public setTs666Notes(notes: MidiNote[]): void {
    this.ts666Notes = notes;
  }

  public setBeatboxPianoRollNotes(notes: MidiNote[]): void {
    this.beatboxPianoRollNotes = notes;
  }

  public setBeatboxConfig(
    steps: Record<DrumTrackId, BeatboxStep[]> | null,
    swing: number,
    midiBeatboxToSerum: boolean
  ): void {
    this.beatboxSteps = steps;
    this.beatboxSwing = Math.max(0, Math.min(0.65, swing));
    this.midiBeatboxToSerum = midiBeatboxToSerum;
  }

  public setTimeAndMetronome(
    timeSignature: TimeSignatureId,
    metronomeEnabled: boolean
  ): void {
    this.timeSignature = timeSignature;
    this.metronomeEnabled = metronomeEnabled;
  }

  public setDawConfig(daw: DawSequencerState | null): void {
    this.daw = daw;
    this.hasActiveAutomation = Boolean(
      daw &&
        Object.values(daw.automationLanes).some(
          (lane) => lane && lane.enabled && lane.points.length > 0
        )
    );
    if (!this.isPlaying) {
      this.applyAutomationAtStep(0, true);
    }
  }

  public setListeners(
    onPlayhead: ((step16: number, isPlaying: boolean, dawStep: number) => void) | null,
    onStopCallback: (() => void) | null
  ): void {
    this.playheadListener = onPlayhead;
    this.onAutoStop = onStopCallback;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  private getActiveRangeInfo(): {
    startStep: number;
    lengthSteps: number;
    stepsPerBar: number;
    stepsPerBeat: number;
    accentBeats: number[];
  } {
    const ts = getTimeSignatureInfo(this.timeSignature);
    const hasClips = Boolean(this.daw?.song.clips.length);
    if (this.daw && this.daw.playMode === 'song' && hasClips) {
      const song = this.daw.song;
      if (song.loopSectionEnabled && song.loopEndBar > song.loopStartBar) {
        const startStep = song.loopStartBar * ts.stepsPerBar;
        const lengthSteps = Math.max(
          ts.stepsPerBar,
          (song.loopEndBar - song.loopStartBar) * ts.stepsPerBar
        );
        return {
          startStep,
          lengthSteps,
          stepsPerBar: ts.stepsPerBar,
          stepsPerBeat: ts.stepsPerBeat,
          accentBeats: ts.accentBeats,
        };
      }
      let maxClipEndBar = 1;
      for (const clip of song.clips) {
        const endBar = clip.startBar + clip.lengthBars;
        if (endBar > maxClipEndBar) maxClipEndBar = endBar;
      }
      const effectiveBars = Math.min(song.totalBars, Math.max(1, maxClipEndBar));
      return {
        startStep: 0,
        lengthSteps: Math.max(ts.stepsPerBar, effectiveBars * ts.stepsPerBar),
        stepsPerBar: ts.stepsPerBar,
        stepsPerBeat: ts.stepsPerBeat,
        accentBeats: ts.accentBeats,
      };
    }

    const activePat = this.daw
      ? this.daw.patterns[this.daw.activePatternId]
      : undefined;
    const lengthSteps = activePat ? activePat.stepCount : ts.stepsPerBar;
    return {
      startStep: 0,
      lengthSteps,
      stepsPerBar: ts.stepsPerBar,
      stepsPerBeat: ts.stepsPerBeat,
      accentBeats: ts.accentBeats,
    };
  }

  private getRawElapsedStep(): number {
    if (!this.isPlaying) return this.isPaused ? this.pausedGlobalStep : 0;
    const now = studioAudio.getCurrentTime();
    if (now === null) return 0;
    const stepSec = 60 / this.bpm / 4;
    return Math.max(0, (now - this.anchorAudioTime) / stepSec);
  }

  public getCurrentStep(): number {
    return this.getRawElapsedStep() % 16;
  }

  public getDawStep(): number {
    const raw = this.getRawElapsedStep();
    const range = this.getActiveRangeInfo();
    return range.startStep + (raw % range.lengthSteps);
  }

  public async start(): Promise<void> {
    if (this.isPlaying) return;
    const ctx = await studioAudio.ensureAudio();
    await Promise.all([
      synthEngine.ensureAudio(),
      subbassEngine.ensureAudio(),
      sixSixSixEngine.ensureAudio(),
    ]);
    const stepSec = 60 / this.bpm / 4;
    const resumeStep = this.isPaused ? this.pausedGlobalStep : 0;

    this.isPlaying = true;
    this.isPaused = false;
    this.anchorAudioTime = ctx.currentTime + 0.035 - resumeStep * stepSec;
    this.lastScheduledGlobalStep = resumeStep - 0.0001;
    this.lastPlayheadEmitTs = 0;
    this.lastEmittedIntStep = -1;

    this.schedulerTimer = window.setInterval(() => {
      this.scheduleTick();
    }, 25);
    this.scheduleTick();
    this.startPlayheadRaf();
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.pausedGlobalStep = this.getRawElapsedStep();
    this.isPlaying = false;
    this.isPaused = true;

    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    synthEngine.panic();
    beatboxEngine.panic();
    subbassEngine.panic();
    sixSixSixEngine.panic();

    const range = this.getActiveRangeInfo();
    const dawStep = range.startStep + (this.pausedGlobalStep % range.lengthSteps);
    this.playheadListener?.(this.pausedGlobalStep % 16, false, dawStep);
  }

  public stop(resetPlayhead = true): void {
    this.isPlaying = false;
    this.isPaused = false;
    if (resetPlayhead) {
      this.pausedGlobalStep = 0;
    }
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    synthEngine.panic();
    beatboxEngine.panic();
    subbassEngine.panic();
    sixSixSixEngine.panic();
    this.clearAllAutomation();
    if (this.playheadListener) {
      const range = this.getActiveRangeInfo();
      this.playheadListener(
        resetPlayhead ? 0 : this.getCurrentStep(),
        false,
        resetPlayhead ? range.startStep : this.getDawStep()
      );
    }
  }

  private clearAllAutomation(): void {
    synthEngine.clearAutomationOverrides();
    beatboxEngine.setAutomationDriveOverride(null);
    studioAudio.setAutomationBusLevels(null, null);
  }

  private applyAutomationAtStep(dawStep: number, clearIfInactive = false): void {
    if (!this.daw) {
      if (clearIfInactive) this.clearAllAutomation();
      return;
    }
    const lanes = this.daw.automationLanes;
    const range = this.getActiveRangeInfo();

    // Map current playback position onto the automation editor coordinate space (0..64)
    const span = Math.max(1, range.lengthSteps);
    const norm01 = Math.max(0, Math.min(1, (dawStep - range.startStep) / span));
    const curveMax = this.daw.playMode === 'song' ? 64 : range.lengthSteps;
    const evalStep = norm01 * curveMax;

    const cutoff = evaluateAutomationValue(lanes['serum.cutoff'], evalStep, curveMax);
    const resonance = evaluateAutomationValue(lanes['serum.resonance'], evalStep, curveMax);
    const wtPosition = evaluateAutomationValue(lanes['serum.wtPosition'], evalStep, curveMax);
    const lfoRate = evaluateAutomationValue(lanes['serum.lfoRate'], evalStep, curveMax);
    const lfoDepth = evaluateAutomationValue(lanes['serum.lfoDepth'], evalStep, curveMax);
    const serumVol = evaluateAutomationValue(lanes['serum.volume'], evalStep, curveMax);
    const beatboxVol = evaluateAutomationValue(lanes['beatbox.volume'], evalStep, curveMax);
    const beatboxDrive = evaluateAutomationValue(lanes['beatbox.drive'], evalStep, curveMax);

    synthEngine.setAutomationOverrides({
      cutoff,
      resonance,
      wtPosition,
      lfoRate,
      lfoDepth,
      volume: serumVol,
    });
    beatboxEngine.setAutomationDriveOverride(beatboxDrive);
    studioAudio.setAutomationBusLevels(serumVol, beatboxVol);
  }

  private scheduleDawPatternStep(
    pat: DawPattern,
    stepIdx: number,
    hitTimeBase: number,
    stepSec: number,
    tracksConfig: Record<DawTrackId, DawTrackConfig>,
    trackOrder?: DawTrackId[],
    trackFilterId?: DawTrackId
  ): void {
    const swingOffset = stepIdx % 2 === 1 ? pat.swing * 0.5 * stepSec : 0;
    const hitTime = hitTimeBase + swingOffset;
    const order = trackOrder && trackOrder.length > 0 ? trackOrder : DAW_TRACK_ORDER;
    const anySolo = order.some((tid) => tracksConfig[tid]?.solo);
    const audible = studioAudio.getPluginAuditability();
    const targetTrackIds = trackFilterId ? [trackFilterId] : order;

    for (const tid of targetTrackIds) {
      const cfg = tracksConfig[tid];
      if (!cfg || cfg.muted || (anySolo && !cfg.solo)) continue;
      if (!audible[cfg.target]) continue;

      // Full 8-drum Beatbox Kit track (beatbox target without fixed drumTrackId)
      if (cfg.target === 'beatbox' && !cfg.drumTrackId) {
        for (const drumId of DRUM_TRACK_ORDER) {
          const kitCell =
            pat.tracks[`${tid}:${drumId}`]?.[stepIdx] ??
            pat.tracks[drumId]?.[stepIdx];
          if (!kitCell?.active) continue;
          if (kitCell.probability < 0.995 && Math.random() > kitCell.probability) {
            continue;
          }
          const vel = Math.max(0.08, Math.min(1.0, kitCell.velocity * cfg.volume));
          let resolvedDrum = drumId;
          if (resolvedDrum === 'ch' && kitCell.length >= 1.5) {
            resolvedDrum = 'oh';
          }
          beatboxEngine.scheduleTrack(resolvedDrum, vel, hitTime);
        }
        continue;
      }

      const cell = pat.tracks[tid]?.[stepIdx];
      if (!cell?.active) continue;

      if (cell.probability < 0.995 && Math.random() > cell.probability) {
        continue;
      }

      const vel = Math.max(0.08, Math.min(1.0, cell.velocity * cfg.volume));
      if (cfg.target === 'beatbox') {
        let drumId: DrumTrackId =
          cfg.drumTrackId ??
          (tid === 'hihat'
            ? 'ch'
            : tid === 'kick' || tid === 'snare' || tid === 'perc' || tid === 'clap' || tid === 'ch' || tid === 'oh' || tid === 'rim' || tid === 'crash'
            ? (tid as DrumTrackId)
            : 'kick');
        if (drumId === 'ch' && cell.length >= 1.5) {
          drumId = 'oh';
        }
        beatboxEngine.scheduleTrack(drumId, vel, hitTime);
      } else {
        const durSec = Math.max(0.03, cell.length * stepSec * 0.94);
        const busTarget =
          cfg.target === 'subbass'
            ? 'subbass'
            : cfg.target === 'ts666'
            ? 'ts666'
            : 'serum';
        midiBus.emit({
          type: 'noteOn',
          source: 'piano_roll',
          midi: cell.note,
          velocity: vel,
          time: hitTime,
          target: busTarget,
        });
        if (cfg.target === 'subbass') {
          subbassEngine.scheduleNote(cell.note, vel, hitTime, hitTime + durSec);
        } else if (cfg.target === 'ts666') {
          sixSixSixEngine.scheduleNote(cell.note, vel, hitTime, hitTime + durSec);
        } else {
          synthEngine.scheduleNote(cell.note, vel, hitTime, hitTime + durSec);
        }
      }
    }
  }

  private scheduleDawPianoRollSlice(
    pat: DawPattern,
    sliceStartStep: number,
    sliceEndStep: number,
    sliceAnchorAudioTime: number,
    stepSec: number,
    trackFilterId?: DawTrackId
  ): void {
    const audible = studioAudio.getPluginAuditability();

    // Per-track clip isolation: honor that track's mute/solo/volume/target
    if (trackFilterId && this.daw) {
      const cfg = this.daw.tracks[trackFilterId];
      if (!cfg) return;
      const order =
        this.daw.trackOrder && this.daw.trackOrder.length > 0
          ? this.daw.trackOrder
          : DAW_TRACK_ORDER;
      const anySolo = order.some((tid) => this.daw!.tracks[tid]?.solo);
      if (cfg.muted || (anySolo && !cfg.solo) || !audible[cfg.target]) return;

      for (const note of pat.pianoRollNotes) {
        if (note.step >= pat.stepCount) continue;
        if (note.step > sliceStartStep && note.step <= sliceEndStep) {
          const startAudio = sliceAnchorAudioTime + note.step * stepSec;
          const durSec = Math.max(0.03, note.duration * stepSec * 0.95);
          const endAudio = startAudio + durSec;
          const vel = Math.max(0.08, Math.min(1, note.velocity * cfg.volume));

          if (cfg.target === 'serum') {
            midiBus.emit({
              type: 'noteOn',
              source: 'piano_roll',
              midi: note.midi,
              velocity: vel,
              time: startAudio,
              target: 'serum',
            });
            synthEngine.scheduleNote(note.midi, vel, startAudio, endAudio);
          } else if (cfg.target === 'subbass') {
            midiBus.emit({
              type: 'noteOn',
              source: 'piano_roll',
              midi: note.midi,
              velocity: vel,
              time: startAudio,
              target: 'subbass',
            });
            subbassEngine.scheduleNote(note.midi, vel, startAudio, endAudio);
          } else if (cfg.target === 'ts666') {
            midiBus.emit({
              type: 'noteOn',
              source: 'piano_roll',
              midi: note.midi,
              velocity: vel,
              time: startAudio,
              target: 'ts666',
            });
            sixSixSixEngine.scheduleNote(note.midi, vel, startAudio, endAudio);
          } else {
            beatboxEngine.scheduleByMidiNote(note.midi, vel, startAudio);
          }
        }
      }
      return;
    }

    for (const note of pat.pianoRollNotes) {
      if (note.step >= pat.stepCount) continue;
      if (note.step > sliceStartStep && note.step <= sliceEndStep) {
        const startAudio = sliceAnchorAudioTime + note.step * stepSec;
        const durSec = Math.max(0.03, note.duration * stepSec * 0.95);
        const endAudio = startAudio + durSec;
        const vel = Math.max(0.08, Math.min(1, note.velocity));

        if (
          audible.serum &&
          (note.target === 'serum' || note.target === 'both' || note.target === 'all')
        ) {
          midiBus.emit({
            type: 'noteOn',
            source: 'piano_roll',
            midi: note.midi,
            velocity: vel,
            time: startAudio,
            target: 'serum',
          });
          synthEngine.scheduleNote(note.midi, vel, startAudio, endAudio);
        }
        if (
          audible.subbass &&
          (note.target === 'subbass' || note.target === 'all')
        ) {
          midiBus.emit({
            type: 'noteOn',
            source: 'piano_roll',
            midi: note.midi,
            velocity: vel,
            time: startAudio,
            target: 'subbass',
          });
          subbassEngine.scheduleNote(note.midi, vel, startAudio, endAudio);
        }
        if (
          audible.ts666 &&
          (note.target === 'ts666' || note.target === 'all')
        ) {
          midiBus.emit({
            type: 'noteOn',
            source: 'piano_roll',
            midi: note.midi,
            velocity: vel,
            time: startAudio,
            target: 'ts666',
          });
          sixSixSixEngine.scheduleNote(note.midi, vel, startAudio, endAudio);
        }
        if (
          audible.beatbox &&
          (note.target === 'beatbox' || note.target === 'both' || note.target === 'all')
        ) {
          beatboxEngine.scheduleByMidiNote(note.midi, vel, startAudio);
        }
      }
    }
  }

  private scheduleTick(): void {
    if (!this.isPlaying) return;
    const ctx = studioAudio.getContext();
    if (!ctx) return;
    if ((ctx.state as string) !== 'running') {
      void studioAudio.recoverIfSuspended();
      return;
    }
    const now = ctx.currentTime;
    const stepSec = 60 / this.bpm / 4;
    const lookaheadSec = 0.14;
    const horizonTime = now + lookaheadSec;

    const horizonGlobalStep = (horizonTime - this.anchorAudioTime) / stepSec;
    if (horizonGlobalStep <= this.lastScheduledGlobalStep) return;

    const startSearch = this.lastScheduledGlobalStep;
    const endSearch = horizonGlobalStep;
    const range = this.getActiveRangeInfo();

    // Stop automatically when loop is off
    const hasClips = Boolean(this.daw?.song.clips.length);
    const isSongMode = this.daw?.playMode === 'song' && hasClips;
    const nonLoopLimit = isSongMode ? range.lengthSteps : Math.max(16, range.lengthSteps);
    if (!this.loop && startSearch >= nonLoopLimit) {
      this.stop(true);
      this.onAutoStop?.();
      return;
    }

    // 1. Metronome clicks on exact beats
    if (this.metronomeEnabled) {
      const firstInt = Math.floor(startSearch) + 1;
      const lastInt = Math.floor(endSearch);
      for (let s = firstInt; s <= lastInt; s++) {
        if (s < 0) continue;
        if (!this.loop && s >= nonLoopLimit) continue;
        if (s % range.stepsPerBeat === 0) {
          const stepInBar = ((s % range.stepsPerBar) + range.stepsPerBar) % range.stepsPerBar;
          const beatInBar = Math.floor(stepInBar / range.stepsPerBeat);
          const isAccent = beatInBar === 0 || range.accentBeats.includes(beatInBar);
          studioAudio.scheduleMetronomeClick(this.anchorAudioTime + s * stepSec, isAccent);
        }
      }
    }

    if (isSongMode && this.daw) {
      // SONG MODE: Schedule arranged pattern clips across continuous timeline
      const songLen = range.lengthSteps;
      const startCycle = Math.max(0, Math.floor(startSearch / songLen));
      const endCycle = this.loop ? Math.floor(endSearch / songLen) : 0;

      for (let cycle = startCycle; cycle <= endCycle; cycle++) {
        const cycleGlobalStart = cycle * songLen;
        const firstInt = Math.max(0, Math.floor(startSearch - cycleGlobalStart) + 1);
        const lastInt = Math.min(songLen - 1, Math.floor(endSearch - cycleGlobalStart));

        // Step Sequencer hits inside Song Mode clips
        for (let localStep = firstInt; localStep <= lastInt; localStep++) {
          const songStep = range.startStep + localStep;
          const barIdx = Math.floor(songStep / range.stepsPerBar);
          const stepInBar = songStep - barIdx * range.stepsPerBar;
          const hitTime = this.anchorAudioTime + (cycleGlobalStart + localStep) * stepSec;

          for (const clip of this.daw.song.clips) {
            if (barIdx >= clip.startBar && barIdx < clip.startBar + clip.lengthBars) {
              const pat = this.daw.patterns[clip.patternId];
              if (!pat) continue;
              const patStep = ((barIdx - clip.startBar) * range.stepsPerBar + stepInBar) % pat.stepCount;
              this.scheduleDawPatternStep(
                pat,
                patStep,
                hitTime,
                stepSec,
                this.daw.tracks,
                this.daw.trackOrder,
                clip.trackId
              );
            }
          }
        }

        // Piano Roll MIDI notes inside Song Mode clips (per bar slice to preserve off-grid timing)
        const minBarLocal = Math.floor(Math.max(0, startSearch - cycleGlobalStart) / range.stepsPerBar);
        const maxBarLocal = Math.floor(Math.min(songLen - 0.001, endSearch - cycleGlobalStart) / range.stepsPerBar);
        for (let localBar = minBarLocal; localBar <= maxBarLocal; localBar++) {
          const songBar = Math.floor(range.startStep / range.stepsPerBar) + localBar;
          const barGlobalStart = cycleGlobalStart + localBar * range.stepsPerBar;
          const barWindowStart = Math.max(-0.0001, startSearch - barGlobalStart);
          const barWindowEnd = Math.min(range.stepsPerBar - 0.0001, endSearch - barGlobalStart);
          if (barWindowEnd <= barWindowStart) continue;

          for (const clip of this.daw.song.clips) {
            if (songBar >= clip.startBar && songBar < clip.startBar + clip.lengthBars) {
              const pat = this.daw.patterns[clip.patternId];
              if (!pat || pat.pianoRollNotes.length === 0) continue;
              const patBarOffset = ((songBar - clip.startBar) * range.stepsPerBar) % pat.stepCount;
              const patAnchorAudio =
                this.anchorAudioTime + (barGlobalStart - patBarOffset) * stepSec;
              this.scheduleDawPianoRollSlice(
                pat,
                patBarOffset + barWindowStart,
                patBarOffset + barWindowEnd,
                patAnchorAudio,
                stepSec,
                clip.trackId
              );
            }
          }
        }
      }
    } else {
      // PATTERN MODE:
      // 1. Existing SERUM Piano Roll (16-step pattern) & BEATBOX (16-step pattern)
      const startCycle16 = Math.max(0, Math.floor(startSearch / 16));
      const endCycle16 = this.loop ? Math.floor(endSearch / 16) : 0;
      const audible = studioAudio.getPluginAuditability();

      for (let cycle = startCycle16; cycle <= endCycle16; cycle++) {
        const cycleBase = cycle * 16;

        if (audible.serum) {
          for (const note of this.notes) {
            const noteGlobalStep = cycleBase + note.step;
            if (noteGlobalStep > startSearch && noteGlobalStep <= endSearch) {
              const noteStartAudio = this.anchorAudioTime + noteGlobalStep * stepSec;
              const noteDurSec = Math.max(0.03, note.duration * stepSec * 0.96);
              const noteEndAudio = noteStartAudio + noteDurSec;
              midiBus.emit({
                type: 'noteOn',
                source: 'piano_roll',
                midi: note.midi,
                velocity: note.velocity,
                time: noteStartAudio,
                target: 'serum',
              });
              synthEngine.scheduleNote(
                note.midi,
                note.velocity,
                noteStartAudio,
                noteEndAudio
              );
            }
          }
        }

        // Dedicated SUBBASS Piano Roll (16-step pattern -> strictly routes to SubbassEngine)
        if (audible.subbass) {
          for (const note of this.subbassNotes) {
            const noteGlobalStep = cycleBase + note.step;
            if (noteGlobalStep > startSearch && noteGlobalStep <= endSearch) {
              const noteStartAudio = this.anchorAudioTime + noteGlobalStep * stepSec;
              const noteDurSec = Math.max(0.035, note.duration * stepSec * 0.96);
              const noteEndAudio = noteStartAudio + noteDurSec;
              midiBus.emit({
                type: 'noteOn',
                source: 'piano_roll',
                midi: note.midi,
                velocity: note.velocity,
                time: noteStartAudio,
                target: 'subbass',
              });
              subbassEngine.scheduleNote(
                note.midi,
                note.velocity,
                noteStartAudio,
                noteEndAudio
              );
            }
          }
        }

        // Dedicated 666TS Piano Roll (16-step pattern -> strictly routes to SixSixSixEngine)
        if (audible.ts666) {
          for (const note of this.ts666Notes) {
            const noteGlobalStep = cycleBase + note.step;
            if (noteGlobalStep > startSearch && noteGlobalStep <= endSearch) {
              const noteStartAudio = this.anchorAudioTime + noteGlobalStep * stepSec;
              const noteDurSec = Math.max(0.035, note.duration * stepSec * 0.96);
              const noteEndAudio = noteStartAudio + noteDurSec;
              midiBus.emit({
                type: 'noteOn',
                source: 'piano_roll',
                midi: note.midi,
                velocity: note.velocity,
                time: noteStartAudio,
                target: 'ts666',
              });
              sixSixSixEngine.scheduleNote(
                note.midi,
                note.velocity,
                noteStartAudio,
                noteEndAudio
              );
            }
          }
        }

        // Dedicated BEATBOX Piano Roll (16-step pattern -> strictly routes to BeatboxEngine)
        if (audible.beatbox) {
          for (const note of this.beatboxPianoRollNotes) {
            const noteGlobalStep = cycleBase + note.step;
            if (noteGlobalStep > startSearch && noteGlobalStep <= endSearch) {
              const noteStartAudio = this.anchorAudioTime + noteGlobalStep * stepSec;
              midiBus.emit({
                type: 'noteOn',
                source: 'piano_roll',
                midi: note.midi,
                velocity: note.velocity,
                time: noteStartAudio,
                target: 'beatbox',
              });
              beatboxEngine.scheduleByMidiNote(
                note.midi,
                note.velocity,
                noteStartAudio
              );
            }
          }

          if (this.beatboxSteps) {
            for (let stepIdx = 0; stepIdx < 16; stepIdx++) {
              const drumGlobalStep = cycleBase + stepIdx;
              if (drumGlobalStep > startSearch && drumGlobalStep <= endSearch) {
                const swingOffset =
                  stepIdx % 2 === 1 ? this.beatboxSwing * 0.5 * stepSec : 0;
                const hitTime = this.anchorAudioTime + drumGlobalStep * stepSec + swingOffset;

                for (const trackId of DRUM_TRACK_ORDER) {
                  const cell = this.beatboxSteps[trackId]?.[stepIdx];
                  if (cell?.active) {
                    const vel = cell.accent
                      ? Math.min(1, cell.velocity * 1.15)
                      : cell.velocity;
                    beatboxEngine.scheduleTrack(trackId, vel, hitTime);

                    if (
                      audible.serum &&
                      this.midiBeatboxToSerum &&
                      (trackId === 'kick' || trackId === 'perc')
                    ) {
                      const triggerMidi = trackId === 'kick' ? 36 : 48;
                      synthEngine.scheduleNote(
                        triggerMidi,
                        vel * 0.8,
                        hitTime,
                        hitTime + stepSec * 0.75
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }

      // 2. SEQUENCER Plugin Active Pattern (16 / 32 / 64 step mode + DAW Piano Roll)
      if (this.daw) {
        const activePat = this.daw.patterns[this.daw.activePatternId];
        if (activePat) {
          const patLen = activePat.stepCount;
          const startPatCycle = Math.max(0, Math.floor(startSearch / patLen));
          const endPatCycle = this.loop ? Math.floor(endSearch / patLen) : 0;

          for (let cycle = startPatCycle; cycle <= endPatCycle; cycle++) {
            const cycleBase = cycle * patLen;

            // Step Sequencer active tracks
            const firstInt = Math.max(0, Math.floor(startSearch - cycleBase) + 1);
            const lastInt = Math.min(patLen - 1, Math.floor(endSearch - cycleBase));
            for (let stepIdx = firstInt; stepIdx <= lastInt; stepIdx++) {
              const hitTime = this.anchorAudioTime + (cycleBase + stepIdx) * stepSec;
              this.scheduleDawPatternStep(
                activePat,
                stepIdx,
                hitTime,
                stepSec,
                this.daw.tracks,
                this.daw.trackOrder
              );
            }

            // DAW Piano Roll Notes
            if (activePat.pianoRollNotes.length > 0) {
              this.scheduleDawPianoRollSlice(
                activePat,
                startSearch - cycleBase,
                endSearch - cycleBase,
                this.anchorAudioTime + cycleBase * stepSec,
                stepSec
              );
            }
          }
        }
      }
    }

    this.lastScheduledGlobalStep = endSearch;
  }

  private startPlayheadRaf(): void {
    const tick = (ts: number) => {
      if (!this.isPlaying) return;
      const now = studioAudio.getCurrentTime();
      if (now !== null) {
        const stepSec = 60 / this.bpm / 4;
        const rawStep = Math.max(0, (now - this.anchorAudioTime) / stepSec);
        const range = this.getActiveRangeInfo();
        const isSongMode = Boolean(this.daw?.playMode === 'song' && this.daw.song.clips.length);
        const nonLoopLimit = isSongMode ? range.lengthSteps : Math.max(16, range.lengthSteps);

        if (!this.loop && rawStep >= nonLoopLimit) {
          this.stop(true);
          this.onAutoStop?.();
          return;
        }

        const wrapped16 = rawStep % 16;
        const dawStep = range.startStep + (rawStep % range.lengthSteps);

        // Apply real-time parameter automation directly to DSP nodes (zero React re-renders!)
        if (this.hasActiveAutomation && ts - this.lastAutoApplyTs >= 24) {
          this.lastAutoApplyTs = ts;
          this.applyAutomationAtStep(dawStep, false);
        }

        if (typeof document === 'undefined' || !document.hidden) {
          const intStep = Math.floor(dawStep);
          if (intStep !== this.lastEmittedIntStep || ts - this.lastPlayheadEmitTs >= 42) {
            this.lastEmittedIntStep = intStep;
            this.lastPlayheadEmitTs = ts;
            this.playheadListener?.(wrapped16, true, dawStep);
          }
        }
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }
}

export const sequencerEngine = new SequencerEngine();
