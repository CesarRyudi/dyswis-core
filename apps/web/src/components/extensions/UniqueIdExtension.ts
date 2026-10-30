import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface UniqueIdOptions {
  generate: boolean;
}

export const UniqueIdExtension = Extension.create<UniqueIdOptions>({
  name: 'uniqueId',

  addOptions() {
    return {
      generate: true,
    };
  },
  
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'blockquote', 'listItem'],
        attributes: {
          id: {
            default: null,
            parseHTML: element => element.getAttribute('data-id'),
            renderHTML: attributes => {
              if (!attributes.id) return {};
              return { 'data-id': attributes.id };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    if (!this.options.generate) {
      return [];
    }

    return [
      new Plugin({
        key: new PluginKey('uniqueId'),
        appendTransaction: (transactions, oldState, newState) => {
          if (!this.editor.isEditable) return null;

          const tr = newState.tr;
          let modified = false;

          if (transactions.some(transaction => transaction.docChanged)) {
            const seenIds = new Set<string>();

            newState.doc.descendants((node, pos) => {
              if (
                node.isBlock && 
                ['paragraph', 'heading', 'blockquote', 'listItem'].includes(node.type.name)
              ) {
                // Se não tem ID, OU se já vimos esse ID no documento atual (duplicação por copy-paste/enter), recria.
                if (!node.attrs.id || seenIds.has(node.attrs.id)) {
                  const id = crypto.randomUUID();
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    id,
                  });
                  modified = true;
                  seenIds.add(id);
                } else {
                  seenIds.add(node.attrs.id);
                }
              }
            });
          }

          return modified ? tr : null;
        },
      }),
    ];
  },
});

