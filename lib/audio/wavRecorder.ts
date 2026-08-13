"use client";

/**
 * Records microphone audio as 16 kHz mono 16-bit PCM WAV — the exact format
 * Azure AI Speech expects (and the highest-accuracy input: no lossy re-encoding,
 * the sample rate Azure's acoustic models are tuned for). MediaRecorder's default
 * webm/opus is REJECTED by Azure Speech's REST API, which is why we capture raw
 * PCM via the Web Audio API instead. The resulting WAV also works with Whisper.
 *
 * getUserMedia enables echo cancellation / noise suppression / auto gain — these
 * measurably improve recognition of names and spelled-out details.
 */

const TARGET_RATE = 16000;

export interface ActiveRecording {
  /** Stop capture and resolve to a 16 kHz mono WAV Blob (type "audio/wav"). */
  stop: () => Promise<Blob>;
  /** Abort without producing a blob (releases the mic). */
  cancel: () => void;
}

export function isWavRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    (typeof (globalThis as any).AudioContext !== "undefined" ||
      typeof (globalThis as any).webkitAudioContext !== "undefined")
  );
}

export async function startWavRecording(): Promise<ActiveRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const AudioCtx: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  // A freshly-created AudioContext can be "suspended" until resumed after a user
  // gesture — while suspended, onaudioprocess never fires and we'd capture
  // silence (the "permission granted but nothing recorded" bug). Resume it.
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch { /* best-effort */ }
  }
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  // gain 0 so we capture without playing the mic back through the speakers
  // (ScriptProcessor only runs while connected downstream).
  const silent = ctx.createGain();
  silent.gain.value = 0;

  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(silent);
  silent.connect(ctx.destination);

  const cleanup = () => {
    try { processor.disconnect(); } catch { /* noop */ }
    try { silent.disconnect(); } catch { /* noop */ }
    try { source.disconnect(); } catch { /* noop */ }
    stream.getTracks().forEach((t) => t.stop());
    try { void ctx.close(); } catch { /* noop */ }
  };

  return {
    stop: async () => {
      const inputRate = ctx.sampleRate;
      cleanup();
      const merged = mergeBuffers(chunks);
      const down = downsample(merged, inputRate, TARGET_RATE);
      return encodeWav(down, TARGET_RATE);
    },
    cancel: () => {
      chunks.length = 0;
      cleanup();
    },
  };
}

function mergeBuffers(chunks: Float32Array[]): Float32Array {
  let length = 0;
  for (const c of chunks) length += c.length;
  const out = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

/** Linear-interpolation downsample from `inRate` to `outRate`. */
function downsample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate || input.length === 0) return input;
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/** Encode mono Float32 PCM as a 16-bit little-endian WAV Blob. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // mono
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);            // PCM chunk size
  view.setUint16(20, 1, true);             // audio format = PCM
  view.setUint16(22, 1, true);             // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);            // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}
