/**
 * DashboardPage.tsx — Painel do Apresentador (Host) para gerenciar salas.
 *
 * Redesenhado no tema Dark Glassmorphism conforme o design system Dyswis.
 */
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ApiError,
  createRoom,
  deleteRoom,
  getMyRooms,
  Room,
  updateRoomStatus,
} from '../services/api';
import { JoinRoomModal } from '../components/JoinRoomModal';

export const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  const loadRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const data = await getMyRooms();
      setRooms(data);
    } catch {
      // silently fail on load
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const handleCreate = async () => {
    setError('');
    setCreating(true);
    try {
      await createRoom(roomName, roomPassword || undefined);
      setDialogOpen(false);
      setRoomName('');
      setRoomPassword('');
      await loadRooms();
      setSnackbarMessage('Sala criada com sucesso!');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Erro ao criar sala');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const copyLink = (room: Room) => {
    const url = room.hasPassword
      ? `${window.location.origin}/join/${room.shortCode || room.id}?token=${room.inviteToken}`
      : `${window.location.origin}/join/${room.shortCode || room.id}`;

    const showSuccess = () => {
      setSnackbarMessage('Link copiado para a área de transferência!');
      setCopiedId(room.id);
      setTimeout(() => setCopiedId(null), 2000);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(showSuccess)
        .catch(() => {
          fallbackCopy(url);
          showSuccess();
        });
    } else {
      fallbackCopy(url);
      showSuccess();
    }
  };

  const fallbackCopy = (text: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    setSnackbarMessage('Link copiado para a área de transferência!');
  };

  const handleDelete = async (roomId: string) => {
    if (
      !window.confirm(
        'Tem certeza que deseja excluir esta sala? Esta ação é irreversível.',
      )
    )
      return;
    try {
      await deleteRoom(roomId);
      setSnackbarMessage('Sala excluída com sucesso!');
      loadRooms();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao excluir sala');
    }
  };

  const handleToggleStatus = async (roomId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await updateRoomStatus(roomId, nextStatus);
      setRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, status: nextStatus } : r)),
      );
      setSnackbarMessage(
        `Sala ${nextStatus === 'ACTIVE' ? 'aberta ao vivo' : 'em modo de espera'}!`,
      );
    } catch {
      alert('Erro ao alterar o status da sala');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#0A0A0B',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Topbar Minimalista do Dashboard */}
      <Box
        sx={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          bgcolor: 'rgba(10, 10, 11, 0.8)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          py: 1.8,
          px: { xs: 2, sm: 4 },
        }}
      >
        <Box
          sx={{
            maxWidth: 1100,
            mx: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Logo e Nome */}
          <Box
            onClick={() => navigate('/')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              cursor: 'pointer',
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #FFFFFF 0%, #A1A1AA 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: '"Inter", sans-serif',
              }}
            >
              Dyswis
            </Typography>
          </Box>

          {/* Atalhos do Usuário */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Tooltip title="Minhas Anotações" disableInteractive>
              <IconButton
                onClick={() => navigate('/dashboard/notes')}
                sx={{
                  bgcolor: 'rgba(27, 27, 30, 0.85)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#FFF',
                  width: 40,
                  height: 40,
                  '&:hover': { bgcolor: 'rgba(40, 40, 45, 0.95)' },
                }}
              >
                <MenuBookOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Chip
              label={user?.name || 'Professor'}
              sx={{
                bgcolor: 'rgba(27, 27, 30, 0.85)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#FFF',
                fontWeight: 500,
                borderRadius: '20px',
                height: 36,
                px: 1,
                maxWidth: { xs: 120, sm: 220 },
                '& .MuiChip-label': {
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
              }}
            />

            <Tooltip title="Sair da Conta" disableInteractive>
              <IconButton
                onClick={handleLogout}
                sx={{
                  bgcolor: 'rgba(27, 27, 30, 0.85)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.6)',
                  width: 40,
                  height: 40,
                  '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' },
                }}
              >
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* Conteúdo Principal */}
      <Container maxWidth="lg" sx={{ flex: 1, py: { xs: 3, sm: 5 }, px: { xs: 2, sm: 4 } }}>
        {/* Cabeçalho da Seção */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 2,
            mb: 4,
          }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em', color: '#FFF' }}>
              Painel de Salas
            </Typography>
            <Typography variant="body2" sx={{ color: '#A1A1AA', mt: 0.5 }}>
              Gerencie suas salas de aula e compartilhe o conteúdo sincronizado ao vivo.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5, width: { xs: '100%', sm: 'auto' }, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<MeetingRoomOutlinedIcon />}
              onClick={() => setIsJoinModalOpen(true)}
              sx={{
                borderColor: 'rgba(255, 255, 255, 0.15)',
                color: '#FFF',
                borderRadius: '24px',
                px: 2.5,
                py: 1,
                textTransform: 'none',
                fontWeight: 600,
                flex: { xs: 1, sm: 'none' },
                '&:hover': {
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                  bgcolor: 'rgba(255, 255, 255, 0.05)',
                },
              }}
            >
              Entrar em uma Sala
            </Button>

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setDialogOpen(true)}
              sx={{
                bgcolor: '#38B7FF',
                color: '#0A0A0B',
                borderRadius: '24px',
                px: 3,
                py: 1,
                textTransform: 'none',
                fontWeight: 700,
                flex: { xs: 1, sm: 'none' },
                boxShadow: '0px 8px 24px rgba(56, 183, 255, 0.25)',
                '&:hover': {
                  bgcolor: '#2da1e6',
                  transform: 'translateY(-1px)',
                  boxShadow: '0px 10px 28px rgba(56, 183, 255, 0.35)',
                },
              }}
            >
              Nova Sala
            </Button>
          </Box>
        </Box>

        {/* Listagem de Salas */}
        {loadingRooms ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
            <CircularProgress sx={{ color: '#38B7FF' }} />
          </Box>
        ) : rooms.length === 0 ? (
          <Card
            elevation={0}
            sx={{
              p: { xs: 4, sm: 6 },
              textAlign: 'center',
              bgcolor: '#17171C',
              borderRadius: '24px',
              border: '1px dashed rgba(255,255,255,0.15)',
            }}
          >
            <SchoolOutlinedIcon sx={{ fontSize: 56, color: '#71717A', mb: 2 }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#FFF', mb: 1 }}>
              Nenhuma sala criada ainda
            </Typography>
            <Typography variant="body2" sx={{ color: '#A1A1AA', maxWidth: 420, mx: 'auto', mb: 3 }}>
              Crie sua primeira sala para iniciar apresentações sincronizadas de PDF, texto e vídeo com seus alunos.
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setDialogOpen(true)}
              sx={{
                bgcolor: '#38B7FF',
                color: '#0A0A0B',
                borderRadius: '20px',
                fontWeight: 600,
                textTransform: 'none',
                px: 3,
              }}
            >
              Criar primeira sala
            </Button>
          </Card>
        ) : (
          <Grid container spacing={2.5}>
            {rooms.map((room) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={room.id}>
                <Card
                  elevation={0}
                  sx={{
                    bgcolor: '#17171C',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '20px',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      borderColor: 'rgba(56, 183, 255, 0.35)',
                      transform: 'translateY(-2px)',
                      boxShadow: '0px 12px 32px rgba(0, 0, 0, 0.4)',
                    },
                  }}
                >
                  <CardContent sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {/* Código e Status */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Chip
                        label={room.shortCode || room.id.slice(0, 6)}
                        size="small"
                        onClick={() => copyLink(room)}
                        title="Clique para copiar o link"
                        sx={{
                          bgcolor: 'rgba(255, 255, 255, 0.06)',
                          color: '#38B7FF',
                          fontWeight: 700,
                          borderRadius: '8px',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                          '&:hover': { bgcolor: 'rgba(56, 183, 255, 0.15)' },
                        }}
                      />

                      <Chip
                        label={room.status === 'ACTIVE' ? 'Ao Vivo' : 'Em Espera'}
                        size="small"
                        onClick={() => handleToggleStatus(room.id, room.status)}
                        sx={{
                          bgcolor:
                            room.status === 'ACTIVE'
                              ? 'rgba(34, 197, 94, 0.15)'
                              : 'rgba(234, 179, 8, 0.15)',
                          color: room.status === 'ACTIVE' ? '#22C55E' : '#EAB308',
                          fontWeight: 600,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor:
                            room.status === 'ACTIVE'
                              ? 'rgba(34, 197, 94, 0.3)'
                              : 'rgba(234, 179, 8, 0.3)',
                        }}
                      />
                    </Box>

                    {/* Nome da Sala */}
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 600,
                        color: '#FFF',
                        fontSize: '1.1rem',
                        lineHeight: 1.3,
                        mb: 1,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                      title={room.name}
                    >
                      {room.name}
                    </Typography>

                    <Typography variant="caption" sx={{ color: '#71717A', mt: 'auto', pt: 1 }}>
                      Criada em {new Date(room.createdAt).toLocaleDateString('pt-BR')}
                    </Typography>
                  </CardContent>

                  {/* Ações do Card */}
                  <CardActions sx={{ px: 3, pb: 3, pt: 0, gap: 1 }}>
                    <Button
                      variant="contained"
                      onClick={() => navigate(`/room/${room.id}/leader?token=${room.inviteToken}`)}
                      sx={{
                        flex: 1,
                        bgcolor: 'rgba(56, 183, 255, 0.15)',
                        color: '#38B7FF',
                        border: '1px solid rgba(56, 183, 255, 0.3)',
                        borderRadius: '12px',
                        py: 0.9,
                        fontWeight: 600,
                        textTransform: 'none',
                        boxShadow: 'none',
                        '&:hover': {
                          bgcolor: '#38B7FF',
                          color: '#0A0A0B',
                          boxShadow: '0px 4px 16px rgba(56, 183, 255, 0.3)',
                        },
                      }}
                    >
                      Abrir Sala
                    </Button>

                    <Tooltip title={copiedId === room.id ? 'Copiado!' : 'Copiar Link de Acesso'} disableInteractive>
                      <IconButton
                        onClick={() => copyLink(room)}
                        sx={{
                          bgcolor: 'rgba(255, 255, 255, 0.05)',
                          color: copiedId === room.id ? '#22C55E' : '#A1A1AA',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '12px',
                          p: 1,
                          '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)', color: '#FFF' },
                        }}
                      >
                        {copiedId === room.id ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>

                    <Tooltip title="Excluir Sala" disableInteractive>
                      <IconButton
                        onClick={() => handleDelete(room.id)}
                        sx={{
                          bgcolor: 'rgba(255, 255, 255, 0.05)',
                          color: '#71717A',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '12px',
                          p: 1,
                          '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' },
                        }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>

      {/* Modal Dark de Criação de Sala */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        fullWidth
        maxWidth="xs"
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
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.25rem', color: '#FFF' }}>
          Nova Sala de Aula
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '8px !important' }}>
          {error && (
            <Alert severity="error" sx={{ bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', borderRadius: '12px' }}>
              {error}
            </Alert>
          )}
          <TextField
            label="Nome da Turma / Sala"
            placeholder="Ex: Aula de Matemática - Semana 3"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            required
            fullWidth
            autoFocus
            slotProps={{
              inputLabel: { sx: { color: '#A1A1AA' } },
              input: {
                sx: {
                  color: '#FFF',
                  bgcolor: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: '12px',
                },
              },
            }}
          />
          <TextField
            label="Senha de acesso (opcional)"
            type="password"
            placeholder="Deixe em branco para sala pública"
            value={roomPassword}
            onChange={(e) => setRoomPassword(e.target.value)}
            fullWidth
            helperText="Se vazio, a sala estará aberta diretamente pelo link"
            slotProps={{
              inputLabel: { sx: { color: '#A1A1AA' } },
              formHelperText: { sx: { color: '#71717A' } },
              input: {
                sx: {
                  color: '#FFF',
                  bgcolor: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: '12px',
                },
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            onClick={() => setDialogOpen(false)}
            sx={{ color: '#A1A1AA', textTransform: 'none', borderRadius: '12px', px: 2 }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!roomName.trim() || creating}
            sx={{
              bgcolor: '#38B7FF',
              color: '#0A0A0B',
              fontWeight: 700,
              textTransform: 'none',
              borderRadius: '12px',
              px: 3,
              '&:hover': { bgcolor: '#2da1e6' },
            }}
          >
            {creating ? <CircularProgress size={20} color="inherit" /> : 'Criar Sala'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Feedback Toast Snackbar */}
      <Snackbar
        open={!!snackbarMessage}
        autoHideDuration={3500}
        onClose={() => setSnackbarMessage('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarMessage('')}
          severity="success"
          sx={{
            bgcolor: '#17171C',
            color: '#FFF',
            border: '1px solid rgba(56, 183, 255, 0.3)',
            borderRadius: '16px',
            boxShadow: '0px 8px 32px rgba(0,0,0,0.5)',
            fontWeight: 500,
          }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>

      <JoinRoomModal open={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} />
    </Box>
  );
};
