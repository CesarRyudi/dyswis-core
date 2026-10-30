import { Box, Typography, CircularProgress, Paper } from '@mui/material';
import LockClockIcon from '@mui/icons-material/LockClock';

interface WaitingRoomProps {
  roomName?: string;
  hostName?: string;
}

export function WaitingRoom({ roomName, hostName }: WaitingRoomProps) {
  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
        bgcolor: 'background.default',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 6,
          textAlign: 'center',
          maxWidth: 400,
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <LockClockIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h5" sx={{ mb: 1, fontWeight: 'bold' }}>
          Sala de Espera
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          Aguarde o anfitrião {hostName ? `(${hostName})` : ''} abrir a sala "{roomName || 'Carregando...'}".
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="primary">
            Aguardando liberação...
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
