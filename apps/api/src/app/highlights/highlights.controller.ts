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
import { HighlightsService } from './highlights.service';
import type { CreateHighlightDto, UpdateHighlightDto } from './highlights.service';

interface AuthenticatedRequest {
  user: { userId: string; email: string };
}

@Controller('highlights')
@UseGuards(JwtAuthGuard)
export class HighlightsController {
  constructor(private readonly highlightsService: HighlightsService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateHighlightDto) {
    if (!dto.roomId) throw new BadRequestException('roomId é obrigatório');
    if (!dto.blockId) throw new BadRequestException('blockId é obrigatório');
    return this.highlightsService.create(req.user.userId, dto);
  }

  @Get()
  findAllByRoom(@Req() req: AuthenticatedRequest, @Query('roomId') roomId: string) {
    if (!roomId) throw new BadRequestException('roomId é obrigatório');
    return this.highlightsService.findAllByRoom(roomId, req.user.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateHighlightDto,
  ) {
    return this.highlightsService.update(id, req.user.userId, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.highlightsService.delete(id, req.user.userId);
  }
}
