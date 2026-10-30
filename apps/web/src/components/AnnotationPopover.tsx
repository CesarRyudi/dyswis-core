import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Button,
  Popper,
  Paper,
  Fade,
  ClickAwayListener,
  CircularProgress,
  Drawer,
  useTheme,
  useMediaQuery
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LoginIcon from '@mui/icons-material/Login';
import { Annotation, createAnnotation, updateAnnotation, deleteAnnotation } from '../services/api';
import { useRoom } from '../contexts/RoomContext';
import { useNavigate } from 'react-router-dom';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';

interface AnnotationPopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  annotation?: Annotation | null;
  draftData?: {
    blockId?: string;
    originalText?: string;
    pdfPage?: number;
    pdfX?: number;
    pdfY?: number;
    mediaId?: string;
  } | null;
  onSaved?: () => void;
  onDeleted?: () => void;
}

export const AnnotationPopover: React.FC<AnnotationPopoverProps> = ({
  open,
  anchorEl,
  onClose,
  annotation,
  draftData,
  onSaved,
  onDeleted,
}) => {
  const { roomId } = useRoom();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [arrowRef, setArrowRef] = useState<HTMLElement | null>(null);
  
  const isGuest = !localStorage.getItem('dyswis_token');

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      if (annotation) {
        setContent(annotation.content);
        setIsEditing(false);
      } else if (draftData) {
        setContent('');
        setIsEditing(true); // Se é um draft, já começa no modo de edição
      }
    } else {
      setIsEditing(false);
      setContent('');
    }
  }, [open, annotation, draftData]);

  const handleSave = async () => {
    if (!roomId || !content.trim() || isGuest) return;
    setLoading(true);
    try {
      if (annotation) {
        await updateAnnotation(annotation.id, content.trim());
      } else if (draftData) {
        await createAnnotation({
          roomId,
          content: content.trim(),
          ...draftData
        });
      }
      setIsEditing(false);
      setContent('');
      onSaved?.();
      onClose();
    } catch (e) {
      console.error('Erro ao salvar anotação', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!annotation) return;
    setLoading(true);
    try {
      await deleteAnnotation(annotation.id);
      setConfirmDeleteOpen(false);
      onDeleted?.();
      onClose();
    } catch (e) {
      console.error('Erro ao deletar anotação', e);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => (
    <Box>
      {isGuest ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 1, px: 1, maxWidth: 260 }}>
          <Typography variant="body2" color="text.secondary" align="center">
            Faça login ou crie uma conta gratuita para criar e salvar anotações!
          </Typography>
          <Button
            variant="contained"
            size="small"
            onClick={() => {
              const url = new URL(window.location.href);
              if (annotation) {
                if (annotation.blockId) {
                  url.searchParams.set('tab', 'text');
                  url.searchParams.set('blockId', annotation.blockId);
                  localStorage.setItem('dyswis_pending_annotation', JSON.stringify({ tab: 'text', blockId: annotation.blockId }));
                } else if (annotation.pdfPage) {
                  url.searchParams.set('tab', 'pdf');
                  url.searchParams.set('page', String(annotation.pdfPage));
                  localStorage.setItem('dyswis_pending_annotation', JSON.stringify({ tab: 'pdf', page: annotation.pdfPage, x: annotation.pdfX || 50, y: annotation.pdfY || 50 }));
                }
              } else if (draftData) {
                if (draftData.blockId) {
                  url.searchParams.set('tab', 'text');
                  url.searchParams.set('blockId', draftData.blockId);
                  localStorage.setItem('dyswis_pending_annotation', JSON.stringify({ tab: 'text', ...draftData }));
                } else if (draftData.pdfX !== undefined || draftData.pdfPage !== undefined) {
                  url.searchParams.set('tab', 'pdf');
                  if (draftData.pdfPage) url.searchParams.set('page', String(draftData.pdfPage));
                  localStorage.setItem('dyswis_pending_annotation', JSON.stringify({ tab: 'pdf', page: draftData.pdfPage || Number(url.searchParams.get('page') || 1), x: draftData.pdfX || 50, y: draftData.pdfY || 50, ...draftData }));
                }
              }
              navigate('/login?returnTo=' + encodeURIComponent(url.pathname + url.search));
            }}
            startIcon={<LoginIcon />}
            sx={{ textTransform: 'none', fontWeight: 'bold', borderRadius: 1.5 }}
          >
            Fazer Login
          </Button>
        </Box>
      ) : isEditing ? (

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Escreva sua anotação..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              }
            }}
            multiline
            maxRows={4}
            inputRef={(el: HTMLTextAreaElement | HTMLInputElement | null) => {
              if (el) el.focus({ preventScroll: true });
            }}
            disabled={loading}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button size="small" onClick={() => annotation ? setIsEditing(false) : onClose()} disabled={loading}>
              Cancelar
            </Button>
            <Button size="small" variant="contained" onClick={handleSave} disabled={!content.trim() || loading}>
              {loading ? <CircularProgress size={20} /> : 'Salvar'}
            </Button>
          </Box>
        </Box>
      ) : annotation ? (
        <Box>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {annotation.content}
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mt: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', opacity: 0.8 }}>
              {new Intl.DateTimeFormat('pt-BR', {
                day: '2-digit',
                month: 'short',
                year: new Date(annotation.createdAt).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }).format(new Date(annotation.createdAt))}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton size="small" onClick={() => setIsEditing(true)} sx={{ p: 0.5 }}>
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" color="error" onClick={() => setConfirmDeleteOpen(true)} disabled={loading} sx={{ p: 0.5 }}>
                {loading ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon fontSize="small" />}
              </IconButton>
            </Box>
          </Box>
        </Box>
      ) : null}

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        loading={loading}
        onConfirm={handleDelete}
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </Box>
  );

  const isTextAnnotation = Boolean(annotation?.blockId || draftData?.blockId);
  const shouldUseDrawer = isMobile && (isEditing || !annotation);

  if (shouldUseDrawer) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        ModalProps={{ disablePortal: !isTextAnnotation }}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60vh', p: 2 } } }}
      >
        <Box sx={{ width: 40, height: 4, bgcolor: 'grey.500', borderRadius: 2, mx: 'auto', mb: 2 }} />
        {renderContent()}
      </Drawer>
    );
  }

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="top"
      transition
      disablePortal={!isTextAnnotation}
      style={{ zIndex: 1300 }}
      modifiers={[
        {
          name: 'flip',
          enabled: true,
          options: {
            altBoundary: true,
            rootBoundary: 'viewport',
            padding: 8,
          },
        },
        {
          name: 'preventOverflow',
          enabled: true,
          options: {
            altAxis: true,
            altBoundary: true,
            tether: true,
            rootBoundary: 'document',
            padding: 8,
          },
        },
        {
          name: 'arrow',
          enabled: true,
          options: {
            element: arrowRef,
          },
        },
        {
          name: 'offset',
          options: {
            offset: [0, 10], // 10px spacing from anchor
          },
        },
      ]}
    >
      {({ TransitionProps, placement }) => (
        <Fade {...TransitionProps} timeout={200}>
          <Box>
            <ClickAwayListener onClickAway={onClose} mouseEvent="onMouseDown" touchEvent="onTouchStart">
              <Paper 
                elevation={6}
                sx={{ 
                  p: 2, 
                  width: 300, 
                  bgcolor: 'background.paper', 
                  borderRadius: 2,
                  overflow: 'visible',
                  position: 'relative',
                }}
              >
                <Box
                  ref={setArrowRef}
                  sx={{
                    position: 'absolute',
                    width: 16,
                    height: 8,
                    ...(placement.startsWith('bottom') 
                      ? { top: '-8px' } 
                      : { bottom: '-8px' }),
                    '&::before': {
                      content: '""',
                      display: 'block',
                      margin: 'auto',
                      width: 0,
                      height: 0,
                      borderLeft: '8px solid transparent',
                      borderRight: '8px solid transparent',
                      ...(placement.startsWith('bottom')
                        ? {
                            borderBottom: '8px solid',
                            borderBottomColor: 'background.paper',
                          }
                        : {
                            borderTop: '8px solid',
                            borderTopColor: 'background.paper',
                          }),
                    }
                  }}
                />
                {renderContent()}
              </Paper>
            </ClickAwayListener>
          </Box>
        </Fade>
      )}
    </Popper>
  );
};
