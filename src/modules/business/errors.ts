export class BusinessError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "INVALID_ASSIGNMENT"
    | "ALREADY_CLOCKED_IN"
    | "NOT_CLOCKED_IN"
    | "NO_CHANGE"
    | "INVALID_TARGET"
    | "STALE_VERSION"
    | "ENTITY_IN_USE"
    | "INVALID_INTERVAL"
    | "OVERLAPPING_TIME"
    | "PAYLOAD_TOO_LARGE";

  constructor(code: BusinessError["code"]) {
    super(code.toLowerCase());
    this.name = "BusinessError";
    this.code = code;
  }
}
