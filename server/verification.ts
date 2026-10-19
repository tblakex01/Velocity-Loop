import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { AsyncResource } from "node:async_hooks";
import type { Replay } from "../src/game/types";
import { HttpError } from "./errors";

export type Verification = {
  replay: Replay;
  result: { valid: boolean; time: number; reason?: string };
};
type Job = {
  payload: unknown;
  resolve: (result: Verification) => void;
  reject: (error: Error) => void;
  resource: AsyncResource;
};
type Slot = {
  worker: Worker;
  ready?: boolean;
  job?: Job;
  timer?: ReturnType<typeof setTimeout>;
  stopped?: boolean;
};

export class VerificationPool {
  private slots: Slot[] = [];
  private queue: Job[] = [];
  private closed = false;
  constructor(size = Math.min(2, Math.max(1, availableParallelism() - 1))) {
    if (!Number.isInteger(size) || size < 1 || size > 8)
      throw new Error("Verification workers must be between 1 and 8.");
    for (let i = 0; i < size; i++) this.spawn();
  }
  private spawn() {
    const slot: Slot = {
      worker: new Worker(new URL("./verify-worker.mjs", import.meta.url), {
        execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 128 },
      }),
    };
    slot.worker.unref();
    this.slots.push(slot);
    slot.worker.on(
      "message",
      (message: Verification & { error?: string; ready?: boolean }) => {
        if (message.ready) {
          slot.ready = true;
          this.dispatch();
          return;
        }
        if (!slot.job) return;
        const job = slot.job;
        clearTimeout(slot.timer);
        slot.job = undefined;
        slot.worker.unref();
        job.resource.runInAsyncScope(() =>
          message.error
            ? job.reject(new HttpError(422, message.error))
            : job.resolve(message),
        );
        job.resource.emitDestroy();
        this.dispatch();
      },
    );
    slot.worker.on("error", () => this.fail(slot));
    slot.worker.on("exit", () => this.fail(slot));
  }
  private fail(slot: Slot) {
    if (slot.stopped) return;
    slot.stopped = true;
    clearTimeout(slot.timer);
    if (slot.job) {
      slot.job.resource.runInAsyncScope(
        slot.job.reject,
        null,
        new HttpError(
          503,
          "Replay verification interrupted. Please try again.",
        ),
      );
      slot.job.resource.emitDestroy();
    }
    this.slots = this.slots.filter((other) => other !== slot);
    void slot.worker.terminate();
    if (!this.closed) {
      for (const job of this.queue.splice(0)) {
        job.reject(
          new HttpError(
            503,
            "Replay verification interrupted. Please try again.",
          ),
        );
        job.resource.emitDestroy();
      }
      setTimeout(() => {
        if (!this.closed) this.spawn();
      }, 1000).unref();
    }
  }
  private dispatch() {
    for (const slot of this.slots) {
      if (!slot.ready || slot.job || !this.queue.length || this.closed)
        continue;
      slot.job = this.queue.shift()!;
      slot.worker.ref();
      slot.timer = setTimeout(() => this.fail(slot), 10000);
      slot.worker.postMessage({ payload: slot.job.payload });
    }
  }
  verify(payload: unknown): Promise<Verification> {
    if (this.closed || this.queue.length >= 8)
      return Promise.reject(
        new HttpError(
          503,
          "Replay verification is busy. Please try again shortly.",
        ),
      );
    return new Promise((resolve, reject) => {
      this.queue.push({
        payload,
        resolve,
        reject,
        resource: new AsyncResource("ReplayVerification"),
      });
      this.dispatch();
    });
  }
  async close() {
    this.closed = true;
    for (const job of this.queue.splice(0)) {
      job.reject(new HttpError(503, "The server is shutting down."));
      job.resource.emitDestroy();
    }
    await Promise.all(
      this.slots.map(async (slot) => {
        this.fail(slot);
        await slot.worker.terminate();
      }),
    );
  }
}
