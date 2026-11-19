import { config } from "./config/env.js";
import { createApp } from "./app.js";
import { writeLog } from "./utils/logger.js";

const app = createApp();

app.listen(config.port, () => {
  writeLog("info", "server.started", { port: config.port });
});
