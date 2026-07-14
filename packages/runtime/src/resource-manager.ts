/**
 * Resource manager (requirement §8).
 *
 * Tracks a global pool of runtime resources (worker slots, CPU-ms, memory) and
 * admits work only when a reservation fits. Reservations are released on
 * completion, cancellation or timeout so no resource leaks (constraint §11).
 */
export interface ResourcePool {
  maxSlots: number;
  maxCpuMs: number;
  maxMemoryBytes: number;
}

export interface ResourceRequest {
  slots: number;
  cpuMs: number;
  memoryBytes: number;
}

export interface ResourceReservation {
  readonly id: string;
  readonly slots: number;
  readonly cpuMs: number;
  readonly memoryBytes: number;
}

export interface ResourceAdmission {
  ok: boolean;
  reasonCode: string;
  reservation?: ResourceReservation;
}

export class ResourceManager {
  readonly #pool: ResourcePool;
  #slots = 0;
  #cpuMs = 0;
  #memoryBytes = 0;
  #counter = 0;

  constructor(pool: Partial<ResourcePool> = {}) {
    this.#pool = {
      maxSlots: pool.maxSlots ?? 16,
      maxCpuMs: pool.maxCpuMs ?? 120_000,
      maxMemoryBytes: pool.maxMemoryBytes ?? 1024 * 1024 * 1024
    };
  }

  reserve(request: ResourceRequest): ResourceAdmission {
    if (this.#slots + request.slots > this.#pool.maxSlots) {
      return { ok: false, reasonCode: "resource_slots_exhausted" };
    }
    if (this.#cpuMs + request.cpuMs > this.#pool.maxCpuMs) {
      return { ok: false, reasonCode: "resource_cpu_exhausted" };
    }
    if (this.#memoryBytes + request.memoryBytes > this.#pool.maxMemoryBytes) {
      return { ok: false, reasonCode: "resource_memory_exhausted" };
    }
    this.#slots += request.slots;
    this.#cpuMs += request.cpuMs;
    this.#memoryBytes += request.memoryBytes;
    this.#counter += 1;
    return {
      ok: true,
      reasonCode: "reserved",
      reservation: { id: `res_${this.#counter}`, slots: request.slots, cpuMs: request.cpuMs, memoryBytes: request.memoryBytes }
    };
  }

  release(reservation: ResourceReservation): void {
    this.#slots = Math.max(0, this.#slots - reservation.slots);
    this.#cpuMs = Math.max(0, this.#cpuMs - reservation.cpuMs);
    this.#memoryBytes = Math.max(0, this.#memoryBytes - reservation.memoryBytes);
  }

  available(): ResourcePool {
    return {
      maxSlots: this.#pool.maxSlots - this.#slots,
      maxCpuMs: this.#pool.maxCpuMs - this.#cpuMs,
      maxMemoryBytes: this.#pool.maxMemoryBytes - this.#memoryBytes
    };
  }
}
