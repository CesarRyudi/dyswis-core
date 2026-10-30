/**
 * AuthService — Lógica de registro e login do Host.
 *
 * POR QUÊ bcrypt: hash unidirecional com salt embutido. O custo (10 rounds)
 * é suficiente para o MVP sem causar latência perceptível.
 *
 * POR QUÊ JWT: Token stateless retornado no login. O frontend armazena
 * e envia no header Authorization para rotas protegidas (ex: criar sala).
 */
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';

interface JwtPayload {
  sub: string; // userId
  email: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string, name: string) {
    let existing;
    try {
      existing = await this.prisma.user.findUnique({ where: { email } });
    } catch (error) {
      this.logger.error(`[Register] Failed to query database: ${(error as Error).message}`, (error as Error).stack);
      throw new InternalServerErrorException('Database communication failure. Please try again later.');
    }

    if (existing) {
      this.logger.warn(`[Register] Registration failed: Email already registered - ${email}`);
      throw new ConflictException('Email already registered');
    }

    const hash = await bcrypt.hash(password, 10);
    
    let user;
    try {
      user = await this.prisma.user.create({
        data: { email, password: hash, name },
      });
    } catch (error) {
      this.logger.error(`[Register] Failed to create user in database: ${(error as Error).message}`, (error as Error).stack);
      throw new InternalServerErrorException('Failed to create user in database.');
    }

    this.logger.log(`[Register] New user registered successfully: ${email}`);
    return this.buildTokenResponse(user.id, user.email, user.name);
  }

  async login(email: string, password: string) {
    let user;
    try {
      user = await this.prisma.user.findUnique({ where: { email } });
    } catch (error) {
      this.logger.error(`[Login] Failed to query user in database: ${(error as Error).message}`, (error as Error).stack);
      throw new InternalServerErrorException('Database communication failure. Please try again later.');
    }

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildTokenResponse(user.id, user.email, user.name);
  }

  async validateOAuthUser(email: string, name: string, googleId: string) {
    let user;
    try {
      user = await this.prisma.user.findUnique({ where: { email } });
    } catch (error) {
      this.logger.error(`[OAuth] Failed to query user in database: ${(error as Error).message}`, (error as Error).stack);
      throw new InternalServerErrorException('Database communication failure. Please try again later.');
    }

    if (!user) {
      try {
        user = await this.prisma.user.create({
          data: { email, name, googleId },
        });
        this.logger.log(`[OAuth] New user created via Google: ${email}`);
      } catch (error) {
        this.logger.error(`[OAuth] Failed to create user via Google: ${(error as Error).message}`, (error as Error).stack);
        throw new InternalServerErrorException('Failed to create user in database.');
      }
    } else if (!user.googleId) {
      try {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId },
        });
        this.logger.log(`[OAuth] Existing user linked with Google: ${email}`);
      } catch (error) {
        this.logger.error(`[OAuth] Failed to link googleId: ${(error as Error).message}`, (error as Error).stack);
      }
    }

    return this.buildTokenResponse(user.id, user.email, user.name);
  }

  private buildTokenResponse(userId: string, email: string, name: string) {
    const payload: JwtPayload = { sub: userId, email };
    try {
      return {
        accessToken: this.jwt.sign(payload),
        user: { id: userId, email, name },
      };
    } catch (error) {
      this.logger.error(`[Token] Failed to sign JWT: ${(error as Error).message}`, (error as Error).stack);
      throw new InternalServerErrorException('Failed to generate access token. Missing or invalid JWT_SECRET.');
    }
  }
}
