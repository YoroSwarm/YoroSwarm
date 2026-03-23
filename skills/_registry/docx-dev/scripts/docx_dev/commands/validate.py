"""
validate command - Validate DOCX structure and content.
Ported from C# ValidateCommand.cs
"""
import argparse
import json
import sys
from pathlib import Path
from lxml import etree
from zipfile import ZipFile

W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'


def validate_command(subparsers):
    parser = subparsers.add_parser('validate', help='Validate DOCX structure and content')
    parser.add_argument('--input', required=True, help='DOCX file to validate')
    parser.add_argument('--xsd', help='XSD schema path for XML validation')
    parser.add_argument('--business', action='store_true', help='Run business rule validation')
    parser.add_argument('--gate-check', dest='gate_check', help='Template DOCX for gate-check validation')
    parser.add_argument('--json', action='store_true', help='Output results as JSON')
    parser.set_defaults(handler=handle_validate)


def handle_validate(args):
    """Main handler for validate command."""
    input_path = Path(args.input)

    if not input_path.exists():
        print(f"File not found: {input_path}", file=sys.stderr)
        return 1

    errors = []
    warnings = []
    gate_passed = True
    gate_violations = []

    # XSD validation
    if args.xsd:
        xsd_errors = validate_xsd(input_path, args.xsd)
        errors.extend(xsd_errors)

    # Business rule validation
    if args.business:
        biz_errors, biz_warnings = validate_business_rules(input_path)
        errors.extend(biz_errors)
        warnings.extend(biz_warnings)

    # Gate check validation
    if args.gate_check:
        gate_passed, gate_violations = validate_gate_check(input_path, args.gate_check)

    is_valid = len(errors) == 0 and gate_passed

    if args.json:
        output = {
            'isValid': is_valid,
            'errors': errors,
            'warnings': warnings,
            'gateCheck': {
                'passed': gate_passed,
                'violations': gate_violations
            } if args.gate_check else None
        }
        print(json.dumps(output, indent=2))
    else:
        if errors:
            print(f"ERRORS ({len(errors)}):")
            for e in errors:
                loc = f" (line {e.get('line', 0)}:{e.get('position', 0)})" if e.get('line') else ""
                print(f"  [{e.get('severity', 'ERROR')}] {e.get('message', str(e))}{loc}")

        if warnings:
            print(f"WARNINGS ({len(warnings)}):")
            for w in warnings:
                print(f"  [{w.get('severity', 'WARNING')}] {w.get('message', str(w))}")

        if args.gate_check:
            print(f"GATE CHECK: {'PASSED' if gate_passed else 'FAILED'}")
            for v in gate_violations:
                print(f"  - {v}")

        print(f"Validation: {'PASSED' if is_valid else 'FAILED'}")

    if not is_valid:
        return 1
    return 0


def validate_xsd(docx_path, xsd_path):
    """Validate DOCX XML against XSD schema."""
    errors = []
    try:
        from lxml import etree
        schema_doc = etree.parse(xsd_path)
        schema = etree.XMLSchema(schema_doc)

        with ZipFile(docx_path, 'r') as z:
            for name in z.namelist():
                if name.endswith('.xml'):
                    try:
                        xml_doc = etree.fromstring(z.read(name))
                        schema.assertValid(xml_doc)
                    except etree.DocumentInvalid as e:
                        errors.append({
                            'severity': 'ERROR',
                            'message': str(e),
                            'file': name
                        })
                    except etree.XMLSyntaxError as e:
                        errors.append({
                            'severity': 'ERROR',
                            'message': f"XML syntax error: {e}",
                            'file': name
                        })
    except Exception as e:
        errors.append({
            'severity': 'ERROR',
            'message': f"XSD validation failed: {e}"
        })
    return errors


def validate_business_rules(docx_path):
    """Run business rule validation."""
    errors = []
    warnings = []

    try:
        with ZipFile(docx_path, 'r') as z:
            if 'word/document.xml' not in z.namelist():
                errors.append({
                    'severity': 'ERROR',
                    'message': 'Missing word/document.xml'
                })
                return errors, warnings

            doc = etree.fromstring(z.read('word/document.xml'))
            body = doc.find(f'{{{W_NS}}}body')

            if body is not None:
                # Check sectPr is last child of body
                children = list(body)
                sect_pr_elements = [c for c in children if c.tag == f'{{{W_NS}}}sectPr']
                if sect_pr_elements:
                    last_child = children[-1]
                    if last_child not in sect_pr_elements:
                        errors.append({
                            'severity': 'ERROR',
                            'message': 'sectPr must be the last child of w:body'
                        })

                # Check paragraph style ordering
                for p in body.iter(f'{{{W_NS}}}p'):
                    pPr = p.find(f'{{{W_NS}}}pPr')
                    if pPr is not None:
                        # pPr must come before any r elements
                        r_elements = [c for c in p if c.tag == f'{{{W_NS}}}r']
                        if r_elements:
                            pPr_index = list(p).index(pPr)
                            first_r_index = list(p).index(r_elements[0])
                            if pPr_index > first_r_index:
                                errors.append({
                                    'severity': 'ERROR',
                                    'message': 'w:pPr must come before w:r elements in w:p'
                                })

    except Exception as e:
        errors.append({
            'severity': 'ERROR',
            'message': f"Business rule validation error: {e}"
        })

    return errors, warnings


def validate_gate_check(docx_path, template_path):
    """Gate check validation against template."""
    violations = []

    # Basic structural checks
    try:
        with ZipFile(docx_path, 'r') as z_doc, ZipFile(template_path, 'r') as z_template:
            doc_files = set(z_doc.namelist())
            template_files = set(z_template.namelist())

            # Check required files exist
            required = ['word/document.xml', '[Content_Types].xml']
            for req in required:
                if req not in doc_files:
                    violations.append(f"Missing required file: {req}")

            # Check style count is reasonable
            if 'word/styles.xml' in doc_files and 'word/styles.xml' in template_files:
                doc_styles = etree.fromstring(z_doc.read('word/styles.xml'))
                template_styles = etree.fromstring(z_template.read('word/styles.xml'))

                doc_style_count = len(list(doc_styles.iter(f'{{{W_NS}}}style')))
                template_style_count = len(list(template_styles.iter(f'{{{W_NS}}}style')))

                if doc_style_count < template_style_count * 0.5:
                    violations.append(f"Style count ({doc_style_count}) significantly lower than template ({template_style_count})")

    except Exception as e:
        violations.append(f"Gate check error: {e}")

    return len(violations) == 0, violations
