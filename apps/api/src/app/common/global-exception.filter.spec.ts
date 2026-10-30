import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { MulterError } from 'multer';
import { Response } from 'express';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: Partial<Response>;
  let mockHost: ArgumentsHost;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    mockResponse = {
      status: statusMock as unknown as Response['status'],
      json: jsonMock as unknown as Response['json'],
      headersSent: false,
    };

    mockHost = {
      switchToHttp: vi.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;
  });

  describe('MulterError mapping', () => {
    it('should map MulterError("LIMIT_FILE_SIZE") to HTTP 413 Payload Too Large', () => {
      const error = new MulterError('LIMIT_FILE_SIZE');

      filter.catch(error, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: 'O arquivo enviado ultrapassa o limite máximo permitido (50 MB para vídeos / 20 MB para PDFs).',
        error: 'MulterError',
      });
    });

    it('should map generic MulterError to HTTP 400 Bad Request', () => {
      const error = new MulterError('LIMIT_UNEXPECTED_FILE');

      filter.catch(error, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Campo de envio de arquivo inválido ou inesperado.',
        error: 'MulterError',
      });
    });
  });

  describe('HttpException status preservation', () => {
    it('should preserve HTTP 400 status for BadRequestException', () => {
      const exception = new BadRequestException('Invalid payload provided');

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid payload provided',
        error: 'Bad Request',
      });
    });

    it('should preserve HTTP 404 status for NotFoundException', () => {
      const exception = new NotFoundException('Resource was not found');

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Resource was not found',
        error: 'Not Found',
      });
    });

    it('should preserve HTTP 401 status for UnauthorizedException', () => {
      const exception = new UnauthorizedException('Invalid credentials');

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Invalid credentials',
        error: 'Unauthorized',
      });
    });
  });

  describe('Uncaught Errors', () => {
    it('should map size-related generic errors to HTTP 413 Payload Too Large', () => {
      const error = new Error('Upload payload size exceeded 50MB');

      filter.catch(error, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: 'O arquivo excede o limite máximo permitido de 50 MB para vídeos ou 20 MB para PDFs no armazenamento.',
        error: 'Internal Server Error',
      });
    });
  });
});
