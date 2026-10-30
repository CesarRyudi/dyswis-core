/**
 * Utilitário para comparação e validação semântica de integridade de snapshots de anotações.
 * [BUG-052] Previne que parágrafos que foram substancialmente reescritos ou alterados
 * pelo líder mantenham anotações ativas como se pertencessem ao conteúdo novo.
 */

export function cleanTextForComparison(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '') // remove tags HTML
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Verifica se o texto atual do bloco ainda preserva a fidelidade semântica
 * em relação ao snapshot original registrado na criação da nota.
 */
export function isTextContentMatching(originalText?: string | null, currentText?: string | null): boolean {
  if (!originalText || !currentText) return true; // Sem snapshot salvo para comparar -> aceita por compatibilidade
  
  const cleanOrig = cleanTextForComparison(originalText);
  const cleanCurr = cleanTextForComparison(currentText);

  if (!cleanOrig || !cleanCurr) return true;
  if (cleanOrig === cleanCurr) return true;

  // Se um contém o outro (ex: pequenas adições ou pontuações)
  if (cleanCurr.includes(cleanOrig) || cleanOrig.includes(cleanCurr)) return true;

  // Avaliação de similaridade por sobreposição de caracteres
  const minLen = Math.min(cleanOrig.length, cleanCurr.length);
  if (minLen >= 12) {
    let sameChars = 0;
    for (let i = 0; i < minLen; i++) {
      if (cleanOrig[i] === cleanCurr[i]) {
        sameChars++;
      }
    }
    // Se pelo menos 65% dos caracteres iniciais coincidirem, considera o mesmo bloco
    if (sameChars / minLen >= 0.65) {
      return true;
    }
  }

  return false;
}
