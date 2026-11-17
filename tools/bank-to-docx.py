# 用法：python3 tools/bank-to-docx.py <輸出.docx> <題庫1.json> [題庫2.json ...]
import json, sys
from docx import Document
from docx.shared import Pt
from docx.oxml.ns import qn

out, files = sys.argv[1], sys.argv[2:]
doc = Document()
style = doc.styles['Normal']
style.font.name = 'Microsoft JhengHei'
style.element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft JhengHei')
style.font.size = Pt(10)
doc.add_heading('健康社會行為學 課堂搶答題庫（審閱用）', level=0)
L = 'ABCD'
for f in files:
    bank = json.load(open(f, encoding='utf-8'))
    doc.add_heading(f"{bank['ep']} {bank['title']}（{len(bank['questions'])} 題）", level=1)
    t = doc.add_table(rows=1, cols=7)
    t.style = 'Table Grid'
    for c, h in zip(t.rows[0].cells, ['題號', '題幹與選項', '答案', '詳解', '限時', '概念', '出處']):
        c.text = h
    for i, q in enumerate(bank['questions'], 1):
        row = t.add_row().cells
        row[0].text = str(i)
        row[1].text = q['q'] + '\n' + '\n'.join(f"({L[k]}) {o}" for k, o in enumerate(q['options']))
        row[2].text = L[q['answer']]
        row[3].text = q['explanation']
        row[4].text = f"{q['timeLimit']} 秒"
        row[5].text = q['concept']
        row[6].text = q['source']
doc.save(out)
print('saved', out)
