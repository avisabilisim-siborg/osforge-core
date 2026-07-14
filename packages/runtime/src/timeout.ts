import type { CancellationSource } from "./cancellation.js";

/**
 * Timeout manager (requirement §11).
 *
 * Arms a timer that cancels the linked cancellation source when the deadline is
 * exceeded. Returns a disarm function the caller MUST invoke on completion so no
 * timer (and no zombie execution) is left behind.
 */
export class TimeoutManager {
  arm(source: CancellationSource, timeoutMs: number, reason = "timeout"): () => void {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      // No positive timeout → nothing to arm; still return a no-op disarm.
      return () => {};
    }
    const timer = setTimeout(() => source.cancel(reason), timeoutMs);
    let disarmed = false;
    return () => {
      if (disarmed) {
        return;
      }
      disarmed = true;
      clearTimeout(timer);
    };
  }
}
