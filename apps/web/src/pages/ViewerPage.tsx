/**
 * ViewerPage.tsx
 *
 * POR QUÊ DO ESTADO:
 * - `localPage` é o que o Viewer está vendo AGORA (pode divergir do Host se Follow Mode estiver off).
 * - `roomPage` é onde o Host está (vem do socket).
 * - Quando Follow Mode está ON: localPage === roomPage (sincronizado).
 * - Quando Follow Mode está OFF: localPage diverge (navegação livre).
 *
 * MODO (ex-TABS):
 * - Dropdown compacto na toolbar substituiu as antigas abas.
 * - Viewer em follow mode acompanha automaticamente o modo do Leader via SYNC_TAB.
 * - "Voltar p/ Líder" retorna ao modo e posição do Host.
 */

import type { ContentTab } from '@dyswis/shared-types';
import LogoutIcon from '@mui/icons-material/Logout';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import ReplyIcon from '@mui/icons-material/Reply';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import SignalWifiStatusbar4BarIcon from '@mui/icons-material/SignalWifiStatusbar4Bar';
import SpeakerNotesIcon from '@mui/icons-material/SpeakerNotes';
import {
  AppBar,
  Box,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Menu,
  Alert as MuiAlert,
  Select,
  Snackbar,
  Toolbar,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PdfViewer } from '../components/PdfViewer';
import { TextViewer } from '../components/TextViewer';
import { VideoPlayer } from '../components/VideoPlayer';
import { useAuth } from '../contexts/AuthContext';
import { useRoom } from '../contexts/RoomContext';
import { Annotation, getAnnotations, Highlight, getHighlights } from '../services/api';
import { WaitingRoom } from '../components/WaitingRoom';
import { SessionNotesDrawer } from '../components/SessionNotesDrawer';

