"""Build the vector presentation from retained, audited reference measurements.

Usage: python3 docs/showcase/build_overview.py
Requires ReportLab. Render QA is deliberately separate from authoring.
"""
from pathlib import Path
import json
import math

from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle

HERE = Path(__file__).resolve().parent
W, H = 960, 600
INK, MUTED = '#142B43', '#52657A'
BLUE, TEAL, GOLD = '#2563EB', '#07897E', '#BD7813'
PAPER, PALE, LINE = '#F8FAFD', '#EAF0F8', '#D6E0EB'
WHITE, PURPLE = '#FFFFFF', '#7656B3'
FONT_DIR = Path('/System/Library/Fonts/Supplemental')
for name, file in [('Body', 'Arial.ttf'), ('Strong', 'Arial Bold.ttf')]:
    if (FONT_DIR / file).exists():
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))
    else:
        from reportlab.pdfbase.pdfmetrics import Font
        pdfmetrics.registerFont(Font(name, 'Helvetica-Bold' if name == 'Strong' else 'Helvetica', 'WinAnsiEncoding'))


def color(v):
    return HexColor(v)


def text(c, x, y, s, size=16, fill=INK, bold=False):
    c.setFillColor(color(fill))
    c.setFont('Strong' if bold else 'Body', size)
    c.drawString(x, H-y-size*.82, str(s))


def para(c, x, y, s, width, size=17, fill=MUTED, leading=None, bold=False):
    style = ParagraphStyle('p', fontName='Strong' if bold else 'Body',
                           fontSize=size, leading=leading or size*1.4,
                           textColor=color(fill), spaceAfter=0)
    p = Paragraph(s, style)
    _, height = p.wrap(width, H)
    p.drawOn(c, x, H-y-height)
    return height


def box(c, x, y, w, h, fill=WHITE, stroke=None, radius=14):
    c.setFillColor(color(fill))
    c.setStrokeColor(color(stroke or fill))
    c.setLineWidth(1)
    c.roundRect(x, H-y-h, w, h, radius, stroke=bool(stroke), fill=1)


def line(c, x1, y1, x2, y2, fill=LINE, width=2):
    c.setStrokeColor(color(fill))
    c.setLineWidth(width)
    c.line(x1, H-y1, x2, H-y2)


def arrow(c, x1, y1, x2, y2, fill=BLUE, width=2):
    line(c, x1, y1, x2, y2, fill, width)
    a = math.atan2(y2-y1, x2-x1)
    for delta in [-.5, .5]:
        line(c, x2, y2, x2-9*math.cos(a+delta), y2-9*math.sin(a+delta), fill, width)


def dot(c, x, y, r, fill):
    c.setFillColor(color(fill))
    c.circle(x, H-y, r, stroke=0, fill=1)


def page(c, n, section, title, subtitle=None):
    c.setFillColor(color(PAPER))
    c.rect(0, 0, W, H, stroke=0, fill=1)
    c.bookmarkPage(f'page{n}')
    c.addOutlineEntry(section, f'page{n}', level=0)
    text(c, 48, 30, 'PROOFLINE', 11, BLUE, True)
    text(c, 176, 30, section.upper(), 10, MUTED)
    text(c, 48, 75, title, 34, INK, True)
    if subtitle:
        para(c, 48, 125, subtitle, 860, 17)
    text(c, 48, 567, 'Reference implementation  |  4dc77a6  |  04 Nov 2026', 9, MUTED)
    text(c, 832, 567, f'{n:02d} / 08', 10, MUTED, True)
    if n > 1:
        c.linkRect('', f'page{n-1}', (781, 12, 805, 38), relative=0, thickness=0)
        text(c, 784, 568, '<', 10, MUTED)
    if n < 8:
        c.linkRect('', f'page{n+1}', (891, 12, 918, 38), relative=0, thickness=0)
        text(c, 899, 568, '>', 10, MUTED)


def note(c, s):
    para(c, 48, 527, s, 860, 10, MUTED, 13)


def coverage_rows(data):
    # Measurements are frozen in JSON so presentation regeneration never substitutes
    # a later run's numbers for the tested reference snapshot.
    labels = {
        'packages/service-bus': 'Event delivery',
        'packages/policy-service': 'Policy commands',
        'packages/policy-state-service': 'Policy projections',
        'packages/finance-service': 'Finance',
        'packages/insurance-runtime': 'Workflow runtime',
        'packages/api-contracts': 'API contracts',
        'tools/impact': 'Harness governance',
        'tools/proofline': 'Execution safeguards',
    }
    rows = []
    for group in data['governanceCoverageGroups']:
        covered = sum(f['metrics']['lines']['covered'] for f in group['files'])
        total = sum(f['metrics']['lines']['total'] for f in group['files'])
        rows.append({'label': labels[group['workspace']], 'percent': 100*covered/total})
    return rows


