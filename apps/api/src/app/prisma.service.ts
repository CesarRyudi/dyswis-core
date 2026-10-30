/**
 * PrismaService — Wrapper do PrismaClient para NestJS DI.
 *
 * POR QUÊ: O NestJS precisa gerenciar o ciclo de vida da conexão com o banco.
 * OnModuleInit abre a conexão ao iniciar o módulo, e OnModuleDestroy fecha ao parar.
 * Injetável em qualquer Service/Controller via constructor injection.
 *
 * Prisma v7 exige um driver adapter. Usamos @prisma/adapter-pg com o pg driver.
 * A DATABASE_URL é lida de process.env (dotenv carregado em main.ts).
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
