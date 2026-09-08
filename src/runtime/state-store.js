import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const CURRENT_STATE_VERSION = 1;

export function emptyState() {
  return {
    schemaVersion: CURRENT_STATE_VERSION,
    worldRef: "world.personal.v1",
    revision: 0,
    sites: {},
    sources: {},
    entities: {},
    observations: [],
    idempotencyKeys: {},
    projections: {},
    actions: {},
    approvals: {},
    studioAuth: null,
    audit: []
  };
}

export function migrateState(input) {
  if (!input || typeof input !== "object") throw new Error("state must be an object");
  if (input.schemaVersion === CURRENT_STATE_VERSION) return input;
  if (input.schemaVersion === undefined || input.schemaVersion === 0) {
    return { ...emptyState(), ...input, schemaVersion: CURRENT_STATE_VERSION, sites: input.sites ?? {}, sources: input.sources ?? {}, entities: input.entities ?? {}, observations: input.observations ?? [], idempotencyKeys: input.idempotencyKeys ?? {}, projections: input.projections ?? {}, actions: input.actions ?? {}, approvals: input.approvals ?? {}, studioAuth: input.studioAuth ?? null, audit: input.audit ?? [] };
  }
  throw new Error(`unsupported state schema version: ${input.schemaVersion}`);
}

export class StateStore {
  #path;
  #state;
  #listeners = new Set();
  #transactionQueue = Promise.resolve();

  constructor({ path, state } = {}) {
    if (!path && !state) throw new Error("StateStore requires path or state");
    this.#path = path;
    this.#state = state ? migrateState(structuredClone(state)) : null;
  }

  async load() {
    if (this.#state) return structuredClone(this.#state);
    try {
      this.#state = migrateState(JSON.parse(await readFile(this.#path, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.#state = emptyState();
      await this.save();
    }
    return structuredClone(this.#state);
  }

  async save() {
    if (!this.#state) throw new Error("state is not loaded");
    if (!this.#path) return;
    await mkdir(dirname(this.#path), { recursive: true });
    const temporaryPath = `${this.#path}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.#state, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.#path);
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new Error("state listener must be a function");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  transaction(mutator) {
    const operation = this.#transactionQueue.then(async () => {
      const state = await this.load();
      const next = structuredClone(state);
      const result = await mutator(next);
      next.revision += 1;
      this.#state = migrateState(next);
      await this.save();
      for (const listener of this.#listeners) {
        try { listener(structuredClone(this.#state), structuredClone(result), structuredClone(state)); } catch { /* Observers cannot roll back a committed state change. */ }
      }
      return { result, state: structuredClone(this.#state) };
    });
    this.#transactionQueue = operation.catch(() => undefined);
    return operation;
  }
}
