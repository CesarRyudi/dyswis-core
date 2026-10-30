import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Socket, Server } from 'socket.io';
import { SocketEvent } from '@dyswis/shared-types';
import { SyncGateway } from './sync.gateway';
import { RoomsService } from './rooms/rooms.service';

describe('SyncGateway (WebSocket Orchestration & Authorization)', () => {
  let gateway: SyncGateway;
  let mockRoomsService: {
    validateToken: ReturnType<typeof vi.fn>;
    getRoomState: ReturnType<typeof vi.fn>;
    saveRoomState: ReturnType<typeof vi.fn>;
    getRoomStatusOnly: ReturnType<typeof vi.fn>;
  };
  let mockServer: {
    to: ReturnType<typeof vi.fn>;
    sockets: { sockets: Map<string, unknown> };
  };
  let mockRoomBroadcaster: {
    emit: ReturnType<typeof vi.fn>;
  };

  const createMockSocket = (role?: 'leader' | 'viewer', roomId = 'room_123'): Partial<Socket> => {
    const broadcastEmit = vi.fn();
    return {
      id: `socket_${Math.random().toString(36).substring(7)}`,
      data: { role, roomId },
      join: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      broadcast: {
        to: vi.fn().mockReturnValue({ emit: broadcastEmit }),
      } as unknown as Socket['broadcast'],
    };
  };

  beforeEach(() => {
    mockRoomsService = {
      validateToken: vi.fn(),
      getRoomState: vi.fn(),
      saveRoomState: vi.fn().mockResolvedValue({ id: 'room_123' }),
      getRoomStatusOnly: vi.fn(),
    };

    mockRoomBroadcaster = {
      emit: vi.fn(),
    };

    mockServer = {
      to: vi.fn().mockReturnValue(mockRoomBroadcaster),
      sockets: { sockets: new Map() },
    };

    gateway = new SyncGateway(mockRoomsService as unknown as RoomsService);
    gateway.server = mockServer as unknown as Server;
  });

  describe('Connection Lifecycle', () => {
    it('should welcome newly connected client with HELLO event and viewer role', () => {
      const client = createMockSocket() as Socket;
      gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith(SocketEvent.HELLO, {
        message: 'Welcome to Dyswis!',
        role: 'viewer',
      });
    });
  });

  describe('JOIN_ROOM Authentication & Validation', () => {
    it('should reject client and disconnect when inviteToken is invalid', async () => {
      mockRoomsService.validateToken.mockResolvedValue(false);
      const client = createMockSocket() as Socket;

      await gateway.handleJoinRoom(client, {
        roomId: 'room_sec_1',
        role: 'viewer',
        inviteToken: 'invalid-token-xyz',
      });

      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid invite token',
      });
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('should authenticate client, bind room context, and hydrate state on valid token', async () => {
      mockRoomsService.validateToken.mockResolvedValue(true);
      mockRoomsService.getRoomState.mockResolvedValue({
        pdfPage: 3,
        activeTab: 'pdf',
        status: 'ACTIVE',
      });
      const client = createMockSocket() as Socket;

      await gateway.handleJoinRoom(client, {
        roomId: 'room_sec_1',
        role: 'viewer',
        inviteToken: 'valid-token-123',
      });

      expect(client.join).toHaveBeenCalledWith('room_sec_1');
      expect(client.data.roomId).toBe('room_sec_1');
      expect(client.data.role).toBe('viewer');
      expect(client.emit).toHaveBeenCalledWith(
        SocketEvent.ROOM_STATE_SYNC,
        expect.objectContaining({
          pdfPage: 3,
          activeTab: 'pdf',
          status: 'ACTIVE',
        }),
      );
    });
  });

  describe('Role-Based Authorization (Leader-Only Channels)', () => {
    it('should reject SYNC_PAGE when attempted by a viewer', () => {
      const viewerSocket = createMockSocket('viewer', 'room_123') as Socket;

      gateway.handleSyncPage(viewerSocket, { page: 5 });

      expect(viewerSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Unauthorized: Leader role required',
      });
      expect(mockServer.to).not.toHaveBeenCalled();
    });

    it('should allow and broadcast SYNC_PAGE when triggered by a verified leader', () => {
      const leaderSocket = createMockSocket('leader', 'room_123') as Socket;

      gateway.handleSyncPage(leaderSocket, { page: 5 });

      expect(mockServer.to).toHaveBeenCalledWith('room_123');
      expect(mockRoomBroadcaster.emit).toHaveBeenCalledWith(SocketEvent.SYNC_PAGE, {
        page: 5,
      });
    });

    it('should reject DRAW_START when attempted by an unauthorized client', () => {
      const viewerSocket = createMockSocket('viewer', 'room_123') as Socket;

      gateway.handleDrawStart(viewerSocket, {
        pageNumber: 1,
        color: '#ff0000',
        thickness: 2,
        point: { x: 50, y: 50 },
      });

      expect(viewerSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Unauthorized: Leader role required',
      });
    });

    it('should reject DRAW_CLEAR when attempted by a viewer', () => {
      const viewerSocket = createMockSocket('viewer', 'room_123') as Socket;

      gateway.handleDrawClear(viewerSocket, { pageNumber: 1 });

      expect(viewerSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Unauthorized: Leader role required',
      });
      expect(viewerSocket.broadcast.to).not.toHaveBeenCalled();
    });

    it('should reject FORCE_SYNC when attempted by a viewer', () => {
      const viewerSocket = createMockSocket('viewer', 'room_123') as Socket;

      gateway.handleForceSync(viewerSocket, { page: 2 });

      expect(viewerSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Unauthorized: Leader role required',
      });
      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });

  describe('NTP-Inspired Clock Synchronization', () => {
    it('should respond with CLOCK_PONG containing client timestamp and server time', () => {
      const client = createMockSocket() as Socket;
      const t0 = 1710000000000;

      gateway.handleClockPing(client, { clientTime: t0 });

      expect(client.emit).toHaveBeenCalledWith(SocketEvent.CLOCK_PONG, {
        clientTime: t0,
        serverTime: expect.any(Number),
      });
    });
  });
});
