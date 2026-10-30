/**
 * TextViewer.tsx
 *
 * Renderiza conteúdo de texto com sincronização de scroll por ancoragem no topo.
 *
 * ESTRATÉGIA DE SYNC (ancoragem pelo topo):
 * Em vez de sincronizar por proporção (scrollTop / totalHeight), identificamos
 * qual linha está no topo visível do container e enviamos seu índice + offsetRatio.
 * O Viewer posiciona essa mesma linha no topo da sua tela:
 *   container.scrollTop = lineEl.offsetTop + offsetRatio * lineEl.offsetHeight
 *
 * Vantagens sobre a proporção:
 * - Telas de tamanhos diferentes SEMPRE mostram o mesmo conteúdo no topo
 * - Resiliente a fontes diferentes, zoom e wrapping variável
 * - Intuitivo para o usuário: "o que eu vejo é o que eles veem"
 *
 * CONTADOR DE LINHAS:
 * Cada linha física (\n) exibe seu número à esquerda de forma discreta,
 * facilitando navegação e referência ("vá para a linha 42").
 *
 * RESPONSABILIDADES:
 * - Renderizar texto linha a linha com contador à esquerda
 * - Se `onScroll` fornecido (Leader): emitir { lineIndex, offsetRatio } ao scrollar
 * - Se `syncScroll` fornecido (Viewer): rolar até a linha indicada
 * - Ignorar scroll programático ao emitir (evitar loop de eventos)
 * - Reposicionar automaticamente em resize/rotação (ResizeObserver)
 */

import { SyncScrollPayload } from '@dyswis/shared-types';
import {
  Box,
  Divider,
  Popover,
  IconButton,
  Tooltip,
} from '@mui/material';
import TiptapHighlight from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import CircleIcon from '@mui/icons-material/Circle';
import { useOptionalRoom } from '../contexts/RoomContext';
import { SelectionSyncExtension } from './extensions/SelectionSyncExtension';
import { UniqueIdExtension } from './extensions/UniqueIdExtension';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditIcon from '@mui/icons-material/Edit';
import {
  Annotation,
  Highlight,
  createHighlight,
  updateHighlightColor,
  deleteHighlight,
} from '../services/api';
import { AnnotationPopover } from './AnnotationPopover';
import { useLongPress } from '../hooks/useLongPress';
import {
  HighlightDecorationExtension,
  highlightPluginKey,
} from './extensions/HighlightDecorationExtension';
import { isTextContentMatching } from '../utils/textSnapshot';

/** Guests não possuem token JWT — usamos isso para ocultar controles de anotação */
const isGuest = () => !localStorage.getItem('dyswis_token');

interface TextViewerProps {
  content: string;
  /**
   * Payload recebido do servidor para aplicar como scroll target.
   * Fornecido pelo Viewer; o Leader não passa este prop.
   */
  syncScroll?: SyncScrollPayload | null;
  /**
   * Callback chamado quando o usuário scrolla (Leader).
   * Deve ser chamado com debounce pelo componente pai.
   */
  onScroll?: (payload: SyncScrollPayload) => void;
  /**
   * Evento de ghost highlight recebido (Viewer/Leader).
   */
  ghostHighlightEvent?: { lineIndex: number; timestamp: number } | null;
  /**
   * Callback quando o Leader faz double click num parágrafo.
   */
  onGhostHighlight?: (lineIndex: number) => void;
  /**
   * Callback para atualizar anotações após criação/edição.
   */
  onAnnotationsChange?: () => void;
  /**
   * Lista de anotações para ancorar no texto.
   */
  annotations?: Annotation[];
  /**
   * Lista de highlights (marcações coloridas) para renderizar no texto.
   */
  highlights?: Highlight[];
  /**
   * Callback para atualizar highlights após criação/edição/deleção.
   */
  onHighlightsChange?: () => void;
  /**
   * Anotação alvo para focar e abrir popover (navegação pela central de notas).
   */
  targetAnnotation?: Annotation | null;
  /**
   * Callback disparado quando a anotação alvo é encontrada e posicionada.
   */
  onTargetAnnotationHandled?: () => void;
}

/**
 * Determina qual linha está ancorada no topo da área visível do container.
 * Itera os elementos [data-line] até encontrar o primeiro cuja parte inferior
 * ultrapassa o scrollTop do container — esse é o que está "no topo".
 */
