"""
merge-runs command - Consolidate adjacent runs with same formatting.
Ported from C# MergeRunsCommand.cs
"""
import argparse
import sys
from pathlib import Path
from zipfile import ZipFile
from lxml import etree

W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'


def merge_runs_command(subparsers):
    parser = subparsers.add_parser('merge-runs', help='Consolidate adjacent runs with same formatting')
    parser.add_argument('--input', required=True, help='Input DOCX file')
    parser.add_argument('--output', help='Output DOCX file (default: overwrite input)')
    parser.set_defaults(handler=handle_merge_runs)


def handle_merge_runs(args):
    """Main handler for merge-runs command."""
    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else input_path

    if not input_path.exists():
        print(f"File not found: {input_path}", file=sys.stderr)
        return 1

    try:
        with ZipFile(input_path, 'r') as z:
            files = {}
            for name in z.namelist():
                files[name] = z.read(name)

        if 'word/document.xml' in files:
            doc = etree.fromstring(files['word/document.xml'])
            merged = merge_adjacent_runs(doc)
            files['word/document.xml'] = etree.tostring(doc, xml_declaration=True, encoding='UTF-8', standalone=True)
            print(f"Merged {merged} run pairs")

        with ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as z:
            for name, content in files.items():
                z.writestr(name, content)

        print(f"Saved to: {output_path}")
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def merge_adjacent_runs(element, merged_count=None):
    """Merge adjacent w:r elements with identical w:rPr."""
    if merged_count is None:
        merged_count = [0]  # Use list to allow modification in nested function

    for p in element.iter(f'{{{W_NS}}}p'):
        children = list(p)
        i = 0
        while i < len(children) - 1:
            current = children[i]
            next_elem = children[i + 1]

            if (current.tag == f'{{{W_NS}}}r' and
                next_elem.tag == f'{{{W_NS}}}r' and
                runs_can_merge(current, next_elem)):

                # Get text from both runs
                current_text = ''.join(t.text or '' for t in current.iter(f'{{{W_NS}}}t'))
                next_text = ''.join(t.text or '' for t in next_elem.iter(f'{{{W_NS}}}t'))

                # Add next run's text to current run
                for t in next_elem.iter(f'{{{W_NS}}}t'):
                    new_t = etree.SubElement(current, f'{{{W_NS}}}t')
                    new_t.text = t.text
                    new_t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')

                # Remove next run
                p.remove(next_elem)
                children.pop(i + 1)
                merged_count[0] += 1
            else:
                i += 1

    return merged_count[0]


def runs_can_merge(r1, r2):
    """Check if two w:r elements can be merged."""
    rPr1 = r1.find(f'{{{W_NS}}}rPr')
    rPr2 = r2.find(f'{{{W_NS}}}rPr')

    # If neither has rPr, they can be merged
    if rPr1 is None and rPr2 is None:
        return True

    # If only one has rPr, they can't be merged
    if rPr1 is None or rPr2 is None:
        return False

    # Compare rPr children (excluding text-related elements)
    def get_comparable_props(rPr):
        props = []
        for child in rPr:
            # Exclude elements that don't affect appearance
            if child.tag not in (f'{{{W_NS}}}rStyle',):
                props.append((child.tag, child.text, child.attrib))
        return set(props)

    return get_comparable_props(rPr1) == get_comparable_props(rPr2)
