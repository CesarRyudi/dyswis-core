import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  Divider,
  Switch,
  FormControlLabel
} from '@mui/material';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import MicIcon from '@mui/icons-material/Mic';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import { MetronomeCalibrator } from './MetronomeCalibrator';
import { AutoCalibrator } from './AutoCalibrator';
import { useRoom } from '../contexts/RoomContext';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  latencyOffset: number;
  setLatencyOffset: (val: number | ((prev: number) => number)) => void;
  stats: {
    clockOffset: number;
    rtt: number;
    transitLatency: number;
    startupDelay: number;
    heartbeatDiff: number;
  };
  isLeader?: boolean;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onClose,
  latencyOffset,
  setLatencyOffset,
  stats,
  isLeader,
}) => {
  const [isCalibratorOpen, setIsCalibratorOpen] = useState(false);
  const [isAutoCalibratorOpen, setIsAutoCalibratorOpen] = useState(false);
  const { viewersMutedEvent, emitVideoMuteViewers } = useRoom();

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Configurações de Sincronia</DialogTitle>
        <DialogContent dividers>
          {isLeader && (
            <Box sx={{ mb: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                Controle de Áudio Global
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Por padrão, o áudio é reproduzido apenas no dispositivo do Líder para evitar microfonia.
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={!(viewersMutedEvent?.muted ?? true)}
                    onChange={(e) => emitVideoMuteViewers(!e.target.checked)}
                  />
                }
                label="Tocar som nos dispositivos dos espectadores"
              />
            </Box>
          )}

          {/* Calibração Fina */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
              Ajuste de Atraso Acústico (Hardware/Bluetooth)
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Compense atrasos introduzidos pelo hardware de som do seu dispositivo.
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, my: 2 }}>
              <IconButton
                size="medium"
                onClick={() => setLatencyOffset((prev) => Math.max(-1000, prev - 10))}
                color="primary"
              >
                <RemoveIcon />
              </IconButton>

              <Typography
                variant="h5"
                color="primary"
                sx={{ fontFamily: 'monospace', minWidth: 120, textAlign: 'center', fontWeight: 'bold' }}
              >
                {latencyOffset > 0 ? '+' : ''}
                {latencyOffset}ms
              </Typography>

              <IconButton
                size="medium"
                onClick={() => setLatencyOffset((prev) => Math.min(1000, prev + 10))}
                color="primary"
              >
                <AddIcon />
              </IconButton>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<MicIcon />}
                onClick={() => setIsAutoCalibratorOpen(true)}
              >
                Auto-Calibração (Recomendado)
              </Button>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<GraphicEqIcon />}
                onClick={() => setIsCalibratorOpen(true)}
              >
                Calibrador Manual (Metrônomo)
              </Button>
            </Box>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Stats for Nerds */}
          <Box>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
              Estatísticas da Rede (Stats for Nerds)
            </Typography>
            <Box
              sx={{
                bgcolor: 'rgba(0,0,0,0.8)',
                color: '#00ffcc',
                p: 2,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                Clock Offset: {Math.round(stats.clockOffset)}ms
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                Ping (RTT): {Math.round(stats.rtt)}ms
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                Transit Latency: {Math.round(stats.transitLatency)}ms
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                Startup Delay: {Math.round(stats.startupDelay)}ms
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                Heartbeat Diff: {Math.round(stats.heartbeatDiff)}ms
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="primary" variant="contained">
            Fechar
          </Button>
        </DialogActions>
      </Dialog>

      <AutoCalibrator
        open={isAutoCalibratorOpen}
        onClose={() => setIsAutoCalibratorOpen(false)}
        onComplete={(val) => {
          setLatencyOffset(val);
          setIsAutoCalibratorOpen(false);
        }}
      />

      <MetronomeCalibrator
        open={isCalibratorOpen}
        onClose={() => setIsCalibratorOpen(false)}
        onComplete={(val) => {
          setLatencyOffset(val);
          setIsCalibratorOpen(false);
        }}
      />
    </>
  );
};
