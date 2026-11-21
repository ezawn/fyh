/**
 * Code-generated chiptune loops (SPEC 9). Notes are MIDI numbers, null = rest.
 * Drums: k = kick, s = snare, h = hat, . = nothing. All arrays share one length.
 */
export type TrackName = "STAGE" | "BOSS" | "STOMP";

export type Track = {
  bpm: number;
  stepsPerBeat: 2 | 4; // 8ths or 16ths
  lead: (number | null)[];
  bass: (number | null)[];
  drums: string;
  leadGate: number; // fraction of a step the lead note sounds
};

const _ = null;

/** Bright, bouncy C major. 4 bars of 8ths. */
const STAGE: Track = {
  bpm: 132,
  stepsPerBeat: 2,
  leadGate: 0.8,
  lead: [
    76, _, 79, 76, 72, _, 74, 76,
    77, _, 76, 74, 72, _, _, _,
    76, _, 79, 81, 79, _, 76, 72,
    74, _, 76, 74, 72, _, 67, _,
  ],
  bass: [
    48, _, 55, _, 48, _, 55, _,
    53, _, 60, _, 48, _, 55, _,
    45, _, 52, _, 53, _, 60, _,
    43, _, 50, _, 48, _, 43, _,
  ],
  drums: "khshkhsh".repeat(4),
};

/** Driving A minor, 2 bars of 16ths. */
const BOSS: Track = {
  bpm: 150,
  stepsPerBeat: 4,
  leadGate: 0.9,
  lead: [
    69, _, _, 72, _, 71, _, 69, 68, _, _, 64, _, _, _, _,
    65, _, _, 69, _, 68, _, 65, 64, _, 68, _, 71, _, _, _,
  ],
  bass: [
    45, 45, 57, 45, 45, 57, 45, 45, 45, 45, 57, 45, 43, 55, 43, 43,
    41, 41, 53, 41, 41, 53, 41, 41, 40, 40, 52, 40, 44, 56, 44, 44,
  ],
  drums: "k.h.s.h.k.k.s.h.".repeat(2),
};

/** The player massively outclasses the boss: a jaunty nursery tune, fast. */
const STOMP: Track = {
  bpm: 176,
  stepsPerBeat: 2,
  leadGate: 0.6,
  lead: [
    72, 72, 79, 79, 81, 81, 79, _,
    77, 77, 76, 76, 74, 74, 72, _,
    79, 79, 77, 77, 76, 76, 74, _,
    79, 79, 77, 77, 76, 76, 74, _,
  ],
  bass: [
    48, _, 60, _, 53, _, 48, _,
    53, _, 48, _, 43, _, 48, _,
    48, _, 53, _, 48, _, 43, _,
    48, _, 53, _, 48, _, 43, _,
  ],
  drums: "khsh".repeat(8),
};

export const TRACKS: Record<TrackName, Track> = { STAGE, BOSS, STOMP };
