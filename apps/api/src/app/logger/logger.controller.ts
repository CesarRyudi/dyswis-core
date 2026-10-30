import { Body, Controller, Post, Logger, Req } from '@nestjs/common';
import type { Request } from 'express';

interface ClientLog {
  level: 'info' | 'error' | 'warn' | 'debug';
  message: string;
  context?: string;
  [key: string]: unknown;
}

@Controller('logs')
export class LoggerController {
  private readonly logger = new Logger('ClientLogger');

  @Post('client')
  receiveClientLogs(@Body() logs: ClientLog[], @Req() req: Request) {
    if (!Array.isArray(logs)) {
      return { success: false, message: 'Expected an array of logs' };
    }

    const ip = req.ip;
    const userAgent = req.headers['user-agent'];

    logs.forEach((log) => {
      const { level, message, context, ...meta } = log;
      const logPayload = {
        message: `[Client] ${message}`,
        clientContext: context || 'Frontend',
        clientIp: ip,
        userAgent,
        ...meta,
      };

      switch (level) {
        case 'error':
          this.logger.error(logPayload);
          break;
        case 'warn':
          this.logger.warn(logPayload);
          break;
        case 'debug':
          this.logger.debug(logPayload);
          break;
        case 'info':
        default:
          this.logger.log(logPayload);
          break;
      }
    });

    return { success: true };
  }
}
