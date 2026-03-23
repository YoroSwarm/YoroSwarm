"""
fix-order command - Fix XML element ordering in DOCX.
Ported from C# FixOrderCommand.cs
"""
import argparse
import sys
from pathlib import Path
from zipfile import ZipFile
from lxml import etree
from io import BytesIO

W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

# Required element order for w:p
P_CHILD_ORDER = [
    f'{{{W_NS}}}pPr',
    f'{{{W_NS}}}bookmarkStart',
    f'{{{W_NS}}}bookmarkEnd',
    f'{{{W_NS}}}commentRangeStart',
    f'{{{W_NS}}}commentRangeEnd',
    f'{{{W_NS}}}commentReference',
    f'{{{W_NS}}}r',
    f'{{{W_NS}}}hyperlink',
    f'{{{W_NS}}}ins',
    f'{{{W_NS}}}del',
    f'{{{W_NS}}}moveFromRangeStart',
    f'{{{W_NS}}}moveFromRangeEnd',
    f'{{{W_NS}}}moveToRangeStart',
    f'{{{W_NS}}}moveToRangeEnd',
]

# Required element order for w:r
R_CHILD_ORDER = [
    f'{{{W_NS}}}rPr',
    f'{{{W_NS}}}t',
    f'{{{W_NS}}}tab',
    f'{{{W_NS}}}br',
    f'{{{W_NS}}}cr',
    f'{{{W_NS}}}noBreakHyphen',
    f'{{{W_NS}}}softHyphen',
    f'{{{W_NS}}}dayLong',
    f'{{{W_NS}}}monthLong',
    f'{{{W_NS}}}yearLong',
    f'{{{W_NS}}}dayShort',
    f'{{{W_NS}}}monthShort',
    f'{{{W_NS}}}yearShort',
    f'{{{W_NS}}}annotationRef',
    f'{{{W_NS}}}separator',
    f'{{{W_NS}}}continuationSeparator',
    f'{{{W_NS}}}fldChar',
    f'{{{W_NS}}}instrText',
]

# Required element order for w:tr
TR_CHILD_ORDER = [
    f'{{{W_NS}}}trPr',
    f'{{{W_NS}}}tc',
]

# Required element order for w:tc
TC_CHILD_ORDER = [
    f'{{{W_NS}}}tcPr',
    f'{{{W_NS}}}p',
]

# Required element order for w:tbl
TBL_CHILD_ORDER = [
    f'{{{W_NS}}}tblPr',
    f'{{{W_NS}}}tblGrid',
    f'{{{W_NS}}}tr',
]


def fix_order_command(subparsers):
    parser = subparsers.add_parser('fix-order', help='Fix XML element ordering in DOCX')
    parser.add_argument('--input', required=True, help='Input DOCX file')
    parser.add_argument('--output', help='Output DOCX file (default: overwrite input)')
    parser.add_argument('--dry-run', dest='dry_run', action='store_true', help='Show changes without applying')
    parser.set_defaults(handler=handle_fix_order)


def handle_fix_order(args):
    """Main handler for fix-order command."""
    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else input_path

    if not input_path.exists():
        print(f"File not found: {input_path}", file=sys.stderr)
        return 1

    try:
        with ZipFile(input_path, 'r') as z:
            # Read all files
            files = {}
            for name in z.namelist():
                files[name] = z.read(name)

        # Fix ordering in document.xml
        if 'word/document.xml' in files:
            doc = etree.fromstring(files['word/document.xml'])
            fixes = fix_element_order(doc)
            files['word/document.xml'] = etree.tostring(doc, xml_declaration=True, encoding='UTF-8', standalone=True)

            if args.dry_run:
                print(f"Would apply {len(fixes)} fixes:")
                for fix in fixes[:10]:
                    print(f"  - {fix}")
            else:
                print(f"Applied {len(fixes)} fixes")

        # Write output
        if not args.dry_run:
            with ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as z:
                for name, content in files.items():
                    z.writestr(name, content)

            print(f"Saved to: {output_path}")

        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


def fix_element_order(element, path=""):
    """Recursively fix element ordering."""
    fixes = []

    # Determine which order规则 to apply
    tag = element.tag
    child_order = None

    if tag == f'{{{W_NS}}}p':
        child_order = P_CHILD_ORDER
    elif tag == f'{{{W_NS}}}r':
        child_order = R_CHILD_ORDER
    elif tag == f'{{{W_NS}}}tr':
        child_order = TR_CHILD_ORDER
    elif tag == f'{{{W_NS}}}tc':
        child_order = TC_CHILD_ORDER
    elif tag == f'{{{W_NS}}}tbl':
        child_order = TBL_CHILD_ORDER

    if child_order:
        # Get current children
        children = list(element)
        current_order = [c.tag for c in children]

        # Check if ordering is correct
        desired_order = []
        for expected_tag in child_order:
            desired_order.extend([c for c in children if c.tag == expected_tag])

        # Add any unexpected elements at the end
        seen_tags = set(child_order)
        for c in children:
            if c.tag not in seen_tags:
                desired_order.append(c)

        # If order differs, fix it
        if [c.tag for c in desired_order] != current_order:
            fixes.append(f"{path}: reorder children")
            element[:] = desired_order

    # Recurse into children
    for child in element:
        child_fixes = fix_element_order(child, f"{path}/{element.tag.split('}')[1]}")
        fixes.extend(child_fixes)

    return fixes
