/**
 * Dyswis Sync & API Backend
 * NestJS application entry point with Winston logging and global exception filtering.
 */


import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import 'dotenv/config';
import { join } from 'path';
import { AppModule } from './app/app.module';

import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { GlobalExceptionFilter } from './app/common/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true, // Buffer bootstrap logs until Winston is initialized
  });
  
  const winstonLogger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(winstonLogger);
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const rawCorsOrigin = process.env.CORS_ORIGIN;
  Logger.log(
    `CORS_ORIGIN env: "${rawCorsOrigin ?? 'NOT SET — defaulting to *'}"`,
    'Bootstrap',
  );

  const corsOrigins = rawCorsOrigin
    ? rawCorsOrigin.split(',').map((o) => o.trim())
    : undefined;

  // Preflight OPTIONS handler ensuring compliant response headers
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers['origin'] as string | undefined;
    if (origin && (corsOrigins ? corsOrigins.includes(origin) : true)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else if (!origin) {
      // Non-browser clients (e.g. curl, test runners)
    } else if (!corsOrigins) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    );
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.enableCors({
    origin: corsOrigins ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  });

  // Serve PDFs enviados via upload em /uploads/<filename>
  // Multer salva em ./uploads (relativo ao CWD = raiz do workspace),
  // então servimos de process.cwd()/uploads.
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
