<div align="center">

<img src="./AutoBot.svg" alt="Auto-Bot" width="140">

# Auto-Bot

### Automatisation de bureau visuelle

Créez et exécutez des workflows d'automatisation grâce à un éditeur visuel basé sur des nœuds.

<br>

[🇬🇧 English](README.md)

[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri\&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-000000?logo=rust\&logoColor=white)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react\&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript\&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## À propos

**Auto-Bot** est une application d'automatisation de bureau visuelle créée pour répondre à un besoin personnel.

Le projet permet de créer des workflows en connectant des nœuds visuels plutôt qu'en écrivant des scripts d'automatisation traditionnels.

Il combine :

* un éditeur visuel basé sur des nœuds ;
* un moteur d'exécution écrit en Rust ;
* l'automatisation native de la souris et du clavier ;
* des variables et structures de contrôle ;
* des fonctions personnalisées réutilisables ;
* la capture d'écran et l'analyse d'images.

Ce dépôt est publié tel quel pour toute personne susceptible de trouver le projet utile.

---

## 🌍 Traductions et internationalisation

Auto-Bot dispose d'un système de traduction conçu pour être facilement étendu et modifié.

Les fichiers de traduction sont volontairement simples à comprendre et peuvent être adaptés sans modifier la logique principale de l'application.

Une nouvelle langue peut être ajoutée en créant un nouveau fichier de traduction et en traduisant les textes existants.

### Traduction assistée par IA

Le projet contient également un fichier de traduction volontairement très verbeux.

Ce fichier fournit davantage de contexte et d'explications pour chaque texte à traduire afin de faciliter l'utilisation d'outils de traduction basés sur l'intelligence artificielle.

L'objectif est de permettre à une personne de générer rapidement une première traduction complète, puis de la relire et de la corriger si nécessaire.

Le système est donc conçu pour faciliter :

* l'ajout de nouvelles langues ;
* la modification des traductions existantes ;
* la correction des traductions ;
* la traduction assistée par IA ;
* la contribution de personnes ne souhaitant pas modifier le code de l'application.

> Une traduction générée par une IA doit idéalement être relue par un locuteur natif avant d'être considérée comme définitive.

---

## Exemple de structure

```text
src/
└── locales/
    ├── fr.json
    ├── en.json
    ├── de.json
    └── ...
```

Le fichier verbeux destiné à la traduction assistée peut contenir davantage d'informations contextuelles que les fichiers de traduction utilisés directement par l'application.

Cette séparation permet de conserver des fichiers de traduction fonctionnels simples tout en fournissant un contexte plus riche aux outils de traduction.

---

## Fonctionnalités

### Éditeur de workflows visuel

Créez des automatisations à l'aide d'un éditeur basé sur des nœuds.

Les workflows peuvent contenir :

* des actions de souris ;
* des actions clavier ;
* des délais ;
* des variables ;
* des opérations mathématiques ;
* des valeurs aléatoires ;
* des boucles ;
* des conditions ;
* de la reconnaissance d'image ;
* des fonctions réutilisables.

---

### Automatisation native du bureau

Le moteur d'exécution est écrit en Rust.

Les actions disponibles incluent notamment :

* déplacer la souris ;
* effectuer des clics gauche, droit et milieu ;
* effectuer des doubles clics ;
* faire défiler la souris ;
* utiliser des raccourcis clavier ;
* saisir du texte ;
* ajouter des délais configurables.

---

## État du projet

Ce projet a été créé principalement pour un usage personnel.

Il est publié publiquement pour toute personne susceptible de le trouver utile.

Il n'existe aucun engagement de maintenance régulière, de support, de mises à jour ou de développement futur.

Si j'ai besoin de modifier le projet à l'avenir pour répondre à mes propres besoins, je pourrai publier ces changements lorsque cela sera possible.

Le projet est fourni tel quel.

---

## Forks et projets dérivés

Vous êtes libre de forker ce projet et de créer votre propre version.

Le projet est destiné à rester gratuit et accessible.

Si vous créez un fork ou un projet dérivé important, merci d'envisager de mentionner clairement le projet original.

---

## Collaboration

Bien que ce projet soit principalement personnel, je peux être ouvert à accueillir un **co-créateur principal**.

Cette possibilité est réservée à une personne qui :

* possède de solides compétences techniques ;
* est réellement intéressée par le projet ;
* comprend l'architecture existante ;
* souhaite contribuer de manière significative ;
* peut faire évoluer le projet au-delà de ce que je souhaite personnellement faire seul.

Si vous êtes réellement intéressé par une collaboration de ce type, vous pouvez me contacter via GitHub.

---

## Licence

Ce projet est distribué sous licence [MIT](LICENSE).

---

<div align="center">

**Auto-Bot**

Créé pour résoudre un problème personnel.
Publié au cas où il pourrait résoudre celui de quelqu'un d'autre.

</div>
