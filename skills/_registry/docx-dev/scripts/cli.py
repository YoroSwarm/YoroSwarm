#!/usr/bin/env python3
"""
docx-dev: Python CLI for OpenXML document generation and manipulation.
A port of the C# minimax-docx skill to Python using python-docx and lxml.
"""
import sys
import argparse
from pathlib import Path

# Import commands
from docx_dev.commands.analyze import analyze_command
from docx_dev.commands.create import create_command
from docx_dev.commands.edit import edit_command
from docx_dev.commands.validate import validate_command
from docx_dev.commands.diff import diff_command
from docx_dev.commands.fix_order import fix_order_command
from docx_dev.commands.merge_runs import merge_runs_command
from docx_dev.commands.apply_template import apply_template_command


def main():
    parser = argparse.ArgumentParser(
        description="docx-dev: OpenXML document generation and manipulation CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # Add subcommands
    create_command(subparsers)
    edit_command(subparsers)
    apply_template_command(subparsers)
    validate_command(subparsers)
    merge_runs_command(subparsers)
    fix_order_command(subparsers)
    analyze_command(subparsers)
    diff_command(subparsers)

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(1)

    # Command handlers are responsible for sys.exit on error
    args.handler(args)


if __name__ == '__main__':
    main()
