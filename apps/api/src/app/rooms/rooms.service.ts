/**
 * RoomsService — CRUD de salas com persistência Prisma.
 *
 * create: Apenas Hosts autenticados. Gera inviteToken de alta entropia.
 * findById: Busca sala por ID + valida inviteToken.
 * findAllByHost: Lista salas do Host autenticado.
 */
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import type { RoomStateSyncPayload } from '@dyswis/shared-types';
import { PrismaService } from '../prisma.service';
import { SyncGateway } from '../sync.gateway';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SyncGateway))
    private readonly syncGateway: SyncGateway,
  ) {}

  private async generateUniqueShortCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const maxAttempts = 10;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const bytes = randomBytes(6);
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[bytes[i] % chars.length];
      }
      const existing = await this.prisma.room.findUnique({ where: { shortCode: code } });
      if (!existing) return code;
    }

    // Fallback defensivo com timestamp em caso de colisão improvável
    return randomBytes(3).toString('hex').toUpperCase();
  }

  async create(hostId: string, name: string, password?: string) {
    const inviteToken = randomBytes(16).toString('hex'); // 32 chars
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const shortCode = await this.generateUniqueShortCode();

    return this.prisma.room.create({
      data: { name, inviteToken, shortCode, status: 'INACTIVE', password: hashedPassword, hostId },
      select: { id: true, inviteToken: true, shortCode: true, status: true, name: true, createdAt: true },
    });
  }

  /**
   * Busca sala por ID e valida o inviteToken.
   * Se o token não bater, nega acesso (sala existe mas o link é inválido).
   */
  async findById(id: string, token: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        inviteToken: true,
        shortCode: true,
        status: true,
        password: true,
        pdfPath: true,
        videoPath: true,
        description: true,
        hostId: true,
        host: { select: { name: true } },
        createdAt: true,
      },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    if (room.password && room.inviteToken !== token) {
      throw new ForbiddenException('Invalid invite link');
    }
    const hasPassword = !!room.password;
    const { password: _p, inviteToken: _t, ...rest } = room;
    void _p;
    void _t;
    return { ...rest, hasPassword };
  }

  /** Verifica a senha da sala. Retorna true se correta, lança exceção se não. */
  async verifyPassword(id: string, inviteToken: string, password: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      select: { inviteToken: true, password: true },
    });
    if (!room || room.inviteToken !== inviteToken) {
      throw new ForbiddenException('Invalid invite link');
    }
    if (!room.password) {
      return { ok: true };
    }
    const match = await bcrypt.compare(password, room.password);
    if (!match) {
      throw new ForbiddenException('Incorrect room password');
    }
    return { ok: true };
  }

  /**
   * Busca detalhes da sala pelo shortCode (usado no Viewer/JoinPage limpo).
   * Não exige token para retornar os dados básicos, mas indica hasPassword.
   */
  async findByCode(shortCode: string) {
    const room = await this.prisma.room.findFirst({
      where: { 
        OR: [
          { shortCode },
          { id: shortCode }
        ]
      },
      select: {
        id: true,
        name: true,
        shortCode: true,
        status: true,
        password: true,
        inviteToken: true,
        pdfPath: true,
        videoPath: true,
        description: true,
        hostId: true,
        host: { select: { name: true } },
        createdAt: true,
      },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    const { password, inviteToken, ...rest } = room;
    return {
      ...rest,
      hasPassword: !!password,
      inviteToken: password ? undefined : inviteToken,
    };
  }

  /** Valida se o token é válido para a sala (usado no socket JOIN_ROOM) */
  async validateToken(roomId: string, token: string): Promise<boolean> {
    if (!token) return false;
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { inviteToken: true },
    });
    if (!room) return false;
    return room.inviteToken === token;
  }

  async findAllByHost(hostId: string) {
    const rooms = await this.prisma.room.findMany({
      where: { hostId },
      select: {
        id: true,
        inviteToken: true,
        shortCode: true,
        status: true,
        password: true,
        name: true,
        pdfPath: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    
    return rooms.map(room => {
      const { password, ...rest } = room;
      return { ...rest, hasPassword: !!password };
    });
  }

  /** Atualiza o status da sala (ACTIVE/INACTIVE) */
  async updateStatus(roomId: string, hostId: string, status: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    if (room.hostId !== hostId) {
      throw new ForbiddenException('Only the host can modify the room status');
    }
    const updated = await this.prisma.room.update({
      where: { id: roomId },
      data: { status },
      select: { id: true, status: true },
    });

    this.syncGateway.broadcastRoomStatus(roomId, status as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED');

    return updated;
  }

  /** Retorna apenas o status da sala */
  async getRoomStatusOnly(roomId: string) {
    return this.prisma.room.findUnique({
      where: { id: roomId },
      select: { status: true },
    });
  }

  /** Permite acesso usando um código de 6 dígitos em vez do inviteToken longo */
  async joinByCode(shortCode: string, password?: string) {
    const room = await this.prisma.room.findFirst({
      where: { 
        OR: [
          { shortCode },
          { id: shortCode }
        ]
      },
      select: {
        id: true,
        inviteToken: true,
        password: true,
        status: true,
      },
    });
    if (!room) {
      throw new NotFoundException('Room not found or invalid code');
    }
    if (room.password) {
      if (!password) {
         throw new ForbiddenException('Password required to access this room');
      }
      const match = await bcrypt.compare(password, room.password);
      if (!match) {
        throw new ForbiddenException('Incorrect room password');
      }
    }
    return { id: room.id, inviteToken: room.inviteToken, status: room.status };
  }

  /** Atualiza o conteúdo de texto (description) da sala */
  async updateDescription(roomId: string, hostId: string, description: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    if (room.hostId !== hostId) {
      throw new ForbiddenException(
        'Only the host can modify the room text',
      );
    }
    return this.prisma.room.update({
      where: { id: roomId },
      data: { description },
      select: { id: true, description: true },
    });
  }

  /** Atualiza o caminho do PDF associado à sala */
  async updatePdf(roomId: string, hostId: string, pdfPath: string | null) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    if (room.hostId !== hostId) {
      throw new ForbiddenException('Only the host can modify the room PDF');
    }
    return this.prisma.room.update({
      where: { id: roomId },
      data: { pdfPath },
      select: { id: true, pdfPath: true },
    });
  }

  /** Atualiza o caminho do vídeo associado à sala */
  async updateVideo(roomId: string, hostId: string, videoPath: string | null) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    if (room.hostId !== hostId) {
      throw new ForbiddenException('Only the host can modify the room video');
    }
    return this.prisma.room.update({
      where: { id: roomId },
      data: { videoPath },
      select: { id: true, videoPath: true },
    });
  }

  /** Exclui a sala */
  async deleteRoom(roomId: string, hostId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    if (room.hostId !== hostId) {
      throw new ForbiddenException('Only the host can delete the room');
    }
    await this.prisma.room.delete({
      where: { id: roomId },
    });
    return { success: true };
  }

  /** Retorna o estado síncrono salvo da sala (para late joiners quando a memória estiver vazia) */
  async getRoomState(roomId: string): Promise<RoomStateSyncPayload | null> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { state: true },
    });
    return (room?.state as unknown as RoomStateSyncPayload) || null;
  }

  /** Atualiza o estado síncrono da sala no banco */
  async saveRoomState(roomId: string, state: RoomStateSyncPayload) {
    return this.prisma.room.update({
      where: { id: roomId },
      data: { state: state as object },
      select: { id: true },
    });
  }
}
