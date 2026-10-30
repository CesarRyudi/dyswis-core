/**
 * AuthController — Public endpoints for host registration, login, and Google OAuth.
 *
 * POST /api/auth/register — Registers a new Host account
 * POST /api/auth/login    — Authenticates Host and issues JWT access token
 * GET  /api/auth/google   — Initiates Google OAuth2 federation
 */
import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

interface OAuthAuthenticatedRequest extends Request {
  user: {
    accessToken: string;
    user: { id: string; email: string; name: string };
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.name);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Passport redirects automatically to Google OAuth consent
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleAuthRedirect(@Req() req: OAuthAuthenticatedRequest, @Res() res: Response) {
    const { accessToken, user } = req.user;
    const frontendUrl = process.env['CORS_ORIGIN'] || process.env['FRONTEND_URL'] || 'http://localhost:4200';
    const encodedUser = encodeURIComponent(JSON.stringify(user));
    res.redirect(`${frontendUrl}/login?token=${accessToken}&user=${encodedUser}`);
  }
}
