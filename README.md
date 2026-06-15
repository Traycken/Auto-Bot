# ![AutoBot](./AutoBot.svg) Auto Bot

[![Tauri Version](https://img.shields.io/badge/Tauri-v2.x-0F0F11?logo=tauri&logoColor=FFC131&labelColor=24292e)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.77%2B-000000?logo=rust&logoColor=white&labelColor=24292e)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18.x-20232A?logo=react&logoColor=61DAFB&labelColor=24292e)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-007ACC?logo=typescript&logoColor=white&labelColor=24292e)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?labelColor=24292e)](LICENSE)

**Auto Bot** est un éditeur de macros visuel puissant, rapide et moderne. Il combine la flexibilité d'un canvas nodal interactif (basé sur **React Flow / XYFlow**) avec la rapidité, la sécurité et la légèreté d'un moteur d'exécution natif écrit en **Rust** via **Tauri 2**.

Conçu pour automatiser des tâches complexes sans écrire de code, Auto Bot vous permet de créer des séquences logiques, de simuler le clavier/souris, de manipuler des variables, de réaliser du traitement d'image (Template Matching, OCR) et de concevoir des fonctions hautement réutilisables.

---

## ✨ Fonctionnalités clés

* **Visual Workflow Engine** : Éditeur nodal intuitif avec gestion d'onglets multiples. Créez plusieurs séquences et fonctions indépendamment dans la même session.
* **Fonctions réutilisables (`.fnc.json`)** : Définissez vos propres blocs réutilisables avec arguments d'entrée typés et valeurs de retour paramétrables.
* **Contrôle avancé du flux** : Boucles `FOR`, branchements conditionnels `IF`, blocs de calcul mathématique et assignation dynamique de variables.
* **Automation Clavier & Souris native** : Moteur basé sur la crate `enigo` assurant des clics, déplacements de souris précis et des saisies clavier complexes.
* **Vision artificielle** : Recherche de patterns sur l'écran (Template Matching) et analyse pixel.
* **Logs & Console de Debug intégrés** : Suivi de l'exécution en temps réel dans l'interface pour tester et corriger rapidement vos graphes.

---

## 🏗️ Architecture du projet

Le projet est structuré en deux parties principales : le frontend sous React/TypeScript pour l'édition et le backend sous Rust/Tauri pour l'exécution des opérations système.

```
auto-bot/
├── src/                          # FRONTEND (React + TS + XYFlow)
│   ├── App.tsx                    # Layout principal et gestionnaire d'onglets
│   ├── main.tsx                   # Point d'entrée de l'application React
│   ├── types/
│   │   └── blocks.ts              # Modèles et typage TypeScript des blocs
│   ├── store/
│   │   └── editorStore.ts         # État global (Zustand) — gestion multi-graphes
│   └── components/
│       ├── TabBar.tsx             # Gestion des onglets de séquences et fonctions
│       ├── MacroBlockNode.tsx     # Rendu générique des nœuds de macro
│       ├── StartNode.tsx          # Point de départ unique d'une séquence
│       ├── FunctionArgsNode.tsx   # Arguments d'entrée pour les fonctions
│       ├── FunctionReturnNode.tsx # Valeur renvoyée par une fonction
│       ├── FunctionCallNode.tsx   # Bloc d'invocation d'une fonction personnalisée
│       ├── ForNode.tsx / IfNode.tsx # Structures de contrôle de flux
│       ├── MathNode.tsx / RandomNode.tsx # Utilitaires de variables et calculs
│       ├── Toolbar.tsx            # Palette des blocs disponibles
│       ├── Inspector.tsx          # Éditeur de propriétés du bloc sélectionné
│       └── LogPanel.tsx           # Console d'exécution et de débogage
│
└── src-tauri/                    # BACKEND (Rust / Tauri 2)
    ├── tauri.conf.json            # Configuration système de Tauri
    ├── Cargo.toml                 # Dépendances natives (enigo, xcap, ort, etc.)
    └── src/
        ├── main.rs                # Point d'entrée de l'exécutable
        ├── lib.rs                 # Initialisation de l'application et dossiers
        ├── blocks/mod.rs          # Structures Rust représentant les blocs
        ├── engine/mod.rs          # Moteur d'exécution asynchrone des macros
        └── ipc/mod.rs             # Commandes de communication Frontend/Backend
```

---

## 🚀 Démarrage rapide

### Prérequis requis

| Outil | Version minimale |
| :--- | :--- |
| **Rust (stable)** | 1.77+ |
| **Node.js** | 20+ |
| **npm** | 10+ |

### Installation des dépendances système

#### 🐧 Linux (Debian/Ubuntu)
Installez les bibliothèques système nécessaires pour le rendu web, le contrôle clavier/souris et la capture d'écran :
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libxdo-dev libxtst-dev libx11-dev libxrandr-dev pkg-config
```

#### 🍎 macOS
Installez les outils de ligne de commande Xcode :
```bash
xcode-select --install
```

#### 🪟 Windows
Aucune dépendance système supplémentaire n'est requise. Veillez simplement à avoir installé [Rustup](https://rustup.rs/) et [Node.js](https://nodejs.org/).

### Lancement en mode développement

1. Clonez le dépôt et installez les paquets Node :
   ```bash
   git clone https://github.com/votre-compte/auto-bot.git
   cd auto-bot
   npm install
   ```

2. Lancez le serveur de développement Tauri :
   ```bash
   npm run tauri dev
   ```

3. Compiler l'exécutable de production :
   ```bash
   npm run tauri build
   ```
   L'exécutable compilé sera disponible dans le dossier `src-tauri/target/release/`.

---

## 💡 Concepts fondamentaux

### 🗂️ Gestion Multi-Onglets
L'éditeur permet d'ouvrir plusieurs espaces de travail en parallèle :
* **Séquence** : Un script complet destiné à être exécuté (commence toujours par un nœud unique **Départ**).
* **Fonction** : Une sous-routine exportée sous format `.fnc.json` réutilisable dans vos séquences.
* **Actions sur les onglets** : Double-cliquez pour renommer, sauvegardez avec `Ctrl+S` (ou l'icône disquette) et utilisez la croix pour fermer.

### 🧩 Fonctions personnalisées (`.fnc.json`)

Les fonctions permettent de modulariser vos automatisations et de les réutiliser.

#### 1. Création d'une fonction
* Cliquez sur le bouton `+` dans la barre d'onglets et choisissez **Nouvelle fonction**.
* L'onglet s'ouvre avec deux nœuds obligatoires et uniques :
  * **ARGUMENTS** : Dans le panneau *Inspector*, listez les variables d'entrée requises (ex: `x`, `y`, `valeur`).
  * **RETOUR** : Spécifiez la variable ou l'expression retournée (ex: `%mon_resultat%`).
* Enregistrez la fonction. Elle est automatiquement stockée dans `<Dossier-Execution>/Fonctions/<nom>.fnc.json`.

#### 2. Appel de la fonction
* Dans n'importe quel onglet de **Séquence**, faites glisser le bloc **Appel Fonction** depuis la palette.
* Dans l'Inspector, sélectionnez le fichier `.fnc.json`.
* Le bloc s'adapte dynamiquement en affichant des champs pour chaque argument requis. Vous pouvez y injecter des valeurs statiques ou des variables existantes (format `%nom_variable%`).
* Le résultat retourné sera disponible pour la suite du flux sous la variable `<NomFonction>_Return`.

---

## 📦 Catalogue de blocs

### 🖱️ Souris
* **Déplacer la souris** (`mouse_move`) : Positionne le curseur à des coordonnées X/Y absolues ou relatives.
* **Clic de souris** (`mouse_click`) : Clic gauche, droit ou milieu (simple ou double).
* **Défilement** (`mouse_scroll`) : Scroll horizontal ou vertical.

### ⌨️ Clavier
* **Appui touche** (`key_press`) : Presse une touche ou un raccourci clavier (ex: `ctrl+shift+t`).
* **Saisir texte** (`type_text`) : Tape une chaîne de caractères caractère par caractère à la vitesse configurée.

### ⚙️ Contrôle & Variables
* **Pause** (`wait`) : Suspend l'exécution pendant une durée définie (en millisecondes).
* **Boucle FOR** (`for_loop`) : Exécute une boucle un nombre donné de fois avec variable d'itération accessible.
* **Opérations Mathématiques** (`math`) : Exécute des calculs arithmétiques et stocke le résultat dans une variable.
* **Assignation** (`set_variable`) : Définit ou met à jour une variable globale ou locale.
* **Aléatoire** (`random`) : Génère un nombre, booléen, texte ou choisit un élément aléatoire dans une liste.

### 👁️ Vision
* **Vérifier couleur** (`pixel_color`) : Lit la couleur d'un pixel à l'écran pour aiguiller la logique.
* **Template Matching** (`image_match`) : Recherche une portion d'image (ex: un bouton précis) sur l'écran.
* **OCR** (`ocr`) : *À venir* — Extraction de texte depuis une zone écran.

---

## ⌨️ Raccourcis clavier de l'éditeur

| Raccourci | Action associée |
| :--- | :--- |
| **`F6`** | Lancer / Arrêter l'exécution de la macro |
| **`F8`** | Capturer la position actuelle du curseur (remplit les champs X/Y actifs dans l'Inspector) |
| **`Ctrl + S`** | Enregistrer la séquence / fonction dans l'onglet actif |
| **`Ctrl + C`** | Copier les nœuds sélectionnés |
| **`Ctrl + V`** | Coller les nœuds copiés |
| **`Suppr` / `Delete`** | Supprimer les nœuds ou connexions sélectionnés |

---

## 🗺️ Roadmap & Évolutions futures

* [ ] **OCR intégré** : Reconnaissance optique de caractères via `tesseract-rs` ou modèle ONNX local.
* [ ] **Compilation Standalone** : Export d'un graphe de macro directement sous forme de binaire compilé Rust autonome.
* [ ] **Gestion Undo / Redo** : Historique d'actions complet dans l'éditeur de graphes.
* [ ] **Raccourcis globaux** : Enregistrement de raccourcis clavier système pour lancer et stopper les scripts même en arrière-plan.
* [ ] **Support macOS renforcé** : Intégration fine des permissions d'accessibilité macOS.

---

## 📄 Licence

Ce projet est distribué sous licence MIT. Consultez le fichier [LICENSE](LICENSE) pour plus de détails.
