#!/usr/bin/env node
// lib/make_docx.mjs — Génère un .docx mis en page à partir du contenu texte
// Usage : node make_docx.mjs <input.txt> <output.docx> <tool> <classe> <niveau> [theme]

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  LevelFormat, Header, Footer, PageNumber
} = require('docx');
import { readFileSync, writeFileSync } from 'fs';

const [,, txtPath, docxPath, tool='ressource', classe='Lycee', niveau='A2', theme=''] = process.argv;

// ── Palette ───────────────────────────────────────────────────────
const BL_DARK  = '1E3A5F';
const BL_MID   = '2D6A9F';
const BL_PALE  = 'EEF5FB';
const GR       = '2E7D32';
const GR_PALE  = 'E8F5E9';
const GO       = 'E8A020';
const GO_PALE  = 'FFF8E8';
const PU       = '6A1B9A';
const PU_PALE  = 'F5EEF8';
const RE       = 'C62828';
const RE_PALE  = 'FFEBEE';
const GY_BDR   = 'CCCCCC';
const WHITE    = 'FFFFFF';

// A4
const PW = 11906, PH = 16838, MG = 1080;
const CW = PW - MG * 2;

// ── Micro-helpers ─────────────────────────────────────────────────
const bdr  = (c = GY_BDR, s = 4) => ({ style: BorderStyle.SINGLE, size: s, color: c });
const noBdr = () => ({ style: BorderStyle.NONE, size: 0, color: WHITE });
const allBdr = (c = GY_BDR) => ({ top: bdr(c), bottom: bdr(c), left: bdr(c), right: bdr(c) });
const CMP = { top: 80, bottom: 80, left: 120, right: 120 };

const Tr = (text, opts = {}) => new TextRun({ text: String(text), font: 'Arial', size: 20, ...opts });
const Tb = (text, color = BL_DARK) => Tr(text, { bold: true, color });
const Ti = (text, color = '666666') => Tr(text, { italics: true, color });
const Ts = (text, opts = {}) => new TextRun({ text: String(text), font: 'Arial', size: 18, ...opts });

const sp = (before = 60, after = 60) => ({ before, after });
const P0 = (children, opts = {}) => new Paragraph({ spacing: sp(), children: Array.isArray(children) ? children : [children], ...opts });
const SPACER = () => new Paragraph({ spacing: { before: 0, after: 0 }, children: [Tr('', { size: 10 })] });

// ── Banner cell helper ────────────────────────────────────────────
function bannerCell(text, align = AlignmentType.LEFT, size = 20, color = WHITE, width) {
  return new TableCell({
    borders: { top: noBdr(), bottom: bdr(BL_MID, 8), left: noBdr(), right: noBdr() },
    shading: { fill: BL_DARK, type: ShadingType.CLEAR },
    width: { size: width, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text, font: 'Arial', size, bold: size >= 22, color })] })],
  });
}

// ── Section bar ───────────────────────────────────────────────────
function sectionBar(text, bg = BL_DARK) {
  return new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: noBdr(), bottom: noBdr(), left: noBdr(), right: noBdr() },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 160, right: 160 },
      children: [new Paragraph({ children: [new TextRun({ text, font: 'Arial', size: 24, bold: true, color: WHITE })] })],
    })]})],
  });
}

// ── Colored box ───────────────────────────────────────────────────
function colorBox(children, bg, borderColor) {
  return new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
    rows: [new TableRow({ children: [new TableCell({
      borders: allBdr(borderColor),
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 180, right: 180 },
      children,
    })]})],
  });
}

// ── Data table ───────────────────────────────────────────────────
function dataTable(headers, rows, colWidths, hBg = BL_MID) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const hRow  = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders: allBdr(hBg), width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: hBg, type: ShadingType.CLEAR }, margins: CMP,
      children: [new Paragraph({ children: [Ts(h, { bold: true, color: WHITE })] })],
    })),
  });
  const dRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      borders: allBdr(), width: { size: colWidths[ci], type: WidthType.DXA },
      shading: { fill: ri % 2 === 0 ? WHITE : BL_PALE, type: ShadingType.CLEAR }, margins: CMP,
      children: [new Paragraph({ children: [Ts(String(cell))] })],
    })),
  }));
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: colWidths, rows: [hRow, ...dRows] });
}

