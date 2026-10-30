import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnnotationsService } from './annotations.service';
import type { CreateAnnotationDto, UpdateAnnotationDto } from './annotations.service';


interface AuthenticatedRequest {
  user: { userId: string; email: string };
}

@Controller('annotations')
@UseGuards(JwtAuthGuard)
export class AnnotationsController {
  constructor(private readonly annotationsService: AnnotationsService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateAnnotationDto) {
    if (!dto.roomId) throw new BadRequestException('roomId é obrigatório');
    return this.annotationsService.create(req.user.userId, dto);
  }

  @Get('all')
  findAllByUser(@Req() req: AuthenticatedRequest) {
    return this.annotationsService.findAllByUser(req.user.userId);
  }

  @Get()
  findAllByRoom(@Req() req: AuthenticatedRequest, @Query('roomId') roomId: string, @Query('mediaId') mediaId?: string) {
    if (!roomId) throw new BadRequestException('roomId é obrigatório');
    return this.annotationsService.findAllByRoom(roomId, req.user.userId, mediaId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateAnnotationDto,
  ) {
    return this.annotationsService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.annotationsService.delete(id, req.user.userId);
  }
}
