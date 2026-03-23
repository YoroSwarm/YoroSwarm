---
name: docx-dev
description: Professional DOCX document creation, editing, and formatting using Python (python-docx + lxml). Three pipelines: create from scratch, fill/edit content, apply template with XSD validation. Use for reports, proposals, contracts, forms, reformatting.
license: MIT
metadata:
  version: "1.0"
  category: document-processing
  sources:
    - ECMA-376 Office Open XML File Formats
    - GB/T 9704-2012 Layout Standard for Official Documents
    - IEEE / ACM / APA / MLA / Chicago / Turabian Style Guides
    - Springer LNCS / Nature / HBR Document Templates
triggers:
  - Word
  - docx
  - document
  - 文档
  - Word文档
  - 报告
  - 合同
  - 公文
  - 排版
  - 套模板
---

# docx-dev

Create, edit, and format DOCX documents via Python CLI using python-docx and lxml.

## Setup

```bash
cd /path/to/docx-dev/scripts
pip install python-docx lxml
```

Verify environment:
```bash
python3 docx_dev/commands/analyze.py --help
```

## Quick Start

### Create a new document
```bash
python3 -m docx_dev.cli create \
  --output report.docx \
  --type report \
  --title "Q3 Strategy Review" \
  --author "Strategy Team" \
  --page-size a4 \
  --page-numbers
```

### Analyze existing document
```bash
python3 -m docx_dev.cli analyze --input document.docx
python3 -m docx_dev.cli analyze --input document.docx --json
```

### Edit document content
```bash
# Replace text
python3 -m docx_dev.cli edit replace-text \
  --input in.docx --output out.docx \
  --find "OLD" --replace "NEW"

# Fill placeholders
python3 -m docx_dev.cli edit fill-placeholders \
  --input in.docx --output out.docx \
  --data '{"name":"John","date":"2024-01-15"}'

# Fill table
python3 -m docx_dev.cli edit fill-table \
  --input in.docx --output out.docx \
  --data '[{"product":"Widget","qty":100,"price":9.99}]'
```

### Validate document
```bash
python3 -m docx_dev.cli validate \
  --input document.docx \
  --xsd assets/xsd/wml-subset.xsd \
  --business

# Gate check against template
python3 -m docx_dev.cli validate \
  --input out.docx \
  --gate-check template.docx
```

### Diff two documents
```bash
python3 -m docx_dev.cli diff --before before.docx --after after.docx
```

### Fix XML element ordering
```bash
python3 -m docx_dev.cli fix-order --input document.docx --output fixed.docx
python3 -m docx_dev.cli fix-order --input document.docx --dry-run
```

### Merge adjacent runs
```bash
python3 -m docx_dev.cli merge-runs --input document.docx --output merged.docx
```

### Apply template
```bash
python3 -m docx_dev.cli apply-template \
  --input source.docx \
  --template template.docx \
  --output styled.docx
```

## Pipeline Routing

```
User task
├─ No input file → Pipeline A: CREATE
│   signals: "write", "create", "draft", "generate", "new", "make a report/proposal/memo"
│   → Read references/scenario_a_create.md
│
└─ Has input .docx
    ├─ Replace/fill/modify content → Pipeline B: FILL-EDIT
    │   signals: "fill in", "replace", "update", "change text", "add section", "edit"
    │   → Read references/scenario_b_edit_content.md
    │
    └─ Reformat/apply style/template → Pipeline C: FORMAT-APPLY
        signals: "reformat", "apply template", "restyle", "match this format", "套模板", "排版"
        → Read references/scenario_c_apply_template.md
```

## Reference Documents

| File | When |
|------|------|
| `references/scenario_a_create.md` | Pipeline A: creating from scratch |
| `references/scenario_b_edit_content.md` | Pipeline B: editing existing content |
| `references/scenario_c_apply_template.md` | Pipeline C: applying template formatting |
| `references/typography_guide.md` | Font pairing, sizes, spacing, page layout |
| `references/cjk_typography.md` | CJK fonts, 字号 sizes, GB/T 9704 公文 standard |
| `references/openxml_element_order.md` | XML element ordering rules |
| `references/openxml_units.md` | Unit conversion: DXA, EMU, half-points |

## Critical Rules

### Element Order (prevents corruption)

| Parent | Order |
|--------|-------|
| `w:p`  | `pPr` → runs |
| `w:r`  | `rPr` → `t`/`br`/`tab` |
| `w:tbl`| `tblPr` → `tblGrid` → `tr` |
| `w:tr` | `trPr` → `tc` |
| `w:tc` | `tcPr` → `p` (min 1 `<w:p/>`) |
| `w:body` | block content → `sectPr` (LAST child) |

### Font Size

`w:sz` = points × 2 (12pt → `sz="24"`). Margins/spacing in DXA (1 inch = 1440, 1cm ≈ 567).

## Dependencies

- Python 3.9+
- python-docx — document creation/editing
- lxml — XSD validation and XML manipulation

## Assets

XSD schemas and style templates are in the `assets/` directory:
- `assets/xsd/wml-subset.xsd` — WordprocessingML schema
- `assets/xsd/business-rules.xsd` — Business rule validation
- `assets/styles/` — Pre-defined style sets (academic, corporate, default)
