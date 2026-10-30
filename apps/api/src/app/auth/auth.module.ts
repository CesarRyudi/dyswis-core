/**
 * AuthModule — Agrupa providers de autenticação.
 *
 * POR QUÊ módulo separado: Isolar responsabilidades. O AppModule importa
 * AuthModule e ganha acesso aos guards e ao JwtService sem acoplamento direto.
 *
 * JWT_SECRET: Em dev usa fallback hardcoded. Em produção DEVE ser variável de ambiente.
 * expiresIn: 7d é razoável para o MVP (sem refresh token por enquanto).
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaService } from '../prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './google.strategy';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env['JWT_SECRET'] || 'dyswis-dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy, PrismaService],
  exports: [AuthService],
})
export class AuthModule {}
