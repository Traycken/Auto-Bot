# Auto Bot

> Éditeur de macros visuelles — Rust · Tauri 2 · React · TypeScript

---

## Prérequis

| Outil | Version min |
|-------|-------------|
| Rust (stable) | 1.77+ |
| Node.js | 20+ |
| npm | 10+ |
| Tauri CLI | 2.x |

### Linux uniquement — dépendances système

```bash
sudo apt install libwebkit2gtk-4.1-dev libxdo-dev libxtst-dev \
  libx11-dev libxrandr-dev pkg-config
```

### macOS
```bash
xcode-select --install
```

---

## Démarrage rapide

```bash
npm install
npm run tauri dev
npm run tauri build
```

---

## Architecture

```
auto-bot/
├── src/
│   ├── App.tsx                    # Layout principal + TabBar
│   ├── main.tsx
│   ├── types/
│   │   └── blocks.ts              # Types TS des blocs
│   ├── store/
│   │   └── editorStore.ts         # État global Zustand — onglets multiples
│   └── components/
│       ├── TabBar.tsx             # Barre d'onglets (séquences + fonctions)
│       ├── MacroBlockNode.tsx
│       ├── StartNode.tsx          # Nœud Départ (non-supprimable, unique)
│       ├── FunctionArgsNode.tsx   # Nœud Arguments (graphs fonctions)
│       ├── FunctionReturnNode.tsx # Nœud Retour (graphs fonctions)
│       ├── FunctionCallNode.tsx   # Nœud Appel Fonction
│       ├── ForNode.tsx
│       ├── IfNode.tsx
│       ├── MathNode.tsx
│       ├── RandomNode.tsx
│       ├── Toolbar.tsx
│       ├── Inspector.tsx
│       ├── LogPanel.tsx
│       └── DebugConsole.tsx
│
└── src-tauri/
    ├── tauri.conf.json
    ├── Cargo.toml
    └── src/
        ├── main.rs
        ├── lib.rs                 # Setup Tauri — crée Fonctions/ au démarrage
        ├── blocks/mod.rs          # Enum Block + FunctionArgs/Return/Call
        ├── engine/mod.rs          # Moteur d'exécution + exec_function_call
        └── ipc/mod.rs             # get_exe_dir, get_functions_dir, list_functions
```

---

## Onglets multiples

La barre d'onglets en haut du canvas permet de :

- **Créer plusieurs séquences** (`+` → Nouvelle séquence) — chacune a son propre graph indépendant
- **Créer des fonctions réutilisables** (`+` → Nouvelle fonction) — graph spécial avec nœuds Arguments et Retour
- **Renommer un onglet** : double-clic sur le nom
- **Sauvegarder** : icône disquette dans l'onglet actif, ou `Ctrl+S`
- **Fermer un onglet** : bouton `×` (minimum 1 onglet conservé)

---

## Fonctions (`.fnc.json`)

### Créer une fonction

1. Cliquer `+` → **Nouvelle fonction**, donner un nom (ex: `cliquer_ok`)
2. L'onglet s'ouvre avec deux nœuds pré-placés non-supprimables :
   - **ARGUMENTS** — dans l'Inspector, ajouter les paramètres (ex: `x`, `y`, `label`)
   - **RETOUR** — définir l'expression de retour (ex: `%resultat`)
3. Construire le graph entre ces deux nœuds
4. `Ctrl+S` — sauvegarde dans `<RacineDuExe>/Fonctions/<nom>.fnc.json`

### Appeler une fonction

1. Dans un onglet **Séquence**, glisser le bloc **Appel Fonction** depuis la palette (catégorie Fonctions)
2. Dans l'Inspector :
   - Cliquer **Ouvrir** pour choisir le `.fnc.json`
   - Les arguments détectés s'affichent — remplir chaque valeur (expressions et `%var` supportés)
   - Le champ **Variable de retour** est pré-rempli avec `<NomFonction>_Return`
3. La valeur retournée est accessible via `%<NomFonction>_Return` dans les blocs suivants

### Fichiers

```
<RacineDuExe>/
└── Fonctions/
    ├── cliquer_ok.fnc.json
    ├── scroll_jusqu_en_bas.fnc.json
    └── …
```

---

## Nœud Départ

- **Unique** : un seul nœud Départ par séquence, ne peut pas être ajouté manuellement
- **Non-supprimable** : la touche `Suppr` et le bouton Inspector n'ont aucun effet dessus
- **Non-dupliquable** : `Ctrl+C / Ctrl+V` l'exclut de la sélection copiée

---

## Blocs disponibles

### Souris
| Bloc | Description |
|------|-------------|
| `mouse_move`   | Déplace la souris |
| `mouse_click`  | Clic gauche/droit/milieu, simple ou double |
| `mouse_scroll` | Défilement horizontal ou vertical |

### Clavier
| Bloc | Description |
|------|-------------|
| `key_press`  | Touche ou combinaison (`ctrl+shift+a`) |
| `type_text`  | Frappe un texte caractère par caractère |

### Contrôle
| Bloc | Description |
|------|-------------|
| `wait`         | Pause en ms |
| `for_loop`     | Boucle FOR avec variable compteur |
| `math`         | Calcul arithmétique → variable |
| `set_variable` | Assigne une valeur à une variable |
| `random`       | Valeur aléatoire (int, float, bool, str, liste) |

### Logique
| Bloc | Description |
|------|-------------|
| `if` | Branchement conditionnel vrai/faux |

### Vision
| Bloc | Description |
|------|-------------|
| `pixel_color`  | Vérifie la couleur d'un pixel |
| `image_match`  | Template matching sur une zone d'écran |
| `ocr`          | Extraction de texte *(à venir)* |

### Fonctions
| Bloc | Description |
|------|-------------|
| `function_call` | Appelle un `.fnc.json` avec arguments, récupère la valeur de retour |

### Spéciaux (non-palette)
| Bloc | Contexte |
|------|----------|
| `start`           | Séquence — unique, non-supprimable |
| `function_args`   | Fonction — arguments entrants, unique, non-supprimable |
| `function_return` | Fonction — valeur de retour, unique, non-supprimable |

---

## Ajouter un nouveau bloc

1. **Rust** — struct + variante dans `src/blocks/mod.rs`
2. **Rust** — cas dans `engine/mod.rs::exec_node()`
3. **TypeScript** — interface dans `src/types/blocks.ts`
4. **TypeScript** — entrée dans `BLOCK_CATALOG`
5. *(optionnel)* Nœud React Flow dédié dans `src/components/`

---

## Raccourcis clavier

| Touche | Action |
|--------|--------|
| `F6` | Lancer / Arrêter la séquence |
| `F8` | Capturer la position curseur (champs X/Y) |
| `Ctrl+S` | Sauvegarder l'onglet actif |
| `Ctrl+C` | Copier les nœuds sélectionnés |
| `Ctrl+V` | Coller |
| `Suppr` | Supprimer les nœuds sélectionnés |

---

## Roadmap

- [ ] OCR via `tesseract-rs`
- [ ] Export en script Rust standalone
- [ ] Support macOS (permissions accessibilité)
- [ ] Hotkey globale pour start/stop
- [ ] Fonctions imbriquées (fonction appelant une fonction)
- [ ] Historique undo/redo
