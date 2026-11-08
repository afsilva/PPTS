export class BusinessError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "INVALID_ASSIGNMENT"
    | "ALREADY_CLOCKED_IN"
    | "NOT_CLOCKED_IN"
    | "NO_CHANGE"
    | "IDEMPOTENCY_CONFLICT"
    | "INVALID_TARGET"
    | "STALE_VERSION"
    | "ENTITY_IN_USE"
    | "INVALID_INTERVAL"
    | "OVERLAPPING_TIME"
    | "PAYLOAD_TOO_LARGE"
    | "INVALID_DOCUMENT"
    | "UNSUPPORTED_DOCUMENT"
    | "DOCUMENT_QUOTA_EXCEEDED"
    | "DOCUMENT_UNAVAILABLE"
    | "RETENTION_ACTIVE";

  constructor(code: BusinessError["code"]) {
    super(code.toLowerCase());
    this.name = "BusinessError";
    this.code = code;
  }
}
