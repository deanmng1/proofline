"""Compatibility entrypoint for regenerating the browser deck's PDF.

Requires Node, project Playwright dependencies, and a local Chromium installation.
"""
from pathlib import Path
import subprocess

if __name__ == "__main__":
    subprocess.run(["node", str(Path(__file__).with_suffix(".mjs"))], check=True)
