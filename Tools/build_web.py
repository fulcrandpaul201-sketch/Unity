"""Construit le prototype jouable : Web/artifact.html (page publiée) et Web/play.html (fichier autonome)."""
import base64, os
os.chdir(os.path.join(os.path.dirname(__file__), ".."))
avatar = base64.b64encode(open("Assets/Resources/avatar_sheet.png", "rb").read()).decode()
script = open("Tools/web/game.js").read().replace("{{AVATAR}}", avatar)
page = open("Tools/web/page.html").read().replace("{{SCRIPT}}", script)
open("Web/artifact.html", "w").write(page)
open("Web/play.html", "w").write('<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n'
    + page + '</body>\n</html>\n')
print("ok")
