export const PRESENCE_STATES = ["OFF_DUTY", "AVAILABLE", "WORKING"] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

export type ClockState = Readonly<{
  presence: PresenceState;
  openEntry: Readonly<{ projectId: string; workCodeId: string }> | null;
}>;

export type ClockCommand =
  | Readonly<{ type: "SET_AVAILABLE" }>
  | Readonly<{ type: "CLOCK_IN"; projectId: string; workCodeId: string }>
  | Readonly<{ type: "CLOCK_OUT" }>
  | Readonly<{ type: "SWITCH"; projectId: string; workCodeId: string }>;

export type ClockEffect = "NONE" | "OPEN" | "CLOSE" | "SWITCH";
export type ClockTransition = Readonly<{ next: ClockState; effect: ClockEffect }>;

export class ClockRuleError extends Error {
  readonly code: "ALREADY_CLOCKED_IN" | "NOT_CLOCKED_IN" | "NO_CHANGE";

  constructor(code: "ALREADY_CLOCKED_IN" | "NOT_CLOCKED_IN" | "NO_CHANGE") {
    super(code.toLowerCase());
    this.name = "ClockRuleError";
    this.code = code;
  }
}

/** Pure state machine; timestamps and persistence are server-owned concerns. */
export function transitionClock(state: ClockState, command: ClockCommand): ClockTransition {
  switch (command.type) {
    case "SET_AVAILABLE":
      if (state.openEntry) throw new ClockRuleError("ALREADY_CLOCKED_IN");
      return { next: { presence: "AVAILABLE", openEntry: null }, effect: "NONE" };
    case "CLOCK_IN":
      if (state.openEntry) throw new ClockRuleError("ALREADY_CLOCKED_IN");
      return {
        next: {
          presence: "WORKING",
          openEntry: { projectId: command.projectId, workCodeId: command.workCodeId },
        },
        effect: "OPEN",
      };
    case "CLOCK_OUT":
      if (!state.openEntry) throw new ClockRuleError("NOT_CLOCKED_IN");
      return { next: { presence: "OFF_DUTY", openEntry: null }, effect: "CLOSE" };
    case "SWITCH":
      if (!state.openEntry) throw new ClockRuleError("NOT_CLOCKED_IN");
      if (
        state.openEntry.projectId === command.projectId &&
        state.openEntry.workCodeId === command.workCodeId
      )
        throw new ClockRuleError("NO_CHANGE");
      return {
        next: {
          presence: "WORKING",
          openEntry: { projectId: command.projectId, workCodeId: command.workCodeId },
        },
        effect: "SWITCH",
      };
    default:
      return assertNever(command);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported clock command: ${String(value)}`);
}

export function cleanMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

export function durationSeconds(startedAt: Date, endedAt: Date): number {
  return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
}

export function durationSince(startedAt: Date, endedAt: Date, boundary: Date): number {
  const clippedStart = new Date(Math.max(startedAt.getTime(), boundary.getTime()));
  return durationSeconds(clippedStart, endedAt);
}
