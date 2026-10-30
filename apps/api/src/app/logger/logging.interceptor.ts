import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          const delay = Date.now() - now;
          this.logger.log({
            message: `${method} ${url} ${res.statusCode} - ${delay}ms`,
            context: 'HTTP',
            method,
            url,
            statusCode: res.statusCode,
            delayMs: delay,
            ip: req.ip,
          });
        },
        error: (error) => {
          const res = context.switchToHttp().getResponse();
          const statusCode = error.status || res?.statusCode || 500;
          const delay = Date.now() - now;
          this.logger.error({
            message: `${method} ${url} ${statusCode} - ${delay}ms - ${error.message}`,
            context: 'HTTP',
            method,
            url,
            statusCode,
            delayMs: delay,
            ip: req.ip,
            errorName: error.name,
            stack: error.stack,
          });
        },
      }),
    );
  }
}