export function ViewerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [searchParams] = useSearchParams();

  const {
    roomId,
    connected,
    isConnecting,
    roomPage,
    lastForcedSync,
    pdfUrl,
    pdfPath,
    videoUrl,
    roomDescription,
    roomScroll,
    lastForcedScroll,
    ghostHighlightEvent,
    roomTab,
    lastTabSync,
    roomStatus,
    shortCode,
    roomName,
    hostName,
  } = useRoom();

  // --- Anotações ---
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [targetTextAnnotation, setTargetTextAnnotation] = useState<Annotation | null>(null);
  const [targetPdfAnnotation, setTargetPdfAnnotation] = useState<Annotation | null>(null);

  const loadAnnotations = async () => {
    if (roomId && localStorage.getItem('dyswis_token')) {
      try {
        const data = await getAnnotations(roomId);
        setAnnotations(data);
      } catch (e) {
        console.error('Failed to load annotations in ViewerPage', e);
      }
    }
  };

  /** Carrega apenas anotações de PDF filtradas pelo mediaId */
  const loadPdfAnnotations = async () => {
    if (roomId && localStorage.getItem('dyswis_token') && pdfPath) {
      try {
        const data = await getAnnotations(roomId, pdfPath);
        setAnnotations(prev => {
          // Merge: mantém anotações de texto, substitui as de PDF
          const textAnns = prev.filter(a => !a.pdfPage);
          return [...textAnns, ...data.filter(a => a.pdfPage)];
        });
      } catch (e) {
        console.error('Failed to load PDF annotations', e);
      }
    }
  };

  // --- Highlights ---
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  const loadHighlights = async () => {
    if (roomId && localStorage.getItem('dyswis_token')) {
      try {
        const data = await getHighlights(roomId);
        setHighlights(data);
      } catch (e) {
        console.error('Failed to load highlights in ViewerPage', e);
      }
    }
  };

  useEffect(() => {
    loadAnnotations();
    loadHighlights();
  }, [roomId]);

  // --- Snackbars & Menus ---
  const [showSyncSnack, setShowSyncSnack] = useState(false);
  const [showScrollSyncSnack, setShowScrollSyncSnack] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);

  // --- Leitura Síncrona Inicial ---
  const initialNavState = useRef<{
    activeTab: ContentTab;
    localPage: number;
    isFollowing: boolean;
    isTextFollowing: boolean;
  }>(
    (() => {
      const fromAnnotationClick = location.state?.fromAnnotationClick;
      const tabParam = searchParams.get('tab');
      const blockId = searchParams.get('blockId');
      const pageParam = searchParams.get('page');

      // Se o usuário veio especificamente de um clique em anotação no dashboard
      if (fromAnnotationClick && (tabParam === 'text' || tabParam === 'pdf' || tabParam === 'video')) {
        return {
          activeTab: tabParam as ContentTab,
          localPage: pageParam ? Number(pageParam) : 1,
          isFollowing: !(blockId || pageParam),
          isTextFollowing: !(blockId || pageParam),
        };
      }

      const storageKey = roomId || window.location.pathname.split('/')[2] || '';
      let savedTab: ContentTab | null = null;
      let savedPage = 1;

      if (storageKey) {
        const saved = sessionStorage.getItem(`dyswis_viewer_state_${storageKey}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.activeTab === 'text' || parsed.activeTab === 'pdf' || parsed.activeTab === 'video') {
              savedTab = parsed.activeTab;
            }
            if (typeof parsed.localPage === 'number') {
              savedPage = parsed.localPage;
            }
          } catch (e) {
            console.error('Erro ao restaurar estado do viewer do storage:', e);
          }
        }
      }

      if (tabParam === 'text' || tabParam === 'pdf' || tabParam === 'video') {
        return {
          activeTab: tabParam as ContentTab,
          localPage: pageParam ? Number(pageParam) : 1,
          isFollowing: true,
          isTextFollowing: true,
        };
      }

      return {
        activeTab: savedTab || 'pdf',
        localPage: savedPage || 1,
        isFollowing: true,
        isTextFollowing: true,
      };
    })()
  ).current;

  // --- Estado de modo ativo ---
  const [activeTab, setActiveTab] = useState<ContentTab>(initialNavState.activeTab);

  // Seleção Inteligente de Modo Inicial (apenas se roomTab ainda não foi recebido via socket)
  useEffect(() => {
    if (roomTab) return;
    if (!pdfUrl && !roomDescription && videoUrl) {
      setActiveTab('video');
    } else if (!pdfUrl && roomDescription) {
      setActiveTab('text');
    }
  }, [pdfUrl, roomDescription, videoUrl, roomTab]);

  // ==================== SYNC DE MODO ====================
  useEffect(() => {
    if (!roomTab) return;
    setActiveTab(roomTab);
    if (roomTab === 'pdf') {
      setIsFollowing(true);
      setLocalPage(roomPage);
    } else if (roomTab === 'text') {
      setIsTextFollowing(true);
    }
  }, [roomTab, lastTabSync]);

  // ==================== PDF ====================
  const [localPage, setLocalPage] = useState<number>(initialNavState.localPage);
  const [numPages, setNumPages] = useState<number>(0);
  const [isFollowing, setIsFollowing] = useState<boolean>(initialNavState.isFollowing);

  useEffect(() => {
    if (isFollowing) {
      setLocalPage(roomPage);
    }
  }, [roomPage, isFollowing]);

  useEffect(() => {
    if (numPages > 0 && localPage > numPages) {
      setLocalPage(numPages);
    }
  }, [numPages, localPage]);

  useEffect(() => {
    if (lastForcedSync > 0) {
      setActiveTab('pdf');
      setIsFollowing(true);
      setLocalPage(roomPage);
      setShowSyncSnack(true);
    }
  }, [lastForcedSync]);

  const handlePageChange = (newPage: number) => {
    setLocalPage(newPage);
    if (isFollowing) {
      setIsFollowing(false);
    }
  };

  const handleBackToHostPdf = () => {
    setIsFollowing(true);
    setLocalPage(roomPage);
  };

  // ==================== TEXTO ====================
  const [isTextFollowing, setIsTextFollowing] = useState<boolean>(initialNavState.isTextFollowing);
  const [scrollToApply, setScrollToApply] = useState<typeof roomScroll>(null);

  useEffect(() => {
    const storageKey = roomId || window.location.pathname.split('/')[2] || '';
    if (!storageKey) return;
    const state = {
      activeTab,
      localPage,
      isFollowing,
      isTextFollowing,
    };
    sessionStorage.setItem(`dyswis_viewer_state_${storageKey}`, JSON.stringify(state));
  }, [roomId, activeTab, localPage, isFollowing, isTextFollowing]);

  // ==================== INICIALIZAÇÃO VIA PARÂMETROS (SCROLL DE ANOTAÇÃO) ====================
  useEffect(() => {
    const fromAnnotationClick = location.state?.fromAnnotationClick;
    const tab = searchParams.get('tab');
    const blockId = searchParams.get('blockId');

    if ((fromAnnotationClick || !sessionStorage.getItem(`dyswis_viewer_state_${roomId || ''}`)) && tab === 'text' && blockId) {
      const timer = setTimeout(() => {
        const el = document.querySelector(`[data-id="${blockId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('annotated-block');
          setTimeout(() => el.classList.remove('annotated-block'), 2000);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [searchParams, location.state, roomId]);

  useEffect(() => {
    if (isTextFollowing && roomScroll) {
      setScrollToApply(roomScroll);
    } else if (!isTextFollowing) {
      setScrollToApply(null);
    }
  }, [roomScroll, isTextFollowing]);

  useEffect(() => {
    if (lastForcedScroll > 0) {
      setActiveTab('text');
      setIsTextFollowing(true);
      setScrollToApply(roomScroll);
      setShowScrollSyncSnack(true);
    }
  }, [lastForcedScroll]);

  const handleTextUserScroll = () => {
    if (isTextFollowing) {
      setIsTextFollowing(false);
      setScrollToApply(null);
    }
  };

  const handleBackToHostText = () => {
    setIsTextFollowing(true);
    setScrollToApply(roomScroll ? { ...roomScroll } : null);
  };

  /** Labels para o Select de modo */
  const tabLabels: Record<Exclude<ContentTab, 'audio'>, string> = {
    pdf: 'PDF',
    text: 'Texto',
    video: 'Vídeo',
  };
  type VisibleTab = keyof typeof tabLabels;

  if (roomStatus === 'INACTIVE') {
    return <WaitingRoom roomName={roomName || undefined} hostName={hostName || undefined} />;
  }

  const isFreeMode = (activeTab === 'pdf' && !isFollowing) || (activeTab === 'text' && !isTextFollowing);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#0A0A0B' }}>
      {/* TopBar (Design Figma) */}
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'transparent', backgroundImage: 'none' }}>
        <Toolbar sx={{ minHeight: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', px: 2 }}>
          
          {/* Esquerda: Botão Home */}
          <Box sx={{ position: 'absolute', left: 16 }}>
            <IconButton
              onClick={() => navigate('/dashboard')}
              sx={{
                bgcolor: 'rgba(255,255,255,0.08)',
                color: '#FFF',
                width: 44,
                height: 44,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' },
              }}
              title="Voltar ao início"
            >
              <HomeOutlinedIcon />
            </IconButton>
          </Box>

          {/* Centro: Título da Sala (Pílula Figma) */}
          <Box
            sx={{
              bgcolor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '24px',
              px: 2.5,
              py: 0.75,
              maxWidth: { xs: 190, sm: 380 },
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'center',
            }}
          >
            <Typography
              variant="body2"
              noWrap
              sx={{ color: '#FFFFFF', fontWeight: 500, fontSize: '0.9rem', fontFamily: '"Inter", sans-serif' }}
            >
              {roomName || shortCode || 'Sala de Apresentação'}
            </Typography>
          </Box>

          {/* Direita: Notas da Sessão & Menu */}
          <Box sx={{ position: 'absolute', right: 16, display: 'flex', gap: 1, alignItems: 'center' }}>
            <IconButton
              onClick={() => setNotesDrawerOpen(true)}
              sx={{
                bgcolor: 'rgba(255,255,255,0.08)',
                color: '#FFF',
                width: 44,
                height: 44,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' },
              }}
              title="Notas da sessão"
            >
              <MenuBookOutlinedIcon fontSize="small" />
            </IconButton>

            <IconButton
              onClick={(e) => setMenuAnchorEl(e.currentTarget)}
              sx={{
                bgcolor: 'rgba(255,255,255,0.08)',
                color: '#FFF',
                width: 44,
                height: 44,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' },
              }}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>

            <Menu
              anchorEl={menuAnchorEl}
              open={Boolean(menuAnchorEl)}
              onClose={() => setMenuAnchorEl(null)}
              slotProps={{
                paper: {
                  sx: {
                    bgcolor: '#1B1B1E',
                    color: '#FFF',
                    minWidth: 220,
                    borderRadius: '16px',
                    border: '1px solid #4D4D4D',
                    mt: 1,
                  },
                },
              }}
            >
              {/* Seletor de Modo */}
              <Box sx={{ px: 2, py: 1.5 }}>
                <Typography variant="caption" sx={{ color: '#A1A1AA', mb: 1, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Modo de Exibição
                </Typography>
                <Select
                  value={activeTab}
                  onChange={(e) => { setActiveTab(e.target.value as ContentTab); setMenuAnchorEl(null); }}
                  size="small"
                  fullWidth
                  sx={{
                    color: '#FFF',
                    bgcolor: 'rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    '.MuiSelect-icon': { color: '#FFF' },
                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
                  }}
                >
                  {(Object.keys(tabLabels) as VisibleTab[]).map((tab) => (
                    <MenuItem key={tab} value={tab}>{tabLabels[tab]}</MenuItem>
                  ))}
                </Select>
              </Box>

              <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

              {/* Status de Conexão */}
              <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {isConnecting ? <CircularProgress size={16} sx={{ color: '#FFF' }} /> : connected ? <SignalWifiStatusbar4BarIcon sx={{ color: '#22C55E' }} fontSize="small" /> : <SignalWifiOffIcon color="error" fontSize="small" />}
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {isConnecting ? 'Conectando...' : connected ? 'Conectado (Online)' : 'Offline'}
                </Typography>
              </Box>

              <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

              {/* Ações de Conta */}
              <Box sx={{ p: 1 }}>
                {!localStorage.getItem('dyswis_token') ? (
                  <MenuItem 
                    onClick={() => {
                      const url = new URL(window.location.href);
                      url.searchParams.set('tab', activeTab);
                      if (activeTab === 'pdf') url.searchParams.set('page', String(localPage));
                      navigate('/login?returnTo=' + encodeURIComponent(url.pathname + url.search));
                    }}
                    sx={{ borderRadius: '8px', color: '#38B7FF', fontWeight: 500, justifyContent: 'center' }}
                  >
                    Fazer Login para Anotar
                  </MenuItem>
                ) : (
                  <>
                    <MenuItem onClick={() => { setMenuAnchorEl(null); setNotesDrawerOpen(true); }} sx={{ borderRadius: '8px', mb: 0.5 }}>
                      <SpeakerNotesIcon fontSize="small" sx={{ mr: 1.5, color: '#A1A1AA' }} /> Minhas Notas
                    </MenuItem>
                    <MenuItem onClick={() => { logout(); navigate(0); }} sx={{ borderRadius: '8px', color: '#EF4444' }}>
                      <LogoutIcon fontSize="small" sx={{ mr: 1.5 }} /> Sair da conta
                    </MenuItem>
                  </>
                )}
              </Box>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Pílula de Status (Abaixo do cabeçalho - Design Figma) */}
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 1, zIndex: 10 }}>
        {activeTab === 'pdf' && (
          isFollowing ? (
            <Box
              onClick={() => setIsFollowing(false)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.2,
                px: 2.5,
                py: 0.7,
                borderRadius: '24px',
                bgcolor: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': { bgcolor: 'rgba(34, 197, 94, 0.18)' },
              }}
              title="Toque para navegar livremente"
            >
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#22C55E' }} />
              <Typography variant="body2" sx={{ color: '#22C55E', fontWeight: 500, fontSize: '0.88rem', fontFamily: '"Inter", sans-serif' }}>
                Seguindo o apresentador
              </Typography>
            </Box>
          ) : (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.2,
                px: 2.5,
                py: 0.7,
                borderRadius: '24px',
                bgcolor: 'rgba(234, 179, 8, 0.12)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                transition: 'all 0.2s',
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: '#FACC15',
                  boxShadow: '0 0 0 2px rgba(250, 204, 21, 0.3)',
                }}
              />
              <Typography variant="body2" sx={{ color: '#FACC15', fontWeight: 500, fontSize: '0.88rem', fontFamily: '"Inter", sans-serif' }}>
                Explorando por conta própria
              </Typography>
            </Box>
          )
        )}

        {activeTab === 'text' && (
          isTextFollowing ? (
            <Box
              onClick={() => setIsTextFollowing(false)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.2,
                px: 2.5,
                py: 0.7,
                borderRadius: '24px',
                bgcolor: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': { bgcolor: 'rgba(34, 197, 94, 0.18)' },
              }}
              title="Toque para navegar livremente"
            >
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#22C55E' }} />
              <Typography variant="body2" sx={{ color: '#22C55E', fontWeight: 500, fontSize: '0.88rem', fontFamily: '"Inter", sans-serif' }}>
                Seguindo o apresentador
              </Typography>
            </Box>
          ) : (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.2,
                px: 2.5,
                py: 0.7,
                borderRadius: '24px',
                bgcolor: 'rgba(234, 179, 8, 0.12)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                transition: 'all 0.2s',
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: '#FACC15',
                  boxShadow: '0 0 0 2px rgba(250, 204, 21, 0.3)',
                }}
              />
              <Typography variant="body2" sx={{ color: '#FACC15', fontWeight: 500, fontSize: '0.88rem', fontFamily: '"Inter", sans-serif' }}>
                Explorando por conta própria
              </Typography>
            </Box>
          )
        )}
      </Box>

      {/* Botão Flutuante 'Voltar ao apresentador' (Design Figma viewer_free_mode_figma.png) */}
      {isFreeMode && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 96,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            pointerEvents: 'auto',
          }}
        >
          <Box
            onClick={activeTab === 'pdf' ? handleBackToHostPdf : handleBackToHostText}
            sx={{
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
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': {
                bgcolor: '#CA8A04',
                transform: 'translateY(-2px)',
                boxShadow: '0px 10px 28px rgba(234, 179, 8, 0.45)',
              },
              '&:active': {
                transform: 'translateY(0)',
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
        </Box>
      )}

      {/* Área de conteúdo */}
      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Modo PDF */}
        {activeTab === 'pdf' && (
          <Box sx={{ flex: 1, p: { xs: 1, sm: 2 }, overflow: 'auto', position: 'relative', touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
            {pdfUrl ? (
              <>
                <PdfViewer
                  fileUrl={pdfUrl}
                  pageNumber={localPage}
                  onPageChange={handlePageChange}
                  readOnly={false}
                  onNumPagesLoaded={setNumPages}
                  annotations={annotations}
                  onAnnotationsChange={loadPdfAnnotations}
                  mediaId={pdfPath ?? undefined}
                  isFollowing={isFollowing}
                  onBackToHost={handleBackToHostPdf}
                  targetAnnotation={targetPdfAnnotation}
                  onTargetAnnotationHandled={() => setTargetPdfAnnotation(null)}
                />
                
                {/* Contador Flutuante e Controles (Design Figma) */}
                <Box
                  sx={{
                    position: 'fixed',
                    bottom: 32,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    bgcolor: 'rgba(27, 27, 30, 0.85)',
                    backdropFilter: 'blur(10px)',
                    color: '#FFF',
                    px: 2,
                    py: 0.75,
                    borderRadius: '32px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    boxShadow: '0px 8px 32px rgba(0,0,0,0.4)',
                    zIndex: 1100,
                    pointerEvents: 'auto',
                  }}
                >
                  <IconButton
                    size="medium"
                    onClick={() => handlePageChange(localPage - 1)}
                    disabled={localPage <= 1}
                    sx={{ color: '#FFF', p: 0.5, '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' } }}
                  >
                    <NavigateBeforeIcon />
                  </IconButton>
                  <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.9rem', mx: 1, fontFamily: '"Inter", sans-serif' }}>
                    {localPage} de {numPages || '?'}
                  </Typography>
                  <IconButton
                    size="medium"
                    onClick={() => handlePageChange(localPage + 1)}
                    disabled={localPage >= numPages}
                    sx={{ color: '#FFF', p: 0.5, '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' } }}
                  >
                    <NavigateNextIcon />
                  </IconButton>
                </Box>
              </>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 1,
                  minHeight: 200,
                }}
              >
                <Typography color="text.secondary">
                  Aguardando o Host enviar um PDF...
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {/* Modo Texto */}
        {activeTab === 'text' && (
          <Box
            sx={{
              flex: 1,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {roomDescription ? (
              <TextViewer
                content={roomDescription}
                syncScroll={isTextFollowing ? scrollToApply : null}
                onScroll={handleTextUserScroll}
                ghostHighlightEvent={ghostHighlightEvent}
                annotations={annotations}
                onAnnotationsChange={loadAnnotations}
                highlights={highlights}
                onHighlightsChange={loadHighlights}
                targetAnnotation={targetTextAnnotation}
                onTargetAnnotationHandled={() => setTargetTextAnnotation(null)}
              />
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 1,
                  minHeight: 200,
                }}
              >
                <Typography color="text.secondary">
                  O Host ainda não adicionou texto a esta sala.
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {/* Modo Vídeo */}
        {activeTab === 'video' && (
          <Box sx={{ flex: 1, p: { xs: 1, sm: 2 }, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {videoUrl ? (
              <VideoPlayer videoUrl={videoUrl} isLeader={false} />
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 1,
                  border: '2px dashed',
                  borderColor: 'divider',
                  borderRadius: 2,
                }}
              >
                <Typography color="text.secondary">Nenhum vídeo carregado no momento.</Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Drawer de Notas da Sessão (Design Figma) */}
      <SessionNotesDrawer
        open={notesDrawerOpen}
        onClose={() => setNotesDrawerOpen(false)}
        annotations={annotations}
        onAnnotationsChange={() => {
          loadAnnotations();
          if (activeTab === 'pdf') loadPdfAnnotations();
        }}
        onNavigateToAnnotation={(ann) => {
          if (ann.pdfPage != null) {
            setActiveTab('pdf');
            setLocalPage(ann.pdfPage);
            setIsFollowing(false);
            setTargetPdfAnnotation(ann);
          } else if (ann.blockId) {
            setActiveTab('text');
            setIsTextFollowing(false);
            setTargetTextAnnotation(ann);
          }
        }}
      />

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

      <Box sx={{ px: 2, py: 1, bgcolor: '#070708' }}>
        <Typography variant="caption" color="text.secondary">
          {activeTab === 'pdf'
            ? `localPage: ${localPage} | roomPage: ${roomPage} | followMode: ${isFollowing ? 'ON' : 'OFF'}`
            : activeTab === 'text'
              ? `scroll follow: ${isTextFollowing ? 'ON' : 'OFF'}`
              : `modo: ${(tabLabels as Record<string, string>)[activeTab] || activeTab}`}
        </Typography>
      </Box>

      {/* Feedback visual de sincronização forçada — PDF */}
      <Snackbar
        open={showSyncSnack}
        autoHideDuration={3000}
        onClose={() => setShowSyncSnack(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <MuiAlert severity="info" variant="filled" sx={{ width: '100%' }}>
          O Líder sincronizou sua tela
        </MuiAlert>
      </Snackbar>

      {/* Feedback visual de sincronização forçada — Texto */}
      <Snackbar
        open={showScrollSyncSnack}
        autoHideDuration={3000}
        onClose={() => setShowScrollSyncSnack(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <MuiAlert severity="info" variant="filled" sx={{ width: '100%' }}>
          O Líder sincronizou a posição do texto
        </MuiAlert>
      </Snackbar>
    </Box>
  );
}
