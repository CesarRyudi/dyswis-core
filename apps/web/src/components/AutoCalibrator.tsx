import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import MicIcon from '@mui/icons-material/Mic';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';

interface AutoCalibratorProps {
  open: boolean;
  onClose: () => void;
  onComplete: (offset: number) => void;
}

const ESTIMATED_INPUT_LATENCY = 30; // ms
const NUM_TESTS = 5;

// Gera uma assinatura acústica única para este aparelho
// Escolhe frequências aleatórias entre 3000Hz e 6000Hz
const generateUniqueFrequencies = (): number[] => {
  return Array.from({ length: NUM_TESTS }, () => Math.floor(Math.random() * 3000) + 3000);
};

export const AutoCalibrator: React.FC<AutoCalibratorProps> = ({ open, onClose, onComplete }) => {
  const [step, setStep] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [latencies, setLatencies] = useState<number[]>([]);
  const [currentFrequencies, setCurrentFrequencies] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isMotorolaMode, setIsMotorolaMode] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      cleanup();
      setStep('idle');
      setLatencies([]);
    }
  }, [open]);

  const cleanup = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => { /* ignore */ });
      audioCtxRef.current = null;
    }
  };

  const startCalibration = async () => {
    setStep('running');
    setLatencies([]);
    setErrorMessage('');
    const uniqueFreqs = generateUniqueFrequencies();
    setCurrentFrequencies(uniqueFreqs);

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('Web Audio API is not supported in this browser.');
      }
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;

      // Resume context in click scope to prevent Autoplay policy blocks
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => { /* ignore */ });
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.0;
      source.connect(analyser);
      analyserRef.current = analyser;

      await runTestSequence(audioCtx, analyser, uniqueFreqs);
    } catch (err) {
      console.error(err);
      setErrorMessage('Não foi possível acessar o microfone. Verifique as permissões.');
      setStep('error');
      cleanup();
    }
  };

  const runTestSequence = async (audioCtx: AudioContext, analyser: AnalyserNode, freqs: number[]) => {
    const results: number[] = [];

    for (let i = 0; i < freqs.length; i++) {
      try {
        const latency = await runSingleTest(audioCtx, analyser, freqs[i]);
        results.push(latency);
        setLatencies([...results]);
        // Pausa entre os bipes para o ambiente acalmar
        await new Promise((resolve) => setTimeout(resolve, 800));
      } catch {
        setErrorMessage(`Falha na medição ${i + 1}. Tente em um ambiente mais silencioso.`);
        setStep('error');
        cleanup();
        return;
      }
    }

    // Calcula a média e subtrai a estimativa de latência de entrada do microfone
    // Calcula a média e subtrai a estimativa de latência de entrada do microfone
    
    setLatencies(results);
    setStep('success');
    cleanup();
  };

  const runSingleTest = (audioCtx: AudioContext, analyser: AnalyserNode, targetFreq: number): Promise<number> => {
    return new Promise((resolve, reject) => {
      const binCount = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(binCount);
      const binIndex = Math.round((targetFreq * analyser.fftSize) / audioCtx.sampleRate);

      // Timeout de segurança se não detectar o som
      const timeoutId = setTimeout(() => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        reject(new Error('Timeout'));
      }, 2000);

      // Prepara o bipe
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.value = targetFreq;

      // Dispara 100ms no futuro para evitar engasgos do JS
      const startTime = audioCtx.currentTime + 0.1;
      const emitPerformanceTime = performance.now() + 100;

      // Envelope curto (Bipe agudo de 100ms)
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(1, startTime + 0.01);
      gain.gain.setValueAtTime(1, startTime + 0.09);
      gain.gain.linearRampToValueAtTime(0, startTime + 0.1);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + 0.15);

      // Monitora o microfone
      const checkLoop = () => {
        analyser.getByteFrequencyData(dataArray);
        
        // Verifica a energia na frequência alvo e na vizinhança imedita (aperto do funil para evitar conflitos)
        let maxEnergy = 0;
        for (let i = Math.max(0, binIndex - 1); i <= Math.min(binCount - 1, binIndex + 1); i++) {
          if (dataArray[i] > maxEnergy) {
            maxEnergy = dataArray[i];
          }
        }

        // Threshold de detecção (ambiente silencioso = ~0, bipe forte = > 200)
        if (maxEnergy > 150 && performance.now() > emitPerformanceTime) {
          const detectTime = performance.now();
          clearTimeout(timeoutId);
          resolve(detectTime - emitPerformanceTime);
        } else {
          animationRef.current = requestAnimationFrame(checkLoop);
        }
      };

      animationRef.current = requestAnimationFrame(checkLoop);
    });
  };

  const handleApply = () => {
    if (step === 'success') {
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      let finalOffset = Math.max(0, Math.min(300, Math.round(avg - ESTIMATED_INPUT_LATENCY)));
      
      if (isMotorolaMode) {
        finalOffset = Math.max(0, Math.round(avg / 2));
      }
      onComplete(finalOffset);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Auto-Calibração por Microfone</DialogTitle>
      <DialogContent dividers>
        {step === 'idle' && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <MicIcon color="primary" sx={{ fontSize: 60, mb: 2 }} />
            <Typography gutterBottom>
              Iremos emitir {NUM_TESTS} bipes sonoros rápidos. O microfone do seu aparelho escutará o próprio alto-falante para calcular o atraso físico exato.
            </Typography>
            <Typography variant="body2" color="warning.main" sx={{ mt: 2 }}>
              Aviso: Aumente o volume, permita o uso do microfone e fique em silêncio.
            </Typography>
          </Box>
        )}

        {step === 'running' && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={60} sx={{ mb: 3 }} />
            <Typography variant="h6">Escutando...</Typography>
            <Typography color="text.secondary">
              Teste {latencies.length + 1} de {NUM_TESTS}
            </Typography>
            {currentFrequencies[latencies.length] && (
               <Typography variant="caption" color="primary" sx={{ display: 'block', mt: 1 }}>
                 Procurando assinatura a {currentFrequencies[latencies.length]}Hz
               </Typography>
            )}
          </Box>
        )}

        {step === 'success' && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CheckCircleIcon color="success" sx={{ fontSize: 60, mb: 2 }} />
            <Typography variant="h6" gutterBottom>Calibração Concluída</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
              {latencies.map((l, i) => (
                <Box key={i} sx={{ bgcolor: 'background.default', p: 1, borderRadius: 1 }}>
                  <Typography variant="caption" sx={{ display: 'block' }}>T{i + 1}</Typography>
                  <Typography sx={{ fontWeight: 'bold' }}>{Math.round(l)}ms</Typography>
                </Box>
              ))}
            </Box>
            <Typography variant="body2" color="text.secondary">
              Média detectada: {Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms
              <br />
              {isMotorolaMode ? (
                <>
                  Modo de Compatibilidade: Atraso dividido por 2
                  <br />
                  <strong>Resultado Final: {Math.max(0, Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) / 2))}ms</strong>
                </>
              ) : (
                <>
                  Desconto do Microfone: -{ESTIMATED_INPUT_LATENCY}ms
                  <br />
                  <strong>Resultado Final: {Math.max(0, Math.min(300, Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length - ESTIMATED_INPUT_LATENCY)))}ms</strong>
                </>
              )}
            </Typography>

            <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(255, 152, 0, 0.1)', border: '1px solid orange', borderRadius: 1, textAlign: 'left' }}>
              <FormControlLabel
                control={<Checkbox checked={isMotorolaMode} onChange={(e) => setIsMotorolaMode(e.target.checked)} color="warning" />}
                label={
                  <Typography variant="body2" color="warning.main">
                    <strong>Modo de Compatibilidade (Motorola/Dolby):</strong> Marque isso se, após calibrar, o seu vídeo começar <em>antes</em> dos outros aparelhos na sala.
                  </Typography>
                }
              />
            </Box>
          </Box>
        )}

        {step === 'error' && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <ErrorOutlineIcon color="error" sx={{ fontSize: 60, mb: 2 }} />
            <Typography color="error" gutterBottom>{errorMessage}</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={step === 'running'}>Cancelar</Button>
        {step === 'idle' || step === 'error' ? (
          <Button onClick={startCalibration} variant="contained" color="primary">
            {step === 'error' ? 'Tentar Novamente' : 'Iniciar Teste'}
          </Button>
        ) : step === 'success' ? (
          <Button onClick={handleApply} variant="contained" color="success">
            Aplicar Ajuste
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
};
