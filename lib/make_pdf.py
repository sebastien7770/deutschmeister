#!/usr/bin/env python3
"""
lib/make_pdf.py — Génère un PDF mis en page à partir du contenu texte DeutschMeister
Usage : python3 make_pdf.py <input.txt> <output.pdf> <tool> <classe> <niveau> [theme]
"""
import sys, re
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# ── Palette ───────────────────────────────────────────────────────
BL_DARK  = colors.HexColor('#1E3A5F')
BL_MID   = colors.HexColor('#2D6A9F')
BL_PALE  = colors.HexColor('#EEF5FB')
GR       = colors.HexColor('#2E7D32')
GR_PALE  = colors.HexColor('#E8F5E9')
GO       = colors.HexColor('#E8A020')
GO_PALE  = colors.HexColor('#FFF8E8')
PU       = colors.HexColor('#6A1B9A')
PU_PALE  = colors.HexColor('#F5EEF8')
RE       = colors.HexColor('#C62828')
RE_PALE  = colors.HexColor('#FFEBEE')
GY_BDR   = colors.HexColor('#CCCCCC')
GY_LIGHT = colors.HexColor('#F7F7F7')
TEXT     = colors.HexColor('#1A1A1A')
MUTED    = colors.HexColor('#666666')
WHITE    = colors.white

W, H = A4
CW = W - 3.6*cm

TOOL_LABELS = {
    'interro':     'Interrogation écrite',
    'cours':       'Fiche de cours',
    'vocab':       'Fiche de vocabulaire',
    'conjugaison': 'Exercice de conjugaison',
    'corrige':     'Corrigé type',
    'dialogue':    'Dialogue modèle',
    'ressource':   'Ressource pédagogique',
}

# ── Style factory ─────────────────────────────────────────────────
def S(name, **kw):
    return ParagraphStyle(name, **kw)

body  = S('body',  fontName='Helvetica',        fontSize=9.5, textColor=TEXT,  leading=15)
bold  = S('bold',  fontName='Helvetica-Bold',   fontSize=9.5, textColor=TEXT,  leading=15)
small = S('small', fontName='Helvetica',        fontSize=9,   textColor=MUTED, leading=13)
note  = S('note',  fontName='Helvetica-Oblique',fontSize=9,   textColor=MUTED, leading=13)
h2sty = S('h2',    fontName='Helvetica-Bold',   fontSize=11,  textColor=BL_MID,  spaceBefore=8, spaceAfter=4)
h3sty = S('h3',    fontName='Helvetica-Bold',   fontSize=10,  textColor=BL_DARK, spaceBefore=6, spaceAfter=3)
foot  = S('foot',  fontName='Helvetica',        fontSize=8,   textColor=MUTED, alignment=TA_CENTER)

def inline_md(text):
    """Convert **bold** and *italic* markdown to ReportLab XML."""
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'\*(.*?)\*',     r'<i>\1</i>', text)
    text = re.sub(r'`(.*?)`',       r'<font face="Courier">\1</font>', text)
    return text

# ── Section bar ───────────────────────────────────────────────────
def section_bar(text, bg=BL_DARK):
    return [
        Spacer(1, 8),
        Table([[Paragraph(text, S('sb', fontName='Helvetica-Bold', fontSize=11,
                                   textColor=WHITE))]],
              colWidths=[CW],
              style=TableStyle([
                  ('BACKGROUND', (0,0),(-1,-1), bg),
                  ('TOPPADDING', (0,0),(-1,-1), 7),
                  ('BOTTOMPADDING', (0,0),(-1,-1), 7),
                  ('LEFTPADDING', (0,0),(-1,-1), 10),
              ])),
        Spacer(1, 5),
    ]

# ── Colored box ───────────────────────────────────────────────────
def color_box(paragraphs, bg, border_color):
    return Table([[paragraphs]], colWidths=[CW],
        style=TableStyle([
            ('BACKGROUND', (0,0),(-1,-1), bg),
            ('BOX', (0,0),(-1,-1), 1, border_color),
            ('TOPPADDING', (0,0),(-1,-1), 8),
            ('BOTTOMPADDING', (0,0),(-1,-1), 8),
            ('LEFTPADDING', (0,0),(-1,-1), 12),
            ('RIGHTPADDING', (0,0),(-1,-1), 12),
        ]))

