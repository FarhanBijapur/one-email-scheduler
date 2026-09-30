export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function write(level: LogLevel, service: string, message: string, extra?: unknown): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    service,
    message,
    ...(extra !== undefined ? { extra } : {}),
  };
  const serialized = JSON.stringify(line);
  if (level === 'error') {
    console.error(serialized);
    return;
  }
  if (level === 'warn') {
    console.warn(serialized);
    return;
  }
  console.log(serialized);
}

export function createLogger(service: string) {
  return {
    debug: (message: string, extra?: unknown) => write('debug', service, message, extra),
    info: (message: string, extra?: unknown) => write('info', service, message, extra),
    warn: (message: string, extra?: unknown) => write('warn', service, message, extra),
    error: (message: string, extra?: unknown) => write('error', service, message, extra),
  };
}
