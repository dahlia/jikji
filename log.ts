/**
 * @copyright 2021–2023 Hong Minhee
 * @license LGPL-3.0-only
 */
import * as log from "https://deno.land/std@0.190.0/log/mod.ts";

/**
 * A shortcut function to configure console logging.
 * @param level The minimum log level to print.  `INFO` by default.
 */
export async function setupConsoleLog(
  level: log.LevelName = "INFO",
): Promise<void> {
  await log.setup({
    handlers: {
      console: new log.handlers.ConsoleHandler(level),
    },
    loggers: {
      default: {
        level,
        handlers: ["console"],
      },
      file: {
        level,
        handlers: ["console"],
      },
    },
  });
}
