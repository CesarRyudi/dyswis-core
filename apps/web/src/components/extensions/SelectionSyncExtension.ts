import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Socket } from 'socket.io-client';
import { SocketEvent, TextSelectionPayload } from '@dyswis/shared-types';

export interface SelectionSyncOptions {
  socket: Socket | null;
  isLeader: boolean;
}

export const SelectionSyncPluginKey = new PluginKey('selectionSync');

export const SelectionSyncExtension = Extension.create<SelectionSyncOptions>({
  name: 'selectionSync',

  addOptions() {
    return {
      socket: null,
      isLeader: false,
    };
  },

  addProseMirrorPlugins() {
    const { socket, isLeader } = this.options;
    let currentSelection = { from: 0, to: 0 };

    return [
      new Plugin({
        key: SelectionSyncPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldState) {
            // Update the decoration set if we received a meta transaction from socket
            const meta = tr.getMeta(SelectionSyncPluginKey);
            if (meta && meta.type === 'UPDATE_SELECTION') {
              const { from, to } = meta;
              if (from === to) return DecorationSet.empty;

              // Create an inline decoration for the remote selection
              const deco = Decoration.inline(from, to, {
                class: 'remote-selection-highlight',
              });
              return DecorationSet.create(tr.doc, [deco]);
            }

            // Map decorations through the transaction so they move correctly if document changes
            return oldState.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
        view: (view) => {
          if (!socket) return {};

          // If viewer, listen to the socket
          const handleTextSelection = (payload: TextSelectionPayload) => {
            if (isLeader) return;
            const { from, to } = payload;
            
            // Limit bounds just in case
            const maxPos = view.state.doc.content.size;
            const safeFrom = Math.min(Math.max(0, from), maxPos);
            const safeTo = Math.min(Math.max(0, to), maxPos);

            const tr = view.state.tr.setMeta(SelectionSyncPluginKey, {
              type: 'UPDATE_SELECTION',
              from: safeFrom,
              to: safeTo,
            });
            view.dispatch(tr);
          };

          socket.on(SocketEvent.TEXT_SELECTION, handleTextSelection);

          return {
            update: (view) => {
              if (!isLeader || !socket) return;
              
              // Only emit if selection actually changed
              const { from, to } = view.state.selection;
              if (from !== currentSelection.from || to !== currentSelection.to) {
                currentSelection = { from, to };
                socket.emit(SocketEvent.TEXT_SELECTION, { from, to } satisfies TextSelectionPayload);
              }
            },
            destroy: () => {
              socket.off(SocketEvent.TEXT_SELECTION, handleTextSelection);
            },
          };
        },
      }),
    ];
  },
});
