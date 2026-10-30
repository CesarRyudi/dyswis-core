import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  CircularProgress,
} from '@mui/material';

interface ConfirmDeleteDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDeleteDialog: React.FC<ConfirmDeleteDialogProps> = ({
  open,
  title = 'Excluir anotação?',
  description = 'Tem certeza de que deseja excluir esta anotação? Esta ação não pode ser desfeita.',
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  loading = false,
  onConfirm,
  onClose,
}) => {
  return (
    <Dialog
      open={open}
      onClose={() => !loading && onClose()}
      slotProps={{
        root: {
          sx: { zIndex: 11000 },
        },
        paper: {
          sx: {
            bgcolor: '#17171C',
            color: '#FFF',
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.1)',
            p: 1.5,
            minWidth: { xs: 280, sm: 360 },
            maxWidth: 420,
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          },
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 600, fontSize: '1.2rem', color: '#FFF' }}>
        {title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem' }}>
          {description}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button
          onClick={onClose}
          disabled={loading}
          sx={{
            color: 'rgba(255,255,255,0.7)',
            textTransform: 'none',
            borderRadius: '10px',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', color: '#FFF' },
          }}
        >
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          variant="contained"
          color="error"
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: '10px',
            boxShadow: 'none',
            px: 2.5,
          }}
        >
          {loading ? <CircularProgress size={20} color="inherit" /> : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
