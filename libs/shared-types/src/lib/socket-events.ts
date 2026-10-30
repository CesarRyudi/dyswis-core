export enum SocketEvent {
  // Mensagem de boas-vindas ao conectar
  HELLO = 'hello',
  // Cliente entra em uma sala específica informando role e roomId
  JOIN_ROOM = 'join_room',
  // Sincronização em massa de todo o estado da sala para late joiners
  ROOM_STATE_SYNC = 'room_state_sync',
  // Host emite → Backend faz broadcast na sala → Viewers recebem
  SYNC_PAGE = 'sync_page',
  // Host força todos os Viewers da sala a voltarem ao modo "Seguindo" (PDF)
  FORCE_SYNC = 'force_sync',
  // Host emite posição de scroll do texto → Backend faz broadcast → Viewers recebem
  SYNC_SCROLL = 'sync_scroll',
  // Host força todos os Viewers da sala a voltarem ao modo "Seguindo" (Texto)
  FORCE_SCROLL = 'force_scroll',
  // Atualiza a descrição (texto) da sala em tempo real
  ROOM_DESCRIPTION_UPDATE = 'room_description_update',
  // Destaque temporário emitido via duplo clique (Ghost Highlight)
  GHOST_HIGHLIGHT = 'ghost_highlight',

  // === FASE 3.A: Sincronização de Alta Precisão ===
  // Cliente envia ping com t0
  CLOCK_PING = 'clock_ping',
  // Servidor responde com t0 e serverTime
  CLOCK_PONG = 'clock_pong',

  // === FASE 3.B: Teste de Latência ===
  // Host segura botão. Informa agendamento futuro
  SYNC_TEST_PREPARE = 'sync_test_prepare',
  // Host solta botão antes ou depois. Cancela e volta pra vermelho.
  SYNC_TEST_CANCEL = 'sync_test_cancel',

  // === FASE 3.C: Sincronização de Vídeo ===
  SYNC_VIDEO_PLAY = 'sync_video_play',
  SYNC_VIDEO_PAUSE = 'sync_video_pause',
  SYNC_VIDEO_SEEK = 'sync_video_seek',
  SYNC_VIDEO_HEARTBEAT = 'sync_video_heartbeat',
  SYNC_VIDEO_MUTE_VIEWERS = 'sync_video_mute_viewers',

  // === Sincronização de Modo/Aba ===
  // Leader emite quando troca de modo (PDF/Texto/Vídeo) → Viewers em follow acompanham
  SYNC_TAB = 'sync_tab',

  // === FASE 4: Desenho Proporcional no PDF ===
  DRAW_START = 'draw_start',
  DRAW_MOVE = 'draw_move',
  DRAW_END = 'draw_end',
  DRAW_CLEAR = 'draw_clear',

  // === FASE 4: Espelhamento de Seleção de Texto ===
  TEXT_SELECTION = 'text_selection',

  // === FASE 5: Notificações de Sala ===
  // Host trocou o PDF da sala → Viewers recarregam o arquivo
  ROOM_PDF_UPDATED = 'room_pdf_updated',
  // Host trocou o Vídeo da sala → Viewers recarregam o arquivo
  ROOM_VIDEO_UPDATED = 'room_video_updated',

  // === FASE 6: Sala de Espera e Ferramentas ===
  ROOM_STATUS_CHANGED = 'room_status_changed',
  CURSOR_LASER = 'cursor_laser',
  DRAW_ERASE = 'draw_erase',
}

export interface HelloPayload {
  message: string;
  role: 'leader' | 'viewer';
}

/** Payload enviado ao entrar em uma sala */
export interface JoinRoomPayload {
  roomId: string;
  role: 'leader' | 'viewer';
  inviteToken: string;
}

/** Payload do evento de sincronização de página */
export interface SyncPagePayload {
  page: number;
}

