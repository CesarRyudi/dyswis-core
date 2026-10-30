/**
 * LoginPage.tsx — Tela de Login/Registro do Host.
 *
 * Mobile-first com MUI sx. Alterna entre modo login e registro.
 * Após sucesso, redireciona para o dashboard de salas.
 */
import {
  Alert,
  Box,
  Button,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import GoogleIcon from '@mui/icons-material/Google';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../services/api';
import { logger } from '../utils/logger';
import { JoinRoomModal } from '../components/JoinRoomModal';

export const LoginPage = () => {
  const { login, register, isAuthenticated, loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnToParam = searchParams.get('returnTo');

  useEffect(() => {
    if (returnToParam && returnToParam !== '/dashboard') {
      localStorage.setItem('dyswis_returnTo', returnToParam);
    }
  }, [returnToParam]);

  useEffect(() => {
    if (isAuthenticated) {
      const storedReturnTo = localStorage.getItem('dyswis_returnTo');
      if (storedReturnTo) {
        localStorage.removeItem('dyswis_returnTo');
        navigate(storedReturnTo);
      } else {
        navigate(returnToParam || '/dashboard');
      }
    }
  }, [isAuthenticated, navigate, returnToParam]);

  useEffect(() => {
    const token = searchParams.get('token');
    const userStr = searchParams.get('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(decodeURIComponent(userStr));
        loginWithToken(token, user);
      } catch {
        // failed to parse user
      }
    }
  }, [searchParams, loginWithToken]);

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isRegister && password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
      const storedReturnTo = localStorage.getItem('dyswis_returnTo');
      if (storedReturnTo) {
        localStorage.removeItem('dyswis_returnTo');
        navigate(storedReturnTo);
      } else {
        navigate(returnToParam || '/dashboard');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (!isRegister && err.message === 'Usuário não encontrado') {
          setIsRegister(true);
          setError('Sua conta ainda não existe. Preencha seu nome para se registrar agora!');
        } else {
          setError(err.message);
        }
        logger.error('Falha na autenticação', { context: 'LoginPage', message: err.message, isRegister, email });
      } else {
        setError('Erro de conexão com o servidor');
        logger.error('Erro de conexão durante autenticação', { context: 'LoginPage', isRegister, email, err });
      }

    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 4, sm: 5 },
          width: '100%',
          maxWidth: 420,
          borderRadius: 0,
        }}
      >
        <Typography
          variant="h5"
          sx={{
            mb: 1,
            textAlign: 'center',
            color: '#ededed',
          }}
        >
          <span
            role="img"
            aria-label="Graduação"
            style={{ marginRight: '8px' }}
          >
            🎓
          </span>
          Dyswis
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 4, textAlign: 'center' }}
        >
          {isRegister
            ? 'Crie sua conta e comece a ensinar'
            : 'Acesse a sua conta'}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 0 }}>
            {error}
          </Alert>
        )}

        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}
        >
          {isRegister && (
            <TextField
              label="Nome completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
              size="medium"
              autoComplete="name"
            />
          )}
          <TextField
            label="E-mail profissional"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            size="medium"
            autoComplete="email"
          />
          <TextField
            label="Senha segura"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            fullWidth
            size="medium"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
          {isRegister && (
            <TextField
              label="Confirme sua senha"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              fullWidth
              size="medium"
              autoComplete="new-password"
              error={confirmPassword.length > 0 && password !== confirmPassword}
              helperText={
                confirmPassword.length > 0 && password !== confirmPassword
                  ? 'As senhas não coincidem'
                  : ''
              }
            />
          )}
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading}
            sx={{
              mt: 1,
              py: 1.5,
              fontSize: '1.05rem',
              fontWeight: 700,
              textTransform: 'none',
              borderRadius: 0,
            }}
          >
            {loading
              ? 'Aguarde...'
              : isRegister
                ? 'Criar minha conta'
                : 'Entrar com Email e Senha'}
          </Button>

          <Box sx={{ position: 'relative', my: 2 }}>
            <Box sx={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', bgcolor: 'rgba(255,255,255,0.1)' }} />
            <Typography variant="body2" sx={{ position: 'relative', display: 'inline-block', bgcolor: '#0a0a0a', px: 2, color: 'text.secondary', left: '50%', transform: 'translateX(-50%)' }}>
              ou
            </Typography>
          </Box>

          <Button
            type="button"
            variant="outlined"
            fullWidth
            onClick={() => {
              const targetReturnTo = returnToParam || localStorage.getItem('dyswis_returnTo') || '/dashboard';
              if (targetReturnTo && targetReturnTo !== '/dashboard') {
                localStorage.setItem('dyswis_returnTo', targetReturnTo);
              }
              window.location.href = `${import.meta.env.VITE_API_URL}/auth/google?returnTo=${encodeURIComponent(targetReturnTo)}`;
            }}
            startIcon={<GoogleIcon />}
            sx={{
              py: 1.2,
              fontSize: '1rem',
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: 0,
            }}
          >
            Entrar com Google
          </Button>
        </Box>

        <Typography
          variant="body2"
          sx={{ mt: 4, textAlign: 'center', color: 'text.secondary' }}
        >
          {isRegister ? 'Já possui uma conta?' : 'Ainda não é um Host?'}
          <br />
          <Button
            color="primary"
            variant="text"
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            sx={{ mt: 1, fontWeight: 'bold' }}
          >
            {isRegister ? 'Faça login aqui' : 'Registre-se e crie salas'}
          </Button>
        </Typography>

        <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            É um aluno ou convidado?
          </Typography>
          <Button
            variant="outlined"
            onClick={() => setIsJoinModalOpen(true)}
            sx={{ fontWeight: 'bold' }}
          >
            Entrar em uma sala com Código
          </Button>
        </Box>
      </Paper>
      <JoinRoomModal open={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} />
    </Box>
  );
};
