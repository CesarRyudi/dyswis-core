import { describe, it, expect } from 'vitest';
import { cleanTextForComparison, isTextContentMatching } from './textSnapshot';

describe('textSnapshot utilities', () => {
  describe('cleanTextForComparison', () => {
    it('should return empty string for null, undefined or empty input', () => {
      expect(cleanTextForComparison(null)).toBe('');
      expect(cleanTextForComparison(undefined)).toBe('');
      expect(cleanTextForComparison('')).toBe('');
    });

    it('should strip HTML tags correctly', () => {
      const html = '<p>Este é um <strong>parágrafo</strong> com <a href="#">link</a>.</p>';
      expect(cleanTextForComparison(html)).toBe('este é um parágrafo com link.');
    });

    it('should normalize &nbsp; and multiple whitespace characters to single spaces', () => {
      const dirty = '  Texto   com&nbsp;&nbsp;espaços   múltiplos  \n  e quebras  ';
      expect(cleanTextForComparison(dirty)).toBe('texto com espaços múltiplos e quebras');
    });

    it('should convert text to lowercase for case-insensitive matching', () => {
      const mixed = 'TypeScript E NestJS';
      expect(cleanTextForComparison(mixed)).toBe('typescript e nestjs');
    });
  });

  describe('isTextContentMatching (Content-Drift Detection)', () => {
    it('should return true if either originalText or currentText is null or undefined (fallback compatibility)', () => {
      expect(isTextContentMatching(null, 'Novo texto')).toBe(true);
      expect(isTextContentMatching('Texto antigo', undefined)).toBe(true);
      expect(isTextContentMatching(undefined, undefined)).toBe(true);
    });

    it('should return true when texts are identical', () => {
      const text = 'Introdução aos sistemas distribuídos e WebSockets';
      expect(isTextContentMatching(text, text)).toBe(true);
    });

    it('should return true when texts differ only by HTML formatting or casing', () => {
      const original = 'Arquitetura de Software em Camadas';
      const current = '<p>ARQUITETURA DE <em>SOFTWARE</em> EM CAMADAS</p>';
      expect(isTextContentMatching(original, current)).toBe(true);
    });

    it('should return true when one text contains the other (minor additions or suffix changes)', () => {
      const original = 'Este tópico abordará WebSockets em tempo real';
      const current = 'Este tópico abordará WebSockets em tempo real com Node.js.';
      expect(isTextContentMatching(original, current)).toBe(true);
    });

    it('should return true when character similarity ratio exceeds 65%', () => {
      const original = 'A sincronização de vídeo utiliza protocolo NTP.';
      const current = 'A sincronização de vídeo utiliza protocolo NTP avançado.';
      expect(isTextContentMatching(original, current)).toBe(true);
    });

    it('should return false when text was substantially rewritten (detecting content drift)', () => {
      const original = 'Nesta aula discutiremos banco de dados relacionais e modelagem com PostgreSQL.';
      const current = 'Hoje falaremos sobre inteligência artificial generativa e redes neurais profundas.';
      expect(isTextContentMatching(original, current)).toBe(false);
    });

    it('should return false when completely different short texts are compared', () => {
      const original = 'Primeiro parágrafo do documento oficial';
      const current = 'Totalmente reescrito por outro instrutor';
      expect(isTextContentMatching(original, current)).toBe(false);
    });
  });
});
