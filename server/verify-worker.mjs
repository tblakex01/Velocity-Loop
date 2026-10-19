import { parentPort } from "node:worker_threads";
import { tsImport } from "tsx/esm/api";

const { validateReplay, verifyReplay } = await tsImport(
  "../src/game/replay.ts",
  import.meta.url,
);
parentPort.postMessage({ ready: true });
parentPort.on("message", async ({ payload }) => {
  try {
    const replay = validateReplay(payload);
    const result = await verifyReplay(replay);
    parentPort.postMessage({ replay, result });
  } catch (error) {
    parentPort.postMessage({
      error:
        error instanceof Error
          ? error.message.slice(0, 200)
          : "Invalid replay.",
    });
  }
});
