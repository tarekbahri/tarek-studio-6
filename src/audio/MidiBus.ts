export type MidiTargetPlugin = 'serum' | 'beatbox' | 'subbass' | 'ts666';

export type MidiEvent =
  | {
      type: 'noteOn';
      source: 'keyboard' | 'piano_roll' | 'beatbox' | 'external_midi';
      midi: number;
      velocity: number;
      time?: number;
      target?: MidiTargetPlugin;
    }
  | {
      type: 'noteOff';
      source: 'keyboard' | 'piano_roll' | 'beatbox' | 'external_midi';
      midi: number;
      time?: number;
      target?: MidiTargetPlugin;
    };

type MidiListener = (event: MidiEvent) => void;
type ActivityListener = (active: boolean, lastLabel: string) => void;

class StudioMidiBus {
  private listeners = new Set<MidiListener>();
  private activityListeners = new Set<ActivityListener>();
  private clearTimer: number | null = null;
  private webMidiInitialized = false;
  private connectedInputs = 0;

  public subscribe(listener: MidiListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeActivity(listener: ActivityListener): () => void {
    this.activityListeners.add(listener);
    return () => {
      this.activityListeners.delete(listener);
    };
  }

  public emit(event: MidiEvent): void {
    for (const l of this.listeners) {
      l(event);
    }
    if (event.type === 'noteOn') {
      const label = `MIDI ${event.midi}`;
      for (const al of this.activityListeners) {
        al(true, label);
      }
      if (this.clearTimer !== null) window.clearTimeout(this.clearTimer);
      this.clearTimer = window.setTimeout(() => {
        for (const al of this.activityListeners) {
          al(false, '');
        }
      }, 150);
    }
  }

  public async initWebMidi(
    onExternalNoteOn: (midi: number, velocity: number) => void,
    onExternalNoteOff: (midi: number) => void
  ): Promise<number> {
    if (this.webMidiInitialized) return this.connectedInputs;
    this.webMidiInitialized = true;
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<{
        inputs: Map<string, { onmidimessage: ((e: { data: Uint8Array }) => void) | null }>;
      }>;
    };
    if (!nav.requestMIDIAccess) return 0;
    try {
      const access = await nav.requestMIDIAccess();
      let count = 0;
      access.inputs.forEach((input) => {
        count++;
        input.onmidimessage = (msg: { data: Uint8Array | null }) => {
          if (!msg.data || msg.data.length < 3) return;
          const [status, data1, data2] = msg.data;
          const cmd = status & 0xf0;
          if (cmd === 0x90 && data2 > 0) {
            const vel = data2 / 127;
            this.emit({ type: 'noteOn', source: 'external_midi', midi: data1, velocity: vel });
            onExternalNoteOn(data1, vel);
          } else if (cmd === 0x80 || (cmd === 0x90 && data2 === 0)) {
            this.emit({ type: 'noteOff', source: 'external_midi', midi: data1 });
            onExternalNoteOff(data1);
          }
        };
      });
      this.connectedInputs = count;
      return count;
    } catch {
      return 0;
    }
  }
}

export const midiBus = new StudioMidiBus();
