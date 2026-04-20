import * as path from 'path';

const logLevel = process.env.LOG_LEVEL || 'info';

const levels: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

function timestamp(): string {
  return new Date().toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export const logger = {
  debug(msg: string, ...args: any[]) {
    if (levels[logLevel] <= 0) {
      console.log(
        `${colors.gray}[${timestamp()}] DEBUG${colors.reset} ${msg}`,
        ...args
      );
    }
  },
  info(msg: string, ...args: any[]) {
    if (levels[logLevel] <= 1) {
      console.log(
        `${colors.cyan}[${timestamp()}] INFO${colors.reset}  ${msg}`,
        ...args
      );
    }
  },
  success(msg: string, ...args: any[]) {
    if (levels[logLevel] <= 1) {
      console.log(
        `${colors.green}[${timestamp()}] ✅ OK${colors.reset}   ${msg}`,
        ...args
      );
    }
  },
  warn(msg: string, ...args: any[]) {
    if (levels[logLevel] <= 2) {
      console.warn(
        `${colors.yellow}[${timestamp()}] WARN${colors.reset}  ${msg}`,
        ...args
      );
    }
  },
  error(msg: string, ...args: any[]) {
    if (levels[logLevel] <= 3) {
      console.error(
        `${colors.red}[${timestamp()}] ERROR${colors.reset} ${msg}`,
        ...args
      );
    }
  },
  section(title: string) {
    const line = '─'.repeat(50);
    console.log(`\n${colors.magenta}${line}${colors.reset}`);
    console.log(`${colors.bright}${colors.magenta}  ${title}${colors.reset}`);
    console.log(`${colors.magenta}${line}${colors.reset}`);
  },
  newVideo(title: string, url: string) {
    console.log(
      `  ${colors.green}▶${colors.reset} ${colors.bright}${title}${colors.reset}`
    );
    console.log(`    ${colors.blue}${url}${colors.reset}`);
  },
};
