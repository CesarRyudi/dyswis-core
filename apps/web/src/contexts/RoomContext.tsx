/**
 * RoomContext.tsx
 *
 * POR QUÊ CONTEXT:
 * Este contexto é o "estado global da sala" mencionado na Regra 4.
 * Qualquer componente na árvore pode consumir `useRoom()` sem prop drilling.
 *
 * RESPONSABILIDADES DESTE CONTEXTO:
 * - Gerenciar a conexão Socket.io (única instância para toda a sessão)
 * - Armazenar `roomPage`: a página em que o Host está (estado global da sala)
 * - Expor `emitPageSync`: função que apenas o Leader chama para sincronizar
 * - Expor `connected`: status da conexão para qualquer componente exibir
 * - Gerenciar `roomId`: identifica a sala Socket.io em que o cliente está
 *
 * O QUE NÃO É RESPONSABILIDADE DESTE CONTEXTO:
 * - `localPage`: é estado LOCAL de cada componente (Leader ou Viewer têm o seu)
 * - `isFollowing`: é estado LOCAL do Viewer
 * - Lógica de UI, navegação ou renderização
 */

import {
  ContentTab,
  GhostHighlightPayload,
  JoinRoomPayload,
  SocketEvent,
  SyncPagePayload,
  SyncScrollPayload,
  SyncTabPayload,
  SyncVideoPausePayload,
  SyncVideoSeekPayload,
  SyncVideoPlayPayload,
  SyncVideoHeartbeatPayload,
  SyncTestPreparePayload,
  RoomDescriptionUpdatePayload,
  RoomStateSyncPayload,
  RoomPdfUpdatedPayload,
  RoomVideoUpdatedPayload,
  LineData,
  RoomStatusChangedPayload,
} from '@dyswis/shared-types';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { getRoomById } from '../services/api';
import { ClockSyncService } from '../services/clockSync';

// --------------------------------------------------------------------------
// Tipos do contexto
// --------------------------------------------------------------------------

