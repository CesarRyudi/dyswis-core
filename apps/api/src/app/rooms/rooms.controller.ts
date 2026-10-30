/**
 * RoomsController — Endpoints de gestão de salas.
 *
 * POST   /api/rooms                    — Cria sala (protegido: requer JWT)
 * GET    /api/rooms                     — Lista salas do Host autenticado (protegido)
 * GET    /api/rooms/:id?token=          — Busca sala por ID + valida token (público)
 * POST   /api/rooms/:id/verify-password — Verifica senha da sala
 * POST   /api/rooms/:id/upload-pdf      — Upload de PDF para a sala (protegido)
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { randomBytes } from 'crypto';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService } from '../storage/storage.service';
import { RoomsService } from './rooms.service';

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  password?: string;
}

export class JoinByCodeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsOptional()
  password?: string;
}

export class UpdateRoomStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: string;
}

export class VerifyPasswordDto {
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class UpdateRoomDescriptionDto {
  @IsString()
  description!: string;
}

interface AuthenticatedRequest {
  user: { userId: string; email: string };
}

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly storage: StorageService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateRoomDto) {
    return this.rooms.create(req.user.userId, dto.name, dto.password);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Req() req: AuthenticatedRequest) {
    return this.rooms.findAllByHost(req.user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  deleteRoom(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.rooms.deleteRoom(id, req.user.userId);
  }

  @Post('join')
  joinByCode(@Body() body: JoinByCodeDto) {
    return this.rooms.joinByCode(body.code, body.password);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateRoomStatusDto,
  ) {
    return this.rooms.updateStatus(id, req.user.userId, body.status);
  }

  @Get('code/:code')
  findByCode(@Param('code') code: string) {
    return this.rooms.findByCode(code);
  }

  @Get(':id')
  findById(@Param('id') id: string, @Query('token') token: string) {
    return this.rooms.findById(id, token);
  }

  @Post(':id/verify-password')
  verifyPassword(
    @Param('id') id: string,
    @Query('token') token: string,
    @Body() body: VerifyPasswordDto,
  ) {
    return this.rooms.verifyPassword(id, token, body.password);
  }

  @Patch(':id/description')
  @UseGuards(JwtAuthGuard)
  updateDescription(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateRoomDescriptionDto,
  ) {
    return this.rooms.updateDescription(id, req.user.userId, body.description);
  }

  @Post(':id/upload-pdf')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
      fileFilter: (_req, file, cb) => {
        const isPdf =
          file.mimetype === 'application/pdf' ||
          file.originalname.toLowerCase().endsWith('.pdf');
        if (!isPdf) {
          cb(
            new BadRequestException('Only PDF files are allowed.'),
            false,
          );
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadPdf(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'No PDF file was provided or the file format was rejected.',
      );
    }
    const unique = randomBytes(8).toString('hex');
    const ext = extname(file.originalname);
    const filename = `${unique}${ext}`;
    const pdfPath = await this.storage.upload(
      file.buffer,
      filename,
      file.mimetype,
    );
    return this.rooms.updatePdf(id, req.user.userId, pdfPath);
  }

  @Post(':id/upload-video')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB limit for videos
      fileFilter: (_req, file, cb) => {
        const isVideo =
          file.mimetype.startsWith('video/') ||
          file.mimetype.startsWith('audio/') ||
          /\.(mp4|webm|mov|m4v|mkv|mp3|wav|ogg|aac|flac)$/i.test(
            file.originalname,
          );
        if (!isVideo) {
          cb(
            new BadRequestException(
              'Only video or audio files are allowed (e.g. MP4, WebM, MOV).',
            ),
            false,
          );
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadVideo(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'No video file was provided or the file format was rejected.',
      );
    }
    const unique = randomBytes(8).toString('hex');
    const ext = extname(file.originalname);
    const filename = `${unique}${ext}`;
    const videoPath = await this.storage.upload(
      file.buffer,
      filename,
      file.mimetype,
      'videos', // usa bucket diferente se estiver usando Supabase
    );
    return this.rooms.updateVideo(id, req.user.userId, videoPath);
  }

  @Delete(':id/pdf')
  @UseGuards(JwtAuthGuard)
  removePdf(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.rooms.updatePdf(id, req.user.userId, null);
  }

  @Delete(':id/video')
  @UseGuards(JwtAuthGuard)
  removeVideo(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.rooms.updateVideo(id, req.user.userId, null);
  }
}
