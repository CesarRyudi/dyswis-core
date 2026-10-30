import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { MulterError } from 'multer';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message =
      'Ocorreu uma instabilidade temporária no servidor. Por favor, tente novamente em instantes.';
    let error = 'Internal Server Error';

    if (exception instanceof MulterError) {
      status = HttpStatus.BAD_REQUEST;
      error = 'MulterError';
      message = exception.message || 'Erro no processamento do arquivo.';

      switch (exception.code) {
        case 'LIMIT_FILE_SIZE':
          status = HttpStatus.PAYLOAD_TOO_LARGE; // 413
          message =
            'O arquivo enviado ultrapassa o limite máximo permitido (50 MB para vídeos / 20 MB para PDFs).';
          break;
        case 'LIMIT_FILE_COUNT':
          message = 'Limite de quantidade de arquivos excedido.';
          break;
        case 'LIMIT_UNEXPECTED_FILE':
          message = 'Campo de envio de arquivo inválido ou inesperado.';
          break;
        case 'LIMIT_PART_COUNT':
          message = 'Muitas partes enviadas no formulário multipart.';
          break;
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      error = exception.name;

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        if (Array.isArray(resObj['message'])) {
          message = (resObj['message'] as unknown[]).join(', ');
        } else if (typeof resObj['message'] === 'string') {
          message = resObj['message'];
        }
        if (typeof resObj['error'] === 'string') {
          error = resObj['error'];
        }
      }

      if (!message || message.toLowerCase() === 'internal server error') {
        message =
          'Ocorreu uma falha no servidor ao processar a solicitação. Por favor, tente novamente.';
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled Exception: ${exception.message}`,
        exception.stack,
      );
      const msg = exception.message || '';
      if (
        msg.toLowerCase().includes('size') ||
        msg.toLowerCase().includes('exceeded') ||
        msg.toLowerCase().includes('payload too large') ||
        msg.includes('52428800')
      ) {
        status = HttpStatus.PAYLOAD_TOO_LARGE;
        message =
          'O arquivo excede o limite máximo permitido de 50 MB para vídeos ou 20 MB para PDFs no armazenamento.';
      } else if (msg.toLowerCase().includes('supabase')) {
        status = HttpStatus.BAD_GATEWAY;
        message =
          'Falha na comunicação com o serviço de armazenamento na nuvem. Por favor, tente novamente.';
      } else {
        message =
          'Ocorreu uma falha ao processar a requisição no servidor. Por favor, tente novamente.';
      }
    } else {
      this.logger.error('Unknown Exception caught', exception);
    }

    if (!response.headersSent) {
      response.status(status).json({
        statusCode: status,
        message,
        error,
      });
    }
  }
}