// ── Bullet paragraph ──────────────────────────────────────────────
function bullet(text, ref = 'bullets') {
  return new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: sp(40, 40), children: [Tr(text)] });
}

// ── Fill line (answer line) ───────────────────────────────────────
function fillLine(label = '') {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GY_BDR } },
    children: [Tr(label)],
  });
}

// ── Parse markdown-flavoured content → docx elements ─────────────
function parseContent(raw) {
  const elements = [];
  const lines    = raw.split('\n');
  let tableRows  = [];
  let tableHdr   = null;
  let inTable    = false;

  const isSep = l => l.trim().replace(/\|/g, '').replace(/-/g, '').replace(/:/g, '').replace(/ /g, '').length === 0 && l.includes('-');
  const parseRow = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

  function flushTable() {
    if (!tableRows.length && !tableHdr) { inTable = false; return; }
    const allRows    = tableHdr ? [tableHdr, ...tableRows] : tableRows;
    const colCount   = Math.max(...allRows.map(r => r.length));
    const colWidth   = Math.floor(CW / colCount);
    const colWidths  = Array(colCount).fill(colWidth);
    colWidths[colCount - 1] = CW - colWidth * (colCount - 1);

    const hRow = new TableRow({
      tableHeader: true,
      children: (allRows[0] || []).map((h, i) => new TableCell({
        borders: allBdr(BL_MID), width: { size: colWidths[i], type: WidthType.DXA },
        shading: { fill: BL_MID, type: ShadingType.CLEAR }, margins: CMP,
        children: [new Paragraph({ children: [Ts(h, { bold: true, color: WHITE })] })],
      })),
    });
    const dRows = (tableHdr ? tableRows : tableRows.slice(1)).map((row, ri) => new TableRow({
      children: row.map((cell, ci) => {
        while (row.length < colCount) row.push('');
        return new TableCell({
          borders: allBdr(), width: { size: colWidths[ci], type: WidthType.DXA },
          shading: { fill: ri % 2 === 0 ? WHITE : BL_PALE, type: ShadingType.CLEAR }, margins: CMP,
          children: [new Paragraph({ children: [Ts(cell)] })],
        });
      }),
    }));
    elements.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: colWidths, rows: [hRow, ...dRows] }));
    elements.push(SPACER());
    inTable = false; tableRows = []; tableHdr = null;
  }

  function inlineFormat(text) {
    // Bold **text** → bold run, italic *text* → italic run, rest → normal
    const parts = [];
    const re    = /\*\*(.*?)\*\*|\*(.*?)\*/g;
    let last    = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(Tr(text.slice(last, m.index)));
      if (m[1] !== undefined) parts.push(Tr(m[1], { bold: true }));
      else if (m[2] !== undefined) parts.push(Ti(m[2]));
      last = re.lastIndex;
    }
    if (last < text.length) parts.push(Tr(text.slice(last)));
    return parts;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const s    = line.trim();

    // Table detection
    if (s.startsWith('|')) {
      if (!inTable) {
        const nextLine = lines[i + 1] || '';
        if (isSep(nextLine)) { tableHdr = parseRow(s); inTable = true; i++; continue; }
        inTable = true;
      }
      if (!isSep(s)) tableRows.push(parseRow(s));
      continue;
    } else if (inTable) { flushTable(); }

    // Headings
    if (s.startsWith('### ')) {
      elements.push(new Paragraph({ spacing: sp(140, 60), children: [new TextRun({ text: s.slice(4), font: 'Arial', size: 20, bold: true, color: BL_MID })] }));
    } else if (s.startsWith('## ')) {
      elements.push(SPACER());
      elements.push(sectionBar(s.slice(3)));
      elements.push(SPACER());
    } else if (s.startsWith('# ')) {
      elements.push(new Paragraph({ spacing: sp(180, 80), children: [new TextRun({ text: s.slice(2), font: 'Arial', size: 28, bold: true, color: BL_DARK })] }));
    }
    // HR
    else if (/^-{3,}$/.test(s)) {
      elements.push(new Paragraph({ spacing: sp(60, 60), border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GY_BDR } }, children: [Tr('')] }));
    }
    // Blockquote
    else if (s.startsWith('> ')) {
      elements.push(colorBox([P0([Ti(s.slice(2))])], BL_PALE, BL_MID));
      elements.push(SPACER());
    }
    // Bullets
    else if (s.startsWith('- ') || s.startsWith('* ')) {
      elements.push(bullet(s.slice(2)));
    }
    // Numbered
    else if (/^\d+[.)]\s/.test(s)) {
      const text = s.replace(/^\d+[.)]\s/, '');
      elements.push(new Paragraph({ numbering: { reference: 'numbers', level: 0 }, spacing: sp(40, 40), children: inlineFormat(text) }));
    }
    // Blank
    else if (s === '') {
      elements.push(SPACER());
    }
    // Normal
    else {
      elements.push(P0(inlineFormat(s)));
    }
  }
  if (inTable) flushTable();
  return elements;
}

