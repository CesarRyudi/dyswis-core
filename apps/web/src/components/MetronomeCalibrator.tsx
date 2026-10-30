import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box } from '@mui/material';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: (calculatedLatency: number) => void;
}

export const MetronomeCalibrator: React.FC<Props> = ({ open, onClose, onComplete }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startTimeRef = useRef<number>(0);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass();
      }
    }
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const startMetronome = () => {
    initAudio();
    setIsRunning(true);
    setTaps([]);
    
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    // Precisamos de um referencial absoluto. 
    // O Date.now() atual corresponde exatamente ao ctx.currentTime atual
    const now = Date.now();
    startTimeRef.current = now;
    
    // A mágica da Web Audio API: agendamos 30 beeps perfeitos no futuro, sem sofrer 
    // com a imprecisão natural do setTimeout/setInterval do Javascript.
    // O hardware de som do aparelho vai reproduzir isso em intervalos exatos de 1 segundo matemático.
    for (let i = 0; i < 30; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine'; // Som de "Beep" limpo
      
      // Agenda para tocar exatamente a cada 1 segundo
      const beatTime = ctx.currentTime + i * 1.0;
      
      osc.frequency.setValueAtTime(880, beatTime); // Nota Lá (A5)
      gain.gain.setValueAtTime(0, beatTime);
      gain.gain.linearRampToValueAtTime(1, beatTime + 0.01); // Ataque rápido
      gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.1); // Decay rápido (um "tick" curto)
      
      osc.start(beatTime);
      osc.stop(beatTime + 0.1);
    }
  };

  const stopMetronome = useCallback(() => {
    setIsRunning(false);
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopMetronome();
      setTaps([]);
    }
    return stopMetronome;
  }, [open, stopMetronome]);

  const handleTap = () => {
    if (!isRunning) return;
    
    const tapTime = Date.now();
    const elapsedTime = tapTime - startTimeRef.current;
    
    // Qual foi a batida matemática mais próxima? (múltiplos de 1000ms)
    // Ex: se elapsedTime for 3250ms, a batida mais próxima foi a de 3000ms.
    const closestBeat = Math.round(elapsedTime / 1000) * 1000;
    
    // O cérebro humano anula o tempo de reação ao bater ritmicamente. 
    // Portanto, o delta medido é puramente o atraso mecânico/bluetooth da saída de áudio do dispositivo.
    const delta = elapsedTime - closestBeat;
    
    // Ignoramos toques absurdos fora de ritmo (> 600ms de erro)
    if (Math.abs(delta) < 600) {
      setTaps(prev => {
        const newTaps = [...prev, delta];
        if (newTaps.length >= 6) {
          // Coletamos 6 batidas e finalizamos
          finishCalibration(newTaps);
        }
        return newTaps;
      });
    }
  };

  const finishCalibration = (finalTaps: number[]) => {
    stopMetronome();
    
    // Ignoramos as duas primeiras batidas pois o usuário ainda estava "pegando o ritmo"
    const validTaps = finalTaps.slice(2); 
    const sum = validTaps.reduce((a, b) => a + b, 0);
    const avg = sum / validTaps.length;
    
    // Arredondamos para a casa de 10ms mais próxima (ex: 147 -> 150)
    const calculatedLatency = Math.round(avg / 10) * 10;
    
    onComplete(calculatedLatency);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle align="center">Calibrador Automático de Atraso</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 2, gap: 2 }}>
          <Typography align="center" color="text.secondary">
            Equipamentos de som e fones Bluetooth possuem um atraso mecânico invisível. 
            Vamos medir isso para que a sincronia fique perfeita.
          </Typography>
          
          <Box sx={{ bgcolor: 'background.default', p: 2, borderRadius: 2, width: '100%' }}>
            <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold' }}>
              Instruções:
            </Typography>
            <Typography variant="body2" sx={{ ml: 2 }}>
              1. Aumente o volume do aparelho.<br/>
              2. Clique em Iniciar e ouça o ritmo (metrônomo).<br/>
              3. Bata o dedo no botão gigante <b>acompanhando exatamente</b> o ritmo do som que você ouve.
            </Typography>
          </Box>

          {!isRunning ? (
            <Button 
              variant="contained" 
              color="primary" 
              size="large" 
              startIcon={<VolumeUpIcon />}
              onClick={startMetronome}
              sx={{ mt: 2 }}
            >
              Iniciar Metrônomo
            </Button>
          ) : (
            <Box
              onClick={handleTap}
              sx={{
                width: 200,
                height: 200,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                color: 'white',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                userSelect: 'none',
                boxShadow: 4,
                '&:active': {
                  bgcolor: 'primary.dark',
                  transform: 'scale(0.95)',
                  boxShadow: 1,
                },
                mt: 2,
                transition: 'transform 0.05s, box-shadow 0.05s'
              }}
            >
              <TouchAppIcon sx={{ fontSize: 64, mb: 1 }} />
              <Typography variant="h5" sx={{ fontWeight: 'bold' }}>TAP</Typography>
              <Typography variant="caption">
                {taps.length} / 6 toques
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Cancelar</Button>
      </DialogActions>
    </Dialog>
  );
};
