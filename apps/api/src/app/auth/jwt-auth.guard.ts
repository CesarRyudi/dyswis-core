/**
 * JwtAuthGuard — Guard reutilizável para proteger rotas que exigem autenticação.
 *
 * USO: @UseGuards(JwtAuthGuard) no controller ou método.
 * Após validação, req.user contém { userId, email }.
 */
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
