interface ClientLog {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: string;
  [key: string]: unknown;
}

class Logger {
  private queue: ClientLog[] = [];
  private readonly maxQueueSize = 10;
  private readonly flushInterval = 5000;

  private apiUrl: string;

  constructor() {
    this.apiUrl = (import.meta.env.VITE_API_URL || '') + '/logs/client';
    
    // Inicia o flush periódico apenas no browser
    if (typeof window !== 'undefined') {
      setInterval(() => this.flush(), this.flushInterval);
      
      // Garante envio ao fechar a aba
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flush(true);
        }
      });
    }
  }

  private pushLog(log: ClientLog) {
    // Imprime no console local para dev/debugging
    const isProd = import.meta.env.MODE === 'production';
    if (!isProd) {
      const consoleMsg = `[${log.context || 'Frontend'}] ${log.message}`;
      switch (log.level) {
        case 'error': console.error(consoleMsg, log); break;
        case 'warn': console.warn(consoleMsg, log); break;
        case 'debug': console.debug(consoleMsg, log); break;
        default: console.info(consoleMsg, log); break;
      }
    } else {
      // Em produção também imprime caso o provedor (como Vercel/Coolify) consiga ler stdout, mas de forma crua
      console.log(JSON.stringify(log));
    }

    this.queue.push(log);
    if (this.queue.length >= this.maxQueueSize) {
      this.flush();
    }
  }

  public info(message: string, meta?: Record<string, unknown>) {
    this.pushLog({ level: 'info', message, ...meta });
  }

  public warn(message: string, meta?: Record<string, unknown>) {
    this.pushLog({ level: 'warn', message, ...meta });
  }

  public error(message: string, meta?: Record<string, unknown>) {
    this.pushLog({ level: 'error', message, ...meta });
  }

  public debug(message: string, meta?: Record<string, unknown>) {
    this.pushLog({ level: 'debug', message, ...meta });
  }

  private async flush(useBeacon = false) {
    if (this.queue.length === 0) return;

    const logsToSend = [...this.queue];
    this.queue = [];

    try {
      const payload = JSON.stringify(logsToSend);
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(this.apiUrl, new Blob([payload], { type: 'application/json' }));
      } else {
        await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true, // Importante para quando a aba está fechando
        });
      }
    } catch (err) {
      // Falha silenciosa para não criar loop de erros
      console.error('Falha ao enviar logs para o backend', err);
    }
  }
}

export const logger = new Logger();
