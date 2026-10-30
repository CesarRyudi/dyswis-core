import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface CreateAnnotationDto {
  roomId: string;
  blockId?: string;
  originalText?: string;
  mediaId?: string;
  pdfPage?: number;
  pdfX?: number;
  pdfY?: number;
  content: string;
}

export interface UpdateAnnotationDto {
  content?: string;
}

@Injectable()
export class AnnotationsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: CreateAnnotationDto) {
    return this.prisma.annotation.create({
      data: {
        userId,
        roomId: data.roomId,
        blockId: data.blockId,
        originalText: data.originalText,
        mediaId: data.mediaId,
        pdfPage: data.pdfPage,
        pdfX: data.pdfX,
        pdfY: data.pdfY,
        content: data.content,
      },
    });
  }

  async findAllByRoom(roomId: string, userId: string, mediaId?: string) {
    return this.prisma.annotation.findMany({
      where: { roomId, userId, ...(mediaId ? { mediaId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAllByUser(userId: string) {
    return this.prisma.annotation.findMany({
      where: { userId },
      include: {
        room: {
          select: {
            name: true,
            pdfPath: true,
            inviteToken: true,
            description: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, userId: string, data: UpdateAnnotationDto) {
    const annotation = await this.prisma.annotation.findUnique({
      where: { id },
    });
    if (!annotation) throw new NotFoundException('Anotação não encontrada');
    if (annotation.userId !== userId) throw new ForbiddenException('Sem permissão');

    return this.prisma.annotation.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, userId: string) {
    const annotation = await this.prisma.annotation.findUnique({
      where: { id },
    });
    if (!annotation) throw new NotFoundException('Anotação não encontrada');
    if (annotation.userId !== userId) throw new ForbiddenException('Sem permissão');

    return this.prisma.annotation.delete({
      where: { id },
    });
  }
}