function findTopLine(container: HTMLDivElement): SyncScrollPayload {
  const scrollTop = container.scrollTop;
  // Agora buscamos os filhos diretos do editor (p, h1, ul, etc)
  const lineEls = container.querySelectorAll<HTMLElement>('.tiptap > *');
  for (let i = 0; i < lineEls.length; i++) {
    const el = lineEls[i];
    const elTop = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;

    if (elBottom > scrollTop) {
      // Quanto da altura desse elemento específico já "passou" ou está escondida acima do scroll
      const scrolledPastElementTop = scrollTop - elTop;

      // Limitamos a 0 caso o scroll esteja antes do início do elemento (acontece com padding/margem inicial)
      const visibleTop = Math.max(0, scrolledPastElementTop);

      // Calculamos a proporção exata para amarrar perfeitamente os topos (ex: 0.25 -> 25% da altura)
      const offsetRatio =
        el.offsetHeight > 0 ? visibleTop / el.offsetHeight : 0;

      return { lineIndex: i, offsetRatio };
    }
  }
  return { lineIndex: Math.max(0, lineEls.length - 1), offsetRatio: 0 };
}

/**
 * Rola o container para que a linha `lineIndex` apareça no topo,
 * deslocada por `offsetRatio * lineHeight` pixels.
 * Usa double-rAF: o 1º garante que o DOM está pintado antes de ler offsetTop;
 * o 2º garante que o evento de scroll foi despachado antes de resetar a flag.
 */
function applyLineScroll(
  container: HTMLDivElement,
  lineIndex: number,
  offsetRatio: number,
  isProgrammaticRef: React.MutableRefObject<boolean>,
  lastTargetScrollTopRef: React.MutableRefObject<number | null>,
  scrollEndTimeoutRef: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>,
  scrollAnimationIdRef: React.MutableRefObject<number | undefined>,
) {
  isProgrammaticRef.current = true;
  requestAnimationFrame(() => {
    const lineEls = container.querySelectorAll<HTMLElement>('.tiptap > *');
    const targetEl = lineEls[lineIndex] ?? lineEls[lineEls.length - 1];
    if (!targetEl) {
      isProgrammaticRef.current = false;
      return;
    }

    // Calcula o target scrollTop somando o topo do elemento mais a fração de sua altura visível
    const targetScrollTop =
      targetEl.offsetTop + offsetRatio * targetEl.offsetHeight;
    lastTargetScrollTopRef.current = targetScrollTop;

    // Evita chamar atribuição de scroll microscópica para reduzir re-renders ou loop de eventos
    if (Math.abs(container.scrollTop - targetScrollTop) > 1) {
      if (scrollAnimationIdRef.current !== undefined) {
        cancelAnimationFrame(scrollAnimationIdRef.current);
      }

      const start = container.scrollTop;
      const change = targetScrollTop - start;
      const startTime = performance.now();
      const duration = 800; // 800ms de duração para um scroll mais lento e elegante

      function animateScroll(currentTime: number) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // easeOutCubic
        const ease = 1 - Math.pow(1 - progress, 3);

        container.scrollTop = start + change * ease;

        if (progress < 1) {
          scrollAnimationIdRef.current = requestAnimationFrame(animateScroll);
        } else {
          scrollAnimationIdRef.current = undefined;
          if (scrollEndTimeoutRef.current)
            clearTimeout(scrollEndTimeoutRef.current);
          scrollEndTimeoutRef.current = setTimeout(() => {
            isProgrammaticRef.current = false;
          }, 150);
        }
      }

      scrollAnimationIdRef.current = requestAnimationFrame(animateScroll);

      // Fallback máximo de segurança
      if (scrollEndTimeoutRef.current)
        clearTimeout(scrollEndTimeoutRef.current);
      scrollEndTimeoutRef.current = setTimeout(() => {
        isProgrammaticRef.current = false;
      }, duration + 500);
    } else {
      isProgrammaticRef.current = false;
    }
  });
}

