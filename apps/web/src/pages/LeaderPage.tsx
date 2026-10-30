/**
 * LeaderPage.tsx — Painel do Apresentador (Host / Líder).
 *
 * Redesenhado no tema Dark Glassmorphism conforme a identidade visual do Dyswis.
 */

import { type ContentTab, type SyncScrollPayload } from '@dyswis/shared-types';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import SignalWifiStatusbar4BarIcon from '@mui/icons-material/SignalWifiStatusbar4Bar';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import {
  Alert,
  Backdrop,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PdfViewer } from '../components/PdfViewer';
import { RichTextEditor } from '../components/RichTextEditor';
import { TextViewer } from '../components/TextViewer';
import { VideoPlayer } from '../components/VideoPlayer';
import { useRoom } from '../contexts/RoomContext';
import {
  updateRoomDescription,
  uploadRoomPdf,
  uploadRoomVideo,
  updateRoomStatus,
  removeRoomPdf,
  removeRoomVideo,
} from '../services/api';

const tabLabels: Record<Exclude<ContentTab, 'audio'>, string> = {
  pdf: 'PDF',
  text: 'Texto',
  video: 'Vídeo',
};
type VisibleTab = keyof typeof tabLabels;

export const LeaderPage = () => {
  const navigate = useNavigate();
  const {
    connected,
    isConnecting,
    roomId,
    inviteToken,
    shortCode,
    roomName,
    hasPassword,
    pdfUrl,
    videoUrl,
    roomDescription,
    roomStatus,
    emitRoomStatusChanged,
    setRoomDescription,
    emitPageSync,
    emitForceSync,
    emitScrollSync,
    emitForceScroll,
    emitRoomDescriptionUpdate,
    ghostHighlightEvent,
    emitGhostHighlight,
    emitSyncTab,
    emitRoomPdfUpdated,
    emitRoomVideoUpdated,
  } = useRoom();

  const [localPage, setLocalPage] = useState<number>(1);
  const [, setNumPages] = useState<number>(0);

  const pdfFileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<ContentTab>('pdf');
  const [silentMode, setSilentMode] = useState(false);

  useEffect(() => {
    if (!pdfUrl && !roomDescription && videoUrl) {
      setActiveTab('video');
      emitSyncTab('video');
    } else if (!pdfUrl && roomDescription) {
      setActiveTab('text');
      emitSyncTab('text');
    }
  }, [pdfUrl, roomDescription, videoUrl]);

  // Sincroniza estado inicial do líder com o backend ao conectar
  useEffect(() => {
    if (connected) {
      emitSyncTab(activeTab);
      if (activeTab === 'pdf') {
        emitPageSync(localPage);
      }
    }
  }, [connected]);

  const [showCopySnack, setShowCopySnack] = useState(false);
  const [showSaveSnack, setShowSaveSnack] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState<string>('Enviando arquivo...');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);

  const lastScrollRef = useRef<SyncScrollPayload | null>(null);

  const handleTabChange = (newTab: ContentTab) => {
    setActiveTab(newTab);
    emitSyncTab(newTab);
  };

  const handlePageChange = (newPage: number) => {
    setLocalPage(newPage);
    if (!silentMode) {
      emitPageSync(newPage);
    }
  };

  const handleForceSync = () => {
    emitSyncTab(activeTab);
    if (activeTab === 'pdf') {
      emitForceSync(localPage);
    } else if (activeTab === 'text') {
      const payload = lastScrollRef.current ?? { lineIndex: 0, offsetRatio: 0 };
      emitForceScroll(payload);
    }
    setSilentMode(false);
    setShowSaveSnack(true);
  };

  const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
  const handleUploadPdf = async (file: File) => {
    if (!roomId) return;
    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setErrorMessage('Apenas arquivos no formato PDF são permitidos.');
      return;
    }
    if (file.size > MAX_PDF_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setErrorMessage(
        `O arquivo PDF selecionado (${sizeMb} MB) ultrapassa o limite máximo de 20 MB. Por favor, escolha um arquivo menor ou reduza o tamanho do documento.`,
      );
      return;
    }
    setUploadProgressMsg('Enviando e processando PDF...');
    setUploading(true);
    try {
      const result = await uploadRoomPdf(roomId, file);
      const apiBase = (
        import.meta.env.VITE_API_URL || `${window.location.origin}/api`
      ).replace(/\/api$/, '');
      const newPdfPath = result.pdfPath;
      const newPdfUrl = newPdfPath.startsWith('http')
        ? newPdfPath
        : `${apiBase}/uploads/${newPdfPath}`;
      emitRoomPdfUpdated(newPdfPath, newPdfUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setErrorMessage(msg || 'Error uploading PDF. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
  const handleUploadVideo = async (file: File) => {
    if (!roomId) return;
    const isVideo =
      file.type.startsWith('video/') ||
      file.type.startsWith('audio/') ||
      /\.(mp4|webm|mov|m4v|mkv|mp3|wav|ogg|aac|flac)$/i.test(file.name);
    if (!isVideo) {
      setErrorMessage(
        'Media format not supported. Please upload a valid video or audio file (e.g. MP4, WebM, MOV).',
      );
      return;
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setErrorMessage(
        `Selected media (${sizeMb} MB) exceeds maximum allowed limit of 50 MB.`,
      );
      return;
    }
    setUploadProgressMsg('Uploading and processing video...');
    setUploading(true);
    try {
      const result = await uploadRoomVideo(roomId, file);
      const apiBase = (
        import.meta.env.VITE_API_URL || `${window.location.origin}/api`
      ).replace(/\/api$/, '');
      const newVideoPath = result.videoPath;
      const newVideoUrl = newVideoPath
        ? newVideoPath.startsWith('http') || newVideoPath.startsWith('/')
          ? newVideoPath
          : `${apiBase}/uploads/${newVideoPath}`
        : null;
      emitRoomVideoUpdated(newVideoPath, newVideoUrl);
      setActiveTab('video');
      emitSyncTab('video');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setErrorMessage(msg || 'Error uploading video. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePdf = async () => {
    if (!roomId) return;
    if (!window.confirm('Do you want to remove the PDF from this room?')) return;
    setUploadProgressMsg('Removing PDF...');
    setUploading(true);
    try {
      await removeRoomPdf(roomId);
      emitRoomPdfUpdated(null, null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setErrorMessage(msg || 'Error removing PDF.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveVideo = async () => {
    if (!roomId) return;
    if (!window.confirm('Do you want to remove the video/audio from this room?')) return;
    setUploadProgressMsg('Removing video...');
    setUploading(true);
    try {
      await removeRoomVideo(roomId);
      emitRoomVideoUpdated(null, null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setErrorMessage(msg || 'Error removing video/audio.');
    } finally {
      setUploading(false);
    }
  };

  const handleTextScroll = (payload: SyncScrollPayload) => {
    lastScrollRef.current = payload;
    if (!silentMode) {
      emitScrollSync(payload);
    }
  };

  const handleOpenEdit = () => {
    setEditDraft(roomDescription || '');
    setEditOpen(true);
  };

  const handleSaveDescription = async () => {
    if (!roomId) return;
    setSaving(true);
    try {
      const cleanDraft = editDraft === '<p></p>' ? '' : editDraft;
      await updateRoomDescription(roomId, cleanDraft);
      setRoomDescription(cleanDraft);
      emitRoomDescriptionUpdate(cleanDraft);
      setEditOpen(false);
      setShowSaveSnack(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setErrorMessage(msg || 'Error saving room description.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!roomId || updatingStatus) return;
    const nextStatus = roomStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setUpdatingStatus(true);
    try {
      await updateRoomStatus(roomId, nextStatus);
      emitRoomStatusChanged(nextStatus);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setErrorMessage(msg || 'Error updating room status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleCopyViewerLink = () => {
    const url = hasPassword
      ? `${window.location.origin}/join/${shortCode || roomId}?token=${inviteToken}`
      : `${window.location.origin}/join/${shortCode || roomId}`;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => setShowCopySnack(true));
    } else {
      setShowCopySnack(true);
    }
  };

  return (
    <Box
      sx={{
        height: '100vh',
        bgcolor: '#0A0A0B',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Topbar Flutuante do Líder */}
      <Box
        sx={{
          zIndex: 100,
          p: { xs: 1.5, sm: 2 },
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 1, sm: 1.5 },
          position: 'relative',
        }}
      >
        {/* Linha Principal do Topbar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: { xs: 1, sm: 1.5 },
            width: '100%',
          }}
        >
          {/* Botão Home à esquerda */}
          <IconButton
            onClick={() => navigate('/dashboard')}
            sx={{
              bgcolor: 'rgba(27, 27, 30, 0.85)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#FFF',
              width: { xs: 38, sm: 44 },
              height: { xs: 38, sm: 44 },
              boxShadow: '0px 8px 32px rgba(0,0,0,0.4)',
              flexShrink: 0,
              '&:hover': { bgcolor: 'rgba(40, 40, 45, 0.95)' },
            }}
            title="Voltar ao Painel"
          >
            <HomeOutlinedIcon sx={{ fontSize: { xs: 20, sm: 24 } }} />
          </IconButton>

          {/* Pílula Central: Nome da Sala + Seletor de Modo (Desktop md+) */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              justifyContent: 'center',
              minWidth: 0,
              flex: { xs: 1, md: 'unset' },
            }}
          >
            {/* Nome da Sala / Código */}
            <Box
              sx={{
                bgcolor: 'rgba(27, 27, 30, 0.85)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '24px',
                px: { xs: 1.2, sm: 2.5 },
                py: { xs: 0.5, sm: 0.8 },
                boxShadow: '0px 8px 32px rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: { xs: 0.6, sm: 1 },
                minWidth: 0,
                maxWidth: { xs: '100%', sm: 300, md: 400 },
              }}
            >
              <Typography
                variant="body2"
                noWrap
                sx={{
                  fontWeight: 600,
                  fontSize: { xs: '0.8rem', sm: '0.95rem' },
                  color: '#FFF',
                  fontFamily: '"Inter", sans-serif',
                  minWidth: 0,
                }}
                title={roomName || shortCode || 'Sala de Aula'}
              >
                {roomName || shortCode || 'Sala de Aula'}
              </Typography>

              <Chip
                label={shortCode || 'Código'}
                size="small"
                onClick={handleCopyViewerLink}
                title="Copiar link"
                sx={{
                  bgcolor: 'rgba(56, 183, 255, 0.15)',
                  color: '#38B7FF',
                  fontWeight: 700,
                  fontSize: { xs: '0.68rem', sm: '0.75rem' },
                  height: { xs: 20, sm: 22 },
                  cursor: 'pointer',
                  borderRadius: '6px',
                  flexShrink: 0,
                  '&:hover': { bgcolor: 'rgba(56, 183, 255, 0.25)' },
                }}
              />
            </Box>

            {/* Seletor de Abas no Desktop (md+) */}
            <Box
              sx={{
                display: { xs: 'none', md: 'flex' },
                bgcolor: 'rgba(27, 27, 30, 0.85)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '24px',
                p: 0.4,
                boxShadow: '0px 8px 32px rgba(0,0,0,0.4)',
                gap: 0.5,
              }}
            >
              {(Object.keys(tabLabels) as VisibleTab[]).map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <Button
                    key={tab}
                    onClick={() => handleTabChange(tab)}
                    size="small"
                    sx={{
                      bgcolor: isActive ? '#38B7FF' : 'transparent',
                      color: isActive ? '#0A0A0B' : 'rgba(255,255,255,0.7)',
                      fontWeight: isActive ? 700 : 500,
                      borderRadius: '20px',
                      px: 1.8,
                      py: 0.5,
                      textTransform: 'none',
                      fontSize: '0.85rem',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        bgcolor: isActive ? '#2da1e6' : 'rgba(255,255,255,0.08)',
                        color: isActive ? '#0A0A0B' : '#FFF',
                      },
                    }}
                  >
                    {tabLabels[tab]}
                  </Button>
                );
              })}
            </Box>
          </Box>

          {/* Ações da Direita: Forçar Sync + Status + Menu */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.6, sm: 1 }, flexShrink: 0 }}>
            {/* Botão Forçar Sincronização */}
            <Tooltip title="Forçar todos os alunos para sua visualização" disableInteractive>
              <Box>
                {/* Versão Desktop (sm+) */}
                <Button
                  onClick={handleForceSync}
                  variant="contained"
                  size="small"
                  startIcon={<ElectricBoltIcon />}
                  sx={{
                    display: { xs: 'none', sm: 'flex' },
                    bgcolor: '#EAB308',
                    color: '#0A0A0B',
                    fontWeight: 700,
                    borderRadius: '24px',
                    px: 2,
                    py: 0.8,
                    textTransform: 'none',
                    boxShadow: '0px 8px 24px rgba(234, 179, 8, 0.25)',
                    '&:hover': {
                      bgcolor: '#CA8A04',
                      boxShadow: '0px 10px 28px rgba(234, 179, 8, 0.35)',
                    },
                  }}
                >
                  Forçar Sync
                </Button>

                {/* Versão Mobile (xs) */}
                <IconButton
                  onClick={handleForceSync}
                  sx={{
                    display: { xs: 'flex', sm: 'none' },
                    bgcolor: 'rgba(234, 179, 8, 0.15)',
                    color: '#EAB308',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    width: 38,
                    height: 38,
                    '&:hover': { bgcolor: 'rgba(234, 179, 8, 0.25)' },
                  }}
                >
                  <ElectricBoltIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            </Tooltip>

            {/* Status da Sala (Ao Vivo / Em Espera) */}
            <Chip
              label={roomStatus === 'ACTIVE' ? 'Ao Vivo' : 'Em Espera'}
              onClick={handleToggleStatus}
              title="Clique para alternar o status da sala"
              sx={{
                bgcolor:
                  roomStatus === 'ACTIVE'
                    ? 'rgba(34, 197, 94, 0.15)'
                    : 'rgba(234, 179, 8, 0.15)',
                color: roomStatus === 'ACTIVE' ? '#22C55E' : '#EAB308',
                fontWeight: 600,
                fontSize: { xs: '0.72rem', sm: '0.85rem' },
                borderRadius: '20px',
                height: { xs: 32, sm: 36 },
                px: { xs: 0.6, sm: 1 },
                cursor: 'pointer',
                border: '1px solid',
                borderColor:
                  roomStatus === 'ACTIVE'
                    ? 'rgba(34, 197, 94, 0.3)'
                    : 'rgba(234, 179, 8, 0.3)',
              }}
            />

            {/* Menu de Mais Opções */}
            <IconButton
              onClick={(e) => setMenuAnchorEl(e.currentTarget)}
              sx={{
                bgcolor: 'rgba(27, 27, 30, 0.85)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#FFF',
                width: { xs: 38, sm: 44 },
                height: { xs: 38, sm: 44 },
                boxShadow: '0px 8px 32px rgba(0,0,0,0.4)',
                '&:hover': { bgcolor: 'rgba(40, 40, 45, 0.95)' },
              }}
            >
              <MoreVertIcon sx={{ fontSize: { xs: 20, sm: 24 } }} />
            </IconButton>
          </Box>
        </Box>

        {/* Linha 2 (Mobile Apenas xs/sm): Seletor de Abas de Apresentação */}
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            justifyContent: 'center',
            width: '100%',
          }}
        >
          <Box
            sx={{
              bgcolor: 'rgba(27, 27, 30, 0.85)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '24px',
              p: 0.35,
              boxShadow: '0px 8px 32px rgba(0,0,0,0.4)',
              display: 'flex',
              gap: 0.5,
              width: '100%',
              maxWidth: 380,
            }}
          >
            {(Object.keys(tabLabels) as VisibleTab[]).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <Button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  size="small"
                  sx={{
                    flex: 1,
                    bgcolor: isActive ? '#38B7FF' : 'transparent',
                    color: isActive ? '#0A0A0B' : 'rgba(255,255,255,0.7)',
                    fontWeight: isActive ? 700 : 500,
                    borderRadius: '20px',
                    py: 0.4,
                    textTransform: 'none',
                    fontSize: '0.8rem',
                    minWidth: 0,
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: isActive ? '#2da1e6' : 'rgba(255,255,255,0.08)',
                      color: isActive ? '#0A0A0B' : '#FFF',
                    },
                  }}
                >
                  {tabLabels[tab]}
                </Button>
              );
            })}
          </Box>
        </Box>
      </Box>

      {/* Menu Dropdown de Opções */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={() => setMenuAnchorEl(null)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#17171C',
              color: '#FFF',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0px 12px 32px rgba(0,0,0,0.6)',
              minWidth: 200,
              py: 1,
            },
          },
        }}
      >
        {/* Seletor de Modo no Mobile */}
        <Box sx={{ display: { xs: 'block', md: 'none' }, px: 2, py: 1 }}>
          <Typography variant="caption" sx={{ color: '#71717A', fontWeight: 600, textTransform: 'uppercase' }}>
            Modo de Apresentação
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mt: 1, mb: 1 }}>
            {(Object.keys(tabLabels) as VisibleTab[]).map((tab) => (
              <Button
                key={tab}
                size="small"
                onClick={() => {
                  handleTabChange(tab);
                  setMenuAnchorEl(null);
                }}
                sx={{
                  bgcolor: activeTab === tab ? '#38B7FF' : 'rgba(255,255,255,0.05)',
                  color: activeTab === tab ? '#0A0A0B' : '#FFF',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  borderRadius: '12px',
                  flex: 1,
                  py: 0.4,
                }}
              >
                {tabLabels[tab]}
              </Button>
            ))}
          </Box>
          <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.1)' }} />
        </Box>

        <MenuItem
          onClick={() => {
            handleForceSync();
            setMenuAnchorEl(null);
          }}
          sx={{ gap: 1.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}
        >
          <ElectricBoltIcon fontSize="small" sx={{ color: '#EAB308' }} />
          <Typography variant="body2">Forçar Sincronização</Typography>
        </MenuItem>

        <MenuItem
          onClick={() => {
            handleCopyViewerLink();
            setMenuAnchorEl(null);
          }}
          sx={{ gap: 1.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}
        >
          <ContentCopyIcon fontSize="small" sx={{ color: '#38B7FF' }} />
          <Typography variant="body2">Copiar Link da Sala</Typography>
        </MenuItem>

        {activeTab === 'text' && (
          <MenuItem
            onClick={() => {
              handleOpenEdit();
              setMenuAnchorEl(null);
            }}
            sx={{ gap: 1.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}
          >
            <EditIcon fontSize="small" sx={{ color: '#38B7FF' }} />
            <Typography variant="body2">Editar Texto da Sala</Typography>
          </MenuItem>
        )}

        {activeTab === 'text' && (
          <MenuItem
            onClick={() => {
              setSilentMode(!silentMode);
              setMenuAnchorEl(null);
            }}
            sx={{ gap: 1.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}
          >
            {silentMode ? <LockOpenIcon fontSize="small" /> : <LockIcon fontSize="small" />}
            <Typography variant="body2">
              {silentMode ? 'Desativar Modo Silencioso' : 'Ativar Modo Silencioso'}
            </Typography>
          </MenuItem>
        )}

        <MenuItem
          onClick={() => {
            if (activeTab === 'pdf') pdfFileInputRef.current?.click();
            else videoFileInputRef.current?.click();
            setMenuAnchorEl(null);
          }}
          sx={{ gap: 1.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}
        >
          <UploadFileIcon fontSize="small" />
          <Typography variant="body2">{`Trocar ${(tabLabels as Record<string, string>)[activeTab] || activeTab}`}</Typography>
        </MenuItem>

        {((activeTab === 'pdf' && pdfUrl) || (activeTab === 'video' && videoUrl)) && (
          <MenuItem
            onClick={() => {
              if (activeTab === 'pdf') handleRemovePdf();
              else handleRemoveVideo();
              setMenuAnchorEl(null);
            }}
            sx={{ gap: 1.5, color: '#EF4444', '&:hover': { bgcolor: 'rgba(239,68,68,0.1)' } }}
          >
            <DeleteOutlineIcon fontSize="small" />
            <Typography variant="body2">{`Remover ${(tabLabels as Record<string, string>)[activeTab] || activeTab}`}</Typography>
          </MenuItem>
        )}

        <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.1)' }} />

        {/* Status de Conexão */}
        <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {isConnecting ? (
            <CircularProgress size={16} sx={{ color: '#FFF' }} />
          ) : connected ? (
            <SignalWifiStatusbar4BarIcon sx={{ color: '#22C55E' }} fontSize="small" />
          ) : (
            <SignalWifiOffIcon color="error" fontSize="small" />
          )}
          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>
            {isConnecting ? 'Conectando...' : connected ? 'Sincronizado (Online)' : 'Offline'}
          </Typography>
        </Box>
      </Menu>

      {/* Área de Conteúdo Principal */}
      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Modo PDF */}
        {activeTab === 'pdf' && (
          <Box sx={{ flex: 1, p: { xs: 1, sm: 2 }, pb: { xs: 12, sm: 16 }, overflow: 'auto', position: 'relative', touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
            {pdfUrl ? (
              <PdfViewer
                fileUrl={pdfUrl}
                pageNumber={localPage}
                onPageChange={handlePageChange}
                readOnly={false}
                onNumPagesLoaded={setNumPages}
                isLeaderSilentMode={silentMode}
                onToggleLeaderSilentMode={() => setSilentMode((prev) => !prev)}
                onForceSync={handleForceSync}
              />
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 1,
                  minHeight: 280,
                  gap: 2,
                }}
              >
                <Typography sx={{ color: '#A1A1AA' }}>
                  Nenhum PDF associado a esta sala.
                </Typography>
                <Button
                  variant="contained"
                  disabled={uploading}
                  component="label"
                  startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : <UploadFileIcon />}
                  sx={{
                    bgcolor: '#38B7FF',
                    color: '#0A0A0B',
                    fontWeight: 600,
                    borderRadius: '20px',
                    px: 3,
                    textTransform: 'none',
                    '&:hover': { bgcolor: '#2da1e6' },
                  }}
                >
                  {uploading ? 'Enviando...' : 'Adicionar PDF'}
                  <input
                    type="file"
                    accept="application/pdf"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadPdf(file);
                      e.target.value = '';
                    }}
                  />
                </Button>
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
                onScroll={handleTextScroll}
                ghostHighlightEvent={ghostHighlightEvent}
                onGhostHighlight={emitGhostHighlight}
              />
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 1,
                  gap: 2,
                  p: 3,
                }}
              >
                <Typography sx={{ color: '#A1A1AA', textAlign: 'center' }}>
                  Nenhum texto salvo para esta sala.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<EditIcon />}
                  onClick={handleOpenEdit}
                  sx={{
                    bgcolor: '#38B7FF',
                    color: '#0A0A0B',
                    fontWeight: 600,
                    borderRadius: '20px',
                    px: 3,
                    textTransform: 'none',
                    '&:hover': { bgcolor: '#2da1e6' },
                  }}
                >
                  Adicionar Texto
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* Modo Vídeo */}
        {activeTab === 'video' && (
          <Box sx={{ flex: 1, p: { xs: 1, sm: 2 }, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {videoUrl ? (
              <VideoPlayer videoUrl={videoUrl} isLeader={true} />
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 1,
                  minHeight: 280,
                  gap: 2,
                }}
              >
                <Typography sx={{ color: '#A1A1AA' }}>
                  Nenhum vídeo associado a esta sala.
                </Typography>
                <Button
                  variant="contained"
                  disabled={uploading}
                  component="label"
                  startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : <UploadFileIcon />}
                  sx={{
                    bgcolor: '#38B7FF',
                    color: '#0A0A0B',
                    fontWeight: 600,
                    borderRadius: '20px',
                    px: 3,
                    textTransform: 'none',
                    '&:hover': { bgcolor: '#2da1e6' },
                  }}
                >
                  {uploading ? 'Enviando...' : 'Adicionar Vídeo'}
                  <input
                    type="file"
                    accept="video/*,audio/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadVideo(file);
                      e.target.value = '';
                    }}
                  />
                </Button>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Dialog Dark de Edição de Texto */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        fullWidth
        maxWidth="md"
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#17171C',
              color: '#FFF',
              borderRadius: '24px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              p: 1,
            },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.2rem', color: '#FFF' }}>
          Editar Texto da Aula
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 1, sm: 2 } }}>
          <RichTextEditor content={editDraft} onChange={(html) => setEditDraft(html)} />
          <Typography variant="caption" sx={{ color: '#71717A', mt: 1.5, display: 'block' }}>
            As alterações serão sincronizadas ao vivo com todos os alunos conectados.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            onClick={() => setEditOpen(false)}
            disabled={saving}
            sx={{ color: '#A1A1AA', textTransform: 'none', borderRadius: '10px' }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveDescription}
            disabled={saving}
            sx={{
              bgcolor: '#38B7FF',
              color: '#0A0A0B',
              fontWeight: 700,
              textTransform: 'none',
              borderRadius: '10px',
              px: 3,
              '&:hover': { bgcolor: '#2da1e6' },
            }}
          >
            {saving ? 'Salvando...' : 'Salvar e Sincronizar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Hidden File Inputs */}
      <input
        type="file"
        accept="application/pdf"
        hidden
        ref={pdfFileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUploadPdf(file);
          e.target.value = '';
        }}
      />
      <input
        type="file"
        accept="video/*,audio/*"
        hidden
        ref={videoFileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUploadVideo(file);
          e.target.value = '';
        }}
      />

      {/* Feedback Snacks */}
      <Snackbar
        open={showCopySnack}
        autoHideDuration={2500}
        onClose={() => setShowCopySnack(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowCopySnack(false)}
          severity="success"
          icon={<CheckIcon fontSize="inherit" />}
          sx={{
            bgcolor: '#17171C',
            color: '#FFF',
            border: '1px solid rgba(56, 183, 255, 0.3)',
            borderRadius: '16px',
            boxShadow: '0px 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          Link de convite copiado para a área de transferência!
        </Alert>
      </Snackbar>

      <Snackbar
        open={showSaveSnack}
        autoHideDuration={2500}
        onClose={() => setShowSaveSnack(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowSaveSnack(false)}
          severity="success"
          icon={<CheckIcon fontSize="inherit" />}
          sx={{
            bgcolor: '#17171C',
            color: '#FFF',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '16px',
            boxShadow: '0px 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          Sincronização forçada enviada aos alunos!
        </Alert>
      </Snackbar>

      <Snackbar
        open={Boolean(errorMessage)}
        autoHideDuration={6000}
        onClose={() => setErrorMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setErrorMessage(null)}
          severity="error"
          sx={{
            bgcolor: '#17171C',
            color: '#FFF',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '16px',
            boxShadow: '0px 8px 32px rgba(0,0,0,0.6)',
            maxWidth: '90vw',
            '& .MuiAlert-icon': {
              color: '#EF4444',
            },
          }}
        >
          {errorMessage}
        </Alert>
      </Snackbar>

      {/* Backdrop de Loading com Dark Glassmorphism durante Upload / Troca / Remoção de Mídia */}
      <Backdrop
        open={uploading}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 999,
          bgcolor: 'rgba(10, 10, 11, 0.82)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            p: 4,
            borderRadius: '24px',
            bgcolor: '#17171C',
            border: '1px solid rgba(56, 183, 255, 0.3)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
            textAlign: 'center',
            maxWidth: 380,
            width: '90%',
          }}
        >
          <Box sx={{ position: 'relative', display: 'inline-flex', mb: 1.5 }}>
            <CircularProgress
              size={56}
              thickness={4}
              sx={{
                color: '#38B7FF',
              }}
            />
          </Box>
          <Typography sx={{ color: '#FFF', fontWeight: 600, fontSize: '1.05rem' }}>
            {uploadProgressMsg}
          </Typography>
          <Typography sx={{ color: '#71717A', fontSize: '0.85rem', mt: 0.5 }}>
            Aguarde enquanto o arquivo é transmitido e processado pelo servidor.
          </Typography>
        </Box>
      </Backdrop>
    </Box>
  );
};
