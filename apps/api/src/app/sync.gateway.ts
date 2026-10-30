import type {
  JoinRoomPayload,
  RoomDescriptionUpdatePayload,
  SyncPagePayload,
  SyncScrollPayload,
  GhostHighlightPayload,
  ClockPingPayload,
  SyncTestPreparePayload,
  SyncVideoPlayPayload,
  SyncVideoPausePayload,
  SyncVideoSeekPayload,
  SyncTabPayload,
  DrawStartPayload,
  DrawMovePayload,
  DrawEndPayload,
  DrawClearPayload,
  TextSelectionPayload,
  RoomStateSyncPayload,
  RoomPdfUpdatedPayload,
  RoomVideoUpdatedPayload,
  LineData,
  RoomStatusChangedPayload,
  CursorLaserPayload,
  DrawErasePayload,
} from '@dyswis/shared-types';
import { HelloPayload, SocketEvent } from '@dyswis/shared-types';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { RoomsService } from './rooms/rooms.service';

interface RoomState extends RoomStateSyncPayload {
  currentDrawingLine?: LineData;
}

@WebSocketGateway({
  cors: {
    origin: process.env['CORS_ORIGIN']
      ? process.env['CORS_ORIGIN'].split(',')
      : '*',
  },
})
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('SyncGateway');

  // In-memory state persistence for late joiners
  private readonly roomStates = new Map<string, RoomState>();
  private readonly saveTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(forwardRef(() => RoomsService))
    private readonly roomsService: RoomsService,
  ) {}

  // O ! indica ao TypeScript que o NestJS injetará este valor antes de qualquer uso
  @WebSocketServer()
  server!: Server;

  private getOrCreateRoomState(roomId: string): RoomState {
    let state = this.roomStates.get(roomId);
    if (!state) {
      state = { drawings: {} };
      this.roomStates.set(roomId, state);
    }
    return state;
  }

  private scheduleSave(roomId: string) {
    if (this.saveTimeouts.has(roomId)) {
      clearTimeout(this.saveTimeouts.get(roomId));
    }
    this.saveTimeouts.set(roomId, setTimeout(() => {
      const state = this.roomStates.get(roomId);
      if (state) {
        // We omit currentDrawingLine since it's transient
        const { currentDrawingLine, ...dbState } = state;
        void currentDrawingLine;
        this.roomsService.saveRoomState(roomId, dbState).catch((err: unknown) => {
          this.logger.error(`Error saving room state for ${roomId}:`, (err as Error)?.message ?? err);
        });
      }
    }, 2000));
  }

  private checkLeader(client: Socket): boolean {
    if (client.data?.role !== 'leader') {
      this.logger.warn(`[Security] Unauthorized leader action attempted by client ${client.id} (role: ${client.data?.role ?? 'none'})`);
      client.emit('error', { message: 'Unauthorized: Leader role required' });
      return false;
    }
    return true;
  }

  handleConnection(client: Socket) {
    const totalClients = this.server.sockets.sockets.size;
    this.logger.log(`📡 New client connected: ${client.id} (total: ${totalClients})`);

    client.emit(SocketEvent.HELLO, {
      message: 'Welcome to Dyswis!',
      role: 'viewer',
    } as HelloPayload);
  }

  handleDisconnect(client: Socket) {
    const roomId = client.data.roomId ?? '(no room)';
    this.logger.log(`🔌 Client disconnected: ${client.id} from room ${roomId}`);
  }

  /**
   * JOIN_ROOM: Client specifies room, role, and inviteToken.
   * Token is validated against database before admitting client.
   */
  @SubscribeMessage(SocketEvent.JOIN_ROOM)
  async handleJoinRoom(client: Socket, payload: JoinRoomPayload) {
    const { roomId, role, inviteToken } = payload;

    const valid = await this.roomsService.validateToken(roomId, inviteToken);
    if (!valid) {
      client.emit('error', { message: 'Invalid invite token' });
      client.disconnect(true);
      return;
    }

    // Hydration: If room is not cached in memory, load from database
    if (!this.roomStates.has(roomId)) {
      try {
        const dbState = await this.roomsService.getRoomState(roomId);
        if (dbState) {
          this.roomStates.set(roomId, dbState as RoomState);
        } else {
          this.roomStates.set(roomId, { drawings: {} });
        }
      } catch (err) {
        this.logger.error(`Error loading state for room ${roomId}:`, err);
        this.roomStates.set(roomId, { drawings: {} });
      }
    }

    const state = this.getOrCreateRoomState(roomId);
    if (!state.status) {
      try {
        const room = await this.roomsService.getRoomStatusOnly(roomId);
        if (room?.status) {
          state.status = room.status as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
        }
      } catch (err) {
        this.logger.error(`Error loading status for room ${roomId}:`, err);
      }
    }
    if (state.pdfPage === undefined) {
      state.pdfPage = 1;
    }
    if (!state.activeTab) {
      state.activeTab = 'pdf';
    }

    client.data.roomId = roomId;
    client.data.role = role;
    client.join(roomId);
    this.logger.log(`🚪 Client ${client.id} joined room "${roomId}" as ${role}`);

    if (state) {
      const { currentDrawingLine, ...cleanState } = state;
      void currentDrawingLine;
      client.emit(SocketEvent.ROOM_STATE_SYNC, cleanState);
    }
  }

  /**
   * Receives page changes from Leader and broadcasts to room.
   */
  @SubscribeMessage(SocketEvent.SYNC_PAGE)
  handleSyncPage(client: Socket, payload: SyncPagePayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;

    const state = this.getOrCreateRoomState(roomId);
    state.pdfPage = payload.page;
    this.scheduleSave(roomId);

    this.logger.log(`📄 Leader ${client.id} [room ${roomId}] changed page to: ${payload.page}`);
    this.server.to(roomId).emit(SocketEvent.SYNC_PAGE, payload);
  }

  /**
   * Receives Force Sync command from Leader.
   */
  @SubscribeMessage(SocketEvent.FORCE_SYNC)
  handleForceSync(client: Socket, payload: SyncPagePayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;
    this.logger.log(`⚡ Leader ${client.id} [room ${roomId}] forced page sync to: ${payload.page}`);
    this.server.to(roomId).emit(SocketEvent.FORCE_SYNC, payload);
  }

  /**
   * Receives scroll sync from Leader.
   */
  @SubscribeMessage(SocketEvent.SYNC_SCROLL)
  handleSyncScroll(client: Socket, payload: SyncScrollPayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;

    const state = this.getOrCreateRoomState(roomId);
    state.textScroll = payload;
    this.scheduleSave(roomId);

    this.server.to(roomId).emit(SocketEvent.SYNC_SCROLL, payload);
  }

  /**
   * Receives Force Scroll Sync command from Leader.
   */
  @SubscribeMessage(SocketEvent.FORCE_SCROLL)
  handleForceScroll(client: Socket, payload: SyncScrollPayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;
    this.logger.log(`⚡ Leader ${client.id} [room ${roomId}] forced scroll sync`);
    this.server.to(roomId).emit(SocketEvent.FORCE_SCROLL, payload);
  }

  /**
   * Atualização da descrição
   */
  @SubscribeMessage(SocketEvent.ROOM_DESCRIPTION_UPDATE)
  handleRoomDescriptionUpdate(
    client: Socket,
    payload: RoomDescriptionUpdatePayload,
  ) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;
    this.server.to(roomId).emit(SocketEvent.ROOM_DESCRIPTION_UPDATE, payload);
  }

  @SubscribeMessage(SocketEvent.GHOST_HIGHLIGHT)
  handleGhostHighlight(client: Socket, payload: GhostHighlightPayload) {
    const roomId = client.data.roomId;
    if (!roomId) return;
    client.broadcast.to(roomId).emit(SocketEvent.GHOST_HIGHLIGHT, payload);
  }

  // === FASE 3.A: Sincronização de Alta Precisão ===
  @SubscribeMessage(SocketEvent.CLOCK_PING)
  handleClockPing(client: Socket, payload: ClockPingPayload) {
    client.emit(SocketEvent.CLOCK_PONG, {
      clientTime: payload.clientTime,
      serverTime: Date.now(),
    });
  }

  // === FASE 3.B: Teste de Latência ===
  @SubscribeMessage(SocketEvent.SYNC_TEST_PREPARE)
  handleSyncTestPrepare(client: Socket) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;
    
    const targetTime = Date.now() + 2000;
    
    this.server.to(roomId).emit(SocketEvent.SYNC_TEST_PREPARE, {
      targetTime,
    } as SyncTestPreparePayload);
  }

  @SubscribeMessage(SocketEvent.SYNC_TEST_CANCEL)
  handleSyncTestCancel(client: Socket) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;
    this.server.to(roomId).emit(SocketEvent.SYNC_TEST_CANCEL);
  }

  // === FASE 3.C: Sincronização de Vídeo ===
  @SubscribeMessage(SocketEvent.SYNC_VIDEO_PLAY)
  handleSyncVideoPlay(client: Socket, payload: { videoTime: number }) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;

    const now = Date.now();
    const targetTime = now + 1500;

    const state = this.getOrCreateRoomState(roomId);
    if (!state.videoState) state.videoState = {};
    state.videoState.playing = true;
    state.videoState.videoTime = payload.videoTime;
    state.videoState.targetTime = targetTime;
    state.videoState.timestamp = now;
    this.scheduleSave(roomId);

    this.server.to(roomId).emit(SocketEvent.SYNC_VIDEO_PLAY, {
      videoTime: payload.videoTime,
      targetTime,
      timestamp: now,
    } as SyncVideoPlayPayload);
  }

  @SubscribeMessage(SocketEvent.SYNC_VIDEO_PAUSE)
  handleSyncVideoPause(client: Socket, payload: SyncVideoPausePayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;

    const state = this.getOrCreateRoomState(roomId);
    if (!state.videoState) state.videoState = {};
    state.videoState.playing = false;
    state.videoState.videoTime = payload.videoTime;
    this.scheduleSave(roomId);

    this.server.to(roomId).emit(SocketEvent.SYNC_VIDEO_PAUSE, payload);
  }

  @SubscribeMessage(SocketEvent.SYNC_VIDEO_SEEK)
  handleSyncVideoSeek(client: Socket, payload: SyncVideoSeekPayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;

    const state = this.getOrCreateRoomState(roomId);
    if (!state.videoState) state.videoState = {};
    state.videoState.videoTime = payload.videoTime;
    this.scheduleSave(roomId);

    this.server.to(roomId).emit(SocketEvent.SYNC_VIDEO_SEEK, payload);
  }

  @SubscribeMessage(SocketEvent.SYNC_VIDEO_HEARTBEAT)
  handleSyncVideoHeartbeat(client: Socket, payload: { videoTime: number }) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;

    // Atualiza estado de reprodução em memória para late-joiners receberem via ROOM_STATE_SYNC
    const state = this.getOrCreateRoomState(roomId);
    if (!state.videoState) state.videoState = {};
    state.videoState.playing = true;
    state.videoState.videoTime = payload.videoTime;
    state.videoState.timestamp = Date.now();

    // Heartbeat is too frequent to save state every time, we skip saving it to DB
    this.server.to(roomId).emit(SocketEvent.SYNC_VIDEO_HEARTBEAT, {
      videoTime: payload.videoTime,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(SocketEvent.SYNC_VIDEO_MUTE_VIEWERS)
  handleSyncVideoMuteViewers(client: Socket, payload: { muted: boolean }) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;

    const state = this.getOrCreateRoomState(roomId);
    if (!state.videoState) state.videoState = {};
    state.videoState.muted = payload.muted;
    this.scheduleSave(roomId);

    this.server.to(roomId).emit(SocketEvent.SYNC_VIDEO_MUTE_VIEWERS, payload);
  }

  // === Sincronização de Modo/Aba ===
  @SubscribeMessage(SocketEvent.SYNC_TAB)
  handleSyncTab(client: Socket, payload: SyncTabPayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;

    const state = this.getOrCreateRoomState(roomId);
    state.activeTab = payload.tab;
    this.scheduleSave(roomId);

    this.logger.log(`📋 Leader ${client.id} [sala ${roomId}] trocou para modo: ${payload.tab}`);
    this.server.to(roomId).emit(SocketEvent.SYNC_TAB, payload);
  }

  // === FASE 4: Desenho Proporcional no PDF ===
  @SubscribeMessage(SocketEvent.DRAW_START)
  handleDrawStart(client: Socket, payload: DrawStartPayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;

    const state = this.getOrCreateRoomState(roomId);
    state.currentDrawingLine = {
      color: payload.color,
      thickness: payload.thickness,
      points: [payload.point],
    };

    client.broadcast.to(roomId).emit(SocketEvent.DRAW_START, payload);
  }

  @SubscribeMessage(SocketEvent.DRAW_MOVE)
  handleDrawMove(client: Socket, payload: DrawMovePayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;

    const state = this.getOrCreateRoomState(roomId);
    if (state.currentDrawingLine) {
      state.currentDrawingLine.points.push(payload.point);
    }

    client.broadcast.to(roomId).emit(SocketEvent.DRAW_MOVE, payload);
  }

  @SubscribeMessage(SocketEvent.DRAW_END)
  handleDrawEnd(client: Socket, payload: DrawEndPayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;

    const state = this.getOrCreateRoomState(roomId);
    if (state.currentDrawingLine) {
      if (!state.drawings) state.drawings = {};
      if (!state.drawings[payload.pageNumber]) state.drawings[payload.pageNumber] = [];
      
      state.drawings[payload.pageNumber].push(state.currentDrawingLine);
      state.currentDrawingLine = undefined;
      this.scheduleSave(roomId);
    }

    client.broadcast.to(roomId).emit(SocketEvent.DRAW_END, payload);
  }

  @SubscribeMessage(SocketEvent.DRAW_CLEAR)
  handleDrawClear(client: Socket, payload: DrawClearPayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;

    const state = this.getOrCreateRoomState(roomId);
    if (payload.pageNumber !== undefined) {
      if (state.drawings && state.drawings[payload.pageNumber]) {
        state.drawings[payload.pageNumber] = [];
        this.scheduleSave(roomId);
      }
    } else {
      state.drawings = {};
      this.scheduleSave(roomId);
    }

    this.server.to(roomId).emit(SocketEvent.DRAW_CLEAR, payload);
  }

  @SubscribeMessage(SocketEvent.DRAW_ERASE)
  handleDrawErase(client: Socket, payload: DrawErasePayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;

    const state = this.getOrCreateRoomState(roomId);
    if (state.drawings && state.drawings[payload.pageNumber]) {
      state.drawings[payload.pageNumber].splice(payload.lineIndex, 1);
      this.scheduleSave(roomId);
    }

    client.broadcast.to(roomId).emit(SocketEvent.DRAW_ERASE, payload);
  }

  @SubscribeMessage(SocketEvent.CURSOR_LASER)
  handleCursorLaser(client: Socket, payload: CursorLaserPayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;
    // Não persistimos o laser, apenas fazemos broadcast
    client.broadcast.to(roomId).emit(SocketEvent.CURSOR_LASER, payload);
  }

  // === FASE 4: Espelhamento de Seleção de Texto ===
  @SubscribeMessage(SocketEvent.TEXT_SELECTION)
  handleTextSelection(client: Socket, payload: TextSelectionPayload) {
    const roomId = client.data.roomId;
    if (!roomId) return;
    client.broadcast.to(roomId).emit(SocketEvent.TEXT_SELECTION, payload);
  }

  // === FASE 5: Notificações de Sala ===
  @SubscribeMessage(SocketEvent.ROOM_PDF_UPDATED)
  handleRoomPdfUpdated(client: Socket, payload: RoomPdfUpdatedPayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;
    this.logger.log(`[${roomId}] PDF atualizado: ${payload.pdfPath}`);
    // Broadcast para todos na sala (incluindo o próprio Host para manter consistência)
    this.server.to(roomId).emit(SocketEvent.ROOM_PDF_UPDATED, payload);
  }

  @SubscribeMessage(SocketEvent.ROOM_VIDEO_UPDATED)
  handleRoomVideoUpdated(client: Socket, payload: RoomVideoUpdatedPayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;
    this.logger.log(`[${roomId}] Vídeo atualizado: ${payload.videoPath}`);
    // Broadcast para todos na sala (incluindo o próprio Host para manter consistência)
    this.server.to(roomId).emit(SocketEvent.ROOM_VIDEO_UPDATED, payload);
  }

  @SubscribeMessage(SocketEvent.ROOM_STATUS_CHANGED)
  handleRoomStatusChanged(client: Socket, payload: RoomStatusChangedPayload) {
    if (!this.checkLeader(client)) return;
    const roomId = client.data.roomId;
    if (!roomId) return;
    const state = this.getOrCreateRoomState(roomId);
    state.status = payload.status;
    this.logger.log(`[${roomId}] Status alterado para: ${payload.status}`);
    this.server.to(roomId).emit(SocketEvent.ROOM_STATUS_CHANGED, payload);
  }

  /**
   * Broadcast imperativo disparado pelo backend (ex: RoomsService ao salvar via REST)
   */
  broadcastRoomStatus(roomId: string, status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED') {
    const state = this.getOrCreateRoomState(roomId);
    state.status = status;
    this.logger.log(`📢 [${roomId}] Broadcast status alterado para: ${status}`);
    if (this.server) {
      this.server.to(roomId).emit(SocketEvent.ROOM_STATUS_CHANGED, { status });
    }
  }
}