// ── Tool labels ───────────────────────────────────────────────────
const toolLabels = {
  interro:     'Interrogation écrite',
  cours:       'Fiche de cours',
  vocab:       'Fiche de vocabulaire',
  conjugaison: 'Exercice de conjugaison',
  corrige:     'Corrigé type',
  dialogue:    'Dialogue modèle',
  ressource:   'Ressource pédagogique',
};

// ── Build document ────────────────────────────────────────────────
const raw       = readFileSync(txtPath, 'utf8');
const toolLabel = toolLabels[tool] || 'Ressource pédagogique';
const themeStr  = theme ? ` — ${theme.charAt(0).toUpperCase() + theme.slice(1)}` : '';

const doc = new Document({
  numbering: {
    config: [
      { reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 360 } }, run: { font: 'Arial', size: 20 } } }] },
      { reference: 'numbers',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 360 } }, run: { font: 'Arial', size: 20 } } }] },
    ],
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 20 } } },
  },
  sections: [{
    properties: {
      page: { size: { width: PW, height: PH }, margin: { top: MG, bottom: MG, left: MG, right: MG } },
    },

    // ── HEADER ──────────────────────────────────────────────────
    headers: {
      default: new Header({
        children: [
          new Table({
            width: { size: CW, type: WidthType.DXA },
            columnWidths: [Math.round(CW * 0.25), Math.round(CW * 0.5), CW - Math.round(CW * 0.25) - Math.round(CW * 0.5)],
            rows: [new TableRow({ children: [
              bannerCell('DeutschMeister', AlignmentType.LEFT,  22, WHITE,    Math.round(CW * 0.25)),
              bannerCell(`${toolLabel}${themeStr}`, AlignmentType.CENTER, 20, WHITE, Math.round(CW * 0.5)),
              bannerCell(`${classe} · Niveau ${niveau} · LV2`, AlignmentType.RIGHT, 18, 'AACCEE', CW - Math.round(CW * 0.25) - Math.round(CW * 0.5)),
            ]})],
          }),
          SPACER(),
        ],
      }),
    },

    // ── FOOTER ──────────────────────────────────────────────────
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: bdr(GY_BDR, 4) },
          spacing: { before: 80 },
          children: [
            new TextRun({ text: `Généré par DeutschMeister  ·  ${classe} LV2  ·  Niveau ${niveau} CECRL  ·  Page `, font: 'Arial', size: 16, color: '888888' }),
            new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: '888888' }),
          ],
        })],
      }),
    },

    children: parseContent(raw),
  }],
});

const buf = await Packer.toBuffer(doc);
writeFileSync(docxPath, buf);
console.log('DOCX OK');
