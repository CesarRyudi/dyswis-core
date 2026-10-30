import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  CircularProgress,
  Alert,
  Box,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { joinRoomByCode } from '../services/api';
import { ApiError } from '../services/api';

interface JoinRoomModalProps {
  open: boolean;
  onClose: () => void;
}

export function JoinRoomModal({ open, onClose }: JoinRoomModalProps) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleJoin = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await joinRoomByCode(code.trim().toUpperCase(), password.trim());
      onClose();
      navigate(`/room/${code.trim().toUpperCase()}?token=${res.inviteToken}`);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An error occurred while joining the room');
      }
    } finally {
      setLoading(false);
    }
  };

  const isPasswordRequired = error.toLowerCase().includes('senha');

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); handleJoin(); }}>
        <DialogTitle>Entrar com Código</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Digite o código de 6 dígitos fornecido pelo anfitrião para entrar na sala.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Código da Sala"
            variant="outlined"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Ex: A1B2C3"
            slotProps={{ htmlInput: { maxLength: 6, style: { textTransform: 'uppercase', letterSpacing: '0.1em' } } }}
            sx={{ mb: 2 }}
          />
          {isPasswordRequired && (
            <TextField
              fullWidth
              label="Senha da Sala"
              type="password"
              variant="outlined"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 2 }}
            />
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={loading} type="button">
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!code || code.trim().length < 6 || loading}
            startIcon={loading ? <CircularProgress size={20} /> : undefined}
          >
            Entrar
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
