"""Construit Web/play.html (prototype jouable autonome, images intégrées en base64)."""
import base64, os
os.chdir(os.path.join(os.path.dirname(__file__), ".."))
b64 = lambda p: base64.b64encode(open(p, "rb").read()).decode()
html = open("Tools/play_template.html").read()
html = html.replace("{{ROOM}}", b64("Assets/Resources/room_empty.png")).replace("{{AVATAR}}", b64("Assets/Resources/avatar_sheet.png"))
open("Web/play.html", "w").write(html)
print("ok")