interface RoomContextValue {
  /** Status da conexão WebSocket */
  connected: boolean;
  /** Status inicial de conexao */
  isConnecting: boolean;
  /** Instância do serviço de relógio */
  clockSync: ClockSyncService | null;
  /** Offset de tempo calculado (serverTime - localTime) */
  clockOffset: number;
  /** Round Trip Time medido pelo relógio */
  rtt: number;
  /** ID da sala atual */
  roomId: string;
  /** Role do usuário nesta sessão */
  role: 'leader' | 'viewer';
  /** Token de convite da sala */
  inviteToken: string;
  /** Código curto de acesso (6 dígitos) */
  shortCode: string | null;
  /** Se a sala exige senha */
  hasPassword: boolean;
  /** Nome da sala */
  roomName: string | null;
  /** Nome do Host/Apresentador da sala */
  hostName: string | null;
  /** URL completa do PDF da sala (null se nenhum PDF enviado) */
  pdfUrl: string | null;
  pdfPath: string | null;
  /** URL completa do Vídeo da sala (null se nenhum vídeo enviado) */
  videoUrl: string | null;
  videoPath: string | null;
  /** Conteúdo de texto da sala (null se nenhum texto salvo) */
  roomDescription: string | null;
  /** Setter para atualizar a description localmente (usado após salvar via API) */
  setRoomDescription: (desc: string | null) => void;
  /** Status da sala (se está inativa, os viewers vão para a sala de espera) */
  roomStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  /** Atualiza o status da sala (necessário exportar para o Host notificar os Viewers) */
  emitRoomStatusChanged: (status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED') => void;
  /**
   * Página atual da sala — onde o Host está.
   * Estado GLOBAL: atualizado via eventos do socket.
   * Leitura: qualquer componente. Escrita: apenas via emitPageSync.
   */
  roomPage: number;
  /**
   * Emite mudança de página do Host para o servidor.
   * Apenas o Leader deve chamar esta função.
   * O servidor fará broadcast para todos os Viewers da sala.
   */
  emitPageSync: (page: number) => void;
  /** Emite força de sincronização para todos os Viewers da sala */
  emitForceSync: (page: number) => void;
  /** Gatilho para o Viewer saber que houve uma sincronização forçada */
  lastForcedSync: number;
  /**
   * Último payload de scroll recebido via SYNC_SCROLL.
   * Usado pelo Viewer para aplicar a posição proporcional.
   */
  roomScroll: SyncScrollPayload | null;
  /** Emite posição de scroll do texto para todos os Viewers da sala.
   * Apenas o Leader deve chamar esta função (com debounce).
   */
  emitScrollSync: (payload: SyncScrollPayload) => void;
  /** Emite força de sincronização de scroll para todos os Viewers da sala */
  emitForceScroll: (payload: SyncScrollPayload) => void;
  /** Gatilho para o Viewer saber que houve uma sincronização de scroll forçada */
  lastForcedScroll: number;
  /** Emite atualização do texto para os Viewers */
  emitRoomDescriptionUpdate: (description: string) => void;
  /** Evento recebido de ghost highlight */
  ghostHighlightEvent: { lineIndex: number; timestamp: number } | null;
  /** Emite o evento de ghost highlight para a sala */
  emitGhostHighlight: (lineIndex: number) => void;
  
  // === FASE 3.B: Teste de Latência ===
  syncTestEvent: { targetTime: number | null; timestamp: number } | null;
  emitSyncTestPrepare: () => void;
  emitSyncTestCancel: () => void;

  // === FASE 3.C: Sincronização de Vídeo ===
  isVideoPlaying: boolean;
  videoPlayEvent: SyncVideoPlayPayload | null;
  videoPauseEvent: SyncVideoPausePayload | null;
  videoSeekEvent: SyncVideoSeekPayload | null;
  videoHeartbeatEvent: SyncVideoHeartbeatPayload | null;
  viewersMutedEvent: { muted: boolean } | null;
  emitVideoPlay: (videoTime: number) => void;
  emitVideoPause: (videoTime: number) => void;
  emitVideoSeek: (videoTime: number) => void;
  emitVideoHeartbeat: (videoTime: number) => void;
  emitVideoMuteViewers: (muted: boolean) => void;

  // === Sincronização de Modo/Aba ===
  /** Aba/modo ativo do Leader (recebido via socket) */
  roomTab: ContentTab | null;
  /** Timestamp da última sincronização de aba (para reagir a trocas ou sync forçado) */
  lastTabSync: number;
  /** Emite troca de modo para todos os Viewers da sala */
  emitSyncTab: (tab: ContentTab) => void;

  // === Acesso de Baixo Nível (Para alta frequência: Drawing, Cursor) ===
  /** Retorna a instância crua do Socket.io para inscrições locais/alta frequência */
  getSocket: () => Socket | null;

  // === Estado de Desenho (Fase 4) ===
  isDrawingMode: boolean;
  setIsDrawingMode: (mode: boolean) => void;
  drawColor: string;
  setDrawColor: (color: string) => void;
  drawThickness: number;
  setDrawThickness: (thickness: number) => void;
  isHighlighter: boolean;
  setIsHighlighter: (mode: boolean) => void;
  isEraser: boolean;
  setIsEraser: (mode: boolean) => void;
  isLaser: boolean;
  setIsLaser: (mode: boolean) => void;
  isActivelyDrawing: boolean;
  setIsActivelyDrawing: (drawing: boolean) => void;

  // Desenhos acumulados fornecidos pelo servidor no Late Join
  roomDrawings: Record<number, LineData[]>;
  /** Sincroniza o estado local do DrawingOverlay com o contexto global */
  syncRoomDrawings: (pageNumber: number, lines: LineData[]) => void;
  clearAllRoomDrawings: () => void;

  // === FASE 5: Troca de PDF em Tempo Real ===
  /** Emite notificação de troca de PDF para todos na sala */
  emitRoomPdfUpdated: (pdfPath: string | null, pdfUrl: string | null) => void;
  /** Emite notificação de troca de Vídeo para todos na sala */
  emitRoomVideoUpdated: (videoPath: string | null, videoUrl: string | null) => void;
}

// --------------------------------------------------------------------------
// Criação do contexto
// --------------------------------------------------------------------------

const RoomContext = createContext<RoomContextValue | null>(null);

// --------------------------------------------------------------------------
// Provider
// --------------------------------------------------------------------------

interface RoomProviderProps {
  role: 'leader' | 'viewer';
  roomId: string;
  inviteToken: string;
  children: React.ReactNode;
}

export const RoomProvider: React.FC<RoomProviderProps> = ({
  role,
  roomId,
  inviteToken,
  children,
}) => {
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [roomPage, setRoomPage] = useState<number>(1);
  const [lastForcedSync, setLastForcedSync] = useState<number>(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState<boolean>(false);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [hostName, setHostName] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [roomDescription, setRoomDescription] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [roomScroll, setRoomScroll] = useState<SyncScrollPayload | null>(null);
  const [lastForcedScroll, setLastForcedScroll] = useState<number>(0);
  const [ghostHighlightEvent, setGhostHighlightEvent] = useState<{
    lineIndex: number;
    timestamp: number;
  } | null>(null);
  
  const [syncTestEvent, setSyncTestEvent] = useState<{
    targetTime: number | null;
    timestamp: number;
  } | null>(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [videoPlayEvent, setVideoPlayEvent] = useState<SyncVideoPlayPayload | null>(null);
  const [videoPauseEvent, setVideoPauseEvent] = useState<SyncVideoPausePayload | null>(null);
  const [videoSeekEvent, setVideoSeekEvent] = useState<SyncVideoSeekPayload | null>(null);
  const [videoHeartbeatEvent, setVideoHeartbeatEvent] = useState<SyncVideoHeartbeatPayload | null>(null);
  const [viewersMutedEvent, setViewersMutedEvent] = useState<{ muted: boolean } | null>(null);

  const [clockSync, setClockSync] = useState<ClockSyncService | null>(null);
  const [clockOffset, setClockOffset] = useState<number>(0);
  const [rtt, setRtt] = useState<number>(0);

  const [roomTab, setRoomTab] = useState<ContentTab | null>(null);
  const [lastTabSync, setLastTabSync] = useState<number>(0);

  // FASE 4: Estados Locais de Desenho
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawColor, setDrawColor] = useState('#ff0000');
  const [drawThickness, setDrawThickness] = useState(4);
  const [isHighlighter, setIsHighlighter] = useState(false);
  const [isEraser, setIsEraser] = useState(false);
  const [isLaser, setIsLaser] = useState(false);
  const [isActivelyDrawing, setIsActivelyDrawing] = useState(false);
  const [roomDrawings, setRoomDrawings] = useState<Record<number, LineData[]>>({});

  const socketRef = useRef<Socket | null>(null);

  // Busca dados da sala (pdfPath / videoPath) ao montar
  useEffect(() => {
    if (!roomId) return; // Em salas públicas, inviteToken pode ser vazio
    const apiBase = (
      import.meta.env.VITE_API_URL || `${window.location.origin}/api`
    ).replace(/\/api$/, '');
    getRoomById(roomId, inviteToken)
      .then((room) => {
        if (room.pdfPath) {
          // Supabase Storage retorna URL completa; local retorna apenas o filename
          setPdfUrl(
            room.pdfPath.startsWith('http') || room.pdfPath.startsWith('/')
              ? room.pdfPath
              : room.pdfPath === 'sample.pdf'
              ? '/sample.pdf'
              : `${apiBase}/uploads/${room.pdfPath}`,
          );
          setPdfPath(room.pdfPath);
        } else {
          setPdfUrl(null);
          setPdfPath(null);
        }
        setShortCode(room.shortCode);
        setHasPassword(room.hasPassword);
        setRoomName(room.name || null);
        if (room.host?.name) {
          setHostName(room.host.name);
        }

        if (room.videoPath) {
          const url = room.videoPath.startsWith('http') || room.videoPath.startsWith('/')
            ? room.videoPath
            : `${apiBase}/uploads/${room.videoPath}`;
          setVideoUrl(url);
          setVideoPath(room.videoPath);
        } else {
          setVideoUrl(null);
          setVideoPath(null);
        }
        if (room.description) {
          setRoomDescription(room.description);
        }
        if (room.status) {
          setRoomStatus(room.status);
        }
      })
      .catch(() => {
        /* sala pode não ter PDF/Vídeo */
      });
  }, [roomId, inviteToken]);

  useEffect(() => {
    // VITE_API_URL em produção (ex: https://api.seu-dominio.com/api);
    // fallback usa mesma origem do frontend (ideal para proxy reverso no Coolify)
    const serverUrl = (
      import.meta.env.VITE_API_URL || `${window.location.origin}/api`
    ).replace(/\/api$/, '');
    const socket = io(serverUrl, {
      // Reconexão automática com backoff exponencial (essencial para mobile/4G)
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setIsConnecting(false);
      /**
       * JOIN_ROOM substitui o antigo IDENTIFY.
       * Agora, além do role, enviamos o roomId para que o servidor
       * coloque este socket na room correta do Socket.io.
       */
      socket.emit(SocketEvent.JOIN_ROOM, {
        roomId,
        role,
        inviteToken,
      } satisfies JoinRoomPayload);

      // Inicia a sincronização de relógio (NTP Simplificado)
      const syncService = new ClockSyncService(socket);
      setClockSync(syncService);
      syncService.start().then((offset) => {
        setClockOffset(offset);
        setRtt(syncService.getRTT());
      });
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setIsConnecting(false);
    });

    /**
     * Atualiza roomPage quando qualquer SYNC_PAGE chega.
     * Agora o servidor só envia para clientes na mesma sala.
     */
    socket.on(SocketEvent.SYNC_PAGE, (payload: SyncPagePayload) => {
      setRoomPage(payload.page);
    });

    socket.on(SocketEvent.FORCE_SYNC, (payload: SyncPagePayload) => {
      setRoomPage(payload.page);
      setLastForcedSync(Date.now());
    });

    socket.on(SocketEvent.SYNC_SCROLL, (payload: SyncScrollPayload) => {
      setRoomScroll(payload);
    });

    socket.on(SocketEvent.FORCE_SCROLL, (payload: SyncScrollPayload) => {
      setRoomScroll(payload);
      setLastForcedScroll(Date.now());
    });

    socket.on(
      SocketEvent.ROOM_DESCRIPTION_UPDATE,
      (payload: RoomDescriptionUpdatePayload) => {
        setRoomDescription(payload.description);
      },
    );

    socket.on(SocketEvent.GHOST_HIGHLIGHT, (payload: GhostHighlightPayload) => {
      setGhostHighlightEvent({
        lineIndex: payload.lineIndex,
        timestamp: Date.now(),
      });
    });

    // FASE 3.B: Handlers do teste de latência
    socket.on(SocketEvent.SYNC_TEST_PREPARE, (payload: SyncTestPreparePayload) => {
      setSyncTestEvent({
        targetTime: payload.targetTime,
        timestamp: Date.now(),
      });
    });

    socket.on(SocketEvent.SYNC_TEST_CANCEL, () => {
      setSyncTestEvent({
        targetTime: null,
        timestamp: Date.now(),
      });
    });

    // FASE 3.C: Handlers do Vídeo
    socket.on(SocketEvent.SYNC_VIDEO_PLAY, (payload: SyncVideoPlayPayload) => {
      setIsVideoPlaying(true);
      setVideoPlayEvent(payload);
    });

    socket.on(SocketEvent.SYNC_VIDEO_PAUSE, (payload: SyncVideoPausePayload) => {
      setIsVideoPlaying(false);
      setVideoPauseEvent(payload);
    });

    socket.on(SocketEvent.SYNC_VIDEO_SEEK, (payload: SyncVideoSeekPayload) => {
      setVideoSeekEvent(payload);
    });

    socket.on(SocketEvent.SYNC_VIDEO_HEARTBEAT, (payload: SyncVideoHeartbeatPayload) => {
      setIsVideoPlaying(true);
      setVideoHeartbeatEvent(payload);
    });

    socket.on(SocketEvent.SYNC_VIDEO_MUTE_VIEWERS, (payload: { muted: boolean }) => {
      setViewersMutedEvent(payload);
    });

    // === Sincronização de Modo/Aba ===
    socket.on(SocketEvent.SYNC_TAB, (payload: SyncTabPayload) => {
      setRoomTab(payload.tab);
      setLastTabSync(Date.now());
    });

    // === Late Joiner Hydration ===
    socket.on(SocketEvent.ROOM_STATE_SYNC, (state: RoomStateSyncPayload) => {
      if (state.activeTab) {
        setRoomTab(state.activeTab);
        setLastTabSync(Date.now());
      }
      if (state.pdfPage) setRoomPage(state.pdfPage);
      if (state.textScroll) setRoomScroll(state.textScroll);
      if (state.status) setRoomStatus(state.status);
      if (state.videoState) {
        const isPlaying = Boolean(state.videoState.playing);
        setIsVideoPlaying(isPlaying);
        if (isPlaying) {
           setVideoPlayEvent({
              videoTime: state.videoState.videoTime || 0,
              targetTime: state.videoState.targetTime || Date.now(),
              timestamp: state.videoState.timestamp || Date.now()
           });
        } else {
           setVideoPauseEvent({ videoTime: state.videoState.videoTime || 0 });
        }
        if (state.videoState.muted !== undefined) {
           setViewersMutedEvent({ muted: state.videoState.muted });
        }
      }
      if (state.drawings) {
        setRoomDrawings(state.drawings);
      }
    });

    // === FASE 5: Troca de PDF em Tempo Real ===
    socket.on(SocketEvent.ROOM_PDF_UPDATED, (payload: RoomPdfUpdatedPayload) => {
      setPdfPath(payload.pdfPath);
      setPdfUrl(payload.pdfUrl);
    });

    // === FASE 5: Troca de Vídeo em Tempo Real ===
    socket.on(SocketEvent.ROOM_VIDEO_UPDATED, (payload: RoomVideoUpdatedPayload) => {
      setVideoPath(payload.videoPath);
      setVideoUrl(payload.videoUrl);
    });

    // === FASE 6: Mudança de Status da Sala ===
    socket.on(SocketEvent.ROOM_STATUS_CHANGED, (payload: RoomStatusChangedPayload) => {
      setRoomStatus(payload.status);
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [role, roomId, inviteToken]);

  /**
   * useCallback garante identidade estável da função entre renders.
   * Componentes que recebem emitPageSync via contexto não re-renderizam
   * quando o RoomProvider re-renderiza por outras razões.
   */
  const emitPageSync = useCallback((page: number) => {
    socketRef.current?.emit(SocketEvent.SYNC_PAGE, {
      page,
    } satisfies SyncPagePayload);
  }, []);

  const emitForceSync = useCallback((page: number) => {
    socketRef.current?.emit(SocketEvent.FORCE_SYNC, {
      page,
    } satisfies SyncPagePayload);
  }, []);

  const emitScrollSync = useCallback((payload: SyncScrollPayload) => {
    socketRef.current?.emit(SocketEvent.SYNC_SCROLL, payload);
  }, []);

  const emitForceScroll = useCallback((payload: SyncScrollPayload) => {
    socketRef.current?.emit(SocketEvent.FORCE_SCROLL, payload);
  }, []);

  const emitRoomDescriptionUpdate = useCallback((description: string) => {
    socketRef.current?.emit(SocketEvent.ROOM_DESCRIPTION_UPDATE, {
      description,
    } satisfies RoomDescriptionUpdatePayload);
  }, []);

  const emitGhostHighlight = useCallback((lineIndex: number) => {
    socketRef.current?.emit(SocketEvent.GHOST_HIGHLIGHT, {
      lineIndex,
    } satisfies GhostHighlightPayload);
  }, []);

  const emitSyncTestPrepare = useCallback(() => {
    socketRef.current?.emit(SocketEvent.SYNC_TEST_PREPARE);
  }, []);

  const emitSyncTestCancel = useCallback(() => {
    socketRef.current?.emit(SocketEvent.SYNC_TEST_CANCEL);
  }, []);

  const emitVideoPlay = useCallback((videoTime: number) => {
    socketRef.current?.emit(SocketEvent.SYNC_VIDEO_PLAY, { videoTime });
  }, []);

  const emitVideoPause = useCallback((videoTime: number) => {
    socketRef.current?.emit(SocketEvent.SYNC_VIDEO_PAUSE, { videoTime } satisfies SyncVideoPausePayload);
  }, []);

  const emitVideoSeek = useCallback((videoTime: number) => {
    socketRef.current?.emit(SocketEvent.SYNC_VIDEO_SEEK, { videoTime } satisfies SyncVideoSeekPayload);
  }, []);

  const emitVideoHeartbeat = useCallback((videoTime: number) => {
    socketRef.current?.emit(SocketEvent.SYNC_VIDEO_HEARTBEAT, { videoTime });
  }, []);

  const emitVideoMuteViewers = useCallback((muted: boolean) => {
    socketRef.current?.emit(SocketEvent.SYNC_VIDEO_MUTE_VIEWERS, { muted });
  }, []);

  const emitSyncTab = useCallback((tab: ContentTab) => {
    socketRef.current?.emit(SocketEvent.SYNC_TAB, { tab } satisfies SyncTabPayload);
  }, []);

  const getSocket = useCallback(() => {
    return socketRef.current;
  }, []);

  const syncRoomDrawings = useCallback((pageNumber: number, lines: LineData[]) => {
    setRoomDrawings((prev) => {
      const next = { ...prev };
      next[pageNumber] = lines;
      return next;
    });
  }, []);

  const clearAllRoomDrawings = useCallback(() => {
    setRoomDrawings({});
  }, []);

  const emitRoomPdfUpdated = useCallback((pdfPath: string | null, pdfUrl: string | null) => {
    socketRef.current?.emit(SocketEvent.ROOM_PDF_UPDATED, {
      pdfPath,
      pdfUrl,
    } satisfies RoomPdfUpdatedPayload);
  }, []);

  const emitRoomVideoUpdated = useCallback((videoPath: string | null, videoUrl: string | null) => {
    socketRef.current?.emit(SocketEvent.ROOM_VIDEO_UPDATED, {
      videoPath,
      videoUrl,
    } satisfies RoomVideoUpdatedPayload);
  }, []);

  const emitRoomStatusChanged = useCallback((status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED') => {
    socketRef.current?.emit(SocketEvent.ROOM_STATUS_CHANGED, {
      status,
    } satisfies RoomStatusChangedPayload);
  }, []);

  const value = useMemo(
    () => ({
      connected,
      isConnecting,
      clockSync,
      clockOffset,
      rtt,
      roomId,
      role,
      inviteToken,
      shortCode,
      hasPassword,
      roomName,
      hostName,
      pdfUrl,
      pdfPath,
      videoUrl,
      videoPath,
      roomDescription,
      setRoomDescription,
      roomStatus,
      emitRoomStatusChanged,
      roomPage,
      lastForcedSync,
      emitPageSync,
      emitForceSync,
      roomScroll,
      emitScrollSync,
      emitForceScroll,
      lastForcedScroll,
      emitRoomDescriptionUpdate,
      ghostHighlightEvent,
      emitGhostHighlight,
      syncTestEvent,
      emitSyncTestPrepare,
      emitSyncTestCancel,
      isVideoPlaying,
      videoPlayEvent,
      videoPauseEvent,
      videoSeekEvent,
      videoHeartbeatEvent,
      viewersMutedEvent,
      emitVideoPlay,
      emitVideoPause,
      emitVideoSeek,
      emitVideoHeartbeat,
      emitVideoMuteViewers,
      roomTab,
      lastTabSync,
      emitSyncTab,
      getSocket,
      isDrawingMode,
      setIsDrawingMode,
      drawColor,
      setDrawColor,
      drawThickness,
      setDrawThickness,
      isHighlighter,
      setIsHighlighter,
      isEraser,
      setIsEraser,
      isLaser,
      setIsLaser,
      isActivelyDrawing,
      setIsActivelyDrawing,
      roomDrawings,
      syncRoomDrawings,
      clearAllRoomDrawings,
      emitRoomPdfUpdated,
      emitRoomVideoUpdated,
    }),
    [
      connected,
      isConnecting,
      clockSync,
      clockOffset,
      rtt,
      roomId,
      role,
      inviteToken,
      shortCode,
      hasPassword,
      roomName,
      hostName,
      pdfUrl,
      pdfPath,
      videoUrl,
      videoPath,
      roomDescription,
      roomStatus,
      emitRoomStatusChanged,
      roomPage,
      lastForcedSync,
      emitPageSync,
      emitForceSync,
      roomScroll,
      emitScrollSync,
      emitForceScroll,
      lastForcedScroll,
      emitRoomDescriptionUpdate,
      ghostHighlightEvent,
      emitGhostHighlight,
      syncTestEvent,
      emitSyncTestPrepare,
      emitSyncTestCancel,
      isVideoPlaying,
      videoPlayEvent,
      videoPauseEvent,
      videoSeekEvent,
      videoHeartbeatEvent,
      viewersMutedEvent,
      emitVideoPlay,
      emitVideoPause,
      emitVideoSeek,
      emitVideoHeartbeat,
      emitVideoMuteViewers,
      roomTab,
      lastTabSync,
      emitSyncTab,
      getSocket,
      isDrawingMode,
      drawColor,
      drawThickness,
      isHighlighter,
      isEraser,
      isLaser,
      isActivelyDrawing,
      roomDrawings,
      syncRoomDrawings,
      clearAllRoomDrawings,
      emitRoomPdfUpdated,
      emitRoomVideoUpdated,
    ],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};

// --------------------------------------------------------------------------
// Hook de consumo
// --------------------------------------------------------------------------

/**
 * useRoom — acessa o estado global da sala de qualquer componente.
 *
 * Lança erro se usado fora do RoomProvider, evitando bugs silenciosos.
 */
export const useRoom = (): RoomContextValue => {
  const ctx = useContext(RoomContext);
  if (!ctx) {
    throw new Error('useRoom deve ser usado dentro de <RoomProvider>');
  }
  return ctx;
};

/**
 * useOptionalRoom — acessa o estado global da sala sem estourar exceção.
 * Útil para componentes que podem ser renderizados fora do RoomProvider.
 */
export const useOptionalRoom = (): RoomContextValue | null => {
  return useContext(RoomContext);
};
