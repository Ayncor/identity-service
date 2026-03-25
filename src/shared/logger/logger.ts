const PREFIX = "[identity-service]";

function formatMessage(level: string, msg: string, err?: unknown): string {
  const base = `${PREFIX} ${level} ${msg}`;
  if (err === undefined) return base;
  if (err instanceof Error) return `${base} ${err.message} ${err.stack ?? ""}`.trim();
  return `${base} ${String(err)}`;
}

/**
 * Lightweight structured console logger for identity-service (Nest HTTP API).
 * Debug lines only when DEBUG is set. 
 */
export const logger = {
  error(msg: string, err?: unknown): void {
    console.error(formatMessage("ERROR", msg, err));
  },
  warn(msg: string, err?: unknown): void {
    console.warn(formatMessage("WARN", msg, err));
  },
  info(msg: string, err?: unknown): void {
    console.info(err !== undefined ? formatMessage("INFO", msg, err) : `${PREFIX} ${msg}`);
  },
  debug(msg: string, err?: unknown): void {
    if (process.env.DEBUG) {
      console.debug(err !== undefined ? formatMessage("DEBUG", msg, err) : `${PREFIX} ${msg}`);
    }
  }
};
