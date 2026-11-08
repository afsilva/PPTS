import "server-only";
import { connect } from "node:net";
import { getDocumentConfig } from "@/config/documents";

export type ScanResult =
  | { outcome: "CLEAN" }
  | { outcome: "INFECTED" }
  | { outcome: "FAILED"; reason: "SCANNER_UNAVAILABLE" | "SCANNER_PROTOCOL_ERROR" };

/** Send fixed clamd INSTREAM frames. No filename or user value reaches a command. */
export async function scanDocument(bytes: Buffer): Promise<ScanResult> {
  const config = getDocumentConfig();
  return new Promise((resolve) => {
    const socket = connect({ host: config.CLAMAV_HOST, port: config.CLAMAV_PORT });
    let settled = false;
    let response = Buffer.alloc(0);
    const finish = (result: ScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(config.CLAMAV_TIMEOUT_MS, () =>
      finish({ outcome: "FAILED", reason: "SCANNER_UNAVAILABLE" }),
    );
    socket.once("error", () => finish({ outcome: "FAILED", reason: "SCANNER_UNAVAILABLE" }));
    socket.on("data", (chunk: Buffer) => {
      response = Buffer.concat([response, chunk]);
      if (response.length > 1024) finish({ outcome: "FAILED", reason: "SCANNER_PROTOCOL_ERROR" });
    });
    socket.once("end", () => {
      const line = response.toString("utf8").replace(/\0$/, "").trim();
      if (/^stream: OK$/.test(line)) finish({ outcome: "CLEAN" });
      else if (/^stream: .+ FOUND$/.test(line)) finish({ outcome: "INFECTED" });
      else finish({ outcome: "FAILED", reason: "SCANNER_PROTOCOL_ERROR" });
    });
    socket.once("connect", () => {
      socket.write("zINSTREAM\0");
      const frameSize = 64 * 1024;
      for (let offset = 0; offset < bytes.length; offset += frameSize) {
        const frame = bytes.subarray(offset, offset + frameSize);
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(frame.length);
        socket.write(length);
        socket.write(frame);
      }
      socket.end(Buffer.alloc(4));
    });
  });
}
