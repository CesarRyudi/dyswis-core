import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Drawer,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import CheckIcon from '@mui/icons-material/Check';
import { Annotation, updateAnnotation, deleteAnnotation } from '../services/api';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';

interface SessionNotesDrawerProps {
  open: boolean;
  onClose: () => void;
  annotations: Annotation[];
  onAnnotationsChange?: () => void;
  onNavigateToAnnotation?: (ann: Annotation) => void;
  title?: string;
}

export const SessionNotesDrawer: React.FC<SessionNotesDrawerProps> = ({
  open,
  onClose,
  annotations,
  onAnnotationsChange,
  onNavigateToAnnotation,
  title = 'Notas da sessão',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const [editContent, setEditContent] = useState('');
  const [annotationToDelete, setAnnotationToDelete] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Filtragem em tempo real pelo termo de busca
  const filteredAnnotations = useMemo(() => {
    if (!searchTerm.trim()) return annotations;
    const lower = searchTerm.toLowerCase();
    return annotations.filter(
      (a) =>
        a.content.toLowerCase().includes(lower) ||
        (a.originalText && a.originalText.toLowerCase().includes(lower)) ||
        (a.pdfPage && `página ${a.pdfPage}`.includes(lower))
    );
  }, [annotations, searchTerm]);

  const handleOpenEdit = (ann: Annotation, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingAnnotation(ann);
    setEditContent(ann.content);
  };

  const handleSaveEdit = async () => {
    if (!editingAnnotation || !editContent.trim()) return;
    setLoading(true);
    try {
      await updateAnnotation(editingAnnotation.id, editContent.trim());
      setEditingAnnotation(null);
      onAnnotationsChange?.();
    } catch (e) {
      console.error('Erro ao atualizar anotação', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!annotationToDelete) return;
    setLoading(true);
    try {
      await deleteAnnotation(annotationToDelete);
      if (editingAnnotation?.id === annotationToDelete) {
        setEditingAnnotation(null);
      }
      setAnnotationToDelete(null);
      onAnnotationsChange?.();
    } catch (e) {
      console.error('Erro ao excluir anotação', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100%', sm: 420 },
            bgcolor: '#0A0A0B',
            color: '#FFFFFF',
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
          },
        },
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton
          onClick={onClose}
          sx={{
            bgcolor: 'rgba(255,255,255,0.08)',
            color: '#FFF',
            width: 44,
            height: 44,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' },
          }}
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>
          {title}
        </Typography>
      </Box>

      {/* Barra de Busca (Design Figma) */}
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Buscar nas notas"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          variant="outlined"
          size="small"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 20 }} />
                </InputAdornment>
              ),
              endAdornment: searchTerm ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchTerm('')} sx={{ color: 'rgba(255,255,255,0.4)', p: 0.5 }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
              sx: {
                bgcolor: '#17171C',
                color: '#FFF',
                borderRadius: '12px',
                '& fieldset': {
                  borderColor: 'rgba(255,255,255,0.08)',
                },
                '&:hover fieldset': {
                  borderColor: 'rgba(255,255,255,0.15)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#38B7FF',
                },
              },
            },
          }}
        />
      </Box>

      {/* Lista de Notas (Design Figma) */}
      <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, pr: 0.5 }}>
        {filteredAnnotations.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, color: 'rgba(255,255,255,0.4)' }}>
            <Typography variant="body2">
              {searchTerm ? 'Nenhuma anotação encontrada para esta busca.' : 'Nenhuma anotação nesta sessão.'}
            </Typography>
          </Box>
        ) : (
          filteredAnnotations.map((ann) => {
            const isPdf = ann.pdfPage != null;
            const cardTitle = isPdf
              ? `Página ${ann.pdfPage}`
              : ann.originalText || 'Texto selecionado';

            return (
              <Box
                key={ann.id}
                onClick={() => {
                  if (onNavigateToAnnotation) {
                    onNavigateToAnnotation(ann);
                    onClose();
                  } else {
                    handleOpenEdit(ann);
                  }
                }}
                sx={{
                  bgcolor: '#17171C',
                  borderRadius: '16px',
                  p: 2.5,
                  border: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: 'rgba(255,255,255,0.15)',
                    bgcolor: '#1C1C22',
                  },
                }}
              >
                {/* Header do Card */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        bgcolor: 'rgba(255,255,255,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isPdf ? (
                        <EditOutlinedIcon sx={{ fontSize: 18, color: '#A1A1AA' }} />
                      ) : (
                        <ArticleOutlinedIcon sx={{ fontSize: 18, color: '#A1A1AA' }} />
                      )}
                    </Box>
                    <Typography
                      variant="subtitle2"
                      noWrap
                      sx={{ fontWeight: 600, color: '#FFFFFF', fontSize: '0.95rem' }}
                    >
                      {cardTitle}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      size="small"
                      onClick={(e) => handleOpenEdit(ann, e)}
                      sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#38B7FF' } }}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAnnotationToDelete(ann.id);
                      }}
                      sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#EF4444' } }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>

                {/* Conteúdo da Nota */}
                <Typography
                  variant="body2"
                  sx={{
                    color: '#A1A1AA',
                    fontSize: '0.9rem',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {ann.content}
                </Typography>
              </Box>
            );
          })
        )}
      </Box>

      {/* Bottom Sheet de Edição de Nota (Design Figma notes_figma_1.png) */}
      <Drawer
        anchor="bottom"
        open={Boolean(editingAnnotation)}
        onClose={() => setEditingAnnotation(null)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#17171C',
              color: '#FFF',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              p: 3,
              maxWidth: 500,
              mx: 'auto',
              border: '1px solid rgba(255,255,255,0.1)',
              borderBottom: 'none',
            },
          },
        }}
      >
        {/* Barra puxadora */}
        <Box sx={{ width: 48, height: 4, bgcolor: 'rgba(255,255,255,0.3)', borderRadius: 2, mx: 'auto', mb: 2.5 }} />

        {/* Título e Ações */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" noWrap sx={{ fontWeight: 600, fontSize: '1.15rem', color: '#FFF', maxWidth: '75%' }}>
            {editingAnnotation?.pdfPage != null
              ? `Página ${editingAnnotation.pdfPage}`
              : editingAnnotation?.originalText || 'Anotação'}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <IconButton
              onClick={() => editingAnnotation && setAnnotationToDelete(editingAnnotation.id)}
              disabled={loading}
              sx={{ color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#EF4444' } }}
            >
              <DeleteOutlineIcon />
            </IconButton>

            <IconButton
              onClick={handleSaveEdit}
              disabled={loading || !editContent.trim()}
              sx={{
                bgcolor: '#00A3FF',
                color: '#FFF',
                width: 40,
                height: 40,
                '&:hover': { bgcolor: '#0085D1' },
                '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' },
              }}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : <CheckIcon />}
            </IconButton>
          </Box>
        </Box>

        {/* Caixa de Texto Branca (Figma Style) */}
        <Box
          sx={{
            bgcolor: '#FFFFFF',
            borderRadius: '16px',
            p: 2,
            minHeight: 140,
            mb: 2,
            boxShadow: '0px 4px 20px rgba(0,0,0,0.3)',
          }}
        >
          <TextField
            fullWidth
            multiline
            minRows={4}
            maxRows={8}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            placeholder="Escreva sua anotação..."
            variant="standard"
            autoFocus
            slotProps={{
              input: {
                disableUnderline: true,
                sx: {
                  color: '#17171C',
                  fontSize: '0.95rem',
                  lineHeight: 1.5,
                  fontWeight: 400,
                  fontFamily: '"Inter", sans-serif',
                },
              },
            }}
          />
        </Box>
      </Drawer>

      <ConfirmDeleteDialog
        open={Boolean(annotationToDelete)}
        loading={loading}
        onConfirm={handleDelete}
        onClose={() => setAnnotationToDelete(null)}
      />
    </Drawer>
  );
};
