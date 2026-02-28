const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(process.cwd(), 'logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function logLine(level, message, extra = null) {
  ensureLogDir();
  const ts = new Date().toISOString();
  const detail = extra ? ` ${JSON.stringify(extra)}` : '';
  const line = `[${ts}] [${level}] ${message}${detail}`;

  console.log(line);

  const day = ts.slice(0, 10);
  const target = path.join(LOG_DIR, `${day}.log`);
  fs.appendFileSync(target, `${line}\n`, 'utf8');
}

module.exports = {
  info(message, extra) {
    logLine('INFO', message, extra);
  },
  warn(message, extra) {
    logLine('WARN', message, extra);
  },
  error(message, extra) {
    logLine('ERROR', message, extra);
  }
};
