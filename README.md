# Unity
## Prototype : salle carrée + avatar

- **Jouer tout de suite** : la page publiée, ou `Web/play.html` dans un navigateur (flèches / ZQSD / WASD, ou glisser au doigt).
- **Dans Unity** : ouvrir le projet, appuyer sur Play. `Assets/Scripts/RoomPrototype.cs` crée la salle carrée (vue de dessus,
  sans texture), la caméra et l'avatar automatiquement à partir de `Assets/Resources/avatar_sheet.png`.
- **Avatar** : `python3 Tools/import_avatar.py` découpe la planche `Assets/Art/Source/avatar_source.png`.
- **Page web** : `python3 Tools/build_web.py` (code du jeu dans `Tools/web/game.js`).
