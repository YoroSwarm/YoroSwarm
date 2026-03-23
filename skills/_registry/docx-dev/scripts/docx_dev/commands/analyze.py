"""
analyze command - Analyze document structure and styles.
Ported from C# AnalyzeCommand.cs
"""
import argparse
import json
import zipfile
from pathlib import Path
from lxml import etree


W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'


def analyze_command(subparsers):
    parser = subparsers.add_parser('analyze', help='Analyze document structure and styles')
    parser.add_argument('--input', required=True, help='DOCX file to analyze')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    parser.set_defaults(handler=handle_analyze)


def handle_analyze(args):
    """Main handler for analyze command."""
    input_path = Path(args.input)

    if not input_path.exists():
        print(f"File not found: {input_path}", file=__import__('sys').stderr)
        return 1

    with zipfile.ZipFile(input_path, 'r') as z:
        # Check for valid DOCX
        doc_entry = z.get_entry('word/document.xml') if hasattr(z, 'get_entry') else None
        if doc_entry is None:
            for name in z.namelist():
                if name == 'word/document.xml':
                    doc_entry = name
                    break

        if doc_entry is None or doc_entry not in z.namelist():
            print("Not a valid DOCX", file=__import__('sys').stderr)
            return 1

        doc_xml = etree.fromstring(z.read('word/document.xml'))
        body = doc_xml.find(f'{{{W_NS}}}body')
        if body is None:
            return 0

        # Sections
        sections = body.findall(f'{{{W_NS}}}sectPr')
        section_breaks = [
            s.findtext(f'{{{W_NS}}}type/@{W_NS}val', default='nextPage').replace(f'{{{W_NS}}}val', '')
            if s.find(f'{{{W_NS}}}type') is not None else 'nextPage'
            for s in sections
        ]

        # Headings
        headings = []
        for p in body.iter(f'{{{W_NS}}}p'):
            pPr = p.find(f'{{{W_NS}}}pPr')
            if pPr is not None:
                pStyle = pPr.find(f'{{{W_NS}}}pStyle')
                if pStyle is not None:
                    style_val = pStyle.get(f'{{{W_NS}}}val', '')
                    if style_val.startswith('Heading') or style_val.startswith('heading'):
                        text = ''.join(t.text or '' for t in p.iter(f'{{{W_NS}}}t'))
                        headings.append({'style': style_val, 'text': text})

        # Tables
        tables = []
        for tbl in body.iter(f'{{{W_NS}}}tbl'):
            rows = tbl.findall(f'{{{W_NS}}}tr')
            first_row = rows[0] if rows else None
            cols = len(first_row.findall(f'{{{W_NS}}}tc')) if first_row is not None else 0
            tables.append({'rows': len(rows), 'cols': cols})

        # Images
        images = len(list(body.iter(f'{{{W_NS}}}drawing')))

        # Headers/footers
        header_refs = sum(len(s.findall(f'{{{W_NS}}}headerReference')) for s in sections)
        footer_refs = sum(len(s.findall(f'{{{W_NS}}}footerReference')) for s in sections)

        # Paragraphs and word count
        paragraphs = list(body.iter(f'{{{W_NS}}}p'))
        all_text = ''.join(t.text or '' for t in body.iter(f'{{{W_NS}}}t'))
        word_count = len(all_text.split())

        # XML file sizes
        xml_files = [
            {'file': e.filename, 'size': e.file_size}
            for e in z.infolist()
            if e.filename.startswith('word/') and e.filename.endswith('.xml')
        ]
        xml_files.sort(key=lambda x: x['size'], reverse=True)

        # Custom styles
        custom_styles = []
        if 'word/styles.xml' in z.namelist():
            styles_xml = etree.fromstring(z.read('word/styles.xml'))
            for style in styles_xml.iter(f'{{{W_NS}}}style'):
                custom_style = style.get(f'{{{W_NS}}}customStyle')
                if custom_style == '1':
                    style_id = style.get(f'{{{W_NS}}}styleId')
                    if style_id:
                        custom_styles.append(style_id)

        analysis = {
            'sections': {'count': len(sections), 'breakTypes': section_breaks},
            'headings': headings,
            'tables': {'count': len(tables), 'details': tables},
            'images': images,
            'headerFooter': {'headers': header_refs, 'footers': footer_refs},
            'paragraphs': len(paragraphs),
            'estimatedWordCount': word_count,
            'xmlFileSizes': xml_files,
            'customStyles': {'count': len(custom_styles), 'names': custom_styles}
        }

        if args.json:
            print(json.dumps(analysis, indent=2))
        else:
            print(f"Sections:       {len(sections)} ({', '.join(section_breaks)})")
            print(f"Headings:       {len(headings)}")
            for h in headings:
                print(f"  {h}")
            print(f"Tables:         {len(tables)}")
            for t in tables:
                print(f"  {t['rows']} rows x {t['cols']} cols")
            print(f"Images:         {images}")
            print(f"Headers:        {header_refs}")
            print(f"Footers:        {footer_refs}")
            print(f"Paragraphs:     {len(paragraphs)}")
            print(f"Word count:     ~{word_count}")
            print(f"Custom styles:  {len(custom_styles)}")
            for s in custom_styles:
                print(f"  {s}")
            print("XML file sizes:")
            for f in xml_files[:10]:
                print(f"  {f['file']}: {f['size']:,} bytes")

        return 0
