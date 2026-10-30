import { Box, Button, Paper, Typography } from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import { useRoom } from '../contexts/RoomContext';

interface SyncTestTabProps {
  isLeader: boolean;
}

export const SyncTestTab: React.FC<SyncTestTabProps> = ({ isLeader }) => {
  const {
    clockSync,
    clockOffset,
    syncTestEvent,
    emitSyncTestPrepare,
    emitSyncTestCancel,
  } = useRoom();
  const [buttonColor, setButtonColor] = useState<'error' | 'success'>('error');
  const [debugDelay, setDebugDelay] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Escuta os eventos do socket via Context
  useEffect(() => {
    if (!syncTestEvent) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (syncTestEvent.targetTime === null) {
      // Evento de CANCEL. Volta pra vermelho.
      setButtonColor('error');
      setDebugDelay(null);
    } else {
      // Evento de PREPARE. Calcula quanto tempo falta no relógio local.
      const localTargetTime = syncTestEvent.targetTime - clockOffset;
      const delay = localTargetTime - Date.now();
      
      setDebugDelay(delay);

      if (delay <= 0) {
        // Se a rede foi tão lenta que a mensagem chegou atrasada (ou se targetTime for o passado), fica verde instantâneo
        setButtonColor('success');
      } else {
        // Agenda para o futuro
        timerRef.current = setTimeout(() => {
          setButtonColor('success');
        }, delay);
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [syncTestEvent, clockOffset]);

  const handleMouseDown = () => {
    if (!isLeader) return;
    emitSyncTestPrepare();
  };

  const handleMouseUp = () => {
    if (!isLeader) return;
    emitSyncTestCancel();
  };

  const isReady = clockSync?.isReady() ?? false;

  return (
    <Box
      sx={{
        p: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
        Laboratório de Sincronização (Fase 3.B)
      </Typography>

      <Paper sx={{ p: 3, maxWidth: 500, textAlign: 'center' }}>
        <Typography variant="body1" sx={{ mb: 2 }}>
          {isLeader
            ? 'Pressione e SEGURE o botão. Em exatos 2 segundos, ele ficará verde. Solte para cancelar.'
            : 'Aguarde o Host pressionar o botão. O seu botão deve ficar verde no mesmo exato milissegundo que o dele.'}
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Status do Relógio:{' '}
          {isReady
            ? `Sincronizado (Offset: ${Math.round(clockOffset)}ms)`
            : 'Sincronizando...'}
        </Typography>

        {debugDelay !== null && (
          <Typography variant="caption" color="primary" sx={{ display: 'block', mb: 2 }}>
            Debug Delay: {Math.round(debugDelay)}ms (Tempo de agendamento)
          </Typography>
        )}

        <Button
          variant="contained"
          color={buttonColor}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchEnd={handleMouseUp}
          disabled={!isReady} // Removido !isLeader daqui para a cor não sumir
          sx={{
            width: 200,
            height: 200,
            borderRadius: '50%',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            transition: 'background-color 0s', // Sem transição para vermos o corte exato do tempo
            pointerEvents: isLeader ? 'auto' : 'none', // Impede clicks do viewer
            opacity: 1, // Garante que Viewers enxerguem a cor plena
          }}
        >
          {buttonColor === 'error' ? 'SEGURE' : 'SINCRONIZADO'}
        </Button>
      </Paper>
    </Box>
  );
};