def build():
    data = json.loads((HERE / 'measurements.json').read_text())
    out = HERE / 'proofline-overview.pdf'
    c = canvas.Canvas(str(out), pagesize=(W, H), pageCompression=1)
    c.setTitle('Proofline | A visual introduction')
    c.setAuthor('Proofline')
    c.setCreator('Proofline document generator')
    c.setSubject('Portable regression testing: capabilities, architecture and observed evidence')

    # 1. A newcomer should understand the noun before meeting the mechanisms.
    page(c, 1, 'A visual introduction', 'Confidence in every change.')
    para(c, 48, 145, '<b>Proofline is a reusable testing harness for web apps built with React/Vite.</b>', 480, 24, INK, 32)
    para(c, 48, 241, 'It brings automated checks, realistic user journeys, and release evidence into one repeatable workflow.', 448, 20, MUTED, 29)
    para(c, 48, 350, 'A harness coordinates how tests are configured, run, isolated, and checked as your application changes.', 442, 16, MUTED, 24)
    for i, (a, b, col) in enumerate([
        ('RULES', 'Does the result stay correct?', BLUE),
        ('JOURNEYS', 'Can a user finish the task?', TEAL),
        ('EVIDENCE', 'Can we explain the result?', PURPLE),
    ]):
        y = 157+i*100
        box(c, 560, y, 350, 85, WHITE, LINE)
        dot(c, 587, y+29, 5, col)
        text(c, 606, y+19, a, 12, col, True)
        text(c, 584, y+46, b, 18, INK, True)
        if i < 2:
            line(c, 734, y+87, 734, y+104, LINE, 2)
    box(c, 48, 452, 862, 47, PALE)
    text(c, 68, 467, 'The payoff: agreed behavior becomes checks you can run again on every change.', 17, INK, True)
    note(c, 'The insurance CRM is the reference proof. The harness is designed to be adapted to other React/Vite applications.')
    c.showPage()

    # 2. Introduce the value and authoring/execution boundary without tool jargon.
    page(c, 2, 'The everyday value', 'Turn agreed behavior into lasting checks.',
         'Once a behavior is captured in a test, each code change can be checked against it again.')
    steps = [
        ('01', 'Describe', 'Your rules, users, and important tasks.', BLUE),
        ('02', 'Capture', 'Write deterministic automated checks.', BLUE),
        ('03', 'Repeat', 'Run the checks as the code changes.', TEAL),
        ('04', 'Explain', 'Keep results, reasons, and failure traces.', PURPLE),
    ]
    for i, (num, title, body, col) in enumerate(steps):
        x = 48+i*220
        box(c, x, 222, 202, 200, WHITE, LINE)
        text(c, x+20, 240, num, 14, col, True)
        text(c, x+20, 282, title, 25, INK, True)
        para(c, x+20, 327, body, 163, 17)
        if i < 3:
            arrow(c, x+205, 317, x+217, 317, BLUE, 1.5)
    para(c, 48, 458, '<b>An agent can help author and adapt the tests.</b> Continuous integration (CI) runs the saved tests using deterministic commands, with no model call in test execution.', 860, 18, INK, 26)
    note(c, 'Deterministic means the same controlled inputs produce the same expected result. The reference tests use local fakes rather than live providers.')
    c.showPage()

    # 3. A simple architecture map shows the harness around an application.
    page(c, 3, 'How it fits', 'One harness. Two kinds of proof.',
         'Focused tests check individual behavior. Browser journeys check how the visible application works together.')
    box(c, 48, 214, 232, 270, INK)
    text(c, 70, 239, 'YOUR APPLICATION', 12, '#B7CCF1', True)
    para(c, 70, 276, 'Routes<br/>Business rules<br/>APIs and providers<br/>Roles and tenants', 184, 20, WHITE, 34)
    arrow(c, 287, 348, 324, 348, BLUE)
    box(c, 335, 214, 575, 72, PALE)
    text(c, 357, 230, 'Portable contracts + guarded runners', 21, INK, True)
    text(c, 357, 261, 'Declare what runs, what it owns, and how it stays isolated.', 14, MUTED)
    for x, title, body, col in [
        (335, 'Focused tests', 'Calculations, services, APIs,<br/>permissions, and UI behavior.', BLUE),
        (631, 'Browser journeys', 'Login, navigation, cross-screen<br/>state, and recovery.', TEAL),
    ]:
        box(c, x, 311, 279, 113, WHITE, LINE)
        text(c, x+20, 330, title, 22, col, True)
        para(c, x+20, 365, body, 242, 15, MUTED, 23)
        arrow(c, x+138, 430, x+138, 449, col)
    box(c, 335, 454, 575, 43, '#EDE9F5')
    text(c, 355, 466, 'Coverage checks + reports + append-only execution history', 16, PURPLE, True)
    note(c, 'The manifest is a checked-in configuration contract. Vitest runs focused tests; Playwright runs browser journeys.')
    c.showPage()

    # 4. The CRM is a concrete example, not the definition of the portable core.
    page(c, 4, 'A real example', 'Follow the journey a user actually takes.',
         'The CRM reference proves a complete path through visible controls and navigation.')
    journey = [
        ('Sign in', 'Open a protected link;<br/>return after login.'),
        ('Create', 'Add a customer,<br/>property, and quote.'),
        ('Bind', 'Create a policy;<br/>inspect its detail.'),
        ('Finance', 'Record a payment;<br/>see the ledger.'),
        ('Sign out', 'Revisit the protected<br/>route and be denied.'),
    ]
    for i, (title, body) in enumerate(journey):
        x = 48+i*175
        dot(c, x+74, 245, 25, BLUE if i < 3 else TEAL)
        text(c, x+69, 235, i+1, 22, WHITE, True)
        if i < 4:
            arrow(c, x+105, 245, x+171, 245, LINE)
        text(c, x, 298, title, 24, INK, True)
        para(c, x, 338, body, 158, 16, MUTED, 25)
    box(c, 48, 437, 862, 63, PALE)
    para(c, 68, 451, '<b>Beyond a screenshot:</b> the journey also checks that the policy, finance, and event state match the visible outcome.', 822, 18, INK, 26)
    note(c, 'Source: the executable golden workflow. Separate reference journeys cover response-loss recovery, access denial, tenant separation, and refund/correction.')
    c.showPage()

    # 5. Translate mechanisms to failure modes a non-specialist can understand.
    page(c, 5, 'What it can catch', 'Protect the behavior people depend on.',
         'The reference implementation demonstrates checks across business behavior and testing boundaries.')
    items = [
        ('Correct results', 'Rules, calculations, and API<br/>results stay correct.', BLUE),
        ('Safe recovery', 'A retry does not create a second<br/>policy or duplicate ledger result.', TEAL),
        ('Access boundaries', 'Roles and tenants cannot read or<br/>change data they do not own.', BLUE),
        ('Independent tests', 'Fresh scenario state prevents one<br/>test from contaminating another.', TEAL),
        ('Controlled requests', 'Undeclared requests fail; declared<br/>providers use deterministic fakes.', PURPLE),
        ('Production separation', 'Test-only adapters must be absent<br/>from the production build.', PURPLE),
    ]
    for i, (title, body, col) in enumerate(items):
        x, y = 48+(i%3)*295, 215+(i//3)*143
        box(c, x, y, 272, 124, WHITE, LINE)
        dot(c, x+21, y+25, 4, col)
        text(c, x+35, y+15, title, 20, INK, True)
        para(c, x+20, y+53, body, 236, 15, MUTED, 23)
    note(c, 'These checks prove declared scenarios and boundaries. Each new application needs its own rules, adapters, and tests.')
    c.showPage()

    # 6. Show governed coverage with an honest denominator, never a quality score.
    page(c, 6, 'Measured protection', 'Coverage is measured. Baselines cannot slip.',
         'Coverage records which code tests execute. Approved minimums may rise; ordinary changes cannot lower them.')
    rows = coverage_rows(data)
    for i, row in enumerate(rows):
        y = 211+i*34
        text(c, 48, y+2, row['label'], 15, INK)
        box(c, 237, y, 391, 18, PALE, radius=5)
        box(c, 237, y, 391*row['percent']/100, 18, TEAL, radius=5)
        text(c, 646, y, f"{row['percent']:.1f}%", 16, INK, True)
    text(c, 237, 490, 'COVERED CODE LINES IN GOVERNED FILES, GROUPED BY COMPONENT', 9, MUTED, True)
    box(c, 747, 210, 163, 274, INK)
    text(c, 770, 236, '32', 55, WHITE, True)
    para(c, 770, 304, 'critical rules<br/>in the registry', 117, 17, WHITE, 25)
    text(c, 770, 382, '8 / 8', 36, '#65D9C4', True)
    para(c, 770, 432, 'governed groups<br/>passed', 123, 13, WHITE, 19)
    note(c, 'Bars: covered lines / instrumented lines for the 12 classified source files, grouped by the manifest. Exclusions apply; this is not whole-application or browser coverage. The gate checks lines, branches, functions, and statements per file.')
    c.showPage()

    # 7. Different workload timings remain separate observations, never a speedup.
    page(c, 7, 'Observed execution', 'Repeatable checks, with visible results.',
         'Two retained local gate passes provide a reference baseline for what ran.')
    pass2 = next(p for p in data['officialPassMeasurements'] if p['pass'] == 2)
    labels = {
        'canonical-full-browser': 'Complete Chromium suite',
        'canonical-full-two-worker-scenario': 'Isolation checks, two workers',
        'canonical-full-scenario-shard-1': 'Split run: part 1 of 2',
        'canonical-full-scenario-shard-2': 'Split run: part 2 of 2',
    }
    timings = [(labels[r['role']], f"{r['testsPassed']} tests", r['durationSeconds'])
               for r in pass2['browserReporterRuns'] if r['role'] in labels]
    # Use a single observed execution per workload: canonical-full Pass 2.
    for i, (label, count, seconds) in enumerate(timings):
        y = 221+i*58
        text(c, 48, y, label, 17, INK, True)
        text(c, 48, y+25, count, 13, MUTED)
        box(c, 320, y+5, 340, 19, PALE, radius=5)
        box(c, 320, y+5, 340*seconds/16, 19, BLUE if i == 0 else TEAL, radius=5)
        text(c, 680, y+3, f'{seconds:.1f} s', 19, INK, True)
    box(c, 772, 217, 138, 236, WHITE, LINE)
    text(c, 792, 240, '404', 40, BLUE, True)
    para(c, 792, 294, 'unit tests<br/>in 45 files', 102, 15, INK, 23)
    text(c, 792, 367, '2', 32, TEAL, True)
    para(c, 792, 408, 'full local<br/>gate passes', 102, 13, INK, 19)
    para(c, 48, 478, 'If a change cannot be mapped safely, selection expands to the full declared suites. Invalid execution metadata blocks the run.', 860, 15, INK, 21)
    note(c, 'Timings: canonical-full Pass 2 runner-reported wall time; builds excluded. Different workloads, not a speedup comparison. The 24 scenario tests are included in the 43-test suite; shards repeat those same scenarios. Local results vary by machine.')
    c.showPage()

    # 8. Close with clear adoption value and truthful scope.
    page(c, 8, 'Make it yours', 'Bring your app. Reuse the testing discipline.',
         'Proofline is a repository-native starting point for another React/Vite application.')
    for x, title, body, col in [
        (48, 'Reuse the harness', 'Manifest + validators<br/>Guarded execution<br/>Change-aware diagnostics<br/>Coverage + evidence policies', BLUE),
        (493, 'Adapt to your product', 'Routes + user journeys<br/>Business rules + API contracts<br/>Roles + tenant boundaries<br/>Test data + provider fakes', TEAL),
    ]:
        box(c, x, 212, 417, 201, WHITE, LINE)
        text(c, x+23, 235, title, 25, col, True)
        para(c, x+23, 282, body, 371, 18, MUTED, 29)
    para(c, 48, 437, '<b>Current scope:</b> the complete declared browser suite runs in Chromium; Firefox/WebKit offer optional smoke checks. This is tooling in a repository. Adapting the contracts and tests requires engineering work.', 860, 15, INK, 23)
    box(c, 48, 501, 862, 34, PALE, radius=8)
    text(c, 64, 511, 'Go deeper: TECHNICAL_GUIDE.md  |  diagrams, commands, measurements, source evidence', 13, BLUE, True)
    c.linkURL('TECHNICAL_GUIDE.md', (48, H-535, 910, H-501), relative=1, thickness=0)
    c.showPage()
    c.save()
    print(out)


if __name__ == '__main__':
    build()