export const TextViewer: React.FC<TextViewerProps> = ({
  content,
  syncScroll,
  onScroll,
  ghostHighlightEvent,
  onGhostHighlight,
  onAnnotationsChange,
  annotations = [],
  highlights = [],
  onHighlightsChange,
  targetAnnotation,
  onTargetAnnotationHandled,
}: TextViewerProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Anotações
  const [annotatedBlocks, setAnnotatedBlocks] = useState<
    { id: string; top: number; left: number }[]
  >([]);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(
    null,
  );

  const [draftAnnotation, setDraftAnnotation] = useState<{
    blockId: string;
    originalText: string;
    top?: number;
    left?: number;
  } | null>(null);
  const [draftAnchorEl, setDraftAnchorEl] = useState<HTMLElement | null>(null);
  const justSavedBlockIdRef = useRef<string | null>(null);

  // Highlight state
  const [highlightPalette, setHighlightPalette] = useState<{
    top: number;
    left: number;
    blockId: string;
    startOffset: number;
    endOffset: number;
    text: string;
  } | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<Highlight | null>(
    null,
  );
  const [highlightPopoverAnchor, setHighlightPopoverAnchor] =
    useState<HTMLElement | null>(null);

  const isProgrammaticScrollRef = useRef(false);
  const lastTargetScrollTopRef = useRef<number | null>(null);
  const scrollEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const scrollAnimationIdRef = useRef<number | undefined>(undefined);

  let socket = null;
  let isLeader = false;
  let roomIdForHighlight = '';

  const room = useOptionalRoom();
  if (room) {
    socket = room.getSocket();
    isLeader = room.role === 'leader';
    roomIdForHighlight = room.roomId || '';
  }

  /**
   * Último syncScroll aplicado — usado pelo ResizeObserver para reposicionar
   * após redimensionamento de tela, rotação ou refluxo de layout.
   */
  const lastSyncRef = useRef<SyncScrollPayload | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: true,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: {
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        },
      }),
      TiptapHighlight.configure({ multicolor: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      SelectionSyncExtension.configure({
        socket,
        isLeader,
      }),
      UniqueIdExtension.configure({ generate: false }),
      HighlightDecorationExtension,
    ],
    content,
    editable: isLeader,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        inputmode: isLeader ? 'none' : 'text',
      },
      // Block all text modifications to effectively make it read-only for typing
      handleKeyDown: () => isLeader,
      handleTextInput: () => isLeader,
      handlePaste: () => isLeader,
      handleDrop: () => isLeader,
    },
    onSelectionUpdate: ({ editor: ed }) => {
      // Seleção de texto agora dispara paleta de highlighter (não mais anotação)
      if (isLeader || isGuest()) return;
      const { from, to, empty } = ed.state.selection;
      if (empty) {
        setHighlightPalette(null);
        return;
      }
      const text = ed.state.doc.textBetween(from, to, ' ');
      if (!text.trim()) {
        setHighlightPalette(null);
        return;
      }

      try {
        const node = ed.view.domAtPos(from).node;
        const element =
          node.nodeType === Node.TEXT_NODE
            ? node.parentElement
            : (node as HTMLElement);
        const blockEl = element?.closest('.tiptap > *') as HTMLElement | null;
        if (!blockEl) {
          setHighlightPalette(null);
          return;
        }

        let blockId = blockEl.getAttribute('data-id') || '';
        if (!blockId) {
          const siblings = Array.from(blockEl.parentElement?.children || []);
          const index = siblings.indexOf(blockEl);
          blockId = `index-${index}`;
        }

        // Calcula offsets relativos ao bloco
        let blockStart = 0;
        ed.state.doc.descendants((n: { isBlock: boolean; attrs: Record<string, unknown> }, pos: number) => {
          if (n.isBlock && n.attrs['id'] === blockId) {
            blockStart = pos + 1;
            return false;
          }
          return true;
        });
        const startOffset = from - blockStart;
        const endOffset = to - blockStart;

        const coords = ed.view.coordsAtPos(from);
        setHighlightPalette({
          top: coords.bottom,
          left: coords.left,
          blockId,
          startOffset,
          endOffset,
          text,
        });
      } catch {
        setHighlightPalette(null);
      }
    },
  });

  // Mantém o conteúdo do editor sincronizado com a prop
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Restaura intenção pendente de anotação (após o usuário voltar do login)
  useEffect(() => {
    if (!editor || !content || isGuest() || isLeader) return;
    const pendingStr = localStorage.getItem('dyswis_pending_annotation');
    if (!pendingStr) return;
    try {
      const pending = JSON.parse(pendingStr);
      if (pending.tab === 'text' && pending.blockId) {
        localStorage.removeItem('dyswis_pending_annotation');
        setTimeout(() => {
          let blockEl = document.querySelector(`.tiptap > *[data-id="${pending.blockId}"]`) as HTMLElement | null;
          if (!blockEl && pending.blockId.startsWith('index-')) {
            const idx = parseInt(pending.blockId.replace('index-', ''), 10);
            const tiptap = document.querySelector('.tiptap');
            if (tiptap && tiptap.children[idx]) {
              blockEl = tiptap.children[idx] as HTMLElement;
            }
          }
          if (blockEl) {
            setDraftAnnotation({
              blockId: pending.blockId,
              originalText: pending.originalText || blockEl.textContent?.trim() || '',
              top: blockEl.offsetTop,
              left: blockEl.offsetLeft + blockEl.offsetWidth / 2,
            });
            blockEl.classList.add('annotated-block');
            blockEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
      }
    } catch {
      localStorage.removeItem('dyswis_pending_annotation');
    }
  }, [editor, content, isLeader]);


  // Limpeza de timeout e animation frame no unmount
  useEffect(() => {
    return () => {
      if (scrollAnimationIdRef.current !== undefined) {
        cancelAnimationFrame(scrollAnimationIdRef.current);
      }
      if (scrollEndTimeoutRef.current) {
        clearTimeout(scrollEndTimeoutRef.current);
      }
    };
  }, []);

  // Aplicar sync sempre que syncScroll ou content mudar
  useEffect(() => {
    if (!syncScroll || !containerRef.current) return;
    lastSyncRef.current = syncScroll;

    // Pequeno delay para garantir que o TipTap já renderizou o novo conteúdo
    // Antes, como era plain text, o map do React já renderizava síncrono.
    setTimeout(() => {
      if (containerRef.current) {
        applyLineScroll(
          containerRef.current,
          syncScroll.lineIndex,
          syncScroll.offsetRatio,
          isProgrammaticScrollRef,
          lastTargetScrollTopRef,
          scrollEndTimeoutRef,
          scrollAnimationIdRef,
        );
      }
    }, 10);
  }, [syncScroll, content]);

  // Reposicionar quando o container redimensiona (rotação, zoom, resize de janela)
  // APENAS reposiciona com base no sync do líder se o viewer estiver ATIVAMENTE seguindo o líder (syncScroll) [BUG-048]
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (syncScroll && lastSyncRef.current !== null) {
        applyLineScroll(
          container,
          lastSyncRef.current.lineIndex,
          lastSyncRef.current.offsetRatio,
          isProgrammaticScrollRef,
          lastTargetScrollTopRef,
          scrollEndTimeoutRef,
          scrollAnimationIdRef,
        );
      }
      calculateAnnotationPositions();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [syncScroll]);

  // Sincroniza highlights com a extensão do TipTap
  useEffect(() => {
    if (!editor) return;
    const tr = editor.state.tr;
    tr.setMeta(highlightPluginKey, { highlights });
    editor.view.dispatch(tr);
  }, [highlights, editor]);

  const calculateAnnotationPositions = () => {
    if (!containerRef.current) return;
    const blocks: { id: string; top: number; left: number }[] = [];
    const foundBlockIds = new Set<string>();
    const els =
      containerRef.current.querySelectorAll<HTMLElement>('.tiptap > *');
    els.forEach((el, index) => {
      const blockId = el.getAttribute('data-id') || `index-${index}`;
      foundBlockIds.add(blockId);
      const currentBlockText = el.textContent?.trim() || '';

      const matchingAnnotations = annotations.filter((a) => {
        if (a.blockId !== blockId) return false;
        return isTextContentMatching(a.originalText, currentBlockText);
      });

      const hasMatchingDraft = draftAnnotation?.blockId === blockId;

      if (matchingAnnotations.length > 0 || hasMatchingDraft) {
        if (matchingAnnotations.length > 0) {
          blocks.push({ id: blockId, top: el.offsetTop, left: el.offsetLeft });
        }
        el.classList.add('annotated-block');
      } else {
        el.classList.remove('annotated-block');
      }
    });
    setAnnotatedBlocks(blocks);
  };

  // Restaura posição de rolagem do sessionStorage estritamente na montagem inicial [BUG-048]
  useEffect(() => {
    const savedScroll = sessionStorage.getItem(`dyswis_text_scroll_${window.location.pathname}`);
    if (savedScroll && containerRef.current && containerRef.current.scrollTop === 0 && !isProgrammaticScrollRef.current) {
      containerRef.current.scrollTop = Number(savedScroll);
    }
  }, []);

  useEffect(() => {
    // Timeout para esperar o TipTap renderizar após a mudança do content ou anotações
    const timer = setTimeout(() => {
      calculateAnnotationPositions();
    }, 100);
    return () => clearTimeout(timer);
  }, [annotations, content, draftAnnotation]);

  // Se houver um rascunho em um bloco que já possui anotação salva (ex: após carregamento ou long-press),
  // converte automaticamente para o modo de visualização/edição da nota existente [BUG-005]
  useEffect(() => {
    if (draftAnnotation && annotations.length > 0) {
      if (justSavedBlockIdRef.current && draftAnnotation.blockId === justSavedBlockIdRef.current) {
        return;
      }
      const existing = annotations.find(
        (a) =>
          a.blockId === draftAnnotation.blockId &&
          isTextContentMatching(a.originalText, draftAnnotation.originalText)
      );
      if (existing) {
        setDraftAnnotation(null);
        setDraftAnchorEl(null);
        setActiveAnnotation(existing);
        const iconEl = containerRef.current?.querySelector<HTMLElement>(`[data-annotation-icon="${draftAnnotation.blockId}"]`) ||
          containerRef.current?.querySelector<HTMLElement>(`.tiptap > *[data-id="${draftAnnotation.blockId}"]`) as HTMLElement | null;
        if (iconEl) setAnchorEl(iconEl);
      }
    }
  }, [annotations, draftAnnotation]);

  // Garante que, sempre que uma nota for aberta, o popover fique ancorado diretamente no ícone lateral em vez do parágrafo inteiro
  useEffect(() => {
    if (activeAnnotation?.blockId) {
      const iconEl = containerRef.current?.querySelector<HTMLElement>(`[data-annotation-icon="${activeAnnotation.blockId}"]`);
      if (iconEl && anchorEl !== iconEl) {
        setAnchorEl(iconEl);
      }
    }
  }, [activeAnnotation, annotatedBlocks, anchorEl]);

  // Handler de Ghost Highlight (Animação)
  useEffect(() => {
    if (!ghostHighlightEvent || !containerRef.current) return undefined;
    const lineEls =
      containerRef.current.querySelectorAll<HTMLElement>('.tiptap > *');
    const targetEl = lineEls[ghostHighlightEvent.lineIndex];
    if (!targetEl) return undefined;

    targetEl.classList.remove('ghost-highlight-active');
    // Forçar reflow para reiniciar animação se o mesmo item for clicado 2x
    void targetEl.offsetWidth;
    targetEl.classList.add('ghost-highlight-active');
    const timer = setTimeout(() => {
      targetEl.classList.remove('ghost-highlight-active');
    }, 1500); // tempo compatível com a animação CSS (1s)
    return () => clearTimeout(timer);
  }, [ghostHighlightEvent]);

  // Navegação assistida para anotação alvo (central de notas) [BUG-045]
  useEffect(() => {
    if (!targetAnnotation || !targetAnnotation.blockId) return undefined;
    const blockId = targetAnnotation.blockId;

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const el = containerRef.current?.querySelector<HTMLElement>(`[data-id="${blockId}"]`);
      if (el) {
        clearInterval(interval);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Feedback luminoso transitório sem remover ou interferir na classe permanente annotated-block
        el.classList.remove('ghost-highlight-active');
        void el.offsetWidth;
        el.classList.add('ghost-highlight-active');
        setTimeout(() => {
          el.classList.remove('ghost-highlight-active');
        }, 1500);

        // Ancorar e abrir o popover no ícone da nota (ou no próprio bloco como fallback)
        const iconEl =
          containerRef.current?.querySelector<HTMLElement>(`[data-annotation-icon="${blockId}"]`) || el;
        setActiveAnnotation(targetAnnotation);
        setAnchorEl(iconEl);

        onTargetAnnotationHandled?.();
      } else if (attempts > 15) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [targetAnnotation, onTargetAnnotationHandled]);

  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const abortProgrammaticScroll = useCallback(() => {
    if (scrollAnimationIdRef.current !== undefined) {
      cancelAnimationFrame(scrollAnimationIdRef.current);
      scrollAnimationIdRef.current = undefined;
    }
    if (scrollEndTimeoutRef.current) {
      clearTimeout(scrollEndTimeoutRef.current);
      scrollEndTimeoutRef.current = null;
    }
    isProgrammaticScrollRef.current = false;
    lastTargetScrollTopRef.current = null;
  }, []);

  const handleUserScrollInteraction = useCallback(() => {
    if (isLeader) return;
    abortProgrammaticScroll();
    if (onScroll && containerRef.current) {
      onScroll(findTopLine(containerRef.current));
    }
  }, [isLeader, abortProgrammaticScroll, onScroll]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartPosRef.current && e.touches.length === 1) {
      const dx = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
      const dy = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
      // Apenas desativa o follow mode se o usuário realmente arrastar/rolar o texto (movimento vertical > 8px ou horizontal > 15px)
      if (dy > 8 || dx > 15) {
        touchStartPosRef.current = null;
        handleUserScrollInteraction();
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartPosRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) > 1 || Math.abs(e.deltaX) > 1) {
      handleUserScrollInteraction();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Space', 'Home', 'End'].includes(e.key)) {
      handleUserScrollInteraction();
    }
  };

  const handleScroll = () => {
    if (!containerRef.current) return;
    if (!isProgrammaticScrollRef.current) {
      sessionStorage.setItem(`dyswis_text_scroll_${window.location.pathname}`, String(containerRef.current.scrollTop));
    }
    if (!onScroll) return;

    if (isProgrammaticScrollRef.current) {
      // Re-agendar o fim do scroll programático (debounce)
      // O evento de scroll é disparado repetidamente durante o smooth scroll
      if (scrollEndTimeoutRef.current)
        clearTimeout(scrollEndTimeoutRef.current);
      scrollEndTimeoutRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 150); // 150ms sem eventos de scroll = terminou a animação
      return;
    }

    // Se o usuário estiver no exato pixel do que foi definido pelo programático,
    // significa que é apenas um rastro de evento assíncrono atrasado do browser e devemos ignorá-lo.
    const currentScrollTop = containerRef.current.scrollTop;
    if (
      lastTargetScrollTopRef.current !== null &&
      Math.abs(currentScrollTop - lastTargetScrollTopRef.current) <= 1.5
    ) {
      return;
    }

    // Se passou do check acima, significa que o usuário realmente mexeu no scroll!
    // Limpamos o rastreador de scroll programático alvo, pois ele já cumpriu seu papel
    lastTargetScrollTopRef.current = null;

    onScroll(findTopLine(containerRef.current));
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!onGhostHighlight || !containerRef.current) return;
    const target = e.target as HTMLElement;
    const lineEl = target.closest('.tiptap > *') as HTMLElement | null;
    if (lineEl) {
      const lineEls = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>('.tiptap > *'),
      );
      const index = lineEls.indexOf(lineEl);
      if (index !== -1) {
        // Feedback Visual Otimista (Instantâneo para quem clicou, zero delay de rede)
        lineEl.classList.remove('ghost-highlight-active');
        void lineEl.offsetWidth; // Força reflow
        lineEl.classList.add('ghost-highlight-active');
        setTimeout(() => {
          lineEl.classList.remove('ghost-highlight-active');
        }, 1500);

        // Notifica o servidor para os outros
        onGhostHighlight(index);
      }
    }
  };

  // === Long Press para criar anotações (Feature 4) ===
  const handleLongPress = (e: React.TouchEvent | React.MouseEvent) => {
    if (isLeader) return; // Leader não faz anotações

    // Identifica o bloco alvo antes da verificação de guest
    const touchTarget = e.target as HTMLElement;
    const blockEl = touchTarget.closest('.tiptap > *') as HTMLElement | null;
    if (!blockEl) return;

    let blockId = blockEl.getAttribute('data-id') || '';
    if (!blockId) {
      const siblings = Array.from(blockEl.parentElement?.children || []);
      const index = siblings.indexOf(blockEl);
      blockId = `index-${index}`;
    }

    const originalText = blockEl.textContent?.trim() || '';

    if (isGuest()) {
      localStorage.setItem('dyswis_pending_annotation', JSON.stringify({
        tab: 'text',
        blockId,
        originalText,
        top: blockEl.offsetTop,
        left: blockEl.offsetLeft + blockEl.offsetWidth / 2,
      }));
    }

    // Se o bloco já possui uma anotação com texto compatível, abre a anotação existente para edição/visualização em vez de criar duplicata [BUG-005] / [BUG-052]
    const existingAnn = annotations.find(
      (a) => a.blockId === blockId && isTextContentMatching(a.originalText, originalText)
    );
    if (existingAnn) {
      setActiveAnnotation(existingAnn);
      const iconEl = containerRef.current?.querySelector<HTMLElement>(`[data-annotation-icon="${blockId}"]`) || blockEl;
      setAnchorEl(iconEl);
      return;
    }

    setDraftAnnotation({
      blockId,
      originalText,
      top: blockEl.offsetTop,
      left: blockEl.offsetLeft + blockEl.offsetWidth / 2,
    });

    // Adiciona feedback visual imediato no bloco (Tarja laranja)
    blockEl.classList.add('annotated-block');
  };

  const longPressHandlers = useLongPress(handleLongPress, undefined, {
    delay: 500,
    shouldPreventDefault: false,
  });

  // === Cliques no texto: detecta cliques nos Highlights (Feature 5) ===
  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('user-highlight')) {
      const hlId = target.getAttribute('data-highlight-id');
      if (hlId) {
        const hl = highlights.find((h) => h.id === hlId);
        if (hl) {
          setActiveHighlight(hl);
          setHighlightPopoverAnchor(target);
        }
      }
    }
  };

  const COLORS = [
    '#FFEB3B',
    '#4CAF50',
    '#2196F3',
    '#FF9800',
    '#F44336',
    '#E91E63',
  ];

  const handleCreateHighlight = async (color: string) => {
    if (!highlightPalette) return;
    try {
      await createHighlight({
        roomId: roomIdForHighlight,
        blockId: highlightPalette.blockId,
        startOffset: highlightPalette.startOffset,
        endOffset: highlightPalette.endOffset,
        text: highlightPalette.text,
        color,
      });
      setHighlightPalette(null);
      editor?.commands.setTextSelection(0); // clear selection
      onHighlightsChange?.();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateHighlight = async (color: string) => {
    if (!activeHighlight) return;
    try {
      await updateHighlightColor(activeHighlight.id, color);
      setActiveHighlight(null);
      setHighlightPopoverAnchor(null);
      onHighlightsChange?.();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteHighlightAction = async () => {
    if (!activeHighlight) return;
    try {
      await deleteHighlight(activeHighlight.id);
      setActiveHighlight(null);
      setHighlightPopoverAnchor(null);
      onHighlightsChange?.();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Box
      ref={containerRef}
      onScroll={handleScroll}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
      sx={{
        height: '100%',
        overflowY: 'auto',
        py: { xs: 2, sm: 3 },
        minHeight: 0,
        backgroundColor: 'background.default',
        // Necessário: offsetTop dos [data-line] é relativo a este container
        position: 'relative',
        '& .tiptap': {
          outline: 'none',
          padding: { xs: '16px 32px', sm: '16px 48px' },
          fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
          lineHeight: 1.8,
          color: 'text.primary',
          caretColor: isLeader ? 'transparent' : 'auto', // Hide cursor for leader
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          touchAction: 'manipulation',
          // Sistema de numeração via CSS!
          counterReset: 'blockNum',
          '& > *': {
            position: 'relative',
            counterIncrement: 'blockNum',
            // Padding/margin permanentes para evitar layout shift no ghost highlight.
            // A "caixa" do highlight já existe sempre; ao ativar, só muda a cor de fundo.
            padding: '0 8px',
            marginLeft: '-8px',
            marginRight: '-8px',
            borderRadius: '8px',
            transition: 'background-color 0.8s ease, transform 0.2s',
            backgroundColor: 'transparent',
            '&::before': { display: 'none' },
            '&.annotated-block': {
              backgroundColor: 'rgba(255, 193, 7, 0.1)',
              borderLeft: '4px solid',
              borderColor: 'warning.main',
            },
          },
          '& > *:after': {
            content: 'counter(blockNum)',
            position: 'absolute',
            left: { xs: '-24px', sm: '-40px' },
            top: '2px',
            width: '1.5rem',
            textAlign: 'right',
            color: 'rgba(255,255,255,0.2)',
            fontSize: '0.7rem',
            fontFamily: 'monospace',
            userSelect: 'none',
            pointerEvents: 'none',
          },
          // Ocultar contador de parágrafos vazios criados pelo tiptap
          '& > *:has(br:only-child):after': {
            content: 'none',
          },
          '& > *:empty:after': {
            content: 'none',
          },
          '& p': {
            margin: 0,
            marginBottom: '1em',
          },
          '& h1': {
            fontSize: '2.2rem',
            fontWeight: 800,
            marginTop: '1.5em',
            marginBottom: '0.5em',
            color: 'text.primary',
            letterSpacing: '-0.02em',
          },
          '& h2': {
            fontSize: '1.6rem',
            fontWeight: 700,
            marginTop: '1.5em',
            marginBottom: '0.5em',
            color: 'text.primary',
            letterSpacing: '-0.01em',
          },
          '& ul, & ol': {
            paddingLeft: '2rem',
            marginBottom: '1em',
          },
          '& mark': {
            backgroundColor: 'rgba(255,255,255,0.1)',
            color: 'text.primary',
            padding: '0.05em 0.15em',
            borderRadius: '4px',
          },
          '& a': {
            color: 'primary.main',
            textDecoration: 'underline',
            textDecorationColor: 'transparent',
            transition: 'text-decoration-color 0.2s',
            '&:hover': {
              textDecorationColor: 'primary.main',
            },
          },
          '& table': {
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            width: '100%',
            margin: '1.5em 0',
            borderRadius: '0px',
            overflow: 'hidden',
          },
          '& td, & th': {
            minWidth: '2em',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '8px 12px',
            verticalAlign: 'top',
            boxSizing: 'border-box',
          },
          '& th': {
            fontWeight: 'bold',
            textAlign: 'left',
            backgroundColor: 'rgba(255,255,255,0.05)',
            color: '#ffffff',
          },
          '@keyframes ghostHighlight': {
            '0%': { backgroundColor: 'rgba(160, 150, 70, 0.4)' },
            '25%': { backgroundColor: 'rgba(160, 150, 70, 0.4)' },
            '100%': { backgroundColor: 'transparent' },
          },
          '& > *.ghost-highlight-active': {
            animation: 'ghostHighlight 1.5s ease-out',
          },
          '& .remote-selection-highlight': {
            backgroundColor: 'rgba(255, 255, 0, 0.3)',
          },
        },
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0 }} {...longPressHandlers}>
        <EditorContent editor={editor} style={{ height: '100%' }} />
      </Box>

      {/* Pins das anotações flutuantes (position absolute sobre o conteúdo de texto) */}
      {annotatedBlocks.map((block) => {
        const ann = annotations.find((a) => a.blockId === block.id);
        if (!ann) return null;
        return (
          <Box
            key={block.id}
            data-annotation-icon={block.id}
            onClick={(e) => {
              e.stopPropagation();
              setAnchorEl(e.currentTarget);
              setActiveAnnotation(ann);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            sx={{
              position: 'absolute',
              top: block.top,
              right: { xs: 8, sm: 16 },
              cursor: 'pointer',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 1, // Increase touch target
              m: -1, // Offset padding to maintain position
              transition: 'all 0.2s ease',
              color: '#ffffff',
              filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.5))',
              '&:hover': { transform: 'scale(1.1)' },
            }}
          >
            <ChatBubbleOutlineIcon
              sx={{ fontSize: 16, pointerEvents: 'none' }}
            />
          </Box>
        );
      })}

      {draftAnnotation && (
        <Box
          ref={setDraftAnchorEl}
          sx={{
            position: 'absolute',
            left: draftAnnotation.left,
            top: draftAnnotation.top,
            zIndex: 10,
            width: 1,
            height: 1,
          }}
        />
      )}

      <AnnotationPopover
        open={Boolean(anchorEl) || Boolean(draftAnchorEl)}
        anchorEl={anchorEl || draftAnchorEl}
        onClose={() => {
          setAnchorEl(null);
          setActiveAnnotation(null);
          setDraftAnchorEl(null);
          setDraftAnnotation(null);
        }}
        annotation={activeAnnotation}
        draftData={draftAnnotation}
        onSaved={() => {
          if (draftAnnotation?.blockId) {
            justSavedBlockIdRef.current = draftAnnotation.blockId;
            setTimeout(() => {
              justSavedBlockIdRef.current = null;
            }, 1000);
          }
          setAnchorEl(null);
          setActiveAnnotation(null);
          setDraftAnchorEl(null);
          setDraftAnnotation(null);
          onAnnotationsChange?.();
        }}
        onDeleted={() => {
          setAnchorEl(null);
          setActiveAnnotation(null);
          setDraftAnchorEl(null);
          setDraftAnnotation(null);
          onAnnotationsChange?.();
        }}
      />

      {/* Botão de Criação de Highlight (quando texto é selecionado) */}
      <Popover
        open={Boolean(highlightPalette)}
        anchorReference="anchorPosition"
        anchorPosition={
          highlightPalette
            ? { top: highlightPalette.top, left: highlightPalette.left }
            : undefined
        }
        onClose={() => setHighlightPalette(null)}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ mt: 1 }}
      >
        <Box sx={{ p: 0.5 }}>
          <Tooltip title="Destacar">
            <IconButton
              size="small"
              onClick={() => handleCreateHighlight('#FFEB3B')}
              sx={{ color: '#FFEB3B', bgcolor: 'rgba(255,235,59,0.1)' }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Popover>

      {/* Popover de Edição/Deleção do Highlight Ativo */}
      <Popover
        open={Boolean(activeHighlight) && Boolean(highlightPopoverAnchor)}
        anchorEl={highlightPopoverAnchor}
        onClose={() => {
          setActiveHighlight(null);
          setHighlightPopoverAnchor(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ mt: 1 }}
      >
        <Box sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {COLORS.map((color) => (
            <IconButton
              key={color}
              size="small"
              onClick={() => handleUpdateHighlight(color)}
            >
              <CircleIcon sx={{ color, fontSize: 20 }} />
            </IconButton>
          ))}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="Remover marcação">
            <IconButton
              size="small"
              onClick={handleDeleteHighlightAction}
              color="error"
            >
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Popover>
    </Box>
  );
};
