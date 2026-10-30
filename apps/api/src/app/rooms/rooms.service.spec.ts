import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma.service';
import { SyncGateway } from '../sync.gateway';

describe('RoomsService (Room Lifecycle & Access Security)', () => {
  let roomsService: RoomsService;
  let mockPrisma: {
    room: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
  let mockSyncGateway: {
    broadcastRoomStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPrisma = {
      room: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };

    mockSyncGateway = {
      broadcastRoomStatus: vi.fn(),
    };

    roomsService = new RoomsService(
      mockPrisma as unknown as PrismaService,
      mockSyncGateway as unknown as SyncGateway,
    );
  });

  describe('validateToken (Socket Handshake Gate)', () => {
    it('should return false if token is empty or null', async () => {
      const result = await roomsService.validateToken('room_1', '');
      expect(result).toBe(false);
      expect(mockPrisma.room.findUnique).not.toHaveBeenCalled();
    });

    it('should return false if room does not exist', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(null);

      const result = await roomsService.validateToken('room_ghost', 'token_123');
      expect(result).toBe(false);
    });

    it('should return true if token matches the room inviteToken', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({
        inviteToken: 'correct_token_xyz',
      });

      const result = await roomsService.validateToken('room_1', 'correct_token_xyz');
      expect(result).toBe(true);
    });

    it('should return false if token does not match', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({
        inviteToken: 'correct_token_xyz',
      });

      const result = await roomsService.validateToken('room_1', 'wrong_token');
      expect(result).toBe(false);
    });
  });

  describe('verifyPassword', () => {
    it('should throw ForbiddenException if room not found or token does not match', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(null);

      await expect(
        roomsService.verifyPassword('room_1', 'bad_token', 'secret123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should succeed with ok: true when room has no password set', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({
        inviteToken: 'token_abc',
        password: null,
      });

      const result = await roomsService.verifyPassword('room_1', 'token_abc', 'any');
      expect(result).toEqual({ ok: true });
    });

    it('should throw ForbiddenException if password does not match hash', async () => {
      const hash = await bcrypt.hash('CorrectPass!', 10);
      mockPrisma.room.findUnique.mockResolvedValue({
        inviteToken: 'token_abc',
        password: hash,
      });

      await expect(
        roomsService.verifyPassword('room_1', 'token_abc', 'WrongPass!'),
      ).rejects.toThrow('Incorrect room password');
    });

    it('should succeed with ok: true when password matches hash', async () => {
      const hash = await bcrypt.hash('CorrectPass!', 10);
      mockPrisma.room.findUnique.mockResolvedValue({
        inviteToken: 'token_abc',
        password: hash,
      });

      const result = await roomsService.verifyPassword('room_1', 'token_abc', 'CorrectPass!');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException when room does not exist', async () => {
      mockPrisma.room.findUnique.mockResolvedValue(null);

      await expect(
        roomsService.findById('missing_id', 'any_token'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when room has password and token is invalid', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({
        id: 'room_sec',
        password: 'hashed_password',
        inviteToken: 'valid_token',
      });

      await expect(
        roomsService.findById('room_sec', 'invalid_token'),
      ).rejects.toThrow('Invalid invite link');
    });

    it('should return sanitized room data without raw password or token when authenticated', async () => {
      mockPrisma.room.findUnique.mockResolvedValue({
        id: 'room_public',
        name: 'Math 101',
        password: null,
        inviteToken: 'tok_123',
        status: 'ACTIVE',
        host: { name: 'Dr. Smith' },
        createdAt: new Date(),
      });

      const result = await roomsService.findById('room_public', 'tok_123');

      expect(result.id).toBe('room_public');
      expect(result.hasPassword).toBe(false);
      expect('password' in result).toBe(false);
    });
  });

  describe('create (ShortCode & Entropy)', () => {
    it('should generate a 6-character shortCode and create room', async () => {
      // First attempt findUnique for shortCode collision check returns null (unique)
      mockPrisma.room.findUnique.mockResolvedValue(null);
      mockPrisma.room.create.mockResolvedValue({
        id: 'new_room_id',
        name: 'Physics Lecture',
        shortCode: 'ABC123',
        status: 'INACTIVE',
        inviteToken: 'random_hex_32_chars',
        createdAt: new Date(),
      });

      const result = await roomsService.create('host_1', 'Physics Lecture');

      expect(mockPrisma.room.create).toHaveBeenCalled();
      const createPayload = mockPrisma.room.create.mock.calls[0][0].data;
      expect(createPayload.name).toBe('Physics Lecture');
      expect(createPayload.hostId).toBe('host_1');
      expect(createPayload.inviteToken).toHaveLength(32);
      expect(createPayload.shortCode).toHaveLength(6);
      expect(result.shortCode).toBe('ABC123');
    });
  });
});
