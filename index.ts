import "dotenv/config";
import { loadConfig } from "./config/load";
import { configureTracer, tracer } from "./observability/tracer";
import { initializeDatabase } from "./data/database";
import { initializeRedis, closeRedis } from "./cache/redis-client";
import { createBotClient, startPresenceRotation } from "./bot/client";
import { loadCommands, registerSlashCommands } from "./bot/command-loader";
import { wireInteractionRouter } from "./bot/interaction-router";
import { wireGuildEvents } from "./bot/guild-events";
import { initializeScheduler } from "./scheduling/scheduler";
import { startHealthServer } from "./observability/health";

async function main(): Promise<void> {
  const cfg = loadConfig();
  configureTracer({ level: cfg.logging.level, fileDir: cfg.logging.fileDir });
  tracer.info("STARTUP", `LeviathanOracle v7.0.0 booting…`);

  await initializeDatabase(cfg);
  initializeRedis(cfg.database.redis);

  const client = createBotClient();
  const commands = await loadCommands();
  tracer.info("STARTUP", `Loaded ${commands.size} command(s)`);

  wireInteractionRouter(client, commands, cfg);
  wireGuildEvents(client, cfg);

  client.once("ready", async () => {
    tracer.info("DISCORD", `Logged in as ${client.user?.tag}`);
    startPresenceRotation(client);
    try {
      await registerSlashCommands(commands, cfg);
    } catch (err) {
      tracer.error("STARTUP", "Slash command registration failed", err);
    }
    try {
      await initializeScheduler(client, cfg);
    } catch (err) {
      tracer.error("STARTUP", "Scheduler init failed", err);
    }
  });

  startHealthServer();
  await client.login(cfg.bot.token);
}

async function shutdown(signal: string): Promise<void> {
  tracer.info("SHUTDOWN", `Received ${signal}`);
  try {
    await closeRedis();
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) =>
  tracer.error("PROCESS", "unhandledRejection", reason),
);
process.on("uncaughtException", (err) =>
  tracer.error("PROCESS", "uncaughtException", err),
);

main().catch((err) => {
  tracer.error("STARTUP", "Fatal startup error", err);
  process.exit(1);
});
