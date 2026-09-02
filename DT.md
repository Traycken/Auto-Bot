# 🌳 Directory Tree (DT.md)

> 📊 **Arborescence complète du dépôt**, avec poids et lignes de code par fichier.
> Synchronisé et mis à jour automatiquement avec [Auto-Github](https://github.com/Traycken/Auto-Github).

🕒 **Dernière mise à jour :** `02/09/2026 à 17:03:35`  
📁 **Total Fichiers :** `120 fichiers` • 📝 **Lignes de code :** `30 168 lignes` • 💾 **Poids total :** `2.76 MB`

---

## 📂 Arborescence des Fichiers

```text
📁 .
├── 📁 dist/
│   ├── 📁 assets/
│   │   ├── 📄 index-BlZsVLPp.js (84 lignes • 590.8 KB)
│   │   ├── 📄 index-BN4e4aqj.js (2 lignes • 7.3 KB)
│   │   └── 📄 index-DYA0uD95.css (2 lignes • 16.2 KB)
│   ├── 📄 index.html (16 lignes • 515 B)
│   ├── 📄 overlay.html (22 lignes • 1.1 KB)
│   └── 📄 region-selector.html (105 lignes • 3.0 KB)
├── 📁 Localization/
│   ├── 📄 EN_en.json (290 lignes • 13.2 KB)
│   └── 📄 FR_fr.json (286 lignes • 13.5 KB)
├── 📁 public/
│   ├── 📄 overlay.html (22 lignes • 1.1 KB)
│   └── 📄 region-selector.html (105 lignes • 3.0 KB)
├── 📁 src/
│   ├── 📁 components/
│   │   ├── 📄 AboutModal.tsx (173 lignes • 7.2 KB)
│   │   ├── 📄 AnimatedEdge.tsx (76 lignes • 3.0 KB)
│   │   ├── 📄 CmdHistoryModal.tsx (80 lignes • 3.0 KB)
│   │   ├── 📄 Console.tsx (228 lignes • 7.6 KB)
│   │   ├── 📄 ForNode.tsx (102 lignes • 4.7 KB)
│   │   ├── 📄 FunctionArgsNode.tsx (72 lignes • 3.2 KB)
│   │   ├── 📄 FunctionCallNode.tsx (85 lignes • 4.0 KB)
│   │   ├── 📄 FunctionReturnNode.tsx (70 lignes • 3.1 KB)
│   │   ├── 📄 HelpModal.tsx (535 lignes • 30.0 KB)
│   │   ├── 📄 HistoryNode.tsx (167 lignes • 6.1 KB)
│   │   ├── 📄 IfNode.tsx (88 lignes • 3.9 KB)
│   │   ├── 📄 Inspector.tsx (2 904 lignes • 144.0 KB)
│   │   ├── 📄 KeyboardModal.tsx (328 lignes • 16.2 KB)
│   │   ├── 📄 MacroBlockNode.tsx (359 lignes • 16.8 KB)
│   │   ├── 📄 MathNode.tsx (71 lignes • 3.0 KB)
│   │   ├── 📄 MenuBar.tsx (392 lignes • 13.0 KB)
│   │   ├── 📄 RandomNode.tsx (56 lignes • 3.3 KB)
│   │   ├── 📄 SettingsModal.tsx (588 lignes • 24.7 KB)
│   │   ├── 📄 SmartInput.tsx (223 lignes • 12.2 KB)
│   │   ├── 📄 StartNode.tsx (63 lignes • 2.2 KB)
│   │   ├── 📄 SwitchNode.tsx (123 lignes • 4.4 KB)
│   │   ├── 📄 TabBar.tsx (276 lignes • 12.2 KB)
│   │   ├── 📄 Toolbar.tsx (121 lignes • 4.8 KB)
│   │   └── 📄 VarPanel.tsx (97 lignes • 4.2 KB)
│   ├── 📁 store/
│   │   └── 📄 editorStore.ts (1 458 lignes • 54.6 KB)
│   ├── 📁 types/
│   │   └── 📄 blocks.ts (398 lignes • 20.6 KB)
│   ├── 📄 App.tsx (742 lignes • 30.8 KB)
│   ├── 📄 index.css (30 lignes • 917 B)
│   └── 📄 main.tsx (11 lignes • 250 B)
├── 📁 src-tauri/
│   ├── 📁 capabilities/
│   │   └── 📄 main.json (23 lignes • 544 B)
│   ├── 📁 gen/
│   │   └── 📁 schemas/
│   │       ├── 📄 acl-manifests.json (1 lignes • 139.3 KB)
│   │       ├── 📄 capabilities.json (1 lignes • 423 B)
│   │       ├── 📄 desktop-schema.json (6 254 lignes • 404.4 KB)
│   │       └── 📄 windows-schema.json (6 254 lignes • 404.4 KB)
│   ├── 📁 icons/
│   │   ├── 📁 android/
│   │   │   ├── 📁 mipmap-anydpi-v26/
│   │   │   │   └── 📄 ic_launcher.xml (5 lignes • 261 B)
│   │   │   ├── 📁 mipmap-hdpi/
│   │   │   │   ├── 📄 ic_launcher_foreground.png (Binaire • 6.8 KB)
│   │   │   │   ├── 📄 ic_launcher_round.png (Binaire • 2.8 KB)
│   │   │   │   └── 📄 ic_launcher.png (Binaire • 3.3 KB)
│   │   │   ├── 📁 mipmap-mdpi/
│   │   │   │   ├── 📄 ic_launcher_foreground.png (Binaire • 4.8 KB)
│   │   │   │   ├── 📄 ic_launcher_round.png (Binaire • 2.6 KB)
│   │   │   │   └── 📄 ic_launcher.png (Binaire • 3.2 KB)
│   │   │   ├── 📁 mipmap-xhdpi/
│   │   │   │   ├── 📄 ic_launcher_foreground.png (Binaire • 9.6 KB)
│   │   │   │   ├── 📄 ic_launcher_round.png (Binaire • 5.7 KB)
│   │   │   │   └── 📄 ic_launcher.png (Binaire • 6.9 KB)
│   │   │   ├── 📁 mipmap-xxhdpi/
│   │   │   │   ├── 📄 ic_launcher_foreground.png (Binaire • 15.5 KB)
│   │   │   │   ├── 📄 ic_launcher_round.png (Binaire • 8.7 KB)
│   │   │   │   └── 📄 ic_launcher.png (Binaire • 10.6 KB)
│   │   │   ├── 📁 mipmap-xxxhdpi/
│   │   │   │   ├── 📄 ic_launcher_foreground.png (Binaire • 20.6 KB)
│   │   │   │   ├── 📄 ic_launcher_round.png (Binaire • 11.4 KB)
│   │   │   │   └── 📄 ic_launcher.png (Binaire • 14.3 KB)
│   │   │   └── 📁 values/
│   │   │       └── 📄 ic_launcher_background.xml (4 lignes • 115 B)
│   │   ├── 📁 ios/
│   │   │   ├── 📄 AppIcon-20x20@1x.png (Binaire • 968 B)
│   │   │   ├── 📄 AppIcon-20x20@2x-1.png (Binaire • 1.9 KB)
│   │   │   ├── 📄 AppIcon-20x20@2x.png (Binaire • 1.9 KB)
│   │   │   ├── 📄 AppIcon-20x20@3x.png (Binaire • 2.8 KB)
│   │   │   ├── 📄 AppIcon-29x29@1x.png (Binaire • 1.4 KB)
│   │   │   ├── 📄 AppIcon-29x29@2x-1.png (Binaire • 2.7 KB)
│   │   │   ├── 📄 AppIcon-29x29@2x.png (Binaire • 2.7 KB)
│   │   │   ├── 📄 AppIcon-29x29@3x.png (Binaire • 3.9 KB)
│   │   │   ├── 📄 AppIcon-40x40@1x.png (Binaire • 1.9 KB)
│   │   │   ├── 📄 AppIcon-40x40@2x-1.png (Binaire • 3.7 KB)
│   │   │   ├── 📄 AppIcon-40x40@2x.png (Binaire • 3.7 KB)
│   │   │   ├── 📄 AppIcon-40x40@3x.png (Binaire • 5.3 KB)
│   │   │   ├── 📄 AppIcon-60x60@2x.png (Binaire • 5.3 KB)
│   │   │   ├── 📄 AppIcon-60x60@3x.png (Binaire • 7.8 KB)
│   │   │   ├── 📄 AppIcon-76x76@1x.png (Binaire • 3.4 KB)
│   │   │   ├── 📄 AppIcon-76x76@2x.png (Binaire • 6.6 KB)
│   │   │   ├── 📄 AppIcon-83.5x83.5@2x.png (Binaire • 7.2 KB)
│   │   │   └── 📄 AppIcon-512@2x.png (Binaire • 58.0 KB)
│   │   ├── 📄 32x32.png (Binaire • 1.6 KB)
│   │   ├── 📄 64x64.png (Binaire • 3.0 KB)
│   │   ├── 📄 128x128.png (Binaire • 5.8 KB)
│   │   ├── 📄 128x128@2x.png (Binaire • 11.9 KB)
│   │   ├── 📄 icon.icns (Binaire • 149.0 KB)
│   │   ├── 📄 icon.ico (Binaire • 23.8 KB)
│   │   ├── 📄 icon.png (Binaire • 25.5 KB)
│   │   ├── 📄 Square30x30Logo.png (Binaire • 1.4 KB)
│   │   ├── 📄 Square44x44Logo.png (Binaire • 2.0 KB)
│   │   ├── 📄 Square71x71Logo.png (Binaire • 3.2 KB)
│   │   ├── 📄 Square89x89Logo.png (Binaire • 4.0 KB)
│   │   ├── 📄 Square107x107Logo.png (Binaire • 4.6 KB)
│   │   ├── 📄 Square142x142Logo.png (Binaire • 6.3 KB)
│   │   ├── 📄 Square150x150Logo.png (Binaire • 6.3 KB)
│   │   ├── 📄 Square284x284Logo.png (Binaire • 13.1 KB)
│   │   ├── 📄 Square310x310Logo.png (Binaire • 14.5 KB)
│   │   └── 📄 StoreLogo.png (Binaire • 2.3 KB)
│   ├── 📁 src/
│   │   ├── 📁 blocks/
│   │   │   └── 📄 mod.rs (633 lignes • 24.1 KB)
│   │   ├── 📁 engine/
│   │   │   └── 📄 mod.rs (3 247 lignes • 134.5 KB)
│   │   ├── 📁 ipc/
│   │   │   └── 📄 mod.rs (1 458 lignes • 54.3 KB)
│   │   ├── 📁 overlay/
│   │   │   ├── 📄 mod.rs (189 lignes • 6.5 KB)
│   │   │   └── 📄 overlay.html (51 lignes • 2.4 KB)
│   │   ├── 📄 lib.rs (112 lignes • 4.1 KB)
│   │   └── 📄 main.rs (5 lignes • 106 B)
│   ├── 📄 build.rs (4 lignes • 39 B)
│   ├── 📄 Cargo.toml (46 lignes • 1.4 KB)
│   └── 📄 tauri.conf.json (60 lignes • 1.2 KB)
├── 📄 .gitignore (30 lignes • 291 B)
├── 📄 AutoBot.svg (1 lignes • 5.7 KB)
├── 📄 Cargo.toml (4 lignes • 51 B)
├── 📄 CHANGELOG.md (95 lignes • 3.7 KB)
├── 📄 DT.md (100 lignes • 1.0 KB)
├── 📄 index.html (15 lignes • 417 B)
├── 📄 install - DEV.bat (29 lignes • 815 B)
├── 📄 install.bat (29 lignes • 817 B)
├── 📄 package.json (30 lignes • 705 B)
├── 📄 README.fr.md (180 lignes • 5.5 KB)
├── 📄 README.md (406 lignes • 7.9 KB)
├── 📄 settings.json (12 lignes • 273 B)
├── 📄 tsconfig.json (21 lignes • 508 B)
└── 📄 vite.config.ts (19 lignes • 457 B)
```

---

## 📊 Répartition par Type de Fichier

| Type / Extension | Fichiers | Lignes | Poids Total |
|:---|---:|---:|---:|
| `*.json` | 11 | 13 232 | 978.4 KB |
| `*.js` | 2 | 86 | 598.2 KB |
| `*.tsx` | 26 | 8 030 | 368.0 KB |
| `*.png` | 48 | *(Binaire)* | 353.2 KB |
| `*.rs` | 7 | 5 648 | 223.6 KB |
| `*.icns` | 1 | *(Binaire)* | 149.0 KB |
| `*.ts` | 3 | 1 875 | 75.6 KB |
| `*.ico` | 1 | *(Binaire)* | 23.8 KB |
| `*.md` | 4 | 781 | 18.0 KB |
| `*.css` | 2 | 32 | 17.1 KB |
| `*.html` | 7 | 336 | 11.6 KB |
| `*.svg` | 1 | 1 | 5.7 KB |
| `*.bat` | 2 | 58 | 1.6 KB |
| `*.toml` | 2 | 50 | 1.4 KB |
| `*.xml` | 2 | 9 | 376 B |
| *(sans extension)* | 1 | 30 | 291 B |
| **TOTAL** | **120** | **30 168** | **2.76 MB** |

---
*Généré automatiquement par [Auto-Github](https://github.com/Traycken/Auto-Github)*
