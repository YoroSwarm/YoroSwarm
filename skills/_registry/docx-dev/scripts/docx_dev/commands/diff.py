"""
diff command - Compare two DOCX files.
Ported from C# DiffCommand.cs
"""
import argparse
import sys
from pathlib import Path
from zipfile import ZipFile
from lxml import etree
import difflib

W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'


def diff_command(subparsers):
    parser = subparsers.add_parser('diff', help='Compare two DOCX files')
    parser.add_argument('--before', required=True, help='Before DOCX file')
    parser.add_argument('--after', required=True, help='After DOCX file')
    parser.set_defaults(handler=handle_diff)


def handle_diff(args):
    """Main handler for diff command."""
    before_path = Path(args.before)
    after_path = Path(args.after)

    if not before_path.exists():
        print(f"File not found: {before_path}", file=sys.stderr)
        return 1

    if not after_path.exists():
        print(f"File not found: {after_path}", file=sys.stderr)
        return 1

    try:
        with ZipFile(before_path, 'r') as z_before, ZipFile(after_path, 'r') as z_after:
            before_files = set(z_before.namelist())
            after_files = set(z_after.namelist())

            # Check for added/removed files
            added = after_files - before_files
            removed = before_files - after_files

            if added:
                print(f"Added files ({len(added)}):")
                for f in sorted(added):
                    print(f"  + {f}")

            if removed:
                print(f"Removed files ({len(removed)}):")
                for f in sorted(removed):
                    print(f"  - {f}")

            # Compare document.xml
            common_files = before_files & after_files
            xml_files = [f for f in common_files if f.endswith('.xml')]

            for xml_file in sorted(xml_files):
                before_content = z_before.read(xml_file).decode('utf-8', errors='replace')
                after_content = z_after.read(xml_file).decode('utf-8', errors='replace')

                if before_content != after_content:
                    print(f"\nModified: {xml_file}")

                    # For document.xml, extract text for readable diff
                    if xml_file == 'word/document.xml':
                        before_text = extract_text(etree.fromstring(before_content.encode()))
                        after_text = extract_text(etree.fromstring(after_content.encode()))

                        if before_text != after_text:
                            diff = list(difflib.unified_diff(
                                before_text.splitlines(keepends=True),
                                after_text.splitlines(keepends=True),
                                fromfile='before',
                                tofile='after',
                                lineterm=''
                            ))
                            if diff:
                                print(''.join(diff[:50]))  # First 50 lines of diff
                    else:
                        # Show XML diff summary
                        before_tree = etree.fromstring(before_content.encode())
                        after_tree = etree.fromstring(after_content.encode())

                        if len(before_tree) != len(after_tree):
                            print(f"  Element count: {len(before_tree)} -> {len(after_tree)}")

            if not added and not removed:
                common_xml = [f for f in common_files if f.endswith('.xml')]
                all_same = True
                for xml_file in common_xml:
                    if z_before.read(xml_file) != z_after.read(xml_file):
                        all_same = False
                        break

                if all_same:
                    print("Files are identical")
                else:
                    print("Files differ (see above)")

        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def extract_text(element):
    """Extract text content from XML element."""
    texts = []
    for elem in element.iter():
        if elem.tag == f'{{{W_NS}}}t' and elem.text:
            texts.append(elem.text)
        elif elem.tag == f'{{{W_NS}}}p':
            texts.append('\n')
        elif elem.tag == f'{{{W_NS}}}tab':
            texts.append('\t')
    return ''.join(texts).strip()
