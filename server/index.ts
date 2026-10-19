import { pathToFileURL } from "node:url";
import { createApp } from "./http";
export { createApp } from "./http";
export type { AppOptions } from "./http";

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PORT ?? 4174);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  const host = process.env.HOST ?? "127.0.0.1";
  const app = createApp();
  app.server.listen(port, host, () =>
    console.log(`Velocity Loop listening on http://${host}:${port}`),
  );
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      app.server.closeAllConnections();
      process.exitCode = 1;
    }, 15000);
    deadline.unref();
    void app
      .close()
      .then(() => clearTimeout(deadline))
      .catch(() => {
        process.exitCode = 1;
      });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