# ── Data table ────────────────────────────────────────────────────
def data_table(headers, rows, col_widths=None, hbg=BL_MID):
    if not col_widths:
        col_widths = [CW / len(headers)] * len(headers)
    hrow = [[Paragraph(f'<b>{h}</b>', S('th', fontName='Helvetica-Bold',
             fontSize=9, textColor=WHITE)) for h in headers]]
    drows = [[Paragraph(str(c), S('td', fontName='Helvetica', fontSize=9,
              textColor=TEXT, leading=13)) for c in row] for row in rows]
    ts = TableStyle([
        ('BACKGROUND', (0,0),(-1,0), hbg),
        ('ROWBACKGROUNDS', (0,1),(-1,-1), [WHITE, BL_PALE]),
        ('GRID', (0,0),(-1,-1), 0.4, GY_BDR),
        ('TOPPADDING', (0,0),(-1,-1), 5),
        ('BOTTOMPADDING', (0,0),(-1,-1), 5),
        ('LEFTPADDING', (0,0),(-1,-1), 7),
        ('RIGHTPADDING', (0,0),(-1,-1), 7),
        ('VALIGN', (0,0),(-1,-1), 'MIDDLE'),
    ])
    return Table(hrow + drows, colWidths=col_widths, style=ts, repeatRows=1)

# ── Fill line ─────────────────────────────────────────────────────
def fill_line(label=''):
    return [
        Paragraph(label, S('fl', fontName='Helvetica', fontSize=9.5, textColor=TEXT, leading=20, leftIndent=6)),
        Table([['']], colWidths=[CW-20], rowHeights=[12],
              style=TableStyle([('LINEBELOW', (0,0),(-1,-1), 0.6, GY_BDR),
                                ('BOTTOMPADDING', (0,0),(-1,-1), 0)])),
        Spacer(1, 3),
    ]

# ── Main parser ───────────────────────────────────────────────────
def parse_content(raw):
    story  = []
    lines  = raw.split('\n')
    i      = 0
    in_tbl = False
    t_hdr  = None
    t_rows = []

    def is_sep(line):
        s = line.strip().strip('|').replace('-','').replace(':','').replace(' ','')
        return len(s) == 0 and '-' in line

    def parse_row(line):
        return [c.strip() for c in line.strip().strip('|').split('|')]

    def flush_table():
        nonlocal in_tbl, t_hdr, t_rows
        if not t_rows and t_hdr is None:
            in_tbl = False; return
        all_rows  = ([t_hdr] if t_hdr else []) + t_rows
        col_count = max(len(r) for r in all_rows)
        cw        = CW / col_count
        col_widths= [cw] * col_count

        hrow = [[Paragraph(f'<b>{c}</b>', S('th', fontName='Helvetica-Bold', fontSize=9, textColor=WHITE))
                 for c in all_rows[0]]]
        drows= [[Paragraph(str(c), S('td', fontName='Helvetica', fontSize=9, textColor=TEXT, leading=13))
                 for c in row] for row in (t_rows if t_hdr else all_rows[1:])]

        ts = TableStyle([
            ('BACKGROUND', (0,0),(-1,0), BL_MID),
            ('ROWBACKGROUNDS', (0,1),(-1,-1), [WHITE, BL_PALE]),
            ('GRID', (0,0),(-1,-1), 0.4, GY_BDR),
            ('TOPPADDING', (0,0),(-1,-1), 5), ('BOTTOMPADDING', (0,0),(-1,-1), 5),
            ('LEFTPADDING', (0,0),(-1,-1), 7), ('RIGHTPADDING', (0,0),(-1,-1), 7),
            ('VALIGN', (0,0),(-1,-1), 'MIDDLE'),
        ])
        story.append(Table(hrow + drows, colWidths=col_widths, style=ts, repeatRows=1))
        story.append(Spacer(1, 6))
        in_tbl = False; t_hdr = None; t_rows = []

    while i < len(lines):
        line = lines[i]
        s    = line.strip()

        # Table
        if s.startswith('|'):
            if not in_tbl:
                nxt = lines[i+1] if i+1 < len(lines) else ''
                if is_sep(nxt):
                    t_hdr = parse_row(s); in_tbl = True; i += 2; continue
                in_tbl = True
            if not is_sep(s):
                t_rows.append(parse_row(s))
            i += 1; continue
        elif in_tbl:
            flush_table()

        # Headings
        if s.startswith('### '):
            story.append(Paragraph(inline_md(s[4:]), h3sty))
        elif s.startswith('## '):
            story += section_bar(s[3:])
        elif s.startswith('# '):
            story.append(Spacer(1, 6))
            story.append(Paragraph(inline_md(s[2:]),
                S('h1', fontName='Helvetica-Bold', fontSize=14, textColor=BL_DARK,
                  spaceBefore=10, spaceAfter=5)))
        # HR
        elif re.match(r'^-{3,}$', s):
            story.append(Spacer(1, 4))
            story.append(HRFlowable(width='100%', thickness=0.5, color=GY_BDR))
            story.append(Spacer(1, 4))
        # Blockquote
        elif s.startswith('> '):
            story.append(color_box(
                [Paragraph(inline_md(s[2:]), S('bq', fontName='Helvetica-Oblique',
                 fontSize=9.5, textColor=TEXT, leading=15))],
                BL_PALE, BL_MID))
            story.append(Spacer(1, 4))
        # Bullet
        elif s.startswith('- ') or s.startswith('* '):
            story.append(Paragraph(
                '•  ' + inline_md(s[2:]),
                S('li', fontName='Helvetica', fontSize=9.5, textColor=TEXT,
                  leading=15, leftIndent=12)))
        # Numbered
        elif re.match(r'^\d+[.)]\s', s):
            text = re.sub(r'^\d+[.)]\s', '', s)
            num  = re.match(r'^(\d+)', s).group(1)
            story.append(Paragraph(
                f'{num}.  {inline_md(text)}',
                S('num', fontName='Helvetica', fontSize=9.5, textColor=TEXT,
                  leading=18, leftIndent=12)))
        # Blank
        elif s == '':
            story.append(Spacer(1, 5))
        # Normal
        else:
            story.append(Paragraph(inline_md(s), body))

        i += 1

    if in_tbl:
        flush_table()
    return story

