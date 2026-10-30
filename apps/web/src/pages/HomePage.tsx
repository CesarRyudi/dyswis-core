import { Box, Button, Typography, Container, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const HomePage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: '#0A0A0B',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 3,
      }}
    >
      <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
        <Box sx={{ mb: 6 }}>
          <img src="/bamboo.svg" alt="Bamboo" style={{ width: 80, height: 65, marginBottom: 32 }} />
          <Typography
            variant="h3"
            sx={{
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: { xs: 32, sm: 40 },
              lineHeight: 1.1,
              mb: 2,
              fontFamily: '"Inter", sans-serif',
              letterSpacing: '-0.0333em',
            }}
          >
            mesma aula.<br />
            mesmo momento.<br />
            juntos.
          </Typography>
        </Box>

        <Stack spacing={2} sx={{ mt: 4 }}>
          {isAuthenticated ? (
            <>
              <Button
                variant="contained"
                onClick={() => navigate('/dashboard')}
                sx={{
                  bgcolor: '#38B7FF',
                  color: '#1A1A1A',
                  borderRadius: '24px',
                  py: 1.5,
                  fontSize: 16,
                  fontWeight: 500,
                  textTransform: 'none',
                  '&:hover': {
                    bgcolor: '#2da1e6',
                  },
                }}
              >
                Minhas salas
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate('/join')}
                sx={{
                  color: '#FFFFFF',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '24px',
                  py: 1.5,
                  fontSize: 16,
                  fontWeight: 500,
                  textTransform: 'none',
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.05)',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                  },
                }}
              >
                Entrar em uma sala
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="contained"
                onClick={() => navigate('/join')}
                sx={{
                  bgcolor: '#38B7FF',
                  color: '#1A1A1A',
                  borderRadius: '24px',
                  py: 1.5,
                  fontSize: 16,
                  fontWeight: 500,
                  textTransform: 'none',
                  '&:hover': {
                    bgcolor: '#2da1e6',
                  },
                }}
              >
                Entrar em uma sala
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate('/login')}
                sx={{
                  color: '#FFFFFF',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '24px',
                  py: 1.5,
                  fontSize: 16,
                  fontWeight: 500,
                  textTransform: 'none',
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.05)',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                  },
                }}
              >
                Fazer login
              </Button>
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
};
