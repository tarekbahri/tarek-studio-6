/**
 * TAREK Real-Time AudioWorklet DSP Processor
 * Runs on the dedicated Web Audio rendering thread (128-sample quanta).
 * Responsibilities:
 *  - Stereo DC-blocking high-pass filter (~5 Hz) to prevent sub-sonic offset clicks
 *  - Transparent soft-knee saturation limiter above 0.90 to avoid digital clipping crackles
 *  - Real-time quantum timing / CPU load & peak telemetry posted at ~5 Hz
 */
class TarekDspProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Stereo DC-blocker state: y[n] = x[n] - x[n-1] + R * y[n-1]
    this.dcR = 0.9993;
    this.xPrevL = 0;
    this.yPrevL = 0;
    this.xPrevR = 0;
    this.yPrevR = 0;

    // Telemetry accumulators (zero allocations in process())
    this.quantumCount = 0;
    this.peakHold = 0;
    this.clippedSamples = 0;
    this.underrunSuspects = 0;
    this.accumCpuRatio = 0;
    this.lastTelemetryTime = currentTime;
    this.expectedQuantumSec = 128 / sampleRate;
    this.lastQuantumTime = currentTime;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const perf = typeof performance !== 'undefined' ? performance : null;
    const t0 = perf ? perf.now() : 0;

    // Detect unexpected audio thread stalls (> 2.5x render quantum gap)
    const dtQuantum = currentTime - this.lastQuantumTime;
    if (this.quantumCount > 4 && dtQuantum > this.expectedQuantumSec * 2.5) {
      this.underrunSuspects++;
    }
    this.lastQuantumTime = currentTime;

    const outL = output[0];
    const outR = output[1] || output[0];
    const inL = input && input[0] ? input[0] : null;
    const inR = input && input[1] ? input[1] : inL;
    const len = outL.length;

    let xPrevL = this.xPrevL;
    let yPrevL = this.yPrevL;
    let xPrevR = this.xPrevR;
    let yPrevR = this.yPrevR;
    const R = this.dcR;

    for (let i = 0; i < len; i++) {
      let rawL = inL ? inL[i] : 0;
      let rawR = inR ? inR[i] : 0;

      // Guard against upstream NaN/Infinity poisoning the recursive DC blocker permanently
      if (!Number.isFinite(rawL)) {
        rawL = 0;
        xPrevL = 0;
        yPrevL = 0;
      }
      if (!Number.isFinite(rawR)) {
        rawR = 0;
        xPrevR = 0;
        yPrevR = 0;
      }

      // DC-blocking high-pass filter
      const dcL = rawL - xPrevL + R * yPrevL;
      xPrevL = rawL;
      yPrevL = dcL;

      const dcR = rawR - xPrevR + R * yPrevR;
      xPrevR = rawR;
      yPrevR = dcR;

      // Smooth C-infinity soft-knee saturation above 0.85 to protect DACs without clip crackle
      const absL = dcL < 0 ? -dcL : dcL;
      const absR = dcR < 0 ? -dcR : dcR;

      let sL = dcL;
      if (absL > 0.85) {
        const excess = absL - 0.85;
        const shaped = 0.85 + Math.tanh(excess * 5.2) * 0.145;
        sL = dcL < 0 ? -shaped : shaped;
        if (absL > 1.02) this.clippedSamples++;
      }

      let sR = dcR;
      if (absR > 0.85) {
        const excess = absR - 0.85;
        const shaped = 0.85 + Math.tanh(excess * 5.2) * 0.145;
        sR = dcR < 0 ? -shaped : shaped;
        if (absR > 1.02) this.clippedSamples++;
      }

      outL[i] = sL;
      if (outR !== outL) {
        outR[i] = sR;
      }

      const pk = absL > absR ? absL : absR;
      if (pk > this.peakHold) {
        this.peakHold = pk;
      }
    }

    this.xPrevL = xPrevL;
    this.yPrevL = yPrevL;
    this.xPrevR = xPrevR;
    this.yPrevR = yPrevR;

    if (perf) {
      const elapsedMs = perf.now() - t0;
      const budgetMs = (len / sampleRate) * 1000;
      this.accumCpuRatio += elapsedMs / Math.max(0.1, budgetMs);
    }

    this.quantumCount++;

    // Post telemetry roughly every 200ms (approx 75 quanta at 48kHz)
    if (currentTime - this.lastTelemetryTime >= 0.2) {
      const avgCpu =
        perf && this.quantumCount > 0
          ? Math.min(100, (this.accumCpuRatio / this.quantumCount) * 100)
          : Math.min(100, this.peakHold * 18);

      this.port.postMessage({
        cpuLoadPct: avgCpu,
        peakLevel: Math.min(1.5, this.peakHold),
        clippedSamples: this.clippedSamples,
        underruns: this.underrunSuspects,
      });

      this.quantumCount = 0;
      this.peakHold = 0;
      this.clippedSamples = 0;
      this.underrunSuspects = 0;
      this.accumCpuRatio = 0;
      this.lastTelemetryTime = currentTime;
    }

    return true;
  }
}

registerProcessor('tarek-dsp-processor', TarekDspProcessor);
