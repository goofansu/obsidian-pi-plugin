/**
 * The wterm core answers cursor-position queries but not device attribute
 * ones. fish sends a Primary Device Attributes query at startup and blocks for
 * ten seconds waiting for a reply, printing a "could not read response"
 * warning before it gives up. This scans the process's output for those
 * queries and produces the replies the terminal itself does not.
 *
 * The replies match what xterm.js reports, which is a well-tested claim of
 * capability for an xterm-like terminal.
 */

/** VT100 with Advanced Video Option. */
export const DA1_REPLY = "\x1b[?1;2c";
/** Terminal id 0, firmware version 276, no cartridge. */
export const DA2_REPLY = "\x1b[>0;276;0c";

/** Enough to hold the longest query while it is still arriving. */
const MAX_PENDING = 32;

const QUERY = /\x1b\[(>?)([0-9;]*)c/g;
/** A trailing fragment that could still become a query. */
const PARTIAL = /\x1b(\[[>0-9;]*)?$/;

export class DeviceAttributeResponder {
  private carry = "";

  /** How much of a possible query is buffered. Exposed for tests. */
  get pending(): number {
    return this.carry.length;
  }

  /** Returns the replies owed for this chunk, concatenated; "" when none. */
  respond(chunk: string): string {
    const text = this.carry + chunk;
    let replies = "";

    QUERY.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = QUERY.exec(text)) !== null) {
      const [, secondary, parameters] = match;
      if (parameters !== "" && parameters !== "0") continue;
      replies += secondary === ">" ? DA2_REPLY : DA1_REPLY;
    }

    this.carry = partialTail(text);
    return replies;
  }
}

function partialTail(text: string): string {
  const tail = text.slice(-MAX_PENDING);
  const match = PARTIAL.exec(tail);
  return match ? match[0] : "";
}
