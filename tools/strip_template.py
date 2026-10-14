"""Make src/render/template.docx: the Word template with its body emptied.

Usage: python3 -I tools/strip_template.py <source.docx> <out.docx>
Keeps styles, theme, numbering, header and contact-icon media; removes all
resume text and external hyperlink relationships so nothing personal ships
in the public bundle. The generator writes the body back in.
"""
import re
import sys
import zipfile

src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == "word/document.xml":
            xml = data.decode("utf-8")
            sect = re.findall(r"<w:sectPr.*?</w:sectPr>", xml, re.S)[-1]
            xml = re.sub(r"<w:body>.*</w:body>", "<w:body>{{BODY}}" + sect + "</w:body>", xml, flags=re.S)
            data = xml.encode("utf-8")
        elif item.filename == "word/_rels/document.xml.rels":
            xml = data.decode("utf-8")
            xml = re.sub(r'<Relationship [^>]*TargetMode="External"/>', "", xml)
            data = xml.encode("utf-8")
        elif item.filename == "docProps/core.xml":
            xml = data.decode("utf-8")
            xml = re.sub(r"<dc:title>.*?</dc:title>", "<dc:title></dc:title>", xml)
            data = xml.encode("utf-8")
        zout.writestr(item, data)
