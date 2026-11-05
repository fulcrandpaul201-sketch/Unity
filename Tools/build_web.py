"""Construit le prototype jouable : Web/artifact.html (page publiée) et Web/play.html (fichier autonome)."""
import base64, os
os.chdir(os.path.join(os.path.dirname(__file__), ".."))
b64 = lambda p: base64.b64encode(open(p, "rb").read()).decode()
script = (open("Tools/web/game.js").read().replace("{{AVATAR}}", b64("Assets/Resources/avatar_sheet.png"))
          .replace("{{BRICK}}", b64("Assets/Resources/tex_brick.png")).replace("{{FLOOR}}", b64("Assets/Resources/tex_floor.png"))
)
page = open("Tools/web/page.html").read().replace("{{SCRIPT}}", script)
open("Web/piece-3d-v2.html", "w").write(page)   # version de travail publiée
# Web/versions/ : copies figées des versions précédentes, à ne pas modifier
open("Web/play.html", "w").write('<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n'
    + page + '</body>\n</html>\n')
print("ok")
