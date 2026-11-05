# Unity
## Prototype : pièce 3D vide + avatar

- **Jouer tout de suite** : la page publiée, ou `Web/play.html` dans un navigateur connecté à Internet (Three.js est chargé depuis cdnjs).
  ZQSD / WASD pour bouger, glisser la souris ou ← → pour tourner la caméra, molette pour zoomer ;
  sur téléphone, doigt à gauche pour bouger, doigt à droite pour tourner.
- **Dans Unity** : ouvrir le projet, appuyer sur Play. `Assets/Scripts/RoomPrototype.cs` crée la pièce 3D, la lumière,
  la caméra à la 3e personne et l'avatar (sprite face caméra) à partir de `Assets/Resources/avatar_sheet.png`.
- **Textures** : `python3 Tools/generate_textures.py` (briques et pavés pixel art raccordables, répétés tous les 2 m).
- **Avatar** : `python3 Tools/import_avatar.py` découpe la planche `Assets/Art/Source/avatar_source.png`.
- **Page web** : `python3 Tools/build_web.py` (code du jeu dans `Tools/web/game.js`).

## Versions

À chaque modification, une copie figée de la version précédente est gardée dans `Web/versions/`
(et publiée à part), puis la version de travail `Web/piece-3d-v2.html` est mise à jour.
