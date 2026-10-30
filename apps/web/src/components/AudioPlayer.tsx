import { Box, Button, CircularProgress, Typography, IconButton, Snackbar } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';
import React, { useEffect, useRef, useState } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { SettingsDialog } from './SettingsDialog';

interface AudioPlayerProps {
  audioUrl: string;
  isLeader: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, isLeader }) => {
  const {
    clockOffset,
    rtt,
    isVideoPlaying,
    videoPlayEvent,
    videoPauseEvent,
    videoSeekEvent,
    videoHeartbeatEvent,
    viewersMutedEvent,
    emitVideoPlay,
    emitVideoPause,
    emitVideoSeek,
    emitVideoHeartbeat,
  } = useRoom();

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const [userReady, setUserReady] = useState<boolean>(isLeader);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [startupDelay, setStartupDelay] = useState(0);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [latencyOffset, setLatencyOffset] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dyswis_latency_offset');
      if (saved !== null) {
        return Number(saved);
      }
    }
    return 150;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showCalibrateToast, setShowCalibrateToast] = useState(false);
  const prevMutedRef = useRef(viewersMutedEvent?.muted ?? true);

  useEffect(() => {
    const currentMuted = viewersMutedEvent?.muted ?? true;
    if (prevMutedRef.current === true && currentMuted === false && !isLeader) {
      // Líder ativou o som: exibe toast discreto sugerindo calibração se desejar
      setShowCalibrateToast(true);
    }
    prevMutedRef.current = currentMuted;
  }, [viewersMutedEvent?.muted, isLeader]);

  useEffect(() => {
    localStorage.setItem('dyswis_latency_offset', latencyOffset.toString());
  }, [latencyOffset]);

  const [debugStats, setDebugStats] = useState({ heartbeatDiff: 0, transitLatency: 0 });
  const [isPausing, setIsPausing] = useState(false);
  const isPausingRef = useRef(false);
  const pausingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastPlayTimeRef = useRef<number>(0);
  const lastPauseTimeRef = useRef<number>(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastHandledPlayRef = useRef<number | null>(null);
  const lastHeartbeatReceivedRef = useRef<number>(0);

  // Limpa timers ao desmontar o componente
  useEffect(() => {
    return () => {
      if (pausingTimerRef.current) clearTimeout(pausingTimerRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Flag para evitar loop infinito quando o play() é chamado programaticamente pelo Sync
  const isSyncPlayRef = useRef(false);
  const isSyncPauseRef = useRef(false);
  const isSyncSeekRef = useRef(false);

  // --- 1. Evento de Play Inicial (Agendado) ---
  useEffect(() => {
    if (!videoPlayEvent || !audioRef.current) return;
    if (!userReady) return; // Não consome nem tenta dar play se o espectador ainda não clicou em "Estou Pronto"
    if (lastHandledPlayRef.current === videoPlayEvent.timestamp) return;

    lastHandledPlayRef.current = videoPlayEvent.timestamp;

    if (pausingTimerRef.current) {
      clearTimeout(pausingTimerRef.current);
      pausingTimerRef.current = null;
    }
    isPausingRef.current = false;
    setIsPausing(false);

    const { targetTime, videoTime, timestamp } = videoPlayEvent;

    // Calcula transit latency: o nosso tempo local atualizado para NTP menos o tempo em que a mensagem saiu do servidor
    const transitLatency = Date.now() + clockOffset - timestamp;
    setDebugStats((prev) => ({ ...prev, transitLatency }));
    console.log(`[AudioPlayer] ⚡ Play Event Recebido | Transit Latency: ${Math.round(transitLatency)}ms | Offset: ${Math.round(clockOffset)}ms`);

    // Garante que o áudio parta exatamente do frame do Líder
    if (Math.abs(audioRef.current.currentTime - videoTime - (latencyOffset / 1000)) > 0.035) {
      isSyncSeekRef.current = true;
      audioRef.current.currentTime = videoTime + (latencyOffset / 1000);
    }

    const localTargetTime = targetTime - clockOffset;
    const delay = localTargetTime - Date.now() - startupDelay - latencyOffset;

    if (timerRef.current) clearTimeout(timerRef.current);

    if (delay > 0) {
      timerRef.current = setTimeout(() => {
        isSyncPlayRef.current = true;
        audioRef.current?.play().catch(() => {
          console.warn('Autoplay bloqueado pelo navegador');
        });
        // Garante que a taxa de reprodução comece normal
        if (audioRef.current) audioRef.current.playbackRate = 1.0;
      }, delay);
    } else {
      isSyncPlayRef.current = true;
      audioRef.current.play().catch((e) => { console.warn('Erro no play', e); });
      if (audioRef.current) audioRef.current.playbackRate = 1.0;
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [videoPlayEvent, clockOffset, startupDelay, latencyOffset, userReady]);

  // --- 2. Correção Contínua (Soft-Sync com Heartbeat) ---
  useEffect(() => {
    // Apenas Viewers aplicam a correção baseada no Heartbeat
    if (isLeader || !videoHeartbeatEvent || !audioRef.current) return;
    
    lastHeartbeatReceivedRef.current = Date.now();

    // Se o usuário ainda não clicou em "Estou Pronto", não mexe no áudio
    if (!userReady) return;

    const { videoTime, timestamp } = videoHeartbeatEvent;
    
    // Calcula o tempo que o áudio do líder estaria AGORA
    const localHeartbeatTime = timestamp - clockOffset;
    const elapsedSinceHeartbeat = (Date.now() - localHeartbeatTime) / 1000;
    const idealVideoTime = videoTime + elapsedSinceHeartbeat + (latencyOffset / 1000);

    const myCurrentTime = audioRef.current.currentTime;
    const diff = idealVideoTime - myCurrentTime;
    
    setDebugStats((prev) => ({ ...prev, heartbeatDiff: diff * 1000 }));

    // Se o desvio for muito grande (> 2s), faz um Hard Seek PRIMEIRO (evita abortar play)
    if (Math.abs(diff) > 2.0) {
      isSyncSeekRef.current = true;
      audioRef.current.currentTime = idealVideoTime;
    }

    // O áudio deve estar tocando se o sync estiver ativo
    if (audioRef.current.paused && isSyncPlayRef.current) {
      audioRef.current.play().catch((e) => { console.warn('Erro no play', e); });
    }

    // Micro-ajustes de playbackRate apenas se não houve hard seek
    if (Math.abs(diff) <= 2.0) {
      if (diff > 0.035) { 
        audioRef.current.playbackRate = 1.05; 
      } else if (diff < -0.035) { 
        audioRef.current.playbackRate = 0.95; 
      } else { 
        audioRef.current.playbackRate = 1.0; 
      }
    }
  }, [videoHeartbeatEvent, clockOffset, isLeader, latencyOffset, userReady]);

  // --- 3. Emissão Contínua (Heartbeat do Líder) ---
  useEffect(() => {
    if (!isLeader || !audioRef.current) return;

    const intervalId = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused) {
        emitVideoHeartbeat(audioRef.current.currentTime - (latencyOffset / 1000));
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isLeader, emitVideoHeartbeat, latencyOffset]);

  // --- 4. Pause Event ---
  useEffect(() => {
    if (!videoPauseEvent || !audioRef.current) return;
    
    isSyncPlayRef.current = false;
    lastHeartbeatReceivedRef.current = 0;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!audioRef.current.paused) {
      isSyncPauseRef.current = true;
      audioRef.current.pause();
    }
    
    setIsPlaying(false);
    audioRef.current.playbackRate = 1.0;
    
    if (Math.abs(audioRef.current.currentTime - videoPauseEvent.videoTime - (latencyOffset / 1000)) > 0.035) {
      isSyncSeekRef.current = true;
      audioRef.current.currentTime = Math.max(0, videoPauseEvent.videoTime + (latencyOffset / 1000));
    }
  }, [videoPauseEvent, latencyOffset]);

  // --- 5. Seek Event ---
  useEffect(() => {
    if (!videoSeekEvent || !audioRef.current) return;
    
    isSyncSeekRef.current = true;
    audioRef.current.currentTime = videoSeekEvent.videoTime + (latencyOffset / 1000);
  }, [videoSeekEvent, latencyOffset]);

  // --- 6. Watchdog: detecta se o líder se desconectou ou parou de transmitir heartbeats ---
  useEffect(() => {
    if (isLeader || !userReady) return;

    const watchdog = setInterval(() => {
      if (
        isSyncPlayRef.current &&
        lastHeartbeatReceivedRef.current > 0 &&
        Date.now() - lastHeartbeatReceivedRef.current > 4500
      ) {
        console.warn('[AudioPlayer] ⚠️ Watchdog: Sem heartbeat do líder há mais de 4.5s. Pausando sincronizadamente.');
        isSyncPlayRef.current = false;
        if (audioRef.current && !audioRef.current.paused) {
          isSyncPauseRef.current = true;
          audioRef.current.pause();
        }
        setIsPlaying(false);
      }
    }, 1500);

    return () => clearInterval(watchdog);
  }, [isLeader, userReady]);

  // Handlers do Leader interceptando controles HTML5
  const handlePlay = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (!isLeader) return;
    if (isSyncPlayRef.current) {
      isSyncPlayRef.current = false; // Foi acionado pelo nosso timeout, então deixa passar
      return;
    }

    // Se estiver no período de lockout de pausa recente (~700ms), bloqueia o play espúrio imediatamente
    if (isPausingRef.current || Date.now() - lastPauseTimeRef.current < 700) {
      isSyncPauseRef.current = true;
      e.currentTarget.pause();
      return;
    }

    // Debounce de cliques rápidos sucessivos no play
    if (Date.now() - lastPlayTimeRef.current < 700) {
      isSyncPauseRef.current = true;
      e.currentTarget.pause();
      return;
    }
    lastPlayTimeRef.current = Date.now();

    // Cancela qualquer timer pendente anterior
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // O Leader tentou dar play manualmente.
    // Pausamos imediatamente e enviamos o evento pro backend (reprodução síncrona agendada no targetTime).
    isSyncPauseRef.current = true;
    e.currentTarget.pause();
    emitVideoPlay(e.currentTarget.currentTime - (latencyOffset / 1000));
  };

  const handlePause = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (!isLeader) return;
    if (isSyncPauseRef.current) {
      isSyncPauseRef.current = false;
      return;
    }

    // Cancela imediatamente qualquer agendamento de play pendente
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    isSyncPlayRef.current = false;

    // Se já estiver em processo de pausa recente (< 700ms), evita flood de eventos
    if (Date.now() - lastPauseTimeRef.current < 700) {
      return;
    }
    lastPauseTimeRef.current = Date.now();

    // Ativa lockout e feedback visual imediato ("Pausando...")
    setIsPausing(true);
    isPausingRef.current = true;
    if (pausingTimerRef.current) clearTimeout(pausingTimerRef.current);
    pausingTimerRef.current = setTimeout(() => {
      isPausingRef.current = false;
      setIsPausing(false);
    }, 700);

    emitVideoPause(e.currentTarget.currentTime - (latencyOffset / 1000));
  };

  const handleSeeked = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (!isLeader) return;
    if (isSyncSeekRef.current) {
      isSyncSeekRef.current = false;
      return;
    }

    emitVideoSeek(e.currentTarget.currentTime - (latencyOffset / 1000));
  };

  const handleAudioPlaying = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    setIsPlaying(true);
    if (!isLeader) return;
    // Heartbeat instantâneo assim que o play físico acontece para corrigir a largada dos Viewers na hora
    emitVideoHeartbeat(e.currentTarget.currentTime - (latencyOffset / 1000));
  };

  const handleReadyClick = async () => {
    if (!audioRef.current) {
      setUserReady(true);
      return;
    }

    setIsMeasuring(true);

    // Salva o volume e muta para o teste silencioso
    const originalVolume = audioRef.current.volume;
    audioRef.current.muted = true;

    let hasFinished = false;

    const finishReady = (measuredDelay: number) => {
      if (hasFinished) return;
      hasFinished = true;

      setStartupDelay(Math.min(measuredDelay, 1000));
      setIsMeasuring(false);
      setUserReady(true);

      if (!audioRef.current) return;

      // Restaura áudio configurado
      audioRef.current.muted = !isLeader && (viewersMutedEvent?.muted ?? true);
      audioRef.current.volume = originalVolume;

      // Avalia se o líder está com play ativo no momento
      const isHeartbeatFresh = Boolean(
        videoHeartbeatEvent && (Date.now() - lastHeartbeatReceivedRef.current < 3500)
      );
      const isPlayActive = Boolean(
        isVideoPlaying || isHeartbeatFresh || (
          videoPlayEvent && (!videoPauseEvent || videoPlayEvent.timestamp > (videoPauseEvent.videoTime ? videoPlayEvent.timestamp - 1 : 0))
        )
      );

      if (isPlayActive) {
        let idealTime = 0;
        if (videoHeartbeatEvent) {
          const localHeartbeatTime = videoHeartbeatEvent.timestamp - clockOffset;
          const elapsed = (Date.now() - localHeartbeatTime) / 1000;
          idealTime = videoHeartbeatEvent.videoTime + elapsed + (latencyOffset / 1000);
        } else if (videoPlayEvent) {
          const localTarget = videoPlayEvent.targetTime - clockOffset;
          const elapsed = (Date.now() - localTarget) / 1000;
          idealTime = Math.max(0, videoPlayEvent.videoTime + elapsed + (latencyOffset / 1000));
        }

        if (videoPlayEvent) {
          lastHandledPlayRef.current = videoPlayEvent.timestamp;
        }

        // Posiciona no tempo ideal ANTES de dar o play para não abortar a Promise
        isSyncSeekRef.current = true;
        audioRef.current.currentTime = Math.max(0, idealTime);
        audioRef.current.playbackRate = 1.0;
        isSyncPlayRef.current = true;

        audioRef.current.play().then(() => {
          setIsPlaying(true);
          console.log(`[AudioPlayer] ▶️ Play sincronizado ativado pós-ready em ${idealTime.toFixed(2)}s`);
        }).catch((err) => {
          console.warn('[AudioPlayer] Falha ao dar play sincronizado pós-ready:', err);
        });
      } else {
        // Líder está pausado: garante posição de frame e pausa
        isSyncPlayRef.current = false;
        setIsPlaying(false);
        if (videoPauseEvent) {
          isSyncSeekRef.current = true;
          audioRef.current.currentTime = Math.max(0, videoPauseEvent.videoTime + (latencyOffset / 1000));
        } else {
          audioRef.current.currentTime = 0;
        }
      }
    };

    // Safety timeout para nunca travar no estado de medição caso o browser atrase o evento
    const safetyTimeout = setTimeout(() => {
      console.warn('[AudioPlayer] Safety timeout na medição de startup delay');
      finishReady(0);
    }, 600);

    try {
      // Passo 1: Warm-up silencioso (inicialização a frio do decodificador)
      await audioRef.current?.play();
      await new Promise(resolve => requestAnimationFrame(resolve));
      audioRef.current?.pause();
      
      // Respiro para o navegador consolidar o estado paused
      await new Promise(resolve => setTimeout(resolve, 50));

      // Passo 2: Medição real (hardware já quente)
      const t1 = performance.now();
      
      const onPlaying = () => {
        clearTimeout(safetyTimeout);
        audioRef.current?.removeEventListener('playing', onPlaying);
        audioRef.current?.pause();
        finishReady(performance.now() - t1);
      };

      audioRef.current?.addEventListener('playing', onPlaying);
      audioRef.current?.play().catch((e) => { 
        clearTimeout(safetyTimeout);
        console.warn('Erro no play da medição', e); 
        finishReady(0);
      });
    } catch (e) {
      clearTimeout(safetyTimeout);
      console.warn('Erro ao medir delay, usando 0', e);
      finishReady(0);
    }
  };

  return (
    <Box 
      ref={audioContainerRef}
      sx={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column', 
        position: 'relative'
      }}
    >
      <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
        <IconButton 
          onClick={() => setIsSettingsOpen(true)} 
          sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
        >
          <SettingsIcon />
        </IconButton>
      </Box>

      {!isLeader && userReady && !isPlaying && (
        <Box sx={{ position: 'absolute', top: 16, left: 16, zIndex: 10, bgcolor: 'rgba(0,0,0,0.6)', px: 2, py: 0.5, borderRadius: 1 }}>
          <Typography variant="body2" color="white">
            Aguardando o Líder dar o play...
          </Typography>
        </Box>
      )}

      <Box sx={{ flex: 1, position: 'relative', bgcolor: 'black', borderRadius: 2, overflow: 'hidden' }}>
        
        {!userReady && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,0.8)',
              zIndex: 10,
              color: 'white',
              p: 3,
            }}
          >
            <Typography variant="h6" gutterBottom>
              O Líder irá iniciar o áudio em breve.
            </Typography>
            <Typography variant="body2" sx={{ mb: 3, textAlign: 'center', maxWidth: 400 }}>
              Os navegadores exigem que você clique na tela antes de permitirem a reprodução de áudio automático.
            </Typography>
            <Button 
              variant="contained" 
              color="primary" 
              size="large"
              startIcon={isMeasuring ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
              onClick={handleReadyClick}
              disabled={isMeasuring}
            >
              {isMeasuring ? 'Medindo latência do dispositivo...' : 'Estou Pronto'}
            </Button>
          </Box>
        )}

        {isBuffering && userReady && (
          <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 5 }}>
            <CircularProgress color="primary" size={24} />
          </Box>
        )}

        {isPausing && (
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              bgcolor: 'rgba(23, 23, 28, 0.92)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              borderRadius: '100px',
              px: 3.5,
              py: 1.5,
              color: 'white',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
              pointerEvents: 'none',
            }}
          >
            <CircularProgress size={24} sx={{ color: '#F59E0B' }} thickness={4.5} />
            <Typography variant="body1" sx={{ fontWeight: 600, letterSpacing: 0.5, color: '#F3F4F6', fontSize: '1.05rem' }}>
              Pausando...
            </Typography>
          </Box>
        )}

        <audio
          ref={audioRef}
          src={audioUrl}
          controls={isLeader} // Apenas Leader tem controles
          preload="auto"
          muted={!isLeader && (viewersMutedEvent?.muted ?? true)}
          style={{ display: 'block' }}
          onPlay={handlePlay}
          onPause={(e) => {
            setIsPlaying(false);
            handlePause(e);
          }}
          onSeeked={handleSeeked}
          onCanPlay={() => setIsBuffering(false)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={handleAudioPlaying}
          playsInline
        />
      </Box>



      <SettingsDialog
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        latencyOffset={latencyOffset}
        setLatencyOffset={setLatencyOffset}
        isLeader={isLeader}
        stats={{
          clockOffset,
          rtt,
          transitLatency: debugStats.transitLatency,
          startupDelay,
          heartbeatDiff: debugStats.heartbeatDiff
        }}
      />
      <Snackbar
        open={showCalibrateToast}
        autoHideDuration={8000}
        onClose={() => setShowCalibrateToast(false)}
        message="O áudio foi ativado. Você pode recalibrar para melhor sincronia."
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        action={
          <Button color="secondary" size="small" onClick={() => { setShowCalibrateToast(false); setIsSettingsOpen(true); }}>
            CALIBRAR
          </Button>
        }
      />
    </Box>
  );
};

