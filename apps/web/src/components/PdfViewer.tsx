/**
 * PdfViewer.tsx
 *
 * POR QUÊ: Componente isolado de renderização PDF. Recebe como props
 * o número da página a exibir (pageNumber), mantendo a separação clara
 * entre "estado global da sala" (quem chama com roomPage) e
 * "estado local do usuário" (localPage, gerenciado fora deste componente).
 *
 * COMO FUNCIONA:
 * - react-pdf v10+ requer que o worker seja configurado antes de qualquer render.
 *   Fazemos isso uma única vez no topo do módulo via GlobalWorkerOptions.
 * - <Document> carrega o arquivo PDF. <Page> renderiza a página específica.
 * - useResizeObserver garante que a largura do container seja respeitada
 *   (responsividade mobile-first em vez de width hardcodado).
 */

import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import ReplyIcon from '@mui/icons-material/Reply';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import SensorsIcon from '@mui/icons-material/Sensors';
import SyncDisabledIcon from '@mui/icons-material/SyncDisabled';
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt';
import {
  Box,
  CircularProgress,
  IconButton,
  Paper,
  Typography,
  Tooltip,
  Chip,
  Button,
  Divider,
} from '@mui/material';
import React, { useCallback, useRef, useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { DrawingOverlay } from './DrawingOverlay';
import { BrushControls } from './BrushControls';

import { AnnotationPopover } from './AnnotationPopover';
import { Annotation } from '../services/api';
import { useLongPress } from '../hooks/useLongPress';
import { useOptionalRoom } from '../contexts/RoomContext';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

/** Guests não possuem token JWT — usamos isso para ocultar controles de anotação */
const isGuestUser = () => !localStorage.getItem('dyswis_token');

// Configura o worker do PDF.js uma única vez no módulo.
// Usamos o CDN para evitar problemas de MIME type (application/octet-stream)
// em servidores Nginx que não configuram corretamente a extensão .mjs
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface PdfPageData {
  originalWidth: number;
  originalHeight: number;
}

interface PdfSlideProps {
  pageNumber: number;
  width: number;
  onPageLoadSuccess?: (page: PdfPageData) => void;
}

/**
 * Componente de slide do PDF altamente otimizado e memoizado.
 * Garante que o canvas NUNCA seja repintado quando o slide muda de slot,
 * eliminando qualquer piscar (tela branca) após a transição.
 */
const PdfSlide = React.memo<PdfSlideProps>(
  ({ pageNumber, width, onPageLoadSuccess }) => {
    return (
      <Page
        pageNumber={pageNumber}
        width={width}
        renderAnnotationLayer={false}
        renderTextLayer={false}
        rotate={0}
        onLoadSuccess={onPageLoadSuccess}
      />
    );
  },
  (prev, next) => prev.pageNumber === next.pageNumber && prev.width === next.width
);

interface PdfViewerProps {
  /** URL do arquivo PDF (ex: '/sample.pdf') */
  fileUrl: string;
  /** Página ativa — controlada externamente (virá do roomPage ou localPage) */
  pageNumber: number;
  /** Callback chamado quando o usuário clica em Próximo/Anterior */
  onPageChange?: (newPage: number) => void;
  /** Se true, desabilita os botões de navegação (modo espectador em follow mode) */
  readOnly?: boolean;
  /** Callback chamado quando o total de páginas é carregado */
  onNumPagesLoaded?: (total: number) => void;
  /** Lista de anotações para renderizar nesta página */
  annotations?: Annotation[];
  /** Callback para recarregar anotações após mudança */
  onAnnotationsChange?: () => void;
  /** Identificador estável do PDF (pdfPath raw) para vincular anotações ao arquivo correto */
  mediaId?: string;
  /** Se true, o visualizador está acompanhando o líder. */
  isFollowing?: boolean;
  /** Callback para sincronizar novamente com o líder (útil no modo Fullscreen). */
  onBackToHost?: () => void;
  /** Anotação alvo para focar e abrir popover automaticamente (vindo da central de notas) [BUG-053] */
  targetAnnotation?: Annotation | null;
  /** Callback disparado após a anotação alvo ser focada e popover aberto [BUG-053] */
  onTargetAnnotationHandled?: () => void;
  /** Estado de navegação livre / silenciosa do líder [BUG-051] */
  isLeaderSilentMode?: boolean;
  /** Callback para alternar entre transmissão ao vivo e navegação livre privativa do líder [BUG-051] */
  onToggleLeaderSilentMode?: () => void;
  /** Callback para forçar sincronização de todos no slide atual [BUG-051] */
  onForceSync?: () => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  fileUrl,
  pageNumber,
  onPageChange,
  readOnly = false,
  onNumPagesLoaded,
  annotations = [],
  onAnnotationsChange,
  mediaId,
  isFollowing,
  onBackToHost,
  targetAnnotation,
  onTargetAnnotationHandled,
  isLeaderSilentMode = false,
  onToggleLeaderSilentMode,
  onForceSync,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null);
  const [draftAnnotation, setDraftAnnotation] = useState<{ x: number, y: number } | null>(null);
  const [draftAnchorEl, setDraftAnchorEl] = useState<HTMLElement | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscapeContent, setIsLandscapeContent] = useState(false);
  const [pageAspectRatio, setPageAspectRatio] = useState<number>(0);
  const [isPortraitDevice, setIsPortraitDevice] = useState(true);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [manualRotationAngle, setManualRotationAngle] = useState<number | null>(null);

  // Funções utilitárias para transformação de deltas e coordenadas nos 4 ângulos (0°, 90°, 180°, 270°)
  const transformDeltaForRotation = (dx: number, dy: number, angle: number) => {
    switch (angle) {
      case 90:
        return { dx: dy, dy: -dx };
      case 180:
        return { dx: -dx, dy: -dy };
      case 270:
        return { dx: -dy, dy: dx };
      case 0:
      default:
        return { dx, dy };
    }
  };

  const getPointForRotation = (clientX: number, clientY: number, rect: DOMRect, angle: number): { x: number; y: number } => {
    let x = 0;
    let y = 0;
    switch (angle) {
      case 90: {
        const width = rect.height || 1;
        const height = rect.width || 1;
        x = ((clientY - rect.top) / width) * 100;
        y = ((rect.right - clientX) / height) * 100;
        break;
      }
      case 180: {
        const width = rect.width || 1;
        const height = rect.height || 1;
        x = ((rect.right - clientX) / width) * 100;
        y = ((rect.bottom - clientY) / height) * 100;
        break;
      }
      case 270: {
        const width = rect.height || 1;
        const height = rect.width || 1;
        x = ((rect.bottom - clientY) / width) * 100;
        y = ((clientX - rect.left) / height) * 100;
        break;
      }
      case 0:
      default: {
        const width = rect.width || 1;
        const height = rect.height || 1;
        x = ((clientX - rect.left) / width) * 100;
        y = ((clientY - rect.top) / height) * 100;
        break;
      }
    }
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  };

  // Estados da Engine de Zoom e Pan
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPinching, setIsPinching] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isMouseDown, setIsMouseDown] = useState(false);

  // Estados da Engine de Deslize (Swipe / Carousel) em Fullscreen
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [transitionStyle, setTransitionStyle] = useState<string>('none');

  const touchStartRef = useRef<{
    touchesCount: number;
    initialDist: number;
    initialZoom: number;
    initialPan: { x: number; y: number };
    startCenter: { x: number; y: number };
    lastPos: { x: number; y: number };
  }>({
    touchesCount: 0,
    initialDist: 0,
    initialZoom: 1,
    initialPan: { x: 0, y: 0 },
    startCenter: { x: 0, y: 0 },
    lastPos: { x: 0, y: 0 },
  });

  const touchSwipeRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    lastDx: number;
    isHorizontal: boolean | null;
  }>({
    startX: 0,
    startY: 0,
    startTime: 0,
    lastDx: 0,
    isHorizontal: null,
  });

  const mouseStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const mouseDragRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    lastDx: number;
  }>({
    startX: 0,
    startY: 0,
    startTime: 0,
    lastDx: 0,
  });

  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const touchTapRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    hasMoved: boolean;
  }>({
    startX: 0,
    startY: 0,
    startTime: 0,
    hasMoved: false,
  });
  const lastDoubleTapExecutionTimeRef = useRef<number>(0);
  const zoomScaleRef = useRef<number>(zoomScale);
  const lastTouchTimeRef = useRef<number>(0);
  useEffect(() => {
    zoomScaleRef.current = zoomScale;
  }, [zoomScale]);

  // Previne zoom nativo da página inteira no navegador móvel (iOS Safari / Chrome) durante a visualização de PDF
  useEffect(() => {
    const preventGesture = (e: Event) => {
      e.preventDefault();
    };

    const handleTouchMoveMulti = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        // Previne que pinch multi-touch no documento dê zoom na página HTML inteira
        e.preventDefault();
      }
    };

    document.addEventListener('gesturestart', preventGesture, { passive: false });
    document.addEventListener('gesturechange', preventGesture, { passive: false });
    document.addEventListener('gestureend', preventGesture, { passive: false });
    document.addEventListener('touchmove', handleTouchMoveMulti, { passive: false });

    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
      document.removeEventListener('touchmove', handleTouchMoveMulti);
    };
  }, []);

  const room = useOptionalRoom();
  const isDrawingMode = room?.isDrawingMode ?? false;

  // Mede a largura do container para renderizar o PDF responsivamente.
  // Solução mais robusta que window.innerWidth para mobile com safe-areas.
  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      onNumPagesLoaded?.(numPages);
    },
    [onNumPagesLoaded],
  );

  const onPageLoadSuccess = useCallback((page: PdfPageData) => {
    setIsLandscapeContent(page.originalWidth > page.originalHeight);
    setPageAspectRatio(page.originalWidth / page.originalHeight);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const getDeviceIsPortrait = (): boolean => {
      if (typeof window === 'undefined') return true;
      // 1. API moderna screen.orientation
      if (window.screen?.orientation?.type) {
        return window.screen.orientation.type.startsWith('portrait');
      }
      // 2. window.orientation legado (iOS Safari antigo)
      if (typeof window.orientation === 'number') {
        const angle = Math.abs(window.orientation);
        return angle === 0 || angle === 180;
      }
      // 3. matchMedia com query de orientação
      if (typeof window.matchMedia === 'function') {
        const mql = window.matchMedia('(orientation: portrait)');
        if (typeof mql.matches === 'boolean') {
          return mql.matches;
        }
      }
      // 4. Fallback de dimensões da janela
      return window.innerHeight > window.innerWidth;
    };

    const checkOrientation = () => {
      setIsPortraitDevice(getDeviceIsPortrait());
    };
    checkOrientation();

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    const screenOrientation = window.screen?.orientation;
    if (screenOrientation && typeof screenOrientation.addEventListener === 'function') {
      screenOrientation.addEventListener('change', checkOrientation);
    }

    let mql: MediaQueryList | null = null;
    if (typeof window.matchMedia === 'function') {
      mql = window.matchMedia('(orientation: portrait)');
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', checkOrientation);
      } else {
        const legacyMql = mql as unknown as { addListener?: (cb: () => void) => void };
        if (typeof legacyMql.addListener === 'function') {
          legacyMql.addListener(checkOrientation);
        }
      }
    }

    const onFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      checkOrientation();
      if (!isFs) {
        setManualRotationAngle(null);
        setZoomScale(1);
        setPanPosition({ x: 0, y: 0 });
        setSwipeOffset(0);
        setIsSwiping(false);
        setIsAnimating(false);
        setTransitionStyle('none');
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
      if (screenOrientation && typeof screenOrientation.removeEventListener === 'function') {
        screenOrientation.removeEventListener('change', checkOrientation);
      }
      if (mql) {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', checkOrientation);
        } else {
          const legacyMql = mql as unknown as { removeListener?: (cb: () => void) => void };
          if (typeof legacyMql.removeListener === 'function') {
            legacyMql.removeListener(checkOrientation);
          }
        }
      }
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  // Redefine o zoom e swipe ao mudar de página ou sair da tela cheia
  useEffect(() => {
    setZoomScale(1);
    setPanPosition({ x: 0, y: 0 });
    setSwipeOffset(0);
    setIsSwiping(false);
    setIsAnimating(false);
    setTransitionStyle('none');
  }, [pageNumber, isFullscreen]);

  const defaultAngle = isFullscreen && isLandscapeContent && isPortraitDevice ? 90 : 0;
  const currentRotationAngle = isFullscreen ? (manualRotationAngle !== null ? manualRotationAngle : defaultAngle) : 0;
  const isCssRotated = currentRotationAngle !== 0;

  const calculatedPageWidth = (() => {
    let w = containerSize.width;
    if (isFullscreen && pageAspectRatio > 0 && containerSize.height > 0) {
      const isTransposed = currentRotationAngle === 90 || currentRotationAngle === 270;
      const effectiveContainerWidth = isTransposed ? containerSize.height : containerSize.width;
      const effectiveContainerHeight = isTransposed ? containerSize.width : containerSize.height;
      const containerAspect = effectiveContainerWidth / effectiveContainerHeight;
      if (pageAspectRatio < containerAspect) {
        w = effectiveContainerHeight * pageAspectRatio;
      } else {
        w = effectiveContainerWidth;
      }
    }
    return w > 0 ? w : 300;
  })();

  const handleToggleRotation = () => {
    const nextAngle = (currentRotationAngle + 90) % 360;
    setManualRotationAngle(nextAngle);
  };

  const handleToggleFullscreen = async () => {
    if (!isFullscreen) {
      if (!isCssRotated && containerRef.current?.parentElement) {
        try {
          if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
          }
        } catch (e) {
          console.error(e);
        }
      }
      setIsFullscreen(true);
    } else {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      } catch (e) {
        console.error(e);
      }
      setIsFullscreen(false);
      setZoomScale(1);
      setPanPosition({ x: 0, y: 0 });
      setSwipeOffset(0);
      setIsSwiping(false);
      setIsAnimating(false);
      setTransitionStyle('none');
    }
  };

  // Limite elástico de Pan
  const clampPan = useCallback((x: number, y: number, scale: number) => {
    if (scale <= 1) return { x: 0, y: 0 };
    const isTransposed = currentRotationAngle === 90 || currentRotationAngle === 270;
    const w = isTransposed ? (containerSize.height || window.innerHeight) : (containerSize.width || window.innerWidth);
    const h = isTransposed ? (containerSize.width || window.innerWidth) : (containerSize.height || window.innerHeight);
    const maxPanX = Math.max(0, (w * (scale - 1)) / 2 + 50 * scale);
    const maxPanY = Math.max(0, (h * (scale - 1)) / 2 + 50 * scale);
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, y)),
    };
  }, [containerSize, currentRotationAngle]);

  // Ações de Zoom com transição visual fluida
  const handleZoomIn = () => {
    const current = zoomScaleRef.current;
    const next = Math.min(3.5, Number((current + 0.5).toFixed(2)));
    if (next !== current) {
      setTransitionStyle('transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)');
      setPanPosition((pan) => clampPan(pan.x, pan.y, next));
      setZoomScale(next);
      setTimeout(() => setTransitionStyle('none'), 360);
    }
  };

  const handleZoomOut = () => {
    const current = zoomScaleRef.current;
    const next = Math.max(1, Number((current - 0.5).toFixed(2)));
    if (next !== current) {
      setTransitionStyle('transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)');
      if (next === 1) {
        setPanPosition({ x: 0, y: 0 });
      } else {
        setPanPosition((pan) => clampPan(pan.x, pan.y, next));
      }
      setZoomScale(next);
      setTimeout(() => setTransitionStyle('none'), 360);
    }
  };

  const handleResetZoom = () => {
    setTransitionStyle('transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)');
    setPanPosition({ x: 0, y: 0 });
    setZoomScale(1);
    setTimeout(() => setTransitionStyle('none'), 360);
  };

  // Duplo toque / Duplo clique para alternar zoom (1.0x <-> 2.0x focado no toque com animação visual)
  const handleDoubleTapZoom = useCallback((clientX: number, clientY: number) => {
    if (isDrawingMode) return;

    const now = Date.now();
    if (now - lastDoubleTapExecutionTimeRef.current < 500) {
      return; // Previne duplo disparo concorrente (ex: touchEnd + dblclick sintético do navegador)
    }
    lastDoubleTapExecutionTimeRef.current = now;

    setIsMouseDown(false);
    setIsPanning(false);
    setIsPinching(false);
    setIsSwiping(false);

    const currentZoom = zoomScaleRef.current;
    setTransitionStyle('transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)');

    if (currentZoom > 1.05) {
      // Se já possui zoom ativo, zera suavemente para 1.0x e recentraliza
      setPanPosition({ x: 0, y: 0 });
      setZoomScale(1);
    } else {
      // Se está em 1.0x, aplica zoom de 2.0x focado na coordenada tocada
      const targetScale = 2.0;
      const rect = containerRef.current?.getBoundingClientRect();
      const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

      let tapRelX = clientX - centerX;
      let tapRelY = clientY - centerY;

      if (currentRotationAngle === 90) {
        const vdx = tapRelY;
        const vdy = -tapRelX;
        tapRelX = vdx;
        tapRelY = vdy;
      } else if (currentRotationAngle === 180) {
        tapRelX = -tapRelX;
        tapRelY = -tapRelY;
      } else if (currentRotationAngle === 270) {
        const vdx = -tapRelY;
        const vdy = tapRelX;
        tapRelX = vdx;
        tapRelY = vdy;
      }

      // Desloca o pan para aproximar a região focada sob o toque
      const targetPanX = -tapRelX * (targetScale - 1);
      const targetPanY = -tapRelY * (targetScale - 1);
      const clamped = clampPan(targetPanX, targetPanY, targetScale);

      setPanPosition(clamped);
      setZoomScale(targetScale);
    }

    setTimeout(() => {
      setTransitionStyle('none');
    }, 360);
  }, [isDrawingMode, currentRotationAngle, clampPan]);

  // Dispara transição fluida contínua sem piscar e sem tropeços
  const triggerSlideTransition = useCallback((targetOffset: number, targetPage: number | null) => {
    setIsSwiping(false);
    setIsAnimating(true);
    setTransitionStyle('transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)');
    setSwipeOffset(targetOffset);

    if (targetPage !== null && targetPage !== pageNumber) {
      setTimeout(() => {
        // Desabilita transição CSS para que o reset para 0 não gere micro-solavancos
        setTransitionStyle('none');
        setSwipeOffset(0);
        onPageChange?.(targetPage);
        setIsAnimating(false);
      }, 350);
    } else {
      setTimeout(() => {
        setTransitionStyle('none');
        setSwipeOffset(0);
        setIsAnimating(false);
      }, 350);
    }
  }, [pageNumber, onPageChange]);

  const safePageNumber = (numPages > 0 && pageNumber > numPages) ? numPages : pageNumber;

  // Handlers Touch para Pinça (Zoom), Arraste (Pan), Deslize (Swipe) e Duplo Toque (Double-Tap to Zoom)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    lastTouchTimeRef.current = Date.now();
    if (e.touches.length === 2) {
      lastTapRef.current = null;
      setIsPinching(true);
      setIsSwiping(false);
      setSwipeOffset(0);
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
      touchStartRef.current = {
        touchesCount: 2,
        initialDist: dist,
        initialZoom: zoomScaleRef.current,
        initialPan: panPosition,
        startCenter: center,
        lastPos: center,
      };
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      touchTapRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        startTime: Date.now(),
        hasMoved: false,
      };

      if (zoomScaleRef.current > 1 && !isDrawingMode) {
        setIsPanning(true);
        touchStartRef.current.touchesCount = 1;
        touchStartRef.current.lastPos = { x: t.clientX, y: t.clientY };
        touchStartRef.current.initialPan = { ...panPosition };
      } else if (isFullscreen && zoomScaleRef.current === 1 && !isDrawingMode && !readOnly && !isAnimating) {
        setTransitionStyle('none');
        touchSwipeRef.current = {
          startX: t.clientX,
          startY: t.clientY,
          startTime: Date.now(),
          lastDx: 0,
          isHorizontal: null,
        };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    lastTouchTimeRef.current = Date.now();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - touchTapRef.current.startX, t.clientY - touchTapRef.current.startY) > 22) {
        touchTapRef.current.hasMoved = true;
      }
    }

    if (e.touches.length === 2 && touchStartRef.current.touchesCount === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = dist / (touchStartRef.current.initialDist || 1);
      const newScale = Math.min(3.5, Math.max(1, Number((touchStartRef.current.initialZoom * ratio).toFixed(2))));
      setZoomScale(newScale);

      const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
      let dx = center.x - touchStartRef.current.startCenter.x;
      let dy = center.y - touchStartRef.current.startCenter.y;
      if (currentRotationAngle !== 0) {
        const transformed = transformDeltaForRotation(dx, dy, currentRotationAngle);
        dx = transformed.dx;
        dy = transformed.dy;
      }
      setPanPosition(clampPan(touchStartRef.current.initialPan.x + dx, touchStartRef.current.initialPan.y + dy, newScale));
    } else if (e.touches.length === 1 && touchStartRef.current.touchesCount === 1 && zoomScaleRef.current > 1 && !isDrawingMode) {
      const t = e.touches[0];
      let dx = t.clientX - touchStartRef.current.lastPos.x;
      let dy = t.clientY - touchStartRef.current.lastPos.y;
      if (currentRotationAngle !== 0) {
        const transformed = transformDeltaForRotation(dx, dy, currentRotationAngle);
        dx = transformed.dx;
        dy = transformed.dy;
      }
      touchStartRef.current.lastPos = { x: t.clientX, y: t.clientY };
      setPanPosition((prev) => clampPan(prev.x + dx, prev.y + dy, zoomScaleRef.current));
    } else if (e.touches.length === 1 && zoomScaleRef.current === 1 && isFullscreen && !isDrawingMode && !readOnly && !isAnimating) {
      const t = e.touches[0];
      const rawDx = t.clientX - touchSwipeRef.current.startX;
      const rawDy = t.clientY - touchSwipeRef.current.startY;
      let visualDx = rawDx;
      let visualDy = rawDy;

      if (currentRotationAngle !== 0) {
        const transformed = transformDeltaForRotation(rawDx, rawDy, currentRotationAngle);
        visualDx = transformed.dx;
        visualDy = transformed.dy;
      }

      if (touchSwipeRef.current.isHorizontal === null) {
        if (Math.abs(visualDx) > 8 || Math.abs(visualDy) > 8) {
          if (Math.abs(visualDx) > Math.abs(visualDy)) {
            touchSwipeRef.current.isHorizontal = true;
            setIsSwiping(true);
          } else {
            touchSwipeRef.current.isHorizontal = false;
          }
        }
      }

      if (touchSwipeRef.current.isHorizontal === true) {
        touchSwipeRef.current.lastDx = visualDx;
        let effectiveOffset = visualDx;

        // Amortecimento elástico (rubber-banding) nas bordas
        if (safePageNumber <= 1 && visualDx > 0) {
          effectiveOffset = visualDx * 0.28;
        } else if (safePageNumber >= numPages && visualDx < 0) {
          effectiveOffset = visualDx * 0.28;
        }

        setSwipeOffset(effectiveOffset);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    lastTouchTimeRef.current = Date.now();
    if (e.touches.length === 0) {
      setIsPinching(false);
      setIsPanning(false);
      touchStartRef.current.touchesCount = 0;

      // Detecção de Duplo Toque (Double-Tap to Zoom)
      if (!touchTapRef.current.hasMoved && Date.now() - touchTapRef.current.startTime < 350) {
        const tapX = touchTapRef.current.startX;
        const tapY = touchTapRef.current.startY;
        const now = Date.now();

        if (lastTapRef.current && now - lastTapRef.current.time < 380) {
          const distFromLastTap = Math.hypot(tapX - lastTapRef.current.x, tapY - lastTapRef.current.y);
          if (distFromLastTap < 40) {
            handleDoubleTapZoom(tapX, tapY);
            lastTapRef.current = null;
            return;
          }
        }
        lastTapRef.current = { x: tapX, y: tapY, time: now };
      }

      if (isSwiping && !isAnimating) {
        const dt = Math.max(1, Date.now() - touchSwipeRef.current.startTime);
        const dx = touchSwipeRef.current.lastDx;
        const velocity = dx / dt;
        const thresholdDist = Math.min(160, Math.max(60, calculatedPageWidth * 0.18));
        const stepDistance = calculatedPageWidth + 24;

        if ((dx < -thresholdDist || velocity < -0.32) && safePageNumber < numPages) {
          triggerSlideTransition(-stepDistance, safePageNumber + 1);
        } else if ((dx > thresholdDist || velocity > 0.32) && safePageNumber > 1) {
          triggerSlideTransition(stepDistance, safePageNumber - 1);
        } else {
          triggerSlideTransition(0, null);
        }
      }
    } else if (e.touches.length === 1 && isPinching) {
      setIsPinching(false);
      setIsPanning(true);
      const t = e.touches[0];
      touchStartRef.current.touchesCount = 1;
      touchStartRef.current.lastPos = { x: t.clientX, y: t.clientY };
      touchStartRef.current.initialPan = { ...panPosition };
    }
    touchSwipeRef.current.isHorizontal = null;
  };

  // Handlers Mouse para Desktop
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      setZoomScale((prev) => {
        const next = Math.min(3.5, Math.max(1, Number((prev * zoomFactor).toFixed(2))));
        if (next === 1) setPanPosition({ x: 0, y: 0 });
        else setPanPosition((pan) => clampPan(pan.x, pan.y, next));
        return next;
      });
    }
  };

  // Previne zoom da página inteira no desktop ao usar Ctrl+Wheel sobre o container do PDF [BUG-055]
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheelNative = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        setZoomScale((prev) => {
          const next = Math.min(3.5, Math.max(1, Number((prev * zoomFactor).toFixed(2))));
          if (next === 1) setPanPosition({ x: 0, y: 0 });
          else setPanPosition((pan) => clampPan(pan.x, pan.y, next));
          return next;
        });
      }
    };
    container.addEventListener('wheel', onWheelNative, { passive: false });
    return () => container.removeEventListener('wheel', onWheelNative);
  }, [clampPan]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() - lastTouchTimeRef.current < 650) return; // Ignora mousedown sintético emitido após toque
    if (e.button !== 0 || isDrawingMode) return;
    setIsMouseDown(true);

    if (zoomScaleRef.current > 1) {
      mouseStartPos.current = { x: e.clientX, y: e.clientY };
    } else if (isFullscreen && zoomScaleRef.current === 1 && !readOnly && !isAnimating) {
      setTransitionStyle('none');
      mouseDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTime: Date.now(),
        lastDx: 0,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() - lastTouchTimeRef.current < 650) return; // Ignora mousemove sintético após toque
    if (!isMouseDown || isDrawingMode) return;

    if (zoomScaleRef.current > 1) {
      let dx = e.clientX - mouseStartPos.current.x;
      let dy = e.clientY - mouseStartPos.current.y;
      if (currentRotationAngle !== 0) {
        const transformed = transformDeltaForRotation(dx, dy, currentRotationAngle);
        dx = transformed.dx;
        dy = transformed.dy;
      }
      mouseStartPos.current = { x: e.clientX, y: e.clientY };
      setPanPosition((prev) => clampPan(prev.x + dx, prev.y + dy, zoomScaleRef.current));
    } else if (isFullscreen && zoomScaleRef.current === 1 && !readOnly && !isAnimating) {
      const rawDx = e.clientX - mouseDragRef.current.startX;
      const rawDy = e.clientY - mouseDragRef.current.startY;
      let visualDx = rawDx;
      if (currentRotationAngle !== 0) {
        const transformed = transformDeltaForRotation(rawDx, rawDy, currentRotationAngle);
        visualDx = transformed.dx;
      }

      if (!isSwiping && Math.abs(visualDx) > 8) {
        setIsSwiping(true);
      }

      if (isSwiping || Math.abs(visualDx) > 8) {
        mouseDragRef.current.lastDx = visualDx;
        let effectiveOffset = visualDx;

        if (safePageNumber <= 1 && visualDx > 0) {
          effectiveOffset = visualDx * 0.28;
        } else if (safePageNumber >= numPages && visualDx < 0) {
          effectiveOffset = visualDx * 0.28;
        }

        setSwipeOffset(effectiveOffset);
      }
    }
  };

  const handleMouseUp = () => {
    if (Date.now() - lastTouchTimeRef.current < 650) {
      setIsMouseDown(false);
      return;
    }
    setIsMouseDown(false);

    if (isSwiping && !isAnimating) {
      const dt = Math.max(1, Date.now() - mouseDragRef.current.startTime);
      const dx = mouseDragRef.current.lastDx;
      const velocity = dx / dt;
      const thresholdDist = Math.min(160, Math.max(60, calculatedPageWidth * 0.18));
      const stepDistance = calculatedPageWidth + 24;

      if ((dx < -thresholdDist || velocity < -0.32) && safePageNumber < numPages) {
        triggerSlideTransition(-stepDistance, safePageNumber + 1);
      } else if ((dx > thresholdDist || velocity > 0.32) && safePageNumber > 1) {
        triggerSlideTransition(stepDistance, safePageNumber - 1);
      } else {
        triggerSlideTransition(0, null);
      }
    }
  };

  // Suporte a teclas de seta (esquerda/direita) em Fullscreen
  useEffect(() => {
    if (!isFullscreen || readOnly) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (safePageNumber < numPages && !isAnimating) {
          e.preventDefault();
          const stepDistance = calculatedPageWidth + 24;
          triggerSlideTransition(-stepDistance, safePageNumber + 1);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (safePageNumber > 1 && !isAnimating) {
          e.preventDefault();
          const stepDistance = calculatedPageWidth + 24;
          triggerSlideTransition(stepDistance, safePageNumber - 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, readOnly, safePageNumber, numPages, isAnimating, calculatedPageWidth, triggerSlideTransition]);

  // Restaura intenção pendente de anotação no PDF (após o usuário voltar do login)
  useEffect(() => {
    if (isGuestUser() || readOnly) return;
    const pendingStr = localStorage.getItem('dyswis_pending_annotation');
    if (!pendingStr) return;
    try {
      const pending = JSON.parse(pendingStr);
      if (pending.tab === 'pdf' && pending.page === pageNumber) {
        localStorage.removeItem('dyswis_pending_annotation');
        setTimeout(() => {
          setDraftAnnotation({
            x: pending.x || 50,
            y: pending.y || 50,
          });
        }, 300);
      }
    } catch {
      localStorage.removeItem('dyswis_pending_annotation');
    }
  }, [pageNumber, readOnly]);

  // Navegação assistida para anotação alvo no PDF (central de notas) [BUG-053]
  useEffect(() => {
    if (!targetAnnotation || targetAnnotation.pdfPage !== pageNumber) return undefined;
    const targetId = targetAnnotation.id;

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const pinEl = containerRef.current?.querySelector<HTMLElement>(`[data-annotation-pin="${targetId}"]`);
      if (pinEl) {
        clearInterval(interval);
        setActiveAnnotation(targetAnnotation);
        setAnchorEl(pinEl);
        onTargetAnnotationHandled?.();
      } else if (attempts > 15) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [targetAnnotation, pageNumber, onTargetAnnotationHandled]);

  const handlePrev = () => {
    if (pageNumber > 1) {
      if (isFullscreen && !isAnimating) {
        const stepDistance = calculatedPageWidth + 24;
        triggerSlideTransition(stepDistance, pageNumber - 1);
      } else {
        onPageChange?.(pageNumber - 1);
      }
    }
  };

  const handleNext = () => {
    if (pageNumber < numPages) {
      if (isFullscreen && !isAnimating) {
        const stepDistance = calculatedPageWidth + 24;
        triggerSlideTransition(-stepDistance, pageNumber + 1);
      } else {
        onPageChange?.(pageNumber + 1);
      }
    }
  };

  const handleLongPress = (e: React.TouchEvent | React.MouseEvent, currentTarget: HTMLElement) => {
    if (isDrawingMode || room?.role === 'leader' || isSwiping) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const rect = currentTarget.getBoundingClientRect();
    const point = getPointForRotation(clientX, clientY, rect, currentRotationAngle);
    const x = point.x;
    const y = point.y;

    if (isGuestUser()) {
      localStorage.setItem('dyswis_pending_annotation', JSON.stringify({
        tab: 'pdf',
        page: pageNumber,
        x,
        y,
      }));
    }

    setDraftAnnotation({ x, y });
  };

  const longPressEvent = useLongPress(handleLongPress, undefined, { delay: 500, shouldPreventDefault: false });

  const handleClosePopover = () => {
    setAnchorEl(null);
    setActiveAnnotation(null);
    setDraftAnnotation(null);
    setDraftAnchorEl(null);
  };

  return (
    <Box
      sx={isFullscreen ? {
        position: 'fixed',
        zIndex: 9999,
        bgcolor: 'black',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        ...(currentRotationAngle === 90 || currentRotationAngle === 270 ? {
          width: '100dvh',
          height: '100dvw',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) rotate(${currentRotationAngle}deg)`,
          transformOrigin: 'center center',
        } : currentRotationAngle === 180 ? {
          width: '100%',
          height: '100%',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          transform: 'rotate(180deg)',
          transformOrigin: 'center center',
        } : {
          width: '100%',
          height: '100%',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        })
      } : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        gap: 1,
        touchAction: 'none',
        overscrollBehavior: 'none',
        pb: { xs: 10, sm: 14 },
      }}
    >
      {/* Área de renderização do PDF */}
      <Paper
        ref={containerRef}
        elevation={4}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={(e) => handleDoubleTapZoom(e.clientX, e.clientY)}
        sx={{
          width: '100%',
          flex: isFullscreen ? 1 : 'none',
          overflow: 'hidden',
          borderRadius: isFullscreen ? 0 : 2,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          bgcolor: isFullscreen ? 'black' : '#1e1e1e',
          touchAction: 'none',
          cursor: isDrawingMode
            ? 'crosshair'
            : zoomScale > 1
            ? (isMouseDown ? 'grabbing' : 'grab')
            : isFullscreen && !readOnly
            ? (isSwiping || isMouseDown ? 'grabbing' : 'grab')
            : 'auto',
        }}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          }
          error={
            <Box sx={{ p: 3 }}>
              <Typography color="error">Falha ao carregar o PDF.</Typography>
            </Box>
          }
        >
          {/* Trilha do Carrossel / Viewport de Slides */}
          <Box 
            sx={{ 
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: calculatedPageWidth,
              height: isFullscreen ? '100%' : 'auto',
              transform: `translate3d(${zoomScale > 1 ? panPosition.x : swipeOffset}px, ${zoomScale > 1 ? panPosition.y : 0}px, 0) scale(${zoomScale})`,
              transformOrigin: 'center center',
              transition: (isPinching || isPanning || isMouseDown || isSwiping)
                ? 'none'
                : (transitionStyle !== 'none' ? transitionStyle : 'none'),
              willChange: 'transform',
            }} 
          >
            {(isFullscreen
              ? [safePageNumber - 1, safePageNumber, safePageNumber + 1].filter((p) => p >= 1 && (numPages ? p <= numPages : true))
              : [safePageNumber || 1]
            ).map((p) => {
              const isCurrent = p === safePageNumber;
              const offsetIndex = p - safePageNumber;
              const isTargetNeighbor = (swipeOffset < 0 && p === safePageNumber + 1) || (swipeOffset > 0 && p === safePageNumber - 1);
              const isVisible = isCurrent || isTargetNeighbor;

              return (
                <Box
                  key={`page_slot_${p}`}
                  sx={{
                    position: isFullscreen ? 'absolute' : 'relative',
                    ...(isFullscreen && {
                      left: '50%',
                      top: '50%',
                      transform: `translate(calc(-50% + ${offsetIndex} * (${calculatedPageWidth}px + 24px)), -50%)`,
                      visibility: isVisible ? 'visible' : 'hidden',
                      opacity: isVisible ? 1 : 0,
                    }),
                    width: calculatedPageWidth,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    WebkitTouchCallout: 'none',
                  }}
                  {...(isCurrent ? longPressEvent : {})}
                >
                  <PdfSlide
                    pageNumber={p}
                    width={calculatedPageWidth}
                    onPageLoadSuccess={pageAspectRatio === 0 ? onPageLoadSuccess : undefined}
                  />

                  {isCurrent && (
                    <>
                      <DrawingOverlay
                        pageNumber={p}
                        rotation={0}
                        isCssRotated={isCssRotated}
                        rotationAngle={currentRotationAngle}
                        zoomScale={zoomScale}
                        panPosition={panPosition}
                      />
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          pointerEvents: 'none',
                          zIndex: 11,
                        }}
                      >
                        {annotations.filter(a => a.pdfPage === p && a.pdfX && a.pdfY && (!mediaId || a.mediaId === mediaId)).map(ann => (
                          <Box
                            key={ann.id}
                            data-annotation-pin={ann.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAnchorEl(e.currentTarget);
                              setActiveAnnotation(ann);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            sx={{
                              position: 'absolute',
                              left: `${ann.pdfX}%`,
                              top: `${ann.pdfY}%`,
                              cursor: 'pointer',
                              pointerEvents: 'auto',
                              zIndex: 12,
                              transition: 'all 0.2s ease',
                              width: 8,
                              height: 8,
                              bgcolor: activeAnnotation?.id === ann.id ? 'primary.main' : 'grey.700',
                              borderRadius: '50%',
                              opacity: activeAnnotation?.id === ann.id ? 1 : 0.85,
                              transform: activeAnnotation?.id === ann.id 
                                ? 'translate(-50%, -50%) scale(1.5)' 
                                : 'translate(-50%, -50%)',
                              '&:hover': { 
                                opacity: 1, 
                                transform: 'translate(-50%, -50%) scale(1.5)' 
                              },
                              '&::after': {
                                content: '""',
                                position: 'absolute',
                                top: -16,
                                left: -16,
                                right: -16,
                                bottom: -16,
                              }
                            }}
                          />
                        ))}

                        {draftAnnotation && (
                          <Box
                            ref={setDraftAnchorEl}
                            sx={{
                              position: 'absolute',
                              left: `${draftAnnotation.x}%`,
                              top: `${draftAnnotation.y}%`,
                              zIndex: 13,
                              pointerEvents: 'auto',
                              width: 8,
                              height: 8,
                              bgcolor: 'secondary.main',
                              borderRadius: '50%',
                              transform: 'translate(-50%, -50%) scale(1.5)',
                            }}
                          />
                        )}
                      </Box>
                      
                      <AnnotationPopover
                        open={Boolean(anchorEl) || Boolean(draftAnchorEl)}
                        anchorEl={anchorEl || draftAnchorEl}
                        onClose={handleClosePopover}
                        annotation={activeAnnotation}
                        draftData={draftAnnotation ? {
                          mediaId: mediaId ?? fileUrl,
                          pdfPage: p,
                          pdfX: draftAnnotation.x,
                          pdfY: draftAnnotation.y
                        } : null}
                        onSaved={() => {
                          handleClosePopover();
                          onAnnotationsChange?.();
                        }}
                        onDeleted={() => {
                          handleClosePopover();
                          onAnnotationsChange?.();
                        }}
                      />
                    </>
                  )}
                </Box>
              );
            })}
          </Box>
        </Document>
      </Paper>

      {/* Botão Flutuante 'Voltar ao apresentador' se estiver no Modo Livre */}
      {isFullscreen && onBackToHost && isFollowing === false && (
        <Box
          onClick={onBackToHost}
          sx={{
            position: 'fixed',
            bottom: { xs: 80, sm: 92 },
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 1.2,
            px: 3,
            py: 1.2,
            borderRadius: '28px',
            bgcolor: '#EAB308',
            color: '#17171C',
            boxShadow: '0px 8px 24px rgba(234, 179, 8, 0.35)',
            cursor: 'pointer',
            zIndex: 1100,
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              bgcolor: '#CA8A04',
              transform: 'translateX(-50%) translateY(-2px)',
              boxShadow: '0px 10px 28px rgba(234, 179, 8, 0.45)',
            },
            '&:active': {
              transform: 'translateX(-50%) translateY(0)',
            },
          }}
        >
          <ReplyIcon sx={{ transform: 'scaleX(-1)', fontSize: 20, color: '#17171C' }} />
          <Typography
            variant="body2"
            sx={{ color: '#17171C', fontWeight: 600, fontSize: '0.95rem', fontFamily: '"Inter", sans-serif' }}
          >
            Voltar ao apresentador
          </Typography>
        </Box>
      )}

      {/* Navegação entre Slides Flutuante (< 1 de 6 >) */}
      {/* Exibida sempre em Fullscreen OU para o Líder em qualquer modo */}
      {(isFullscreen || room?.role === 'leader') && (
        <Box
          sx={{
            position: 'fixed',
            bottom: { xs: 20, sm: 28 },
            left: '50%',
            transform: 'translateX(-50%)',
            bgcolor: 'rgba(27, 27, 30, 0.85)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '40px',
            px: { xs: 1.5, sm: 2 },
            py: 0.6,
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 0.5, sm: 1 },
            boxShadow: '0px 8px 32px rgba(0,0,0,0.4)',
            zIndex: 1100,
            pointerEvents: 'auto',
          }}
        >
          <IconButton
            size="medium"
            onClick={handlePrev}
            disabled={readOnly || pageNumber <= 1}
            sx={{ color: '#FFF', p: 0.5, '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' } }}
          >
            <NavigateBeforeIcon />
          </IconButton>
          <Typography
            variant="body2"
            sx={{
              color: '#FFF',
              fontWeight: 500,
              fontSize: { xs: '0.85rem', sm: '0.9rem' },
              mx: { xs: 0.5, sm: 1 },
              fontFamily: '"Inter", sans-serif',
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {safePageNumber || 1} de {numPages || '?'}
          </Typography>
          <IconButton
            size="medium"
            onClick={handleNext}
            disabled={readOnly || pageNumber >= numPages}
            sx={{ color: '#FFF', p: 0.5, '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' } }}
          >
            <NavigateNextIcon />
          </IconButton>

          {/* Controles de Sincronização / Modo Livre do Líder em Fullscreen [BUG-051] */}
          {isFullscreen && room?.role === 'leader' && onToggleLeaderSilentMode && (
            <>
              <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.15)', mx: 0.5 }} />
              
              <Tooltip
                title={isLeaderSilentMode ? 'Navegação Livre ativa (os alunos não veem a troca de slides). Clique para voltar a transmitir.' : 'Transmitindo ao vivo para toda a sala. Clique para navegar livremente sem mover os alunos.'}
                disableInteractive
              >
                <Chip
                  icon={isLeaderSilentMode ? <SyncDisabledIcon sx={{ fontSize: '15px !important', color: '#FACC15 !important' }} /> : <SensorsIcon sx={{ fontSize: '15px !important', color: '#22C55E !important' }} />}
                  label={isLeaderSilentMode ? 'Modo Livre' : 'Ao Vivo'}
                  size="small"
                  onClick={onToggleLeaderSilentMode}
                  sx={{
                    bgcolor: isLeaderSilentMode ? 'rgba(250, 204, 21, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                    color: isLeaderSilentMode ? '#FACC15' : '#22C55E',
                    border: '1px solid',
                    borderColor: isLeaderSilentMode ? 'rgba(250, 204, 21, 0.3)' : 'rgba(34, 197, 94, 0.3)',
                    fontWeight: 600,
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    height: 28,
                    '&:hover': {
                      bgcolor: isLeaderSilentMode ? 'rgba(250, 204, 21, 0.25)' : 'rgba(34, 197, 94, 0.25)',
                    },
                  }}
                />
              </Tooltip>

              {onForceSync && (
                <Tooltip title="Forçar sincronização de todos os alunos neste slide" disableInteractive>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={onForceSync}
                    startIcon={<ElectricBoltIcon sx={{ fontSize: '15px !important' }} />}
                    sx={{
                      bgcolor: '#EAB308',
                      color: '#17171C',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      borderRadius: '20px',
                      px: 1.2,
                      py: 0.3,
                      minHeight: 28,
                      textTransform: 'none',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 8px rgba(234, 179, 8, 0.3)',
                      '&:hover': {
                        bgcolor: '#CA8A04',
                      },
                    }}
                  >
                    Sincronizar Todos
                  </Button>
                </Tooltip>
              )}
            </>
          )}
        </Box>
      )}

      {/* Botões de Ações Flutuantes Enfileirados na Vertical no Canto Direito */}
      <Box
        sx={{
          position: 'fixed',
          bottom: { xs: 20, sm: 28 },
          right: { xs: 12, sm: 24 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1.2,
          zIndex: 1100,
        }}
      >
        {/* Ferramentas de Desenho / Pincel (Apenas para o Líder) */}
        {room?.role === 'leader' && (
          <BrushControls pageNumber={safePageNumber || 1} isMobileLayout={true} isCssRotated={isCssRotated} />
        )}

        {/* Controles de Zoom Flutuantes (No Fullscreen ou sempre que Zoom > 1) [BUG-055] */}
        {(isFullscreen || zoomScale > 1) && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              bgcolor: 'rgba(27, 27, 30, 0.85)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '24px',
              p: 0.4,
              gap: 0.3,
              boxShadow: '0px 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            {/* Zoom In */}
            <Tooltip title="Aumentar Zoom (+)" disableInteractive placement="left">
              <span>
                <IconButton
                  onClick={handleZoomIn}
                  disabled={zoomScale >= 3.5}
                  size="small"
                  sx={{
                    color: '#FFF',
                    width: { xs: 36, sm: 38 },
                    height: { xs: 36, sm: 38 },
                    '&.Mui-disabled': { color: 'rgba(255,255,255,0.25)' },
                  }}
                >
                  <ZoomInIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            {/* Indicador / Reset de Zoom */}
            <Tooltip title="Redefinir Zoom (100%)" disableInteractive placement="left">
              <Box
                onClick={handleResetZoom}
                sx={{
                  cursor: zoomScale > 1 ? 'pointer' : 'default',
                  px: 0.8,
                  py: 0.3,
                  borderRadius: '12px',
                  bgcolor: zoomScale > 1 ? 'rgba(234, 179, 8, 0.2)' : 'transparent',
                  border: zoomScale > 1 ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid transparent',
                  transition: 'all 0.2s ease',
                  '&:hover': zoomScale > 1 ? { bgcolor: 'rgba(234, 179, 8, 0.35)', transform: 'scale(1.05)' } : {},
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: zoomScale > 1 ? '#EAB308' : 'rgba(255,255,255,0.6)',
                    fontFamily: '"Inter", monospace',
                    userSelect: 'none',
                    lineHeight: 1,
                  }}
                >
                  {Math.round(zoomScale * 100)}%
                </Typography>
              </Box>
            </Tooltip>

            {/* Zoom Out */}
            <Tooltip title="Diminuir Zoom (-)" disableInteractive placement="left">
              <span>
                <IconButton
                  onClick={handleZoomOut}
                  disabled={zoomScale <= 1}
                  size="small"
                  sx={{
                    color: '#FFF',
                    width: { xs: 36, sm: 38 },
                    height: { xs: 36, sm: 38 },
                    '&.Mui-disabled': { color: 'rgba(255,255,255,0.25)' },
                  }}
                >
                  <ZoomOutIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        )}

        {/* Girar PDF (Apenas no modo Fullscreen) */}
        {isFullscreen && (
          <Tooltip title="Girar PDF" disableInteractive placement="left">
            <IconButton 
              onClick={handleToggleRotation} 
              sx={{
                bgcolor: 'rgba(27, 27, 30, 0.85)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#FFF',
                width: { xs: 40, sm: 44 },
                height: { xs: 40, sm: 44 },
                boxShadow: '0px 8px 32px rgba(0,0,0,0.4)',
                transition: 'all 0.2s ease',
                '&:hover': { bgcolor: 'rgba(40, 40, 45, 0.95)', transform: 'scale(1.05)' },
              }}
            >
              <RotateRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Botão de Tela Cheia / Sair da Tela Cheia */}
        <Tooltip title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'} disableInteractive placement="left">
          <IconButton
            onClick={handleToggleFullscreen}
            sx={{
              bgcolor: 'rgba(27, 27, 30, 0.85)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#FFF',
              width: { xs: 40, sm: 44 },
              height: { xs: 40, sm: 44 },
              boxShadow: '0px 8px 32px rgba(0,0,0,0.4)',
              transition: 'all 0.2s ease',
              '&:hover': { bgcolor: 'rgba(40, 40, 45, 0.95)', transform: 'scale(1.05)' },
            }}
          >
            {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

