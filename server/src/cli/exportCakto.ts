import { readFileSync } from 'node:fs';
import { parseCsv } from '../util/csv.js';
import { readXlsxSheet, excelSerialToISODate, type XlsxCell } from '../util/xlsx.js';
import { normalizeName } from '../util/keys.js';
import { parseDateISO } from '../util/parse.js';

/**
 * Leitura do export de vendas da Cakto (o painel exporta .csv E .xlsx — os dois caem aqui) e
 * as normalizações que só fazem sentido nesse contexto. Fica fora do CLI para poder ser testado
 * sem executar o backfill.
 */

export type ExportCell = XlsxCell;

/** Lê o export inteiro como matriz. `.xlsx` preserva número/data como número (não vira texto). */
export function readExportFile(path: string): ExportCell[][] {
  if (/\.xlsx$/i.test(path)) return readXlsxSheet(path);
  if (/\.csv$/i.test(path)) return parseCsv(readFileSync(path, 'utf8'));
  throw new Error(`Formato não suportado em "${path}": use o export da Cakto em .csv ou .xlsx.`);
}

/**
 * Número do export. O CSV da Cakto usa ponto decimal ("4297.00"); o xlsx entrega número puro.
 * Formato BR ("4.297,00") também é aceito, caso alguém reexporte pela planilha.
 */
export function parseExportNumber(v: ExportCell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '')
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .trim();
  if (!s) return null;
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Data do export → 'yyyy-mm-dd'. No .xlsx vem como serial do Excel; no .csv como ISO
 * ("2026-07-31T18:36:07.937797-03:00") ou dd/MM/yyyy. Só o DIA importa: a aba VENDAS guarda dia.
 */
export function parseExportDate(v: ExportCell): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? excelSerialToISODate(v) : null;
  const s = String(v).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return parseDateISO(s);
}

/**
 * Todo token do nome da aba precisa aparecer no nome do export (prefixo conta nos dois sentidos).
 * A aba guarda muitas vezes só o primeiro nome ("Maira") e o export traz o completo
 * ("Maira Pinto Gomes"); o inverso (nome truncado na aba) também acontece.
 *
 * Sozinho isso NÃO identifica ninguém — primeiro nome repete muito. Só é usado combinado com
 * valor exato + janela de data, e exigindo candidato único.
 */
export function nomeCompativel(nomeAba: string, nomeExport: string): boolean {
  const alvo = normalizeName(nomeAba).split(' ').filter(Boolean);
  const cand = normalizeName(nomeExport).split(' ').filter(Boolean);
  if (alvo.length === 0 || cand.length === 0) return false;
  return alvo.every((t) => cand.some((c) => c === t || c.startsWith(t) || t.startsWith(c)));
}
