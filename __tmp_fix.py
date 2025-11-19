from pathlib import Path
path = Path('lib/law-xml-parser.tsx')
text = path.read_text(encoding='utf-8')
old = '  t = t.replace(/(?<!\u300d\s)��\s*([0-9]{1,4})\s*��(��\s*([0-9]{1,2}))?(?![��\d])/g, (m) => {'
new = '  t = t.replace(/(?<!data-article="\")(?<!data-article=\')(?![])/g, (m) => {'
if old not in text:
    raise SystemExit('old pattern not found')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
