import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
  Container,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  getRoomById,
  getRoomByCode,
  joinRoomByCode,
  RoomDetail,
} from '../services/api';
import { PinInput } from '../components/PinInput';
import { useAuth } from '../contexts/AuthContext';

export const JoinPage = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  useAuth();

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(!!code); // Only load initially if we have a code

  const [inputCode, setInputCode] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!code) {
      setLoading(false);
      return;
    }

    getRoomByCode(code)
      .then(async (fetchedRoom) => {
        setRoom(fetchedRoom);

        if (!fetchedRoom.hasPassword) {
          const targetUrl = fetchedRoom.inviteToken
            ? `/room/${code}?token=${fetchedRoom.inviteToken}`
            : `/room/${code}`;
          navigate(targetUrl, { replace: true });
          return;
        }

        if (token) {
          try {
            await getRoomById(fetchedRoom.id, token);
            navigate(`/room/${code}?token=${token}`, { replace: true });
            return;
          } catch {
            console.warn('Invalid token provided in URL');
          }
        }

        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setLoadError(err.message);
        } else {
          setLoadError('Erro ao buscar sala');
        }
        setLoading(false);
      });
  }, [code, token, navigate]);

  const handleJoinWithCode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputCode.length === 6) {
      navigate(`/join/${inputCode}`);
    }
  };

  const handleJoinWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setPasswordError('');

    setJoining(true);
    try {
      const res = await joinRoomByCode(code, roomPassword);
      setJoining(false);
      navigate(`/room/${code}?token=${res.inviteToken}`);
    } catch (err) {
      setPasswordError(
        err instanceof ApiError ? err.message : 'Erro ao verificar senha',
      );
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0A0A0B' }}>
        <CircularProgress />
      </Box>
    );
  }

  // --- TELA 1: Digitar o código da sala (Nenhum código na URL ou sala não encontrada) ---
  if (!code || loadError) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          backgroundColor: '#0A0A0B',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
        }}
      >
        <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
          <Box sx={{ mb: 6 }}>
            <img src="/bamboo.svg" alt="Bamboo" style={{ width: 80, height: 65, marginBottom: 32 }} />
            <Typography
              variant="h3"
              sx={{
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: { xs: 32, sm: 40 },
                lineHeight: 1.1,
                mb: 2,
                fontFamily: '"Inter", sans-serif',
                letterSpacing: '-0.0333em',
              }}
            >
              mesma aula.<br />
              mesmo momento.<br />
              juntos.
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: '#A1A1AA',
                fontSize: 16,
                mt: 3,
                fontFamily: '"Inter", sans-serif',
              }}
            >
              Digite o código que você recebeu e entre direto na apresentação, ao vivo.
            </Typography>
          </Box>

          <Box component="form" onSubmit={handleJoinWithCode} sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Box>
              <Typography variant="caption" sx={{ color: '#ABABAB', display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Código da Sessão
              </Typography>
              <PinInput
                length={6}
                value={inputCode}
                onChange={setInputCode}
                onComplete={(val) => {
                  navigate(`/join/${val}`);
                }}
              />
            </Box>

            {loadError && (
              <Alert severity="error" sx={{ mx: 'auto', mt: -2 }}>
                {loadError}
              </Alert>
            )}

            <Button
              type="submit"
              variant="contained"
              disabled={inputCode.length < 6}
              sx={{
                bgcolor: '#38B7FF',
                color: '#1A1A1A',
                borderRadius: '24px',
                py: 1.5,
                fontSize: 16,
                fontWeight: 500,
                textTransform: 'none',
                '&:hover': {
                  bgcolor: '#2da1e6',
                },
                '&.Mui-disabled': {
                  bgcolor: 'rgba(56, 183, 255, 0.3)',
                  color: 'rgba(26, 26, 26, 0.5)',
                }
              }}
            >
              Entrar na Sessão
            </Button>
          </Box>
        </Container>
      </Box>
    );
  }

  // --- TELA 2: Sala sem senha (redirecionando silenciosamente) ---
  if (room && !room.hasPassword) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0A0A0B' }}>
        <CircularProgress />
      </Box>
    );
  }

  // --- TELA 3: Sala COM senha ---
  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: '#0A0A0B',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 3,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 4, sm: 5 },
          width: '100%',
          maxWidth: 400,
          backgroundColor: '#1B1B1E',
          borderRadius: '32px',
          border: '1px solid #363636',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <img src="/bamboo.svg" alt="Bamboo" style={{ width: 48, height: 39 }} />
        </Box>
        
        <Typography
          variant="h5"
          sx={{ mb: 1, fontWeight: 'bold', textAlign: 'center', color: '#FFFFFF', fontFamily: '"Inter", sans-serif' }}
        >
          {room?.name}
        </Typography>
        <Typography
          variant="body2"
          sx={{ mb: 4, textAlign: 'center', color: '#A1A1AA' }}
        >
          Apresentado por {room?.host.name}
        </Typography>

        <Box
          component="form"
          onSubmit={handleJoinWithPassword}
          sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
        >
          <TextField
            label="Senha da Sala"
            type="password"
            value={roomPassword}
            onChange={(e) => setRoomPassword(e.target.value)}
            required
            fullWidth
            autoFocus
            error={!!passwordError}
            helperText={passwordError}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '16px',
                backgroundColor: 'transparent',
                '& fieldset': { borderColor: '#4D4D4D' },
                '&:hover fieldset': { borderColor: '#38B7FF' },
                '&.Mui-focused fieldset': { borderColor: '#38B7FF' },
              },
              '& .MuiInputBase-input': {
                color: '#FFFFFF',
              },
              '& .MuiInputLabel-root': {
                color: '#A1A1AA',
              }
            }}
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={!roomPassword || joining}
            sx={{
              bgcolor: '#38B7FF',
              color: '#1A1A1A',
              borderRadius: '24px',
              py: 1.5,
              fontSize: 16,
              fontWeight: 500,
              textTransform: 'none',
              '&:hover': {
                bgcolor: '#2da1e6',
              },
            }}
          >
            {joining ? 'Verificando...' : 'Entrar na Sessão'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};
