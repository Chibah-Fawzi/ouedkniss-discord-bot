const fs = require("fs");
const path = require("path");

const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, "bot.log");

function ensureLogDir() {
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {}
}

function formatLine(level, message, meta) {
  const ts = new Date().toISOString();
  const payload = meta ? { ...meta } : undefined;
  return JSON.stringify({ ts, level, message, meta: payload }) + "\n";
}

function log(level, message, meta) {
  ensureLogDir();
  const line = formatLine(level, message, meta);
  fs.appendFile(LOG_FILE, line, () => {});
}

module.exports = {
  info: (message, meta) => log("info", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  error: (message, meta) => log("error", message, meta),
  LOG_FILE,
};
