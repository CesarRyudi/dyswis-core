import { useEffect, useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Container,
  IconButton,
  TextField,
  InputAdornment,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Drawer,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import CheckIcon from '@mui/icons-material/Check';
import LogoutIcon from '@mui/icons-material/Logout';
import HistoryIcon from '@mui/icons-material/History';
import { useNavigate } from 'react-router-dom';
import { getAllAnnotations, Annotation, updateAnnotation, deleteAnnotation } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';
import { isTextContentMatching } from '../utils/textSnapshot';

export function NotesDashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [orphanModalData, setOrphanModalData] = useState<Annotation | null>(null);
  const [annotationToDelete, setAnnotationToDelete] = useState<string | null>(null);
  
  // Estado para Bottom Sheet de Edição de Nota (Figma notes_figma_1.png)
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const [editContent, setEditContent] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchNotes = async () => {
    try {
      const data = await getAllAnnotations();
      setAnnotations(data);
    } catch (e) {
      console.error('Failed to load notes', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchNotes();
  }, [user, navigate]);

  const isHistoricalAnnotation = (ann: Annotation): boolean => {
    if (ann.blockId?.startsWith('index-')) return true;
    if (ann.pdfPage != null) {
      return !ann.room?.pdfPath;
    }
    if (!ann.blockId) return false;
    const roomDesc = ann.room?.description;
    if (!roomDesc) return true;
    if (!roomDesc.includes(`data-id="${ann.blockId}"`) && !roomDesc.includes(`id="${ann.blockId}"`)) {
      return true;
    }
    // [BUG-052] Se o parágrafo teve seu texto substancialmente alterado pelo líder:
    if (ann.originalText && ann.originalText.trim().length > 0) {
      const regex = new RegExp(`<(?:p|h[1-6]|blockquote|li)[^>]*?(?:data-id|id)="${ann.blockId}"[^>]*>([\\s\\S]*?)<\\/(?:p|h[1-6]|blockquote|li)>`, 'i');
      const match = roomDesc.match(regex);
      if (match) {
        const blockHtml = match[1];
        if (!isTextContentMatching(ann.originalText, blockHtml)) {
          return true; // Texto foi reescrito/divergiu -> classificar como Nota Histórica!
        }
      }
    }
    return false;
  };

  const filteredAnnotations = useMemo(() => {
    if (!searchTerm.trim()) return annotations;
    const lower = searchTerm.toLowerCase();
    return annotations.filter(
      (a) =>
        a.content.toLowerCase().includes(lower) ||
        (a.originalText && a.originalText.toLowerCase().includes(lower)) ||
        (a.pdfPage && `página ${a.pdfPage}`.includes(lower)) ||
        (a.room?.name && a.room.name.toLowerCase().includes(lower))
    );
  }, [annotations, searchTerm]);

  const handleOpenEdit = (ann: Annotation, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingAnnotation(ann);
    setEditContent(ann.content);
  };

  const handleSaveEdit = async () => {
    if (!editingAnnotation || !editContent.trim()) return;
    setActionLoading(true);
    try {
      await updateAnnotation(editingAnnotation.id, editContent.trim());
      setEditingAnnotation(null);
      await fetchNotes();
    } catch (e) {
      console.error('Erro ao atualizar anotação', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!annotationToDelete) return;
    setActionLoading(true);
    try {
      await deleteAnnotation(annotationToDelete);
      if (editingAnnotation?.id === annotationToDelete) {
        setEditingAnnotation(null);
      }
      setAnnotationToDelete(null);
      await fetchNotes();
    } catch (e) {
      console.error('Erro ao excluir anotação', e);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <Box sx={{ minHeight: '100vh', bgcolor: '#0A0A0B', color: '#FFF', pb: 8, fontFamily: '"Inter", sans-serif' }}>
        {/* Header (Figma Style) */}
        <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)', bgcolor: '#0A0A0B', position: 'sticky', top: 0, zIndex: 10 }}>
          <Container maxWidth="sm">
            <Box sx={{ display: 'flex', alignItems: 'center', py: 2.5, justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <IconButton 
                  onClick={() => navigate(-1)} 
                  sx={{ 
                    color: '#FFF', 
                    bgcolor: 'rgba(255,255,255,0.08)',
                    width: 44,
                    height: 44,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' }
                  }}
                >
                  <ArrowBackIcon fontSize="small" />
                </IconButton>
                <Typography variant="h6" sx={{ fontWeight: 600, letterSpacing: '-0.02em', fontSize: '1.25rem' }}>
                  Notas da sessão
                </Typography>
              </Box>
              <IconButton 
                onClick={() => { logout(); navigate('/login'); }}
                title="Sair da conta"
                sx={{
                  color: '#EF4444',
                  bgcolor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  width: 40,
                  height: 40,
                  '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.2)' },
                }}
              >
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Box>
          </Container>
        </Box>

        <Container maxWidth="sm" sx={{ mt: 3 }}>
          {/* Barra de Busca (Figma Style) */}
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

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
              <CircularProgress sx={{ color: '#38B7FF' }} />
            </Box>
          ) : filteredAnnotations.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, px: 4, bgcolor: '#17171C', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                {searchTerm ? 'Nenhuma anotação encontrada para esta busca.' : 'Nenhuma anotação registrada ainda.'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredAnnotations.map((ann) => {
                const isPdf = ann.pdfPage != null;
                const cardTitle = isPdf
                  ? `Página ${ann.pdfPage}`
                  : ann.originalText || 'Texto selecionado';

                return (
                  <Box
                    key={ann.id}
                    onClick={() => {
                      if (isHistoricalAnnotation(ann)) {
                        setOrphanModalData(ann);
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
                        <Box sx={{ overflow: 'hidden' }}>
                          <Typography
                            variant="subtitle2"
                            noWrap
                            sx={{ fontWeight: 600, color: '#FFFFFF', fontSize: '0.95rem' }}
                          >
                            {cardTitle}
                          </Typography>
                          {ann.room?.name && (
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>
                              {ann.room.name}
                            </Typography>
                          )}
                        </Box>
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
                          disabled={actionLoading}
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
              })}
            </Box>
          )}
        </Container>
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
              maxWidth: 540,
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
              disabled={actionLoading}
              sx={{ color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#EF4444' } }}
            >
              <DeleteOutlineIcon />
            </IconButton>

            <IconButton
              onClick={handleSaveEdit}
              disabled={actionLoading || !editContent.trim()}
              sx={{
                bgcolor: '#00A3FF',
                color: '#FFF',
                width: 40,
                height: 40,
                '&:hover': { bgcolor: '#0085D1' },
                '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' },
              }}
            >
              {actionLoading ? <CircularProgress size={20} color="inherit" /> : <CheckIcon />}
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

      {/* Dialog para anotações órfãs */}
      <Dialog
        open={Boolean(orphanModalData)}
        onClose={() => setOrphanModalData(null)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#17171C',
              color: '#FFF',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.1)',
              backgroundImage: 'none',
            },
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1, fontWeight: 600 }}>
          <HistoryIcon sx={{ color: '#EAB308' }} />
          Anotação Histórica
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#A1A1AA', mb: 3, lineHeight: 1.6 }}>
            O conteúdo original ao qual esta anotação estava vinculada foi modificado ou removido pelo professor. Ela é mantida aqui para seu acesso histórico.
          </Typography>

          {orphanModalData?.originalText && (
            <Box
              sx={{
                pl: 2,
                py: 1.5,
                mb: 3,
                borderLeft: '4px solid #EAB308',
                bgcolor: 'rgba(234, 179, 8, 0.05)',
                borderRadius: '0 8px 8px 0',
              }}
            >
              <Typography variant="caption" sx={{ color: '#EAB308', fontWeight: 600, display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Trecho de texto original:
              </Typography>
              <Typography variant="body2" sx={{ color: '#D4D4D8', fontStyle: 'italic' }}>
                "{orphanModalData.originalText}"
              </Typography>
            </Box>
          )}

          {orphanModalData?.pdfPage != null && (
            <Box
              sx={{
                pl: 2,
                py: 1.5,
                mb: 3,
                borderLeft: '4px solid #EAB308',
                bgcolor: 'rgba(234, 179, 8, 0.05)',
                borderRadius: '0 8px 8px 0',
              }}
            >
              <Typography variant="caption" sx={{ color: '#EAB308', fontWeight: 600, display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Página do PDF original:
              </Typography>
              <Typography variant="body2" sx={{ color: '#D4D4D8', fontStyle: 'italic' }}>
                Página {orphanModalData.pdfPage}
              </Typography>
            </Box>
          )}

          <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', p: 2, borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
            <Typography variant="caption" sx={{ color: '#A1A1AA', display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
              Sua anotação:
            </Typography>
            <Typography variant="body1" sx={{ color: '#FFF', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {orphanModalData?.content}
            </Typography>
          </Box>

          <Typography variant="caption" sx={{ color: '#71717A', mt: 3, display: 'block', textAlign: 'center' }}>
            Sala: {orphanModalData?.room?.name || 'Desconhecida'} • {orphanModalData ? new Date(orphanModalData.createdAt).toLocaleDateString('pt-BR') : ''}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 0 }}>
          <Button 
            onClick={() => setOrphanModalData(null)}
            sx={{ 
              color: '#FFF', 
              bgcolor: 'rgba(255,255,255,0.1)', 
              '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' },
              borderRadius: '8px',
              px: 3,
              py: 1
            }}
          >
            Fechar
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(annotationToDelete)}
        loading={actionLoading}
        onConfirm={handleDelete}
        onClose={() => setAnnotationToDelete(null)}
      />
    </>
  );
}


