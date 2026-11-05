# Unity
## Prototype : salle vide + avatar

- **Jouer tout de suite** : ouvrir `Web/play.html` dans un navigateur (flèches / ZQSD / WASD, ou glisser au doigt).
- **Dans Unity** : ouvrir le projet, appuyer sur Play. `Assets/Scripts/RoomPrototype.cs` crée la salle,
  la caméra et l'avatar automatiquement à partir des images de `Assets/Resources/`.
- **Régénérer les images** : `python3 Tools/generate_room.py`, `python3 Tools/import_avatar.py` (découpe ta planche `Assets/Art/Source/avatar_source.png`), puis `python3 Tools/build_web.py`.
