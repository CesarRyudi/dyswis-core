import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatClearIcon from '@mui/icons-material/FormatClear';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import HighlightIcon from '@mui/icons-material/Highlight';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import PaletteIcon from '@mui/icons-material/Palette';
import TableChartIcon from '@mui/icons-material/TableChart';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Popover,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  styled,
} from '@mui/material';
import Highlight from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { SelectionSyncExtension } from './extensions/SelectionSyncExtension';
import { UniqueIdExtension } from './extensions/UniqueIdExtension';

// Estilização do container do editor para parecer com um TextField do MUI
const EditorContainer = styled(Box)(({ theme }) => ({
  border: 'none',
  borderTop: `1px solid ${theme.palette.divider}`,
  borderRadius: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  height: '65vh',
  minHeight: 300,
  backgroundColor: theme.palette.background.default,
  '& .tiptap': {
    minHeight: '100%',
    padding: theme.spacing(3),
    outline: 'none',
    fontFamily: theme.typography.fontFamily,
    lineHeight: 1.8,
    color: theme.palette.text.primary,
    // Tipografia baseada no MUI
    '& p': {
      margin: 0,
      marginBottom: '1em',
    },
    '& h1': {
      fontSize: '2.2rem',
      fontWeight: 800,
      marginTop: '1.5em',
      marginBottom: '0.5em',
      color: theme.palette.text.primary,
      letterSpacing: '-0.02em',
    },
    '& h2': {
      fontSize: '1.6rem',
      fontWeight: 700,
      marginTop: '1.5em',
      marginBottom: '0.5em',
      color: theme.palette.text.primary,
      letterSpacing: '-0.01em',
    },
    '& ul, & ol': {
      paddingLeft: '2rem',
      marginBottom: '1em',
    },
    '& mark': {
      backgroundColor: 'rgba(255,255,255,0.1)',
      color: theme.palette.text.primary,
      padding: '0.05em 0.15em',
      borderRadius: '4px',
    },
    '& a': {
      color: theme.palette.primary.main,
      textDecoration: 'underline',
      textDecorationColor: 'transparent',
      transition: 'text-decoration-color 0.2s',
      cursor: 'pointer',
      '&:hover': {
        textDecorationColor: theme.palette.primary.main,
      },
    },
    '& table': {
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
      width: '100%',
      margin: '1.5em 0',
      borderRadius: '0px',
      overflow: 'hidden',
    },
    '& td, & th': {
      minWidth: '2em',
      border: `1px solid rgba(255,255,255,0.1)`,
      padding: '8px 12px',
      verticalAlign: 'top',
      boxSizing: 'border-box',
    },
    '& th': {
      fontWeight: 'bold',
      textAlign: 'left',
      backgroundColor: 'rgba(255,255,255,0.05)',
      color: '#ffffff',
    },
    '& .remote-selection-highlight': {
      backgroundColor: 'rgba(255, 255, 0, 0.3)',
    },
  },
}));

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  content,
  onChange,
}) => {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');

  const [tableAnchorEl, setTableAnchorEl] = useState<null | HTMLElement>(null);
  const [hoveredRow, setHoveredRow] = useState(0);
  const [hoveredCol, setHoveredCol] = useState(0);
  const [, setTick] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fallback seguro caso seja usado fora do RoomProvider (ex: futuro dashboard)
  let socket = null;
  try {
    const room = useRoom();
    socket = room.getSocket();
  } catch {
    // Ignora se não houver contexto de sala
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
        },
      }),
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      SelectionSyncExtension.configure({
        socket,
        isLeader: true,
      }),
      UniqueIdExtension,
    ],
    content,
    onSelectionUpdate: () => {
      setTick((t) => t + 1);
    },
    onTransaction: ({ editor, transaction }) => {
      setTick((t) => t + 1);
      if (transaction.docChanged) {
        onChange(editor.getHTML());
      }
    },
    immediatelyRender: false, // Evita problemas de hidratação (SSR/React 18+)
  });

  // Atualiza o conteúdo se a prop inicial mudar (ex: ao abrir um novo dialog)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const [hoverAnchor, setHoverAnchor] = useState<HTMLElement | null>(null);
  const [highlightMenuAnchor, setHighlightMenuAnchor] =
    useState<HTMLElement | null>(null);
  const [highlightColor, setHighlightColor] = useState('#2e7d32');
  const hoverTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleLinkMouseOver = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    if (a) {
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
      setHoverAnchor(a);
    }
  };

  const handleLinkMouseOut = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) {
      hoverTimeout.current = setTimeout(() => {
        setHoverAnchor(null);
      }, 300);
    }
  };

  if (!editor) {
    return null;
  }

  const handleOpenLinkDialog = () => {
    const { from, to, empty } = editor.state.selection;
    if (!empty) {
      setLinkText(editor.state.doc.textBetween(from, to, ' '));
    } else {
      setLinkText('');
    }
    const previousUrl = editor.getAttributes('link').href;
    setLinkUrl(previousUrl || '');
    setLinkDialogOpen(true);
  };

  const handleSaveLink = () => {
    let finalUrl = linkUrl.trim();
    if (finalUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkDialogOpen(false);
      return;
    }

    // Auto prepend https:// if missing to avoid relative routing to localhost
    if (!/^https?:\/\//i.test(finalUrl) && !/^mailto:/i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }

    if (linkText.trim().length > 0) {
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${finalUrl}">${linkText}</a>`)
        .run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: finalUrl })
        .run();
    }
    setLinkDialogOpen(false);
  };

  const handleInsertTable = (rows: number, cols: number) => {
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: true })
      .run();
    setTableAnchorEl(null);
  };

  return (
    <EditorContainer>
      {/* Menu Bar */}
      <Box
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          p: 0.5,
          bgcolor: 'background.default',
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <ToggleButtonGroup size="small" aria-label="formatação de texto">
          <Tooltip title="Negrito (Ctrl+B)">
            <ToggleButton
              value="bold"
              selected={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <FormatBoldIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Itálico (Ctrl+I)">
            <ToggleButton
              value="italic"
              selected={editor.isActive('italic')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <FormatItalicIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Sublinhado (Ctrl+U)">
            <ToggleButton
              value="underline"
              selected={editor.isActive('underline')}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <FormatUnderlinedIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Destacar">
            <ToggleButton
              value="highlight"
              selected={editor.isActive('highlight')}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .toggleHighlight({ color: highlightColor })
                  .run()
              }
            >
              <HighlightIcon fontSize="small" sx={{ color: highlightColor }} />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Selecionar Cor do Destaque">
            <ToggleButton
              value="highlight-color"
              onClick={(e) => setHighlightMenuAnchor(e.currentTarget)}
              sx={{ px: 0.5 }}
            >
              <PaletteIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>

        <ToggleButtonGroup size="small" aria-label="títulos">
          <Tooltip title="Título 1 (Ctrl+Alt+1)">
            <ToggleButton
              value="h1"
              selected={editor.isActive('heading', { level: 1 })}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 1 }).run()
              }
              sx={{ fontWeight: 'bold' }}
            >
              H1
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Título 2 (Ctrl+Alt+2)">
            <ToggleButton
              value="h2"
              selected={editor.isActive('heading', { level: 2 })}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
              sx={{ fontWeight: 'bold' }}
            >
              H2
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>

        <ToggleButtonGroup size="small" aria-label="listas">
          <Tooltip title="Lista (Ctrl+Shift+8)">
            <ToggleButton
              value="bullet"
              selected={editor.isActive('bulletList')}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <FormatListBulletedIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Lista Numerada (Ctrl+Shift+7)">
            <ToggleButton
              value="ordered"
              selected={editor.isActive('orderedList')}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <FormatListNumberedIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>

        <ToggleButtonGroup size="small" aria-label="inserções">
          <Tooltip title="Inserir Link">
            <ToggleButton
              value="link"
              selected={editor.isActive('link')}
              onClick={handleOpenLinkDialog}
            >
              <LinkIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Inserir Tabela">
            <ToggleButton
              value="table"
              onClick={(e) => {
                setTableAnchorEl(e.currentTarget);
                setHoveredRow(0);
                setHoveredCol(0);
              }}
            >
              <TableChartIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
          {editor.isActive('table') && (
            <Tooltip title="Remover Tabela">
              <ToggleButton
                value="delete_table"
                onClick={() => editor.chain().focus().deleteTable().run()}
              >
                <DeleteIcon fontSize="small" color="error" />
              </ToggleButton>
            </Tooltip>
          )}
        </ToggleButtonGroup>

        <Box sx={{ flexGrow: 1 }} />

        <ToggleButtonGroup size="small" aria-label="limpar">
          <Tooltip title="Limpar formatação">
            <ToggleButton
              value="clear"
              onClick={() =>
                editor.chain().focus().clearNodes().unsetAllMarks().run()
              }
            >
              <FormatClearIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
      </Box>

      {/* Área de Edição */}
      <Box
        sx={{ flex: 1, overflow: 'auto' }}
        ref={containerRef}
        onMouseOver={handleLinkMouseOver}
        onMouseOut={handleLinkMouseOut}
      >
        <EditorContent editor={editor} />
      </Box>

      {/* Hover Popover para Links */}
      <Popover
        open={Boolean(hoverAnchor)}
        anchorEl={hoverAnchor}
        onClose={() => setHoverAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
        slotProps={{
          paper: {
            onMouseEnter: () => {
              if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
            },
            onMouseLeave: () => {
              setHoverAnchor(null);
            },
            sx: { pointerEvents: 'auto' },
          },
        }}
        sx={{ pointerEvents: 'none' }}
      >
        <Box
          sx={{
            display: 'flex',
            bgcolor: 'background.paper',
            p: 0.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          <Button
            size="small"
            startIcon={<EditIcon />}
            sx={{ textTransform: 'none' }}
            onClick={() => {
              if (!hoverAnchor || !editor) return;
              try {
                const pos = editor.view.posAtDOM(hoverAnchor, 0);
                editor.commands.setTextSelection(pos);
                handleOpenLinkDialog();
              } catch {
                // Ignore fallbacks se DOM ref falhar
              }
            }}
          >
            Editar Link
          </Button>
          <Button
            size="small"
            color="error"
            startIcon={<LinkOffIcon />}
            sx={{ textTransform: 'none' }}
            onClick={() => {
              if (!hoverAnchor || !editor) return;
              try {
                const pos = editor.view.posAtDOM(hoverAnchor, 0);
                editor.commands.setTextSelection(pos);
                editor.commands.unsetLink();
                setHoverAnchor(null);
              } catch {
                // Ignore
              }
            }}
          >
            Remover
          </Button>
        </Box>
      </Popover>

      {/* Dialog de Link */}
      <Dialog open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)}>
        <DialogTitle sx={{ pb: 1 }}>Link</DialogTitle>
        <DialogContent sx={{ minWidth: { xs: 280, sm: 400 } }}>
          <TextField
            label="Exibir texto"
            placeholder="Texto para o link (opcional)"
            fullWidth
            margin="normal"
            size="small"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
          />
          <TextField
            label="Endereço"
            placeholder="Link para uma página da Web existente"
            fullWidth
            margin="normal"
            size="small"
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveLink();
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
          <Button
            color="error"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              setLinkDialogOpen(false);
            }}
          >
            Remover Link
          </Button>
          <Box>
            <Button
              onClick={() => setLinkDialogOpen(false)}
              color="inherit"
              sx={{ mr: 1 }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveLink}
              variant="contained"
              disableElevation
            >
              Inserir
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Popover da Tabela (Grid 6x5) */}
      <Popover
        open={Boolean(tableAnchorEl)}
        anchorEl={tableAnchorEl}
        onClose={() => setTableAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
            {hoveredRow > 0 && hoveredCol > 0
              ? `${hoveredCol} x ${hoveredRow}`
              : 'Inserir tabela'}
          </Typography>
          <Box
            onMouseLeave={() => {
              setHoveredRow(0);
              setHoveredCol(0);
            }}
          >
            {Array.from({ length: 5 }).map((_, rIndex) => (
              <Box key={rIndex} sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                {Array.from({ length: 6 }).map((_, cIndex) => {
                  const isHovered = rIndex < hoveredRow && cIndex < hoveredCol;
                  return (
                    <Box
                      key={cIndex}
                      onMouseEnter={() => {
                        setHoveredRow(rIndex + 1);
                        setHoveredCol(cIndex + 1);
                      }}
                      onClick={() => handleInsertTable(rIndex + 1, cIndex + 1)}
                      sx={{
                        width: 24,
                        height: 24,
                        border: '1px solid',
                        borderColor: isHovered ? 'primary.main' : 'divider',
                        bgcolor: isHovered
                          ? 'primary.transparent'
                          : 'transparent',
                        borderRadius: 1,
                        cursor: 'pointer',
                        transition: 'background-color 0.1s ease',
                      }}
                    />
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      </Popover>

      {/* Popover de Cores do Highlight */}
      <Popover
        open={Boolean(highlightMenuAnchor)}
        anchorEl={highlightMenuAnchor}
        onClose={() => setHighlightMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Box sx={{ p: 1.5, display: 'flex', gap: 1 }}>
          {[
            { c: '#7f1d1d', n: 'Vermelho Escuro' },
            { c: '#14532d', n: 'Verde Escuro' },
            { c: '#1e3a8a', n: 'Azul Escuro' },
            { c: '#4c1d95', n: 'Roxo Escuro' },
            { c: '#713f12', n: 'Amarelo Escuro' },
            { c: 'transparent', n: 'Limpar' },
          ].map((item) => (
            <Box
              key={item.c}
              onClick={() => {
                if (item.c === 'transparent') {
                  editor.chain().focus().unsetMark('highlight').run();
                } else {
                  setHighlightColor(item.c);
                  editor.chain().focus().setHighlight({ color: item.c }).run();
                }
                setHighlightMenuAnchor(null);
              }}
              title={item.n}
              sx={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                bgcolor: item.c === 'transparent' ? 'grey.200' : item.c,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: 'grey.400',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                transition: 'transform 0.1s',
                '&:hover': { transform: 'scale(1.15)' },
              }}
            >
              {item.c === 'transparent' && (
                <FormatClearIcon sx={{ fontSize: 15 }} color="action" />
              )}
            </Box>
          ))}
        </Box>
      </Popover>
    </EditorContainer>
  );
};
