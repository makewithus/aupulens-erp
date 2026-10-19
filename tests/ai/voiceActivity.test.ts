import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { waveformLevels } from "@/lib/audio/wavRecorder";
import { VoiceActivity } from "@/components/ai/VoiceActivity";

describe("microphone waveform", () => {
  it("stays flat for silence and responds to actual sample energy", () => {
    expect(waveformLevels(new Float32Array(4096))).toEqual(Array(24).fill(0));
    const quiet = waveformLevels(new Float32Array(4096).fill(0.02));
    const speech = waveformLevels(new Float32Array(4096).fill(0.12));
    expect(quiet[0]).toBeGreaterThan(0);
    expect(speech[0]).toBeGreaterThan(quiet[0]);
    expect(waveformLevels(new Float32Array(4096).fill(1))).toEqual(Array(24).fill(1));
    expect(waveformLevels(new Float32Array())).toEqual(Array(24).fill(0));
  });
  it("shows the captured envelope only during recording", () => {
    const render = (listening: boolean, transcribing: boolean, levels: number[] = []) => renderToStaticMarkup(React.createElement(VoiceActivity, { listening, transcribing, levels }));
    expect(render(false, false)).toBe("");
    const silence = render(true, false);
    const speech = render(true, false, Array(24).fill(1));
    expect(silence).toContain("Listening…");
    expect(silence).toContain("height:2px");
    expect(speech).toContain("height:24px");
    expect(speech).toContain('role="status"');
    expect(speech).toContain("motion-reduce:transition-none");
    expect(render(false, true)).toContain("Transcribing…");
    expect(render(false, true)).not.toContain("Listening…");
  });
});
