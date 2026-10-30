import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import { useRoom } from '../contexts/RoomContext';
import { SocketEvent, DrawPoint, DrawStartPayload, DrawMovePayload, DrawEndPayload, DrawClearPayload, CursorLaserPayload, DrawErasePayload } from '@dyswis/shared-types';

interface LaserPoint extends DrawPoint {
  id: string;
  timestamp: number;
  color: string;
  thickness: number;
}

function useThrottle<Args extends unknown[]>(callback: (...args: Args) => void, delay: number) {
  const lastCall = useRef(0);
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Garantimos que a última chamada pendente será executada
  const flush = useCallback(() => {
    if (timeoutId.current) {
      clearTimeout(timeoutId.current);
      timeoutId.current = null;
    }
  }, []);

  const throttledFunction = useCallback((...args: Args) => {
    const now = Date.now();
    
    if (now - lastCall.current >= delay) {
      flush();
      callback(...args);
      lastCall.current = now;
    } else {
      flush();
      timeoutId.current = setTimeout(() => {
        callback(...args);
        lastCall.current = Date.now();
        timeoutId.current = null;
      }, delay - (now - lastCall.current));
    }
  }, [callback, delay, flush]);

  return { throttledFunction, flush };
}

interface LineData {
  points: DrawPoint[];
  color: string;
  thickness: number;
}

interface DrawingOverlayProps {
  pageNumber: number;
  rotation?: number;
  isCssRotated?: boolean;
  rotationAngle?: number;
  zoomScale?: number;
  panPosition?: { x: number; y: number };
}

