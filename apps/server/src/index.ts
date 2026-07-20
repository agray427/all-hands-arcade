import { config } from "./config.js";
import { createArcadeServer } from "./server.js";

const server = await createArcadeServer({
  port: config.port,
  clientOrigin: config.clientOrigin,
});

process.stdout.write(
  `arcade server listening on :${server.port} (origin ${config.clientOrigin})\n`,
);
