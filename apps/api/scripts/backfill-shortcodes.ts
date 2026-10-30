import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import * as dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function generateUniqueShortCode(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  let isUnique = false;
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await prisma.room.findUnique({ where: { shortCode: code } });
    if (!existing) isUnique = true;
  }
  return code;
}

async function main() {
  console.log('Iniciando o backfill de shortCodes...');

  // Buscar todas as salas que não possuem shortCode
  const roomsToUpdate = await prisma.room.findMany({
    where: {
      shortCode: null,
    },
  });

  if (roomsToUpdate.length === 0) {
    console.log('Nenhuma sala precisa ser atualizada. Todas já possuem shortCode.');
    return;
  }

  console.log(`Encontradas ${roomsToUpdate.length} salas sem shortCode.`);

  for (const room of roomsToUpdate) {
    const code = await generateUniqueShortCode();
    await prisma.room.update({
      where: { id: room.id },
      data: { shortCode: code },
    });
    console.log(`Sala ID: ${room.id} atualizada com shortCode: ${code}`);
  }

  console.log('Backfill concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro durante o backfill:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
