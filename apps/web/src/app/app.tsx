import { CssBaseline, ThemeProvider, createTheme, CircularProgress, Box, Typography } from '@mui/material';
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { RoomProvider } from '../contexts/RoomContext';
import { getRoomByCode, getRoomById } from '../services/api';

const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const NotesDashboardPage = lazy(() =>
  import('../pages/NotesDashboardPage').then((m) => ({ default: m.NotesDashboardPage })),
);
const JoinPage = lazy(() =>
  import('../pages/JoinPage').then((m) => ({ default: m.JoinPage })),
);
const LeaderPage = lazy(() =>
  import('../pages/LeaderPage').then((m) => ({ default: m.LeaderPage })),
);
const LoginPage = lazy(() =>
  import('../pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const ViewerPage = lazy(() =>
  import('../pages/ViewerPage').then((m) => ({ default: m.ViewerPage })),
);
const HomePage = lazy(() =>
  import('../pages/HomePage').then((m) => ({ default: m.HomePage })),
);

const PageLoadingFallback = () => (
  <Box
    sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: '#000000',
    }}
  >
    <CircularProgress sx={{ color: '#3291ff' }} />
  </Box>
);

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#000000',
      paper: '#0a0a0a',
    },
    primary: {
      main: '#3291ff',
      light: '#79b8ff',
      dark: '#0070f3',
    },
    secondary: {
      main: '#888888',
    },
    divider: 'rgba(255, 255, 255, 0.12)',
    text: {
      primary: '#ededed',
      secondary: '#a1a1aa',
    },
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily:
      '"Inter", "Plus Jakarta Sans", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 16,
    h3: { fontWeight: 700, letterSpacing: '-0.03em' },
    h5: { fontWeight: 600, letterSpacing: '-0.02em', color: '#ededed' },
    h6: { fontWeight: 500, letterSpacing: '-0.01em', color: '#ededed' },
    body1: { fontSize: '1.05rem', lineHeight: 1.6 },
    body2: { fontSize: '0.95rem', lineHeight: 1.5 },
    button: { textTransform: 'none', fontWeight: 500 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#000000',
          color: '#ededed',
          margin: 0,
          padding: 0,
          WebkitFontSmoothing: 'antialiased',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          boxShadow: 'none',
          transition: 'all 0.2s ease',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.15)',
          color: '#ededed',
          backgroundColor: 'transparent',
          '&:hover': {
            backgroundColor: 'rgba(50, 145, 255, 0.05)',
            borderColor: '#3291ff',
            color: '#3291ff',
            boxShadow: '0 0 0 1px rgba(50, 145, 255, 0.2)',
          },
        },
        text: {
          '&:hover': {
            color: '#3291ff',
            backgroundColor: 'rgba(50, 145, 255, 0.1)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#0a0a0a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: 'none',
          transition:
            'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
          '&:hover': {
            borderColor: '#3291ff',
            boxShadow: '0 0 0 1px rgba(50, 145, 255, 0.2)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#0a0a0a',
          boxShadow: 'none',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        },
        elevation0: {
          border: '1px solid rgba(255, 255, 255, 0.12)',
          '&:hover': {
            borderColor: '#3291ff',
            boxShadow: '0 0 0 1px rgba(50, 145, 255, 0.2)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 6,
            backgroundColor: '#000000',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.15)',
            },
            '&:hover fieldset': {
              borderColor: '#3291ff',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#3291ff',
              borderWidth: '1px',
              boxShadow: '0 0 0 2px rgba(50, 145, 255, 0.2)',
            },
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          opacity: 0.7,
          transition: 'color 0.2s ease, opacity 0.2s ease',
          '&.Mui-selected': {
            color: '#ededed',
            opacity: 1,
          },
          '&:hover': {
            opacity: 1,
            color: '#3291ff',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: '#3291ff',
        },
      },
    },
  },
});

/**
 * ProtectedRoute — Redireciona para /login se o Host não estiver autenticado.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/**
 * Wrappers que extraem roomId da URL e injetam no RoomProvider.
 */
function LeaderRoute() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  return (
    <ProtectedRoute>
      <RoomProvider role="leader" roomId={roomId || ''} inviteToken={token}>
        <LeaderPage />
      </RoomProvider>
    </ProtectedRoute>
  );
}

function ViewerRoute() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;
    getRoomByCode(code)
      .then(async (room) => {
        if (room.hasPassword) {
          if (!token) {
            navigate(`/join/${code}`, { replace: true });
            return;
          }
          try {
            await getRoomById(room.id, token);
          } catch {
            navigate(`/join/${code}`, { replace: true });
            return;
          }
        } else if (!token && room.inviteToken) {
          navigate(`/room/${code}?token=${room.inviteToken}`, { replace: true });
          return;
        }
        setRoomId(room.id);
      })
      .catch(() => setError('Sala não encontrada'));
  }, [code, token, navigate]);

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0A0A0B', color: 'text.primary', p: 4 }}>
        <Typography variant="h6">{error}</Typography>
      </Box>
    );
  }

  if (!roomId) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0A0A0B' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <RoomProvider role="viewer" roomId={roomId} inviteToken={token}>
      <ViewerPage />
    </RoomProvider>
  );
}

export function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <AuthProvider>
        <Suspense fallback={<PageLoadingFallback />}>
          <Routes>
            {/* Home */}
            <Route path="/" element={<HomePage />} />

            {/* Auth */}
            <Route path="/login" element={<LoginPage />} />

            {/* Host Dashboard (protegido) */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/notes"
              element={
                <ProtectedRoute>
                  <NotesDashboardPage />
                </ProtectedRoute>
              }
            />

            {/* Guest Join */}
            <Route path="/join" element={<JoinPage />} />
            <Route path="/join/:code" element={<JoinPage />} />

            {/* Salas */}
            <Route path="/room/:roomId/leader" element={<LeaderRoute />} />
            <Route path="/room/:code" element={<ViewerRoute />} />

            {/* Fallback — redireciona para login */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
