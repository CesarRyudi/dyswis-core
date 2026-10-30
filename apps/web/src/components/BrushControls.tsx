import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Divider,
  IconButton,
  SvgIcon,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import BrushIcon from '@mui/icons-material/Brush';
import FormatPaintIcon from '@mui/icons-material/FormatPaint';
import HighlightIcon from '@mui/icons-material/Highlight';
import WbIncandescentIcon from '@mui/icons-material/WbIncandescent';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { useRoom } from '../contexts/RoomContext';
import { SocketEvent } from '@dyswis/shared-types';

import { SvgIconProps } from '@mui/material';

export const EraserSvgIcon = (props: SvgIconProps) => (
  <SvgIcon {...props}>
    <path d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53H2V10.53L13.41 3.56c.79-.78 2.05-.78 2.83 0m-4.24 13L19.07 8.64l-4.25-4.25L4 15.2V16.53h8z" />
  </SvgIcon>
);

interface BrushControlsProps {
  pageNumber?: number;
  isMobileLayout?: boolean;
  isCssRotated?: boolean;
}

const AVAILABLE_COLORS = ['#f44336', '#2196f3', '#4caf50', '#ffeb3b', '#ffffff'];
const AVAILABLE_THICKNESSES = [2, 4, 8, 14];

export const BrushControls: React.FC<BrushControlsProps> = ({ isCssRotated = false }) => {
  const {
    getSocket,
    isDrawingMode,
    setIsDrawingMode,
    drawColor,
    setDrawColor,
    drawThickness,
    setDrawThickness,
    isHighlighter,
    setIsHighlighter,
    isEraser,
    setIsEraser,
    isLaser,
    setIsLaser,
    isActivelyDrawing,
    role,
  } = useRoom();

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [openColorFlyout, setOpenColorFlyout] = useState(false);
  const [openThicknessFlyout, setOpenThicknessFlyout] = useState(false);

  // Fecha flyouts automaticamente se o líder começar a desenhar na tela
  useEffect(() => {
    if (isActivelyDrawing) {
      setOpenColorFlyout(false);
      setOpenThicknessFlyout(false);
    }
  }, [isActivelyDrawing]);

  if (role !== 'leader') return null;

  const handleClearDrawing = () => {
    getSocket()?.emit(SocketEvent.DRAW_CLEAR, {});
    setClearConfirmOpen(false);
  };

  const isPenActive = !isHighlighter && !isEraser && !isLaser;

  return (
    <>
      {/* Botão Flutuante de Ativação/Desativação do Modo de Desenho */}
      <Tooltip title={isDrawingMode ? 'Fechar Ferramentas de Desenho' : 'Ferramentas de Desenho'} disableInteractive>
        <IconButton
          onClick={() => {
            const nextMode = !isDrawingMode;
            setIsDrawingMode(nextMode);
            if (!nextMode) {
              setOpenColorFlyout(false);
              setOpenThicknessFlyout(false);
            }
          }}
          sx={{
            bgcolor: isDrawingMode ? '#38B7FF' : 'rgba(27, 27, 30, 0.85)',
            backdropFilter: 'blur(10px)',
            color: isDrawingMode ? '#17171C' : '#FFFFFF',
            border: '1px solid',
            borderColor: isDrawingMode ? '#38B7FF' : 'rgba(255,255,255,0.1)',
            width: { xs: 40, sm: 44 },
            height: { xs: 40, sm: 44 },
            boxShadow: '0px 8px 32px rgba(0,0,0,0.4)',
            transition: 'all 0.2s ease',
            '&:hover': {
              bgcolor: isDrawingMode ? '#2da1e6' : 'rgba(40, 40, 45, 0.95)',
              transform: 'translateY(-1px)',
            },
          }}
        >
          <BrushIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Dock Flutuante Centralizado de Ferramentas — Design Modular de 1 Linha com Flyouts Colapsáveis e Auto-Fading */}
      {isDrawingMode && (
        <Box
          sx={{
            position: 'fixed',
            bottom: { xs: 80, sm: 88 },
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1200,
            pointerEvents: isActivelyDrawing ? 'none' : 'auto',
            opacity: isActivelyDrawing ? 0.08 : 1,
            transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            animation: 'dockFadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            '@keyframes dockFadeIn': {
              '0%': { opacity: 0, transform: 'translateX(-50%) translateY(8px)' },
              '100%': { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
            },
          }}
        >
          {/* Flyout Colapsável de Seleção de Cores */}
          {openColorFlyout && !isActivelyDrawing && (
            <Box
              sx={{
                mb: 1,
                bgcolor: 'rgba(23, 23, 28, 0.96)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '24px',
                p: 0.8,
                display: 'flex',
                alignItems: 'center',
                gap: 1.2,
                boxShadow: '0px 12px 36px rgba(0, 0, 0, 0.65)',
                animation: 'flyoutUp 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                '@keyframes flyoutUp': {
                  '0%': { opacity: 0, transform: 'translateY(6px)' },
                  '100%': { opacity: 1, transform: 'translateY(0)' },
                },
              }}
            >
              {AVAILABLE_COLORS.map((color) => {
                const isSelected = drawColor === color && !isEraser;
                return (
                  <Box
                    key={color}
                    onClick={() => {
                      setDrawColor(color);
                      if (isEraser) setIsEraser(false);
                      setOpenColorFlyout(false);
                    }}
                    sx={{
                      width: 26,
                      height: 26,
                      flexShrink: 0,
                      borderRadius: '50%',
                      bgcolor: color,
                      cursor: 'pointer',
                      border: color === '#ffffff' ? '1px solid rgba(0,0,0,0.4)' : 'none',
                      outline: isSelected ? '2px solid #38B7FF' : 'none',
                      outlineOffset: 2,
                      transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                      transition: 'all 0.15s ease',
                      '&:hover': { transform: 'scale(1.25)' },
                    }}
                  />
                );
              })}
            </Box>
          )}

          {/* Flyout Colapsável de Seleção de Espessuras */}
          {openThicknessFlyout && !isActivelyDrawing && (
            <Box
              sx={{
                mb: 1,
                bgcolor: 'rgba(23, 23, 28, 0.96)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '24px',
                px: 1,
                py: 0.6,
                display: 'flex',
                alignItems: 'center',
                gap: 0.8,
                boxShadow: '0px 12px 36px rgba(0, 0, 0, 0.65)',
                animation: 'flyoutUp 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                '@keyframes flyoutUp': {
                  '0%': { opacity: 0, transform: 'translateY(6px)' },
                  '100%': { opacity: 1, transform: 'translateY(0)' },
                },
              }}
            >
              {AVAILABLE_THICKNESSES.map((thick) => {
                const isSelected = drawThickness === thick;
                return (
                  <IconButton
                    key={thick}
                    onClick={() => {
                      setDrawThickness(thick);
                      setOpenThicknessFlyout(false);
                    }}
                    sx={{
                      width: 32,
                      height: 32,
                      p: 0,
                      bgcolor: isSelected ? 'rgba(56, 183, 255, 0.2)' : 'transparent',
                      border: '1px solid',
                      borderColor: isSelected ? 'rgba(56, 183, 255, 0.5)' : 'transparent',
                      borderRadius: '12px',
                      transition: 'all 0.15s ease',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                    }}
                  >
                    <Box
                      sx={{
                        width: Math.min(20, thick + 3),
                        height: Math.min(20, thick + 3),
                        bgcolor: isSelected ? '#38B7FF' : 'rgba(255,255,255,0.7)',
                        borderRadius: '50%',
                        boxShadow: isSelected ? '0 0 6px rgba(56, 183, 255, 0.6)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    />
                  </IconButton>
                );
              })}
            </Box>
          )}

          {/* Barra Principal Modular em 1 Linha (Altura Fina ~46px com Touch Targets Confortáveis) */}
          <Box
            sx={{
              bgcolor: 'rgba(23, 23, 28, 0.95)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '28px',
              boxShadow: '0px 12px 40px rgba(0, 0, 0, 0.6)',
              px: 1.2,
              py: 0.6,
              display: 'flex',
              alignItems: 'center',
              gap: 0.8,
              width: 'auto',
              maxWidth: 'calc(100vw - 32px)',
            }}
          >
            {/* 1. Caneta Normal */}
            <Tooltip title="Caneta" disableInteractive>
              <IconButton
                onClick={() => {
                  setIsHighlighter(false);
                  setIsEraser(false);
                  setIsLaser(false);
                  setOpenColorFlyout(false);
                  setOpenThicknessFlyout(false);
                }}
                sx={{
                  width: { xs: 36, sm: 38 },
                  height: { xs: 36, sm: 38 },
                  bgcolor: isPenActive ? 'rgba(56, 183, 255, 0.2)' : 'transparent',
                  color: isPenActive ? '#38B7FF' : 'rgba(255,255,255,0.75)',
                  border: '1px solid',
                  borderColor: isPenActive ? 'rgba(56, 183, 255, 0.4)' : 'transparent',
                  borderRadius: '14px',
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                <FormatPaintIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* 2. Marca-texto */}
            <Tooltip title="Marca-texto" disableInteractive>
              <IconButton
                onClick={() => {
                  setIsHighlighter(true);
                  setIsEraser(false);
                  setIsLaser(false);
                  setOpenColorFlyout(false);
                  setOpenThicknessFlyout(false);
                }}
                sx={{
                  width: { xs: 36, sm: 38 },
                  height: { xs: 36, sm: 38 },
                  bgcolor: isHighlighter ? 'rgba(234, 179, 8, 0.2)' : 'transparent',
                  color: isHighlighter ? '#EAB308' : 'rgba(255,255,255,0.75)',
                  border: '1px solid',
                  borderColor: isHighlighter ? 'rgba(234, 179, 8, 0.4)' : 'transparent',
                  borderRadius: '14px',
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                <HighlightIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* 3. Laser */}
            <Tooltip title="Laser" disableInteractive>
              <IconButton
                onClick={() => {
                  setIsHighlighter(false);
                  setIsEraser(false);
                  setIsLaser(true);
                  setOpenColorFlyout(false);
                  setOpenThicknessFlyout(false);
                }}
                sx={{
                  width: { xs: 36, sm: 38 },
                  height: { xs: 36, sm: 38 },
                  bgcolor: isLaser ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                  color: isLaser ? '#EF4444' : 'rgba(255,255,255,0.75)',
                  border: '1px solid',
                  borderColor: isLaser ? 'rgba(239, 68, 68, 0.4)' : 'transparent',
                  borderRadius: '14px',
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                <WbIncandescentIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* 4. Borracha */}
            <Tooltip title="Borracha" disableInteractive>
              <IconButton
                onClick={() => {
                  setIsHighlighter(false);
                  setIsEraser(true);
                  setIsLaser(false);
                  setOpenColorFlyout(false);
                  setOpenThicknessFlyout(false);
                }}
                sx={{
                  width: { xs: 36, sm: 38 },
                  height: { xs: 36, sm: 38 },
                  bgcolor: isEraser ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                  color: isEraser ? '#FFF' : 'rgba(255,255,255,0.75)',
                  border: '1px solid',
                  borderColor: isEraser ? 'rgba(255, 255, 255, 0.4)' : 'transparent',
                  borderRadius: '14px',
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                <EraserSvgIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.3, borderColor: 'rgba(255,255,255,0.12)', height: 24, alignSelf: 'center' }} />

            {/* 5. Indicador e Botão Colapsável de Cor */}
            <Tooltip title="Escolher Cor" disableInteractive>
              <IconButton
                onClick={() => {
                  setOpenColorFlyout(!openColorFlyout);
                  setOpenThicknessFlyout(false);
                }}
                sx={{
                  width: { xs: 36, sm: 38 },
                  height: { xs: 36, sm: 38 },
                  p: 0,
                  bgcolor: openColorFlyout ? 'rgba(255,255,255,0.12)' : 'transparent',
                  borderRadius: '14px',
                  border: '1px solid',
                  borderColor: openColorFlyout ? 'rgba(255,255,255,0.3)' : 'transparent',
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    bgcolor: isEraser ? '#888888' : drawColor,
                    border: drawColor === '#ffffff' ? '1px solid rgba(0,0,0,0.4)' : '1px solid rgba(255,255,255,0.4)',
                    boxShadow: !isEraser ? `0 0 8px ${drawColor}80` : 'none',
                    transition: 'all 0.15s ease',
                  }}
                />
              </IconButton>
            </Tooltip>

            {/* 6. Indicador e Botão Colapsável de Espessura */}
            <Tooltip title="Escolher Espessura" disableInteractive>
              <IconButton
                onClick={() => {
                  setOpenThicknessFlyout(!openThicknessFlyout);
                  setOpenColorFlyout(false);
                }}
                sx={{
                  width: { xs: 36, sm: 38 },
                  height: { xs: 36, sm: 38 },
                  p: 0,
                  bgcolor: openThicknessFlyout ? 'rgba(255,255,255,0.12)' : 'transparent',
                  borderRadius: '14px',
                  border: '1px solid',
                  borderColor: openThicknessFlyout ? 'rgba(255,255,255,0.3)' : 'transparent',
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                <Box
                  sx={{
                    width: Math.min(18, drawThickness + 4),
                    height: Math.min(18, drawThickness + 4),
                    borderRadius: '50%',
                    bgcolor: '#FFFFFF',
                    opacity: 0.9,
                    boxShadow: '0 0 6px rgba(255, 255, 255, 0.5)',
                    transition: 'all 0.15s ease',
                  }}
                />
              </IconButton>
            </Tooltip>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.3, borderColor: 'rgba(255,255,255,0.12)', height: 24, alignSelf: 'center' }} />

            {/* 7. Limpar Tudo com Confirmação */}
            <Tooltip title="Limpar Desenhos" disableInteractive>
              <IconButton
                onClick={() => setClearConfirmOpen(true)}
                sx={{
                  width: { xs: 36, sm: 38 },
                  height: { xs: 36, sm: 38 },
                  color: 'rgba(239, 68, 68, 0.85)',
                  borderRadius: '14px',
                  transition: 'all 0.15s ease',
                  '&:hover': { color: '#EF4444', bgcolor: 'rgba(239,68,68,0.15)' },
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      )}

      {/* Modal Dark de Confirmação para Limpar Desenhos — BUG-028: zIndex 10001 para Fullscreen */}
      <Dialog
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          root: {
            sx: { zIndex: 10001 },
          },
          paper: {
            sx: {
              bgcolor: '#17171C',
              color: '#FFF',
              borderRadius: '20px',
              border: '1px solid rgba(255,255,255,0.1)',
              p: 1,
              zIndex: 10002,
              ...(isCssRotated && {
                transform: 'rotate(90deg) !important',
                transformOrigin: 'center center',
                maxWidth: 'calc(100dvh - 40px)',
              }),
            },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '1.15rem' }}>Apagar todos os desenhos?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: '#A1A1AA', fontSize: '0.95rem' }}>
            Isso removerá todas as anotações visuais e desenhos de todos os slides da apresentação.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setClearConfirmOpen(false)}
            sx={{ color: '#A1A1AA', textTransform: 'none', borderRadius: '10px' }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleClearDrawing}
            sx={{
              bgcolor: '#EF4444',
              color: '#FFF',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: '10px',
              px: 2,
              '&:hover': { bgcolor: '#DC2626' },
            }}
          >
            Apagar Tudo
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