const hexToRgba = (hex: string, alpha: number) => {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const DrawingOverlay: React.FC<DrawingOverlayProps> = ({
  pageNumber,
  rotation = 0,
  isCssRotated = false,
  rotationAngle = isCssRotated ? 90 : 0,
}) => {
  const { getSocket, isDrawingMode, drawColor, drawThickness, role, isHighlighter, roomDrawings, syncRoomDrawings, clearAllRoomDrawings, isLaser, isEraser, setIsActivelyDrawing } = useRoom();
  const socket = getSocket();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Linhas desta página apenas
  const [lines, setLines] = useState<LineData[]>([]);
  const [currentLine, setCurrentLine] = useState<LineData | null>(null);
  
  // Laser local e remoto com rastro
  const [laserTrail, setLaserTrail] = useState<LaserPoint[]>([]);

  // Cursor customizado para hitbox (agora como HTML Div)
  const customCursorRef = useRef<HTMLDivElement>(null);

  const isDrawing = useRef(false);
  const activeTouchPointersRef = useRef<Set<number>>(new Set());
  const isPinchGestureRef = useRef(false);

  // === Utilitário para distância ponto a segmento em pixels ===
  const distToSegmentSquaredPx = (p: DrawPoint, v: DrawPoint, w: DrawPoint, rx: number, ry: number) => {
    const px = p.x * rx, py = p.y * ry;
    const vx = v.x * rx, vy = v.y * ry;
    const wx = w.x * rx, wy = w.y * ry;

    const l2 = Math.pow(vx - wx, 2) + Math.pow(vy - wy, 2);
    if (l2 === 0) return Math.pow(px - vx, 2) + Math.pow(py - vy, 2);
    let t = ((px - vx) * (wx - vx) + (py - vy) * (wy - vy)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.pow(px - (vx + t * (wx - vx)), 2) + Math.pow(py - (vy + t * (wy - vy)), 2);
  };

  // === Hidratação (Late Joiner & Navegação) ===
  useEffect(() => {
    if (roomDrawings && roomDrawings[pageNumber]) {
      setLines(roomDrawings[pageNumber]);
    } else {
      setLines([]);
    }
  }, [pageNumber, roomDrawings]);

  // === Recebimento de Eventos via Socket ===
  useEffect(() => {
    if (!socket) return;

    const handleDrawStart = (payload: DrawStartPayload) => {
      if (payload.pageNumber !== pageNumber) return;
      // Inicia uma nova linha vinda do socket e coloca direto nas 'lines' (pois é viewer)
      setLines((prev) => [
        ...prev,
        { points: [payload.point], color: payload.color, thickness: payload.thickness }
      ]);
    };

    const handleDrawMove = (payload: DrawMovePayload) => {
      if (payload.pageNumber !== pageNumber) return;
      setLines((prev) => {
        if (prev.length === 0) return prev;
        const newLines = [...prev];
        const lastLine = newLines[newLines.length - 1];
        lastLine.points.push(payload.point);
        return newLines;
      });
    };

    const handleDrawEnd = (payload: DrawEndPayload) => {
      // Viewer sincroniza a linha finalizada com o estado global da sala
      if (Number(payload.pageNumber) === Number(pageNumber)) {
        setLines((prev) => {
          syncRoomDrawings(pageNumber, prev);
          return prev;
        });
      }
    };

    const handleDrawClear = (payload: DrawClearPayload) => {
      if (payload.pageNumber === undefined) {
        setLines([]);
        clearAllRoomDrawings();
      } else if (Number(payload.pageNumber) === Number(pageNumber)) {
        setLines([]);
        syncRoomDrawings(pageNumber, []);
      }
    };

    const handleDrawErase = (payload: DrawErasePayload) => {
      if (Number(payload.pageNumber) === Number(pageNumber)) {
        setLines((prev) => {
          const next = [...prev];
          next.splice(payload.lineIndex, 1);
          syncRoomDrawings(pageNumber, next);
          return next;
        });
      }
    };

    socket.on(SocketEvent.CURSOR_LASER, (payload: CursorLaserPayload) => {
      if (payload.pageNumber !== pageNumber) return;
      setLaserTrail(prev => [...prev, { 
        ...payload.point, 
        id: Math.random().toString(), 
        timestamp: Date.now(),
        color: payload.color,
        thickness: payload.thickness
      }]);
    });

    socket.on(SocketEvent.DRAW_START, handleDrawStart);
    socket.on(SocketEvent.DRAW_MOVE, handleDrawMove);
    socket.on(SocketEvent.DRAW_END, handleDrawEnd);
    socket.on(SocketEvent.DRAW_CLEAR, handleDrawClear);
    socket.on(SocketEvent.DRAW_ERASE, handleDrawErase);

    return () => {
      socket.off(SocketEvent.DRAW_START, handleDrawStart);
      socket.off(SocketEvent.DRAW_MOVE, handleDrawMove);
      socket.off(SocketEvent.DRAW_END, handleDrawEnd);
      socket.off(SocketEvent.DRAW_CLEAR, handleDrawClear);
      socket.off(SocketEvent.DRAW_ERASE, handleDrawErase);
      socket.off(SocketEvent.CURSOR_LASER);
    };
  }, [socket, pageNumber, syncRoomDrawings, clearAllRoomDrawings]);

  // === Emissão com Throttle ===
  // O leader emite a cada 16ms durante o movimento
  const emitCallback = useCallback((point: DrawPoint) => {
    socket?.emit(SocketEvent.DRAW_MOVE, { pageNumber, point } satisfies DrawMovePayload);
  }, [socket, pageNumber]);
  
  const { throttledFunction: emitMoveThrottled, flush: flushMoveThrottled } = useThrottle(emitCallback, 16);

  const emitLaserCallback = useCallback((point: DrawPoint) => {
    socket?.emit(SocketEvent.CURSOR_LASER, { pageNumber, point, color: drawColor, thickness: drawThickness } satisfies CursorLaserPayload);
  }, [socket, pageNumber, drawColor, drawThickness]);
  const { throttledFunction: emitLaserThrottled } = useThrottle(emitLaserCallback, 32);

  // === Interações Locais (Leader) ===

  // Limpeza de rastro do laser
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setLaserTrail(prev => prev.filter(p => now - p.timestamp < 1000));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // === Cálculo Normalizado de Espessura do Traço (Isométrico e Proporcional ao PDF) ===
  const calculateStrokePx = useCallback((thickness: number, isHighlighterLine?: boolean) => {
    // Usamos a largura intrínseca base do contêiner (offsetWidth) do documento.
    // Como o contêiner pai em PdfViewer já possui a transformação CSS scale(zoomScale),
    // a espessura calculada em pixels base é automaticamente ampliada na proporção exata 1:1 com o conteúdo do PDF,
    // garantindo invariância matemática perfeita e eliminando qualquer efeito de dupla ampliação ao dar zoom.
    const baseWidth = containerRef.current ? containerRef.current.offsetWidth : window.innerWidth;
    
    if (isHighlighterLine) {
      // Marca-texto: ~1.76% da largura do PDF no nível 4 (cobre exatamente uma linha de texto padrão)
      const highlighterRatio = (thickness * 4.4) / 1000;
      return Math.max(2, highlighterRatio * baseWidth);
    }
    
    // Caneta Normal e Laser: ~1.32% da largura do PDF no nível 4
    const penRatio = (thickness * 3.3) / 1000;
    return Math.max(1, penRatio * baseWidth);
  }, []);

  const eraseLineAtPoint = (point: DrawPoint) => {
    const baseWidth = containerRef.current ? containerRef.current.offsetWidth : 1000;
    const baseHeight = containerRef.current ? containerRef.current.offsetHeight : 1000;

    const rx = baseWidth / 100;
    const ry = baseHeight / 100;

    const sizePx = calculateStrokePx(drawThickness, isHighlighter);
    const eraserRadiusPx = Math.max(6, sizePx * 0.75);
    const ERASER_SIZE_SQ_PX = Math.pow(eraserRadiusPx, 2);
    
    // Procura do fim pro começo (última linha desenhada = cima)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      let hit = false;
      for (let j = 0; j < line.points.length - 1; j++) {
        const distSqPx = distToSegmentSquaredPx(point, line.points[j], line.points[j + 1], rx, ry);
        if (distSqPx < ERASER_SIZE_SQ_PX) {
          hit = true;
          break;
        }
      }
      if (hit) {
        socket?.emit(SocketEvent.DRAW_ERASE, { pageNumber, lineIndex: i } satisfies DrawErasePayload);
        // Oculta localmente imediatamente para responsividade, e o backend emite pra geral
        setLines((prev) => {
          const next = [...prev];
          next.splice(i, 1);
          syncRoomDrawings(pageNumber, next);
          return next;
        });
        break; // Apaga 1 por vez
      }
    }
  };

  const getPointFromEvent = (e: React.PointerEvent<HTMLDivElement>): DrawPoint | null => {
    if (!containerRef.current) return null;
    const clientX = e.clientX;
    const clientY = e.clientY;
    const rect = containerRef.current.getBoundingClientRect();

    let x = 0;
    let y = 0;

    switch (rotationAngle) {
      case 90: {
        // Quando rotacionado a 90deg no sentido horário
        const width = rect.height || 1;
        const height = rect.width || 1;
        x = ((clientY - rect.top) / width) * 100;
        y = ((rect.right - clientX) / height) * 100;
        break;
      }
      case 180: {
        // Quando rotacionado a 180deg (ponta-cabeça)
        const width = rect.width || 1;
        const height = rect.height || 1;
        x = ((rect.right - clientX) / width) * 100;
        y = ((rect.bottom - clientY) / height) * 100;
        break;
      }
      case 270: {
        // Quando rotacionado a 270deg (ou -90deg)
        const width = rect.height || 1;
        const height = rect.width || 1;
        x = ((rect.bottom - clientY) / width) * 100;
        y = ((clientX - rect.left) / height) * 100;
        break;
      }
      case 0:
      default: {
        // Modo Normal / Desktop / 0deg
        const width = rect.width || 1;
        const height = rect.height || 1;
        x = ((clientX - rect.left) / width) * 100;
        y = ((clientY - rect.top) / height) * 100;
        break;
      }
    }

    // Clamping para manter os pontos perfeitamente delimitados dentro da área do slide (0-100%)
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingMode || role !== 'leader') return;

    if (e.pointerType === 'touch') {
      activeTouchPointersRef.current.add(e.pointerId);

      if (activeTouchPointersRef.current.size > 1) {
        // Multi-touch detectado (gesto de pinça/zoom com 2 dedos)
        isPinchGestureRef.current = true;

        // Se uma linha estava sendo traçada pelo primeiro dedo antes do segundo tocar, descarta imediatamente
        if (isDrawing.current) {
          isDrawing.current = false;
          setIsActivelyDrawing(false);
          setCurrentLine(null);
          // Emite DRAW_ERASE para limpar qualquer ponto inicial enviado do socket para os espectadores
          socket?.emit(SocketEvent.DRAW_ERASE, { pageNumber, lineIndex: lines.length } satisfies DrawErasePayload);
        }

        // Libera pointer capture para permitir que eventos de touch cheguem ao PdfViewer
        try {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        } catch {
          /* ignore */
        }
        return;
      }
    }

    if (isPinchGestureRef.current) return;

    e.preventDefault(); // Impede scroll indesejado ao tentar desenhar com 1 dedo
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* fallback se não suportado */
    }
    isDrawing.current = true;
    setIsActivelyDrawing(true);
    const point = getPointFromEvent(e);
    if (!point) return;

    if (isLaser) {
      setLaserTrail(prev => [...prev, { ...point, id: Math.random().toString(), timestamp: Date.now(), color: drawColor, thickness: drawThickness }]);
      emitLaserThrottled(point);
      return;
    }

    if (isEraser) {
      eraseLineAtPoint(point);
      return;
    }

    const actualColor = isHighlighter ? hexToRgba(drawColor, 0.4) : drawColor;

    const newLine = {
      color: actualColor,
      thickness: drawThickness,
      points: [point],
    };

    setCurrentLine(newLine);

    socket?.emit(SocketEvent.DRAW_START, {
      pageNumber,
      color: actualColor,
      thickness: drawThickness,
      point,
    } satisfies DrawStartPayload);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingMode || role !== 'leader') return;

    if (isPinchGestureRef.current || (e.pointerType === 'touch' && activeTouchPointersRef.current.size > 1)) {
      if (isDrawing.current) {
        isDrawing.current = false;
        setIsActivelyDrawing(false);
        setCurrentLine(null);
      }
      return;
    }

    const point = getPointFromEvent(e);

    // Atualiza o cursor customizado sempre que o mouse se mover sobre a área (mesmo sem clicar)
    if (customCursorRef.current && containerRef.current && point) {
      const sizePx = calculateStrokePx(drawThickness, isHighlighter);

      customCursorRef.current.style.left = `${point.x}%`;
      customCursorRef.current.style.top = `${point.y}%`;
      customCursorRef.current.style.width = `${sizePx}px`;
      customCursorRef.current.style.height = `${sizePx}px`;
    }

    if (!isDrawing.current) return;
    if (!point) return;

    if (isLaser) {
      setLaserTrail(prev => [...prev, { ...point, id: Math.random().toString(), timestamp: Date.now(), color: drawColor, thickness: drawThickness }]);
      emitLaserThrottled(point);
      return;
    }

    if (isEraser) {
      eraseLineAtPoint(point);
      return;
    }

    setCurrentLine((prev) => {
      if (!prev) return prev;
      return { ...prev, points: [...prev.points, point] };
    });

    emitMoveThrottled(point);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      activeTouchPointersRef.current.delete(e.pointerId);
      if (activeTouchPointersRef.current.size === 0) {
        isPinchGestureRef.current = false;
      }
    }

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* fallback */
    }

    if (isPinchGestureRef.current) {
      isDrawing.current = false;
      setIsActivelyDrawing(false);
      setCurrentLine(null);
      return;
    }

    if (!isDrawingMode || !isDrawing.current || role !== 'leader') return;
    isDrawing.current = false;
    setIsActivelyDrawing(false);
    
    if (isLaser) {
      return;
    }

    if (isEraser) return;

    flushMoveThrottled(); // Garante envio do último ponto (se pendente)
    socket?.emit(SocketEvent.DRAW_END, { pageNumber } satisfies DrawEndPayload);
    
    // Move currentLine para a lista de lines e sincroniza no contexto global
    if (currentLine) {
      setLines((prev) => {
        const next = [...prev, currentLine];
        syncRoomDrawings(pageNumber, next);
        return next;
      });
      setCurrentLine(null);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      activeTouchPointersRef.current.delete(e.pointerId);
      if (activeTouchPointersRef.current.size === 0) {
        isPinchGestureRef.current = false;
      }
    }
    isDrawing.current = false;
    setIsActivelyDrawing(false);
    setCurrentLine(null);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    if (customCursorRef.current) {
      customCursorRef.current.style.display = 'none';
    }
    handlePointerUp(e);
  };

  const handlePointerEnter = () => {
    if (customCursorRef.current && isDrawingMode && role === 'leader') {
      customCursorRef.current.style.display = 'block';
    }
  };

  // Limpeza de segurança para estado de desenho ativo
  useEffect(() => {
    return () => {
      setIsActivelyDrawing(false);
    };
  }, [setIsActivelyDrawing]);

  // Renderiza uma linha SVG
  const renderLine = (line: LineData, index: number) => {
    if (line.points.length === 0) return null;
    const pointsStr = line.points.map((p) => `${p.x},${p.y}`).join(' ');
    
    // Converte a espessura para pixels da tela com proporção uniforme e limites mínimos
    const isHighlighterLine = line.color.startsWith('rgba');
    const strokePx = calculateStrokePx(line.thickness, isHighlighterLine);

    return (
      <polyline
        key={index}
        points={pointsStr}
        fill="none"
        stroke={line.color}
        strokeWidth={strokePx}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    );
  };

  return (
    <Box
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onPointerEnter={handlePointerEnter}
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        // Só captura pointer events se estivermos no modo desenho!
        // Cursor nativo desligado quando em modo desenho (usamos hitbox renderizado)
        pointerEvents: isDrawingMode ? 'auto' : 'none',
        touchAction: isDrawingMode ? 'none' : 'auto', // Impede pan/zoom mobile ao desenhar
        cursor: isDrawingMode ? 'none' : 'auto'
      }}
    >
      <style>
        {`
          @keyframes laserFade {
            0% { opacity: 0.8; }
            100% { opacity: 0; }
          }
          @keyframes laserMaskFade {
            0% { stroke: #cccccc; }
            100% { stroke: #000000; }
          }
        `}
      </style>
      <svg
        width="100%"
        height="100%"
        // viewBox com 100 de largura e 100 de altura
        // Como o PDF pode não ser quadrado, usamos preserveAspectRatio="none"
        // para esticar as coordenadas (já que p.x e p.y estão em %)
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ display: 'block' }}
        transform={rotation ? `rotate(${rotation} 50 50)` : undefined}
      >
        {lines.map((line, i) => renderLine(line, i))}
        {currentLine && renderLine(currentLine, lines.length)}
        
        {/* Máscara do Rastro do Laser para Fade sem Sobreposição de Transparência */}
        <defs>
          <mask id="laser-mask" maskUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200">
            <rect x="-50" y="-50" width="200" height="200" fill="black" />
            {laserTrail.map((p, i) => {
              if (i === 0) return null;
              const prev = laserTrail[i - 1];
              if (p.timestamp - prev.timestamp > 300) return null;
              
              const strokePx = calculateStrokePx(p.thickness, false);

              return (
                <line
                  key={p.id}
                  x1={prev.x} y1={prev.y}
                  x2={p.x} y2={p.y}
                  strokeWidth={strokePx}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  style={{ animation: 'laserMaskFade 1s forwards linear' }}
                />
              );
            })}
          </mask>
        </defs>

        {/* Rastro do Laser Visível */}
        {laserTrail.length > 1 && (() => {
          const lastPoint = laserTrail[laserTrail.length - 1];
          const strokePx = calculateStrokePx(lastPoint.thickness, false);
          const pointsStr = laserTrail.map(p => `${p.x},${p.y}`).join(' ');

          return (
            <polyline
              points={pointsStr}
              fill="none"
              stroke={lastPoint.color}
              strokeWidth={strokePx}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              mask="url(#laser-mask)"
            />
          );
        })()}
        {/* Cabeça do Laser Atual */}
        {laserTrail.length > 0 && (() => {
          const lastPoint = laserTrail[laserTrail.length - 1];
          const strokePx = calculateStrokePx(lastPoint.thickness, false);
          return (
            <line
              key={`head-${lastPoint.id}`}
              x1={lastPoint.x} y1={lastPoint.y}
              x2={lastPoint.x} y2={lastPoint.y}
              stroke={lastPoint.color}
              strokeWidth={strokePx}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              filter="drop-shadow(0 0 3px currentColor)"
              style={{ animation: 'laserFade 1s forwards linear', color: lastPoint.color }}
            />
          );
        })()}
      </svg>
      {/* Hitbox Cursor Overlay */}
      <Box
        ref={customCursorRef}
        sx={{
          position: 'absolute',
          pointerEvents: 'none',
          borderRadius: '50%',
          border: '1px solid rgba(0,0,0,0.8)', // Borda fina escura
          backgroundColor: 'transparent',
          transform: 'translate(-50%, -50%)',
          display: isDrawingMode && role === 'leader' ? 'block' : 'none',
          zIndex: 9999,
          // Crosshair interno
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '8px',
            height: '1px',
            backgroundColor: 'rgba(0,0,0,0.8)',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '1px',
            height: '8px',
            backgroundColor: 'rgba(0,0,0,0.8)',
          }
        }}
      />
    </Box>
  );
};