# ── Build PDF ─────────────────────────────────────────────────────
def build_pdf(txt_path, pdf_path, tool, classe, niveau, theme):
    raw        = open(txt_path, encoding='utf-8').read()
    tool_label = TOOL_LABELS.get(tool, 'Ressource pédagogique')
    theme_str  = f' — {theme.title()}' if theme else ''

    doc = SimpleDocTemplate(
        pdf_path, pagesize=A4,
        leftMargin=1.8*cm, rightMargin=1.8*cm,
        topMargin=1.5*cm,  bottomMargin=1.8*cm
    )

    story = []

    # Banner
    banner_cw = [W - 3.6*cm]
    col_a = round((W-3.6*cm)*0.25)
    col_b = round((W-3.6*cm)*0.5)
    col_c = (W-3.6*cm) - col_a - col_b

    banner = Table([[
        Paragraph('DeutschMeister',
            S('bl', fontName='Helvetica-Bold', fontSize=16, textColor=WHITE, alignment=TA_LEFT)),
        Paragraph(f'{tool_label}{theme_str}',
            S('bm', fontName='Helvetica-Bold', fontSize=11, textColor=WHITE, alignment=TA_CENTER)),
        Paragraph(f'{classe} · Niveau {niveau} · LV2',
            S('br', fontName='Helvetica', fontSize=9,  textColor=colors.HexColor('#AACCEE'), alignment=TA_RIGHT)),
    ]], colWidths=[col_a, col_b, col_c],
    style=TableStyle([
        ('BACKGROUND', (0,0),(-1,-1), BL_DARK),
        ('TOPPADDING', (0,0),(-1,-1), 12), ('BOTTOMPADDING', (0,0),(-1,-1), 12),
        ('LEFTPADDING', (0,0),(-1,-1), 8),  ('RIGHTPADDING', (0,0),(-1,-1), 8),
        ('VALIGN', (0,0),(-1,-1), 'MIDDLE'),
        ('LINEAFTER', (0,0),(1,-1), 0.5, colors.HexColor('#3A5A7F')),
    ]))
    story.append(banner)
    story.append(Spacer(1, 10))

    story += parse_content(raw)

    # Footer line
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width='100%', thickness=0.4, color=GY_BDR))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f'Généré par DeutschMeister  ·  {classe} LV2  ·  Niveau {niveau} CECRL',
        foot))

    doc.build(story)
    print('PDF OK')

if __name__ == '__main__':
    if len(sys.argv) < 6:
        print('Usage: make_pdf.py <in.txt> <out.pdf> <tool> <classe> <niveau> [theme]')
        sys.exit(1)
    build_pdf(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5],
              sys.argv[6] if len(sys.argv) > 6 else '')