/**
 * Payload de sincronização de scroll de texto.
 *
 * Estratégia: ancoragem pelo topo da tela.
 * O Leader identifica qual linha está no topo visível do seu container e
 * envia o índice dela + o quanto o topo do viewport já avançou dentro da linha
 * (offsetRatio ∈ [0, 1]).
 *
 * O Viewer rola até:
 *   container.scrollTop = lineEl.offsetTop + offsetRatio * lineEl.offsetHeight
 *
 * Isso garante que o que está no topo da tela do Leader esteja no topo da tela
 * do Viewer, independente de tamanho de tela, zoom ou fonte.
 */
export interface SyncScrollPayload {
  /** Índice 0-based da linha ancorada no topo do viewport */
  lineIndex: number;
  /** Fração [0, 1] de quanto o topo do viewport avançou dentro dessa linha */
  offsetRatio: number;
  /** Timestamp opcional para forçar reatividade no React mesmo se a posição for idêntica */
  timestamp?: number;
}

/** Payload de atualização de descrição da sala */
export interface RoomDescriptionUpdatePayload {
  description: string;
}

/** Payload de destaque temporário (Ghost Highlight) */
export interface GhostHighlightPayload {
  lineIndex: number;
}

// === FASE 3: Sincronização ===

export interface ClockPingPayload {
  clientTime: number; // t0 do cliente
}

export interface ClockPongPayload {
  clientTime: number; // eco do t0 do cliente
  serverTime: number; // tempo do servidor no momento do processamento
}

export interface SyncTestPreparePayload {
  targetTime: number; // Tempo futuro absoluto em que o botão deve ficar verde
}

export interface SyncVideoPlayPayload {
  videoTime: number; // Tempo do vídeo em que o play foi dado
  targetTime: number; // Tempo futuro absoluto (NTP) em que o vídeo deve rodar
  timestamp: number; // Timestamp NTP exato do servidor no momento do play
}

export interface SyncVideoPausePayload {
  videoTime: number; // Tempo exato em que o vídeo foi pausado (para corrigir drifts)
}

export interface SyncVideoSeekPayload {
  videoTime: number; // Novo tempo do vídeo após o seek
}

export interface SyncVideoHeartbeatPayload {
  videoTime: number; // Tempo atual do vídeo do Leader
  timestamp: number; // Timestamp NTP de quando o heartbeat foi enviado
}

/** Payload de sincronização de aba/modo ativo */
export type ContentTab = 'pdf' | 'text' | 'video' | 'audio';

export interface SyncTabPayload {
  tab: ContentTab;
}

// === FASE 4: Desenho e Texto ===

export interface DrawPoint {
  /** Posição X normalizada (0 a 100) relativa à largura da página */
  x: number;
  /** Posição Y normalizada (0 a 100) relativa à altura da página */
  y: number;
}

export interface DrawStartPayload {
  pageNumber: number;
  point: DrawPoint;
  color: string;
  thickness: number;
}

export interface DrawMovePayload {
  pageNumber: number;
  point: DrawPoint;
}

export interface DrawEndPayload {
  pageNumber: number;
}

export interface DrawClearPayload {
  pageNumber?: number;
}

export interface TextSelectionPayload {
  from: number;
  to: number;
}

export interface LineData {
  color: string;
  thickness: number;
  points: DrawPoint[];
}

export interface RoomStateSyncPayload {
  activeTab?: ContentTab;
  pdfPage?: number;
  textScroll?: SyncScrollPayload;
  videoState?: {
    playing?: boolean;
    videoTime?: number;
    targetTime?: number;
    muted?: boolean;
    timestamp?: number;
  };
  drawings?: Record<number, LineData[]>;
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

/** Payload emitido quando o Host troca o PDF da sala */
export interface RoomPdfUpdatedPayload {
  pdfPath: string | null;
  pdfUrl: string | null;
}

/** Payload emitido quando o Host troca o Vídeo da sala */
export interface RoomVideoUpdatedPayload {
  videoPath: string | null;
  videoUrl: string | null;
}

export interface RoomStatusChangedPayload {
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

export interface CursorLaserPayload {
  pageNumber: number;
  point: DrawPoint;
  color: string;
  thickness: number;
}

export interface DrawErasePayload {
  pageNumber: number;
  lineIndex: number;
}

