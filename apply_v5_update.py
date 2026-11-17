#!/usr/bin/env python3
"""Apply the V5 feature add-on without replacing existing V5 source modules.
Run from the repository root (next to index.html). Requires only Python 3.
"""
from pathlib import Path
import sys

root = Path(__file__).resolve().parent
index = root / "index.html"
css = root / "css" / "v5-enhancements.css"
js = root / "js" / "v5-enhancements.js"

if not index.is_file():
    sys.exit("ERROR: ไม่พบ index.html — กรุณาวางไฟล์ชุดนี้ในโฟลเดอร์หลักของ Insulator-AI-V5")
if not js.is_file() or not css.is_file():
    sys.exit("ERROR: ต้องมี js/v5-enhancements.js และ css/v5-enhancements.css")

html = index.read_text(encoding="utf-8-sig")
label_old = '<label for="units">จำนวนลูกถ้วยจริงบนเสานี้ (ปรับได้ ไม่จำกัดไว้ 3 ลูก)</label>'
label_new = '<label for="units">ระบุจำนวนลูกถ้วย</label>'
css_tag = '<link rel="stylesheet" href="css/v5-enhancements.css?v=20261117">'
script_tag = '<script src="js/v5-enhancements.js?v=20261117"></script>'
bootstrap_tag = '<script src="js/bootstrap.js"></script>'

checks = [
    (label_old in html or label_new in html, "ไม่พบ Label จำนวนลูกถ้วยตาม V5 ปัจจุบัน"),
    ("</head>" in html, "ไม่พบ </head>"),
    (bootstrap_tag in html, "ไม่พบ js/bootstrap.js ของ V5 ปัจจุบัน"),
]
for passed, problem in checks:
    if not passed:
        sys.exit("ERROR: " + problem + " — ไม่มีการแก้ไขไฟล์")

updated = html.replace(label_old,label_new)
if 'css/v5-enhancements.css' not in updated:
    updated = updated.replace('</head>', css_tag+'\n</head>', 1)
if 'js/v5-enhancements.js' not in updated:
    updated = updated.replace(bootstrap_tag,bootstrap_tag+'\n'+script_tag,1)

if updated == html:
    print('ติดตั้งอยู่แล้ว ไม่มีการเปลี่ยนแปลงเพิ่ม')
else:
    backup = root / 'index.html.pre_enhancement.bak'
    if not backup.exists():
        backup.write_text(html,encoding='utf-8')
    index.write_text(updated,encoding='utf-8')
    print('อัปเดต index.html สำเร็จ')
    print('สำรองต้นฉบับไว้ที่ index.html.pre_enhancement.bak')
print('ตรวจสอบไฟล์ที่ต้องอัปโหลด: index.html, css/v5-enhancements.css, js/v5-enhancements.js')
