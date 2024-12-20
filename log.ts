/**
 * @copyright 2021–2024 Hong Minhee
 * @license LGPL-3.0-only
 */
import * as log from "@std/log";

/**
 * A shortcut function to configure console logging.
 * @param level The minimum log level to print.  `INFO` by default.
 */
// deno-lint-ignore require-await
export async function setupConsoleLog(
  level: log.LevelName = "INFO",
): Promise<void> {
  log.setup({
    handlers: {
      console: new log.ConsoleHandler(level),
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
