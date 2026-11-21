# Projet jeu — salles Blender (pour Unity)

## Règles de travail

- **Toujours répondre en français.**
- **Avant chaque modification**, expliquer ce que j'ai compris de la demande et **attendre l'accord explicite** de l'utilisateur avant d'agir.
- **Ne faire que les modifications demandées** : aucune initiative, aucun « tant que j'y suis ».
- **Ne rien fusionner** : les objets restent séparés, sauf demande explicite.

## Règles de modélisation

- **Maillage** : aucun trait ni arête inutile. Uniquement les arêtes nécessaires à la forme (pas de diagonales, pas de découpes superflues). Le nombre de faces n'est pas limité, ce sont les arêtes superflues qu'on évite.
- **Prêt pour les textures** (elles seront ajoutées plus tard) : UV propres à l'échelle réelle (1 m = 1 m de texture), échelle et rotations appliquées (échelle = 1), normales vers l'extérieur, aucune face superposée, faces plates pour la pierre et lissage seulement sur les courbes. Éviter tout outil ou procédé qui rendrait la texture étirée ou cassée.
- **Unités** : mètres, 1 unité Blender = 1 m.
- **Noms** : utiliser exactement les noms donnés par l'utilisateur ; ne jamais inventer de nom sans demander.

## Projet

- Jeu en semi-monde ouvert pour **Unity** : chaque salle est un fichier Blender séparé ; on passe d'une salle à l'autre par téléportation depuis une carte.
- Direction artistique : château en pierre unie (piliers, bandes horizontales, arrondis, arches avec moulures).
