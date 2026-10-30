/**
 * HighlightDecorationExtension.ts
 *
 * Extensão TipTap que renderiza highlights (marcações coloridas) como
 * Decoration.inline() do ProseMirror. Os highlights são passados como
 * estado externo (via setMeta) e renderizados como <mark> coloridos.
 *
 * ESTRATÉGIA:
 * - Recebe um array de highlights (blockId, startOffset, endOffset, color)
 * - Para cada highlight, localiza o bloco no doc por data-id
 * - Calcula as posições absolutas (from, to) no ProseMirror
 * - Cria Decoration.inline com a cor correspondente
 */

import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface HighlightData {
  id: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  color: string;
}

export const highlightPluginKey = new PluginKey('highlightDecoration');

export const HighlightDecorationExtension = Extension.create({
  name: 'highlightDecoration',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: highlightPluginKey,
        state: {
          init() {
            return { highlights: [] as HighlightData[], decorations: DecorationSet.empty };
          },
          apply(tr, state, _oldEditorState, newEditorState) {
            const meta = tr.getMeta(highlightPluginKey);
            
            // Se recebeu novos highlights via setMeta, recalcula
            if (meta?.highlights) {
              const highlights = meta.highlights as HighlightData[];
              const decorations = buildDecorations(newEditorState.doc, highlights);
              return { highlights, decorations };
            }

            // Se o doc mudou, re-mapeia as decorations existentes
            if (tr.docChanged && state.highlights.length > 0) {
              const decorations = buildDecorations(newEditorState.doc, state.highlights);
              return { highlights: state.highlights, decorations };
            }

            return state;
          },
        },
        props: {
          decorations(state) {
            const pluginState = highlightPluginKey.getState(state);
            return pluginState?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

/**
 * Constrói o DecorationSet a partir dos highlights e do doc atual.
 * Para cada highlight, localiza o bloco por data-id e aplica inline decoration.
 */
function buildDecorations(doc: ProseMirrorNode, highlights: HighlightData[]): DecorationSet {
  const decorations: Decoration[] = [];

  const blockPositions = new Map<string, { start: number; end: number }>();
  let index = 0;
  doc.forEach((node: ProseMirrorNode, offset: number) => {
    if (node.isBlock) {
      const id = (node.attrs['id'] as string | undefined) || `index-${index}`;
      // O conteúdo do bloco começa em offset + 1 (dentro do nó)
      blockPositions.set(id, {
        start: offset + 1,
        end: offset + node.nodeSize - 1,
      });
    }
    index++;
  });

  for (const hl of highlights) {
    const block = blockPositions.get(hl.blockId);
    if (!block) continue;

    // Calcula posições absolutas dentro do bloco
    const from = Math.min(block.start + hl.startOffset, block.end);
    const to = Math.min(block.start + hl.endOffset, block.end);

    if (from >= to || from < block.start) continue;

    decorations.push(
      Decoration.inline(from, to, {
        class: 'user-highlight',
        style: `background-color: ${hl.color}40; border-bottom: 2px solid ${hl.color};`,
        'data-highlight-id': hl.id,
      }),
    );
  }

  return DecorationSet.create(doc, decorations);
}
