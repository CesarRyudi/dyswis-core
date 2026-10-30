import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';

describe('AuthService', () => {
  let authService: AuthService;
  let mockPrisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let mockJwt: {
    sign: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    mockJwt = {
      sign: vi.fn().mockReturnValue('mock-jwt-token-12345'),
    };

    authService = new AuthService(
      mockPrisma as unknown as PrismaService,
      mockJwt as unknown as JwtService,
    );
  });

  describe('register', () => {
    it('should register a new user with hashed password and return access token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'usr_abc123',
        email: 'alice@dyswis.com',
        name: 'Alice Presenter',
      });

      const result = await authService.register('alice@dyswis.com', 'Password123!', 'Alice Presenter');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'alice@dyswis.com' },
      });
      expect(mockPrisma.user.create).toHaveBeenCalled();
      const createData = mockPrisma.user.create.mock.calls[0][0].data;
      expect(createData.email).toBe('alice@dyswis.com');
      expect(createData.name).toBe('Alice Presenter');
      // Ensure password was hashed and not stored in plaintext
      expect(createData.password).not.toBe('Password123!');
      expect(await bcrypt.compare('Password123!', createData.password)).toBe(true);

      expect(result).toEqual({
        accessToken: 'mock-jwt-token-12345',
        user: {
          id: 'usr_abc123',
          email: 'alice@dyswis.com',
          name: 'Alice Presenter',
        },
      });
    });

    it('should throw ConflictException if email is already registered', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'usr_existing',
        email: 'existing@dyswis.com',
      });

      await expect(
        authService.register('existing@dyswis.com', 'Password123!', 'Existing User'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login (Security & Anti-Enumeration)', () => {
    it('should throw UnauthorizedException with opaque message when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login('notfound@dyswis.com', 'RandomPassword!'),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        authService.login('notfound@dyswis.com', 'RandomPassword!'),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException when user has no password (e.g. OAuth only)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'usr_oauth',
        email: 'oauth@dyswis.com',
        password: null,
      });

      await expect(
        authService.login('oauth@dyswis.com', 'RandomPassword!'),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException with identical opaque message when password is wrong', async () => {
      const hashedPassword = await bcrypt.hash('CorrectPassword123!', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'usr_valid',
        email: 'user@dyswis.com',
        password: hashedPassword,
        name: 'Valid User',
      });

      await expect(
        authService.login('user@dyswis.com', 'WrongPassword!'),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should authenticate successfully with valid credentials and return signed JWT', async () => {
      const hashedPassword = await bcrypt.hash('CorrectPassword123!', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'usr_valid',
        email: 'user@dyswis.com',
        password: hashedPassword,
        name: 'Valid User',
      });

      const result = await authService.login('user@dyswis.com', 'CorrectPassword123!');

      expect(mockJwt.sign).toHaveBeenCalledWith({
        sub: 'usr_valid',
        email: 'user@dyswis.com',
      });
      expect(result).toEqual({
        accessToken: 'mock-jwt-token-12345',
        user: {
          id: 'usr_valid',
          email: 'user@dyswis.com',
          name: 'Valid User',
        },
      });
    });
  });

  describe('validateOAuthUser', () => {
    it('should create a new user when OAuth user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'usr_oauth_new',
        email: 'oauthnew@dyswis.com',
        name: 'OAuth User',
        googleId: 'google-id-999',
      });

      const result = await authService.validateOAuthUser('oauthnew@dyswis.com', 'OAuth User', 'google-id-999');

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'oauthnew@dyswis.com',
          name: 'OAuth User',
          googleId: 'google-id-999',
        },
      });
      expect(result.user.id).toBe('usr_oauth_new');
      expect(result.accessToken).toBe('mock-jwt-token-12345');
    });

    it('should link googleId to existing user if not yet linked', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'usr_existing_local',
        email: 'local@dyswis.com',
        name: 'Local User',
        googleId: null,
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 'usr_existing_local',
        email: 'local@dyswis.com',
        name: 'Local User',
        googleId: 'google-id-777',
      });

      const result = await authService.validateOAuthUser('local@dyswis.com', 'Local User', 'google-id-777');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'usr_existing_local' },
        data: { googleId: 'google-id-777' },
      });
      expect(result.user.id).toBe('usr_existing_local');
    });
  });
});
