import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface CreateHighlightDto {
  roomId: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  color?: string;
  text?: string;
}

export interface UpdateHighlightDto {
  color?: string;
}

@Injectable()
export class HighlightsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: CreateHighlightDto) {
    return this.prisma.highlight.create({
      data: {
        userId,
        roomId: data.roomId,
        blockId: data.blockId,
        startOffset: data.startOffset,
        endOffset: data.endOffset,
        color: data.color || '#FFEB3B',
        text: data.text,
      },
    });
  }

  async findAllByRoom(roomId: string, userId: string) {
    return this.prisma.highlight.findMany({
      where: { roomId, userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(id: string, userId: string, data: UpdateHighlightDto) {
    const highlight = await this.prisma.highlight.findUnique({
      where: { id },
    });
    if (!highlight) throw new NotFoundException('Marcação não encontrada');
    if (highlight.userId !== userId) throw new ForbiddenException('Sem permissão');

    return this.prisma.highlight.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, userId: string) {
    const highlight = await this.prisma.highlight.findUnique({
      where: { id },
    });
    if (!highlight) throw new NotFoundException('Marcação não encontrada');
    if (highlight.userId !== userId) throw new ForbiddenException('Sem permissão');

    return this.prisma.highlight.delete({
      where: { id },
    });
  }
}
