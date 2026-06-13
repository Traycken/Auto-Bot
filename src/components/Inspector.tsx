import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { BLOCK_CATALOG, type ColorFormat, type MouseButton, type RandomMode } from "../types/blocks";
import { SmartInput } from "./SmartInput";
import { VarPanel } from "./VarPanel";
import { invoke } from "@tauri-apps/api/core";
import { KeyboardModal } from "./KeyboardModal";
import { CmdHistoryModal } from "./CmdHistoryModal";

async function pickScreenRegion(screenIdx: number) {
  return invoke<{ x: number; y: number; w: number; h: number; screen: number }>(
    "select_screen_region",
    { screen: screenIdx },
  );
}

const BLACKLIST = new Set([
  "label", "color", "icon", "kind", "children", "index", "id", "type", "position", "deletable",
  "Relative", "double click", "LANG", "hold ms", "delay between chars ms", "delay after ms", "travel ms", "Travel MS"
]);

const S = {
  input:  { width:"100%", padding:"4px 8px", fontSize:11, fontFamily:"monospace", background:"#111113", border:"0.5px solid #2a2a2e", borderRadius:5, color:"#d0d0d0", outline:"none", boxSizing:"border-box" } as React.CSSProperties,
  label:  { fontSize:9, letterSpacing:"0.08em", textTransform:"uppercase" as const, color:"#555", marginBottom:3, display:"block" },
  row:    { marginBottom:9 } as React.CSSProperties,
  btn:    { display:"flex", alignItems:"center", justifyContent:"center", gap:4, padding:"4px 8px", fontSize:10, fontFamily:"monospace", cursor:"pointer", background:"#18181b", border:"0.5px solid #2a2a2e", borderRadius:5, color:"#aaa" } as React.CSSProperties,
};

type ScreenInfo = { id:number; name:string; x:number; y:number; width:number; height:number; scale_factor:number; is_primary:boolean; };

// ── Sub-components ────────────────────────────────────────────────────────────

function InspectorTabs({ value, onChange }: { value:"normal"|"advanced"; onChange:(v:"normal"|"advanced")=>void }) {
  return (
    <div style={{ display:"flex", gap:5, padding:"8px 12px", borderBottom:"0.5px solid #2a2a2e" }}>
      {(["normal","advanced"] as const).map(tab => (
        <button key={tab} onClick={() => onChange(tab)} style={{
          ...S.btn, flex:1,
          background: value===tab ? "#E84C1E22" : "#111113",
          borderColor: value===tab ? "#E84C1E" : "#2a2a2e",
          color: value===tab ? "#E84C1E" : "#666",
        }}>{tab==="normal" ? "Normal" : "Avancé"}</button>
      ))}
    </div>
  );
}

function AdvancedFields({ data, onChange }: { data:Record<string,unknown>; onChange:(p:Record<string,unknown>)=>void }) {
  const fields = Object.entries(data).filter(([k,v]) =>
    !["label","color","icon","kind","children"].includes(k) &&
    !BLACKLIST.has(k) &&
    (typeof v==="string" || typeof v==="number" || typeof v==="boolean")
  );
  return (
    <>{fields.map(([k,v]) => (
      <div key={k} style={S.row}>
        <span style={S.label}>{k.replace(/_/g," ")}</span>
        <input type="text" value={String(v??"")}
          onChange={e => { const raw=e.target.value; onChange({ [k]: typeof v==="boolean" ? raw==="true" : typeof v==="number" ? Number(raw) : raw }); }}
          style={S.input} />
      </div>
    ))}</>
  );
}

function BoolField({ label, value, onChange }: { label:string; value:boolean; onChange:(v:boolean)=>void }) {
  return (
    <div style={S.row}>
      <span style={S.label}>{label}</span>
      <div style={{ display:"flex", gap:5 }}>
        {([true,false] as const).map(opt => (
          <button key={String(opt)} onClick={() => onChange(opt)} style={{
            ...S.btn, flex:1,
            background: value===opt ? "#E84C1E22" : "#111113",
            borderColor: value===opt ? "#E84C1E" : "#2a2a2e",
            color: value===opt ? "#E84C1E" : "#666",
          }}>{opt ? "vrai" : "faux"}</button>
        ))}
      </div>
    </div>
  );
}

// ── ScreenPickerModal ─────────────────────────────────────────────────────────

function ScreenPickerModal({ selected, onSelect, onClose }: { selected:number; onSelect:(s:number)=>void; onClose:()=>void }) {
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<ScreenInfo[]>("list_screens")
      .then(s => { setScreens(s); setLoading(false); })
      .catch(() => { setScreens([]); setLoading(false); });
  }, []);

  const minX = Math.min(0,...screens.map(s=>s.x));
  const minY = Math.min(0,...screens.map(s=>s.y));
  const maxX = Math.max(1920,...screens.map(s=>s.x+s.width));
  const maxY = Math.max(1080,...screens.map(s=>s.y+s.height));
  const scale = Math.min(480/Math.max(1,maxX-minX), 260/Math.max(1,maxY-minY));

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:10000, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={e => e.target===e.currentTarget && onClose()}
    >
      <div style={{ width:560, background:"#18181b", border:"0.5px solid #2a2a2e", borderRadius:10, padding:20, fontFamily:"monospace", boxShadow:"0 20px 60px #000e" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <span style={{ fontSize:13, color:"#e0e0e0", fontWeight:500 }}>Sélectionner un écran</span>
          <button onClick={onClose} style={{ ...S.btn, padding:"3px 10px", fontSize:13 }}>×</button>
        </div>

        <div style={{ position:"relative", height:300, background:"#0e0e10", border:"0.5px solid #2a2a2e", borderRadius:6, overflow:"hidden" }}>
          {loading && (
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#555", fontSize:11 }}>
              <i className="ti ti-loader" style={{ marginRight:6 }} />Chargement…
            </div>
          )}
          {!loading && screens.length === 0 && (
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#555", fontSize:11 }}>
              Aucun écran détecté (mode dev ?)
            </div>
          )}
          {screens.map((s, i) => (
            <button key={s.id} onClick={() => { onSelect(i); onClose(); }} style={{
              position:"absolute",
              left: Math.round((s.x-minX)*scale + 20),
              top:  Math.round((s.y-minY)*scale + 20),
              width:  Math.max(90, Math.round(s.width*scale)),
              height: Math.max(55, Math.round(s.height*scale)),
              background: selected===i ? "#E84C1E22" : "#111113",
              border: `1.5px solid ${selected===i ? "#E84C1E" : "#3a3a3e"}`,
              borderRadius: 5, color: selected===i ? "#E84C1E" : "#aaa",
              cursor:"pointer", fontFamily:"monospace", fontSize:10,
              display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3,
            }}>
              <i className="ti ti-device-desktop" style={{ fontSize:14 }} />
              <span style={{ fontWeight:600 }}>{s.name || `Écran ${i+1}`}</span>
              <span style={{ color:"#666", fontSize:9 }}>{s.width}×{s.height}</span>
              {s.is_primary && <span style={{ color:"#1D9E75", fontSize:8 }}>principal</span>}
            </button>
          ))}
        </div>

        <p style={{ fontSize:9, color:"#444", marginTop:10, textAlign:"center" }}>
          Cliquer sur un écran pour le sélectionner
        </p>
      </div>
    </div>
  );
}

// ── ScreenPickerButton — bouton réutilisable ──────────────────────────────────

function ScreenPickerButton({ screen, onSelect }: { screen: number; onSelect:(s:number)=>void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={S.row}>
      <span style={S.label}>Écran</span>
      <button onClick={() => setOpen(true)} style={{ ...S.btn, width:"100%", justifyContent:"flex-start", gap:7 }}>
        <i className="ti ti-device-desktop" style={{ fontSize:11, color:"#E84C1E" }} />
        <span>Écran {screen + 1} — cliquer pour changer</span>
      </button>
      {open && (
        <ScreenPickerModal
          selected={screen}
          onSelect={s => { onSelect(s); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ── ColorField ────────────────────────────────────────────────────────────────

function ColorField({ data, onChange }: { data:Record<string,unknown>; onChange:(p:Record<string,unknown>)=>void }) {
  const fmt = (data.color_format ?? "hex") as ColorFormat;
  const hexToRgb = (hex:string) => ({ r:parseInt(hex.slice(1,3),16)||0, g:parseInt(hex.slice(3,5),16)||0, b:parseInt(hex.slice(5,7),16)||0 });
  return (
    <div style={S.row}>
      <span style={S.label}>Format couleur</span>
      <div style={{ display:"flex", gap:4, marginBottom:7 }}>
        {(["hex","rgb","hsv"] as ColorFormat[]).map(f => (
          <button key={f} onClick={() => onChange({ color_format:f })} style={{
            ...S.btn, flex:1,
            background: fmt===f ? "#E84C1E22" : "#111113",
            borderColor: fmt===f ? "#E84C1E" : "#2a2a2e",
            color: fmt===f ? "#E84C1E" : "#666",
          }}>{f.toUpperCase()}</button>
        ))}
      </div>
      {fmt==="hex" && (
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <input type="color" value={(data.expected_hex as string)??"#FF0000"}
            onChange={e => { const hex=e.target.value.toUpperCase(); const {r,g,b}=hexToRgb(hex); onChange({expected_hex:hex,expected_r:r,expected_g:g,expected_b:b}); }}
            style={{ width:32, height:28, border:"none", borderRadius:4, background:"none", cursor:"pointer", padding:0 }} />
          <input type="text" value={(data.expected_hex as string)??"#FF0000"}
            onChange={e => onChange({ expected_hex:e.target.value.toUpperCase() })} style={S.input} placeholder="#FF0000" />
        </div>
      )}
      {fmt==="rgb" && (
        <div style={{ display:"flex", gap:4 }}>
          {[["expected_r","R","#E24B4A"],["expected_g","G","#1D9E75"],["expected_b","B","#378ADD"]].map(([k,lbl,col]) => (
            <div key={k} style={{ flex:1 }}>
              <span style={{ ...S.label, color:col }}>{lbl} ({(data[k] as number)??0})</span>
              <input type="range" min={0} max={255} step={1} value={(data[k] as number)??0} onChange={e => onChange({[k]:Number(e.target.value)})} style={{ width:"100%", accentColor:col }} />
            </div>
          ))}
        </div>
      )}
      {fmt==="hsv" && (
        <div style={{ display:"flex", gap:4 }}>
          {[["expected_h","H°","0","360"],["expected_s","S%","0","100"],["expected_v","V%","0","100"]].map(([k,lbl,mn,mx]) => (
            <div key={k} style={{ flex:1 }}>
              <span style={S.label}>{lbl} ({(data[k] as number)??0})</span>
              <input type="range" min={Number(mn)} max={Number(mx)} step={1} value={(data[k] as number)??0} onChange={e => onChange({[k]:Number(e.target.value)})} style={{ width:"100%", accentColor:"#1D9E75" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── WaitFields ───────────────────────────────────────────────────────────────

function WaitFields({ data, onChange }: { data:Record<string,unknown>; onChange:(p:Record<string,unknown>)=>void }) {
  const mode = (data.mode as string) ?? "duration";

  return (
    <>
      <div style={S.row}>
        <span style={S.label}>Mode d'attente</span>
        <select
          value={mode}
          onChange={e => onChange({ mode: e.target.value })}
          style={{ ...S.input, background: "#0e0e10" }}
        >
          <option value="duration">Durée (en millisecondes)</option>
          <option value="datetime">Date & Heures spécifiées</option>
        </select>
      </div>

      {mode === "duration" ? (
        <SmartInput
          label="Durée (ms)"
          value={(data.duration_ms as string) ?? "1000"}
          onChange={v => onChange({ duration_ms: v })}
        />
      ) : (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
            {[["year", "Année"], ["month", "Mois"], ["day", "Jour"]].map(([k, lbl]) => (
              <div key={k} style={{ flex: 1 }}>
                <span style={S.label}>{lbl}</span>
                <input
                  type="text"
                  value={(data[k] as string) ?? "-1"}
                  onChange={e => onChange({ [k]: e.target.value })}
                  style={S.input}
                  placeholder="-1"
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
            {[["hour", "Heures"], ["minute", "Minutes"], ["second", "Secondes"]].map(([k, lbl]) => (
              <div key={k} style={{ flex: 1 }}>
                <span style={S.label}>{lbl}</span>
                <input
                  type="text"
                  value={(data[k] as string) ?? "-1"}
                  onChange={e => onChange({ [k]: e.target.value })}
                  style={S.input}
                  placeholder="-1"
                />
              </div>
            ))}
          </div>
          <p style={{ fontSize: 9, color: "#555", marginTop: 4, lineHeight: "1.3" }}>
            Laisse vide ou indique <strong>-1</strong> pour ignorer un paramètre.
            <br />
            Ex: Minutes = 30 déclenchera l'action à chaque heure pile et 30 minutes (ex: 14h30, 15h30).
          </p>
        </>
      )}
    </>
  );
}

// ── OcrFields ────────────────────────────────────────────────────────────────

function OcrFields({ data, onChange }: { data:Record<string,unknown>; onChange:(p:Record<string,unknown>)=>void }) {
  const captureRegion = async () => {
    try {
      const screenIdx = Number(data.screen ?? 0);
      const r = await pickScreenRegion(screenIdx);
      onChange({ x:String(r.x), y:String(r.y), width:String(r.w), height:String(r.h), screen:r.screen });
    } catch { alert("Disponible uniquement dans l'application compilée."); }
  };

  const useRegex = !!(data.use_regex);
  const matchCase = !!(data.match_case);
  const wholeWord = !!(data.match_whole_word);

  const toggleBtn = (label: string, active: boolean, title: string, onClick: () => void) => (
    <button
      onClick={onClick}
      title={title}
      style={{
        ...S.btn, padding:"3px 8px", fontSize:10,
        background: active ? "#1D9E7522" : "#111113",
        borderColor: active ? "#1D9E75" : "#2a2a2e",
        color: active ? "#1D9E75" : "#555",
        fontFamily: "monospace", fontWeight: active ? 700 : 400,
      }}
    >{label}</button>
  );

  return (
    <>
      {/* Zone de capture */}
      <div style={S.row}>
        <span style={S.label}>Zone OCR</span>
        <div style={{ display:"flex", gap:5 }}>
          <button onClick={captureRegion} style={{ ...S.btn, flex:1 }}>
            <i className="ti ti-screenshot" style={{ fontSize:11 }} /> Sélectionner zone
          </button>
        </div>
        <div style={{ display:"flex", gap:4, marginTop:5 }}>
          {[["x","X"],["y","Y"],["width","L"],["height","H"]].map(([k,lbl]) => (
            <div key={k} style={{ flex:1 }}>
              <span style={S.label}>{lbl}</span>
              <input type="text" value={(data[k] as string)??"0"} onChange={e => onChange({[k]:e.target.value})} style={S.input} />
            </div>
          ))}
        </div>
      </div>

      {/* Langue */}
      <div style={S.row}>
        <span style={S.label}>Langue (ex: fra, eng)</span>
        <input type="text" value={(data.lang as string)??"fra"} onChange={e => onChange({ lang:e.target.value })} style={S.input} />
      </div>

      {/* Itérations / cooldown */}
      <SmartInput label="Itérations"     value={(data.iterations  as string)??"1"}   onChange={v => onChange({ iterations:v })} />
      <SmartInput label="Cool-down (ms)" value={(data.cooldown_ms as string)??"250"} onChange={v => onChange({ cooldown_ms:v })} />

      {/* Texte à chercher */}
      <div style={S.row}>
        <span style={S.label}>MATCH — texte à rechercher</span>
        <input
          type="text"
          value={(data.match_text as string)??""}
          onChange={e => onChange({ match_text:e.target.value })}
          style={S.input}
          placeholder="Laisser vide pour tout capturer"
        />
        <div style={{ display:"flex", gap:4, marginTop:5 }}>
          {toggleBtn("Aa", matchCase, "Match case (sensible à la casse)", () => onChange({ match_case:!matchCase }))}
          {toggleBtn("\\b", wholeWord, "Match whole word (mot entier)", () => onChange({ match_whole_word:!wholeWord }))}
          {toggleBtn(".*", useRegex,  "Use Regular Expression",          () => onChange({ use_regex:!useRegex }))}
        </div>
      </div>

      {/* Tolérance */}
      {!useRegex && (
        <div style={S.row}>
          <span style={S.label}>Tolérance ({(data.tolerance as number)??0}%)</span>
          <input
            type="range" min={0} max={100} step={1}
            value={(data.tolerance as number)??0}
            onChange={e => onChange({ tolerance:Number(e.target.value) })}
            style={{ width:"100%", accentColor:"#1D9E75" }}
          />
        </div>
      )}

      {/* Var. sortie */}
      <SmartInput label="Var. de sortie (texte OCR)" value={(data.output_var as string)??"ocrText"} onChange={v => onChange({ output_var:v })} />

      <ScreenPickerButton screen={Number(data.screen??0)} onSelect={s => onChange({ screen:s })} />
      <div style={{ marginTop: 10, display: "flex", gap: 5, alignItems: "center" }}>
        <button
          onClick={async () => {
            try {
              const res = await invoke<boolean>("test_ocr", {
                x: Number(data.x ?? 0),
                y: Number(data.y ?? 0),
                w: Number(data.width ?? 300),
                h: Number(data.height ?? 100),
                screen: Number(data.screen ?? 0),
                lang: String(data.lang ?? "fra"),
                matchText: String(data.match_text ?? "")
              });
              alert(res ? "Succès : Texte OCR matché !" : "Échec : Texte non trouvé dans la capture OCR.");
            } catch (e) {
              alert("Erreur de test: " + String(e));
            }
          }}
          style={{ ...S.btn, flex: 1, background: "#1D9E7522", borderColor: "#1D9E75", color: "#1D9E75", fontWeight: "bold" }}
        >
          <i className="ti ti-test-pipe" style={{ fontSize: 11 }} /> TESTER OCR
        </button>
      </div>
    </>
  );
}

// ── ImageFields ───────────────────────────────────────────────────────────────

function ImageFields({ data, onChange }: { data:Record<string,unknown>; onChange:(p:Record<string,unknown>)=>void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const matchMode = (data.match_mode as string) ?? "first";
  const importFile = (e:React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{ onChange({ template_b64:(reader.result as string).split(",")[1] }); };
    reader.readAsDataURL(file);
  };
  const captureRegion = async () => {
    try {
      const screenIdx = Number(data.screen ?? 0);
      const r = await pickScreenRegion(screenIdx);
      onChange({ region_x:String(r.x), region_y:String(r.y), region_w:String(r.w), region_h:String(r.h), screen:r.screen });
    } catch { alert("Disponible uniquement dans l'application compilée."); }
  };
  const captureImage = async (alsoRegion:boolean) => {
    try {
      const screenIdx = Number(data.screen ?? 0);
      const r = await pickScreenRegion(screenIdx);
      const template=await invoke<string>("capture_region",{ x:r.x, y:r.y, width:r.w, height:r.h, screen:r.screen });
      onChange({ template_b64:template, ...(alsoRegion ? { region_x:String(r.x), region_y:String(r.y), region_w:String(r.w), region_h:String(r.h), screen:r.screen } : {}) });
    } catch { alert("Capture indisponible dans ce contexte."); }
  };
  return (
    <>
      <div style={S.row}>
        <span style={S.label}>Template image</span>
        {!!(data.template_b64 as string) && (
          <div style={{ marginBottom:6, borderRadius:4, overflow:"hidden", border:"0.5px solid #2a2a2e", background:"#0d0d0f" }}>
            <img src={`data:image/png;base64,${data.template_b64 as string}`} style={{ maxWidth:"100%", maxHeight:150, display:"block", objectFit:"contain", margin:"0 auto" }} />
          </div>
        )}
        <div style={{ display:"flex", gap:5 }}>
          <button onClick={() => fileRef.current?.click()} style={{ ...S.btn, flex:1 }}><i className="ti ti-upload" style={{ fontSize:11 }} />Importer</button>
          <button onClick={captureRegion} style={{ ...S.btn, flex:1 }}><i className="ti ti-screenshot" style={{ fontSize:11 }} />Zone</button>
        </div>
        <div style={{ display:"flex", gap:5, marginTop:5 }}>
          <button onClick={() => captureImage(false)} style={{ ...S.btn, flex:1 }}><i className="ti ti-photo" style={{ fontSize:11 }} />Image</button>
          <button onClick={() => captureImage(true)} style={{ ...S.btn, flex:1 }}><i className="ti ti-focus-2" style={{ fontSize:11 }} />Zone+Image</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={importFile} />
      </div>
      <div style={{ display:"flex", gap:4, marginBottom:9 }}>
        {[["region_x","X"],["region_y","Y"],["region_w","L"],["region_h","H"]].map(([k,lbl]) => (
          <div key={k} style={{ flex:1 }}>
            <span style={S.label}>{lbl}</span>
            <input type="text" value={(data[k] as string)??"0"} onChange={e => onChange({[k]:e.target.value})} style={S.input} />
          </div>
        ))}
      </div>
      <SmartInput label="Seuil (0–1)"    value={(data.threshold   as string)??"0.9"} onChange={v => onChange({ threshold:v })} />
      <SmartInput label="Itérations"     value={(data.iterations  as string)??"1"}   onChange={v => onChange({ iterations:v })} />
      <SmartInput label="Cool-down (ms)" value={(data.cooldown_ms as string)??"250"} onChange={v => onChange({ cooldown_ms:v })} />
      <div style={S.row}>
        <span style={S.label}>Mode de match</span>
        <div style={{ display:"flex", gap:4 }}>
          {([["first","Premier Match"],["all","Tous Match"]] as const).map(([mode,label]) => (
            <button key={mode} onClick={() => onChange({ match_mode:mode })} style={{
              ...S.btn, flex:1,
              background: matchMode===mode ? "#1D9E7522" : "#111113",
              borderColor: matchMode===mode ? "#1D9E75" : "#2a2a2e",
              color: matchMode===mode ? "#1D9E75" : "#666",
            }}>{label}</button>
          ))}
        </div>
      </div>
      <SmartInput label="Var. de sortie (BOX dict)" value={(data.output_var  as string)??"imgMatch"} onChange={v => onChange({ output_var:v })} />
      <ScreenPickerButton screen={Number(data.screen??0)} onSelect={s => onChange({ screen:s })} />
      <div style={{ marginTop: 10, display: "flex", gap: 5, alignItems: "center" }}>
        <button
          onClick={async () => {
            try {
              const res = await invoke<boolean>("test_image_match", {
                templateB64: data.template_b64 ?? "",
                x: Number(data.region_x ?? 0),
                y: Number(data.region_y ?? 0),
                w: Number(data.region_w ?? 400),
                h: Number(data.region_h ?? 300),
                screen: Number(data.screen ?? 0),
                threshold: String(data.threshold ?? "0.9")
              });
              alert(res ? "Succès : Image trouvée !" : "Échec : Image non trouvée.");
            } catch (e) {
              alert("Erreur de test: " + String(e));
            }
          }}
          style={{ ...S.btn, flex: 1, background: "#1D9E7522", borderColor: "#1D9E75", color: "#1D9E75", fontWeight: "bold" }}
        >
          <i className="ti ti-test-pipe" style={{ fontSize: 11 }} /> TESTER IMAGE
        </button>
      </div>
    </>
  );
}

// ── CmdFields ─────────────────────────────────────────────────────────────────

function CmdFields({ data, onChange, nodeId }: { data:Record<string,unknown>; onChange:(p:Record<string,unknown>)=>void; nodeId:string }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const saveRestartSnapshotWithNodePatch = useEditorStore(s => s.saveRestartSnapshotWithNodePatch);
  const wait = data.wait !== false;
  const administrator = !!data.administrator;
  const echo = !!data.echo;
  const toggleAdmin = async () => {
    if (administrator) {
      onChange({ administrator:false });
      return;
    }
    try {
      const elevated = await invoke<boolean>("is_app_elevated").catch(() => false);
      if (elevated) {
        onChange({ administrator:true });
        return;
      }
      saveRestartSnapshotWithNodePatch(nodeId, { administrator:true });
      await invoke("request_cmd_admin_access");
    } catch (err) {
      alert(`Acces administrateur refuse ou indisponible.\n${String(err)}`);
      onChange({ administrator:false });
    }
  };
  return (
    <>
      <div style={S.row}>
        <span style={S.label}>Commande</span>
        <textarea
          value={(data.command as string)??""}
          onChange={e => onChange({ command:e.target.value })}
          style={{ ...S.input, minHeight:72, resize:"vertical", fontFamily:"monospace", fontSize:11 }}
          placeholder="python script.py %myVar&#10;powershell -File run.ps1 %path"
        />
        <p style={{ fontSize:9, color:"#555", marginTop:4, lineHeight:"1.3" }}>
          Python, Perl, Ruby, Node.js, Bash/Sh, PowerShell… Les <strong>%variables</strong> sont remplacées avant exécution.
        </p>
      </div>
      <div style={S.row}>
        <span style={S.label}>Attendre la fin</span>
        <div style={{ display:"flex", gap:4 }}>
          {([[true,"Oui"],[false,"Non"]] as const).map(([val,label]) => (
            <button key={String(val)} onClick={() => onChange({ wait:val })} style={{
              ...S.btn, flex:1,
              background: wait===val ? "#64748B22" : "#111113",
              borderColor: wait===val ? "#64748B" : "#2a2a2e",
              color: wait===val ? "#94A3B8" : "#666",
            }}>{label}</button>
          ))}
        </div>
        {!wait && (
          <p style={{ fontSize:9, color:"#555", marginTop:4 }}>
            Mode async : <strong>%CMDReturn</strong> n'est pas alimentée.
          </p>
        )}
      </div>
      <div style={S.row}>
        <span style={S.label}>Options CMD</span>
        <div style={{ display:"flex", gap:4 }}>
          <button onClick={toggleAdmin} style={{
            ...S.btn, flex:1,
            background: administrator ? "#EF9F2722" : "#111113",
            borderColor: administrator ? "#EF9F27" : "#2a2a2e",
            color: administrator ? "#F59E0B" : "#666",
          }}>
            <i className="ti ti-shield-lock" style={{ fontSize:11 }} /> Administrateur
          </button>
          <button onClick={() => onChange({ echo:!echo })} style={{
            ...S.btn, flex:1,
            background: echo ? "#64748B22" : "#111113",
            borderColor: echo ? "#64748B" : "#2a2a2e",
            color: echo ? "#94A3B8" : "#666",
          }}>
            <i className="ti ti-terminal" style={{ fontSize:11 }} /> @echo {echo ? "on" : "off"}
          </button>
        </div>
      </div>
      {wait && (
        <SmartInput label="Var. retour (%CMDReturn)" value={(data.output_var as string)??"CMDReturn"} onChange={v => onChange({ output_var:v })} />
      )}
      <button onClick={() => setHistoryOpen(true)} style={{ ...S.btn, width:"100%", marginTop:4 }}>
        <i className="ti ti-terminal-2" style={{ fontSize:11 }} /> Historique console
      </button>
      {historyOpen && <CmdHistoryModal nodeId={nodeId} onClose={() => setHistoryOpen(false)} />}
    </>
  );
}

function PythonFields({ data, onChange, nodeId }: { data:Record<string,unknown>; onChange:(p:Record<string,unknown>)=>void; nodeId:string }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pythonEnvs, setPythonEnvs] = useState<Array<{ name: string; dir: string }>>([]);
  
  const interpreterMode = (data.interpreter_mode as string) ?? "uv";
  const globals = (data.globals as { name:string; value:string }[] | undefined) ?? [];

  const [manualSubMode, setManualSubMode] = useState<"normal" | "advanced">(
    (data.python_path || data.pip_path) ? "advanced" : "normal"
  );

  useEffect(() => {
    invoke<{ python_envs?: Array<{ name: string; dir: string }> }>("get_settings")
      .then(settings => {
        setPythonEnvs(settings.python_envs || []);
      })
      .catch(err => console.error("Error loading settings in PythonFields:", err));
  }, []);

  const handleBrowseEnvDir = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        title: "Choisir le dossier de l'environnement Python",
        multiple: false,
        directory: true,
      });
      if (path && typeof path === "string") {
        onChange({ python_env_dir: path });
      }
    } catch (err) {
      console.error("Browse directory error:", err);
    }
  };

  const handleBrowseFile = async (field: "python_path" | "pip_path") => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        title: `Choisir le fichier ${field === "python_path" ? "python" : "pip"}`,
        multiple: false,
        directory: false,
      });
      if (path && typeof path === "string") {
        onChange({ [field]: path });
      }
    } catch (err) {
      console.error("Browse file error:", err);
    }
  };

  const updateGlobal = (index:number, key:"name"|"value", value:string) => {
    const next = [...globals];
    next[index] = { ...next[index], [key]: value };
    onChange({ globals: next });
  };
  const addGlobal = () => onChange({ globals: [...globals, { name:`var_${globals.length + 1}`, value:"" }] });
  const removeGlobal = (index:number) => onChange({ globals: globals.filter((_, i) => i !== index) });

  const selectedEnvName = (data.python_env_name as string) ?? "";
  const selectedEnvDir = (data.python_env_dir as string) ?? "";

  return (
    <>
      <div style={S.row}>
        <span style={S.label}>Sélecteur d'interprète</span>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {([["uv", "Mode UV Auto"], ["manual", "Mode Manuel"]] as const).map(([m, lbl]) => (
            <button key={m} onClick={() => onChange({ interpreter_mode: m })} style={{
              ...S.btn, flex: 1,
              background: interpreterMode === m ? "#3776AB22" : "#111113",
              borderColor: interpreterMode === m ? "#3776AB" : "#2a2a2e",
              color: interpreterMode === m ? "#3776AB" : "#666",
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      {interpreterMode === "manual" ? (
        <>
          <div style={S.row}>
            <span style={S.label}>Sous-mode Manuel</span>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {([["normal", "Normal (Dossier)"], ["advanced", "Avancé (Chemins)"]] as const).map(([sm, lbl]) => (
                <button key={sm} onClick={() => {
                  setManualSubMode(sm);
                  if (sm === "normal") {
                    onChange({ python_path: "", pip_path: "" });
                  } else {
                    onChange({ python_env_name: "", python_env_dir: "" });
                  }
                }} style={{
                  ...S.btn, flex: 1, fontSize: 11, padding: "4px 8px",
                  background: manualSubMode === sm ? "#3776AB22" : "#111113",
                  borderColor: manualSubMode === sm ? "#3776AB" : "#2a2a2e",
                  color: manualSubMode === sm ? "#3776AB" : "#666",
                }}>{lbl}</button>
              ))}
            </div>
          </div>

          {manualSubMode === "normal" ? (
            <>
              <div style={S.row}>
                <span style={S.label}>Environnement Python</span>
                <select
                  value={selectedEnvName || "__custom__"}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === "__custom__") {
                      onChange({ python_env_name: "", python_env_dir: "" });
                    } else {
                      const matched = pythonEnvs.find(env => env.name === val);
                      onChange({ python_env_name: val, python_env_dir: matched ? matched.dir : "" });
                    }
                  }}
                  style={{ ...S.input, padding: "8px" }}
                >
                  <option value="__custom__">-- Dossier personnalisé --</option>
                  {pythonEnvs.map(env => (
                    <option key={env.name} value={env.name}>{env.name} ({env.dir})</option>
                  ))}
                </select>
              </div>

              {selectedEnvName !== "" ? (
                <div style={S.row}>
                  <span style={S.label}>Dossier de l'environnement</span>
                  <input type="text" value={selectedEnvDir} disabled style={{ ...S.input, opacity: 0.6 }} />
                </div>
              ) : (
                <div style={S.row}>
                  <span style={S.label}>Dossier de l'environnement</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input
                      type="text"
                      value={selectedEnvDir}
                      onChange={e => onChange({ python_env_dir: e.target.value })}
                      style={{ ...S.input, flex: 1 }}
                      placeholder="Ex: C:\mon_env_python"
                    />
                    <button onClick={handleBrowseEnvDir} style={S.btn} title="Choisir le dossier...">
                      📂
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={S.row}>
                <span style={S.label}>Chemin python.exe</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <input type="text" value={(data.python_path as string) ?? ""} onChange={e => onChange({ python_path: e.target.value })} style={{ ...S.input, flex: 1 }} placeholder="C:\chemin\vers\python.exe" />
                  <button onClick={() => handleBrowseFile("python_path")} style={S.btn} title="Choisir le fichier...">
                    📂
                  </button>
                </div>
              </div>
              <div style={S.row}>
                <span style={S.label}>Chemin pip.exe (facultatif)</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <input type="text" value={(data.pip_path as string) ?? ""} onChange={e => onChange({ pip_path: e.target.value })} style={{ ...S.input, flex: 1 }} placeholder="C:\chemin\vers\pip.exe" />
                  <button onClick={() => handleBrowseFile("pip_path")} style={S.btn} title="Choisir le fichier...">
                    📂
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <div style={S.row}>
          <span style={S.label}>Version Python UV</span>
          <select
            value={(data.python_version as string) ?? "3.12"}
            onChange={e => onChange({ python_version: e.target.value })}
            style={{ ...S.input, background: "#0e0e10" }}
          >
            <option value="3.12">3.12 (Recommandé)</option>
            <option value="3.11">3.11</option>
            <option value="3.10">3.10</option>
            <option value="3.9">3.9</option>
            <option value="3.8">3.8</option>
          </select>
        </div>
      )}
      <div style={S.row}>
        <span style={S.label}>Requirements</span>
        <textarea
          value={(data.requirements as string)??""}
          onChange={e => onChange({ requirements:e.target.value })}
          style={{ ...S.input, minHeight:64, resize:"vertical", fontFamily:"monospace", fontSize:11 }}
          placeholder={"requests==2.32.3\npandas"}
        />
      </div>
      <div style={S.row}>
        <span style={S.label}>Variables globales injectees</span>
        {globals.map((g, i) => (
          <div key={i} style={{ display:"flex", gap:4, marginBottom:5 }}>
            <input
              type="text"
              value={g.name}
              onChange={e => updateGlobal(i, "name", e.target.value)}
              style={{ ...S.input, flex:1 }}
              placeholder="nom"
            />
            <input
              type="text"
              value={g.value}
              onChange={e => updateGlobal(i, "value", e.target.value)}
              style={{ ...S.input, flex:2 }}
              placeholder="%maVariable"
            />
            <button onClick={() => removeGlobal(i)} style={{ ...S.btn, color:"#E24B4A", borderColor:"#E24B4A33" }}>
              <i className="ti ti-trash" style={{ fontSize:10 }} />
            </button>
          </div>
        ))}
        <button onClick={addGlobal} style={{ ...S.btn, width:"100%" }}>
          <i className="ti ti-plus" style={{ fontSize:11 }} /> Ajouter variable
        </button>
      </div>
      <div style={S.row}>
        <span style={S.label}>Editeur Python</span>
        <textarea
          value={(data.script as string)??""}
          onChange={e => onChange({ script:e.target.value })}
          style={{ ...S.input, minHeight:220, resize:"vertical", fontFamily:"Consolas, monospace", fontSize:12, lineHeight:1.45, tabSize:2 }}
          spellCheck={false}
          placeholder={"print('Hello')"}
        />
      </div>
      <SmartInput label="Var. retour stdout" value={(data.output_var as string)??"PythonReturn"} onChange={v => onChange({ output_var:v })} />
      <button onClick={() => setHistoryOpen(true)} style={{ ...S.btn, width:"100%", marginTop:4 }}>
        <i className="ti ti-terminal-2" style={{ fontSize:11 }} /> Historique console
      </button>
      {historyOpen && <CmdHistoryModal nodeId={nodeId} onClose={() => setHistoryOpen(false)} />}
    </>
  );
}

// ── RandomModeField ───────────────────────────────────────────────────────────

function RandomModeField({ data, onChange }: { data:Record<string,unknown>; onChange:(p:Record<string,unknown>)=>void }) {
  const modes: Array<[RandomMode,string]> = [["int","Entier"],["float","Décimal"],["bool","Booléen"],["str","Texte"],["list","Liste"]];
  return (
    <div style={S.row}>
      <span style={S.label}>Mode</span>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4 }}>
        {modes.map(([mode,label]) => (
          <button key={mode} onClick={() => onChange({ mode })} style={{
            ...S.btn,
            background: data.mode===mode ? "#D4537E22" : "#111113",
            borderColor: data.mode===mode ? "#D4537E" : "#2a2a2e",
            color: data.mode===mode ? "#D4537E" : "#666",
          }}>{label}</button>
        ))}
      </div>
    </div>
  );
}

// ── FunctionArgsFields — avec valeur par défaut, édition inline, copie ────────

interface ArgDef { name: string; default_value: string; }

function FunctionArgsFields({ data, onChange }: { data:Record<string,unknown>; onChange:(p:Record<string,unknown>)=>void }) {
  // Support ancien format (string[]) et nouveau (ArgDef[])
  const rawArgs = (data.args ?? []) as (string | ArgDef)[];
  const args: ArgDef[] = rawArgs.map(a =>
    typeof a === "string" ? { name: a, default_value: "" } : a
  );

  const [newName, setNewName]   = useState("");
  const [newDef,  setNewDef]    = useState("");
  const [editIdx, setEditIdx]   = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDef,  setEditDef]  = useState("");
  const [copied,   setCopied]   = useState<number | null>(null);

  const save = (updated: ArgDef[]) => onChange({ args: updated });

  const addArg = () => {
    const name = newName.trim().replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_]/g,"");
    if (!name) return;
    if (args.some(a => a.name === name)) return;
    save([...args, { name, default_value: newDef.trim() }]);
    setNewName(""); setNewDef("");
  };

  const removeArg = (i: number) => save(args.filter((_,idx) => idx !== i));
  const moveUp    = (i: number) => { if (i===0) return; const a=[...args]; [a[i-1],a[i]]=[a[i],a[i-1]]; save(a); };
  const moveDown  = (i: number) => { if (i===args.length-1) return; const a=[...args]; [a[i],a[i+1]]=[a[i+1],a[i]]; save(a); };

  const startEdit = (i: number) => {
    setEditIdx(i); setEditName(args[i].name); setEditDef(args[i].default_value);
  };
  const commitEdit = () => {
    if (editIdx === null) return;
    const name = editName.trim().replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_]/g,"");
    if (!name) { setEditIdx(null); return; }
    const updated = args.map((a,i) => i===editIdx ? { name, default_value: editDef.trim() } : a);
    save(updated); setEditIdx(null);
  };

  const copyName = (i: number) => {
    navigator.clipboard.writeText(`%${args[i].name}`).catch(() => {});
    setCopied(i);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <>
      <div style={{ padding:"5px 8px", background:"#081410", borderRadius:5, border:"0.5px solid #22C55E33", fontSize:9, color:"#2a7040", marginBottom:9 }}>
        Ces arguments seront disponibles comme <span style={{ color:"#c792ea" }}>%nom</span> dans la fonction.
        La valeur par défaut est utilisée si l'appelant ne passe pas l'argument.
      </div>

      {args.length === 0 && (
        <p style={{ fontSize:10, color:"#333", fontFamily:"monospace", marginBottom:8, textAlign:"center" }}>aucun argument</p>
      )}

      {args.map((a, i) => (
        <div key={i} style={{ marginBottom:5, background:"#111113", borderRadius:6, border:"0.5px solid #1a2a1a", overflow:"hidden" }}>
          {editIdx === i ? (
            // ── Mode édition ──
            <div style={{ padding:"6px 8px" }}>
              <div style={{ display:"flex", gap:4, marginBottom:4 }}>
                <div style={{ flex:1 }}>
                  <span style={S.label}>Nom</span>
                  <input
                    autoFocus
                    type="text" value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if(e.key==="Enter") commitEdit(); if(e.key==="Escape") setEditIdx(null); }}
                    style={{ ...S.input, borderColor:"#22C55E88" }}
                  />
                </div>
                <div style={{ flex:1 }}>
                  <span style={S.label}>Défaut</span>
                  <input
                    type="text" value={editDef}
                    onChange={e => setEditDef(e.target.value)}
                    onKeyDown={e => { if(e.key==="Enter") commitEdit(); if(e.key==="Escape") setEditIdx(null); }}
                    placeholder="(vide = requis)"
                    style={{ ...S.input, borderColor:"#22C55E44" }}
                  />
                </div>
              </div>
              <div style={{ display:"flex", gap:4 }}>
                <button onClick={commitEdit} style={{ ...S.btn, flex:1, background:"#22C55E22", borderColor:"#22C55E", color:"#22C55E" }}>
                  <i className="ti ti-check" style={{ fontSize:10 }} /> OK
                </button>
                <button onClick={() => setEditIdx(null)} style={{ ...S.btn, flex:1 }}>
                  <i className="ti ti-x" style={{ fontSize:10 }} /> Annuler
                </button>
              </div>
            </div>
          ) : (
            // ── Mode affichage ──
            <div style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 8px" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ fontSize:11, color:"#c792ea", fontWeight:600, fontFamily:"monospace" }}>%{a.name}</span>
                  {a.default_value && (
                    <span style={{ fontSize:9, color:"#555", background:"#1a1a1e", padding:"1px 5px", borderRadius:3, border:"0.5px solid #2a2a2e", maxWidth:70, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      = {a.default_value}
                    </span>
                  )}
                  {!a.default_value && (
                    <span style={{ fontSize:8, color:"#E24B4A55", fontStyle:"italic" }}>requis</span>
                  )}
                </div>
              </div>

              {/* Bouton copier %nom */}
              <button
                onClick={() => copyName(i)}
                title={`Copier "%${a.name}"`}
                style={{ ...S.btn, padding:"2px 5px", background: copied===i ? "#22C55E22" : "#111113", borderColor: copied===i ? "#22C55E" : "#2a2a2e", color: copied===i ? "#22C55E" : "#666" }}
              >
                <i className={`ti ${copied===i ? "ti-check" : "ti-copy"}`} style={{ fontSize:10 }} />
              </button>

              {/* Bouton éditer */}
              <button onClick={() => startEdit(i)} title="Modifier" style={{ ...S.btn, padding:"2px 5px" }}>
                <i className="ti ti-pencil" style={{ fontSize:10 }} />
              </button>

              {/* Monter / descendre */}
              <button onClick={() => moveUp(i)}   disabled={i===0}             style={{ ...S.btn, padding:"2px 4px", opacity:i===0?0.3:1 }}>↑</button>
              <button onClick={() => moveDown(i)} disabled={i===args.length-1} style={{ ...S.btn, padding:"2px 4px", opacity:i===args.length-1?0.3:1 }}>↓</button>

              {/* Supprimer */}
              <button onClick={() => removeArg(i)} title="Supprimer" style={{ ...S.btn, padding:"2px 5px", color:"#E24B4A", borderColor:"#E24B4A33" }}>
                <i className="ti ti-trash" style={{ fontSize:10 }} />
              </button>
            </div>
          )}
        </div>
      ))}

      {/* ── Formulaire ajout ── */}
      <div style={{ background:"#0e0e10", borderRadius:6, border:"0.5px solid #2a2a2e", padding:"7px 8px", marginTop:4 }}>
        <span style={{ ...S.label, marginBottom:5 }}>Ajouter un argument</span>
        <div style={{ display:"flex", gap:4, marginBottom:5 }}>
          <div style={{ flex:1 }}>
            <span style={{ fontSize:8, color:"#555", display:"block", marginBottom:2 }}>NOM</span>
            <input
              type="text" value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key==="Enter" && addArg()}
              placeholder="nom_arg"
              style={{ ...S.input, fontSize:10 }}
            />
          </div>
          <div style={{ flex:1 }}>
            <span style={{ fontSize:8, color:"#555", display:"block", marginBottom:2 }}>DÉFAUT (optionnel)</span>
            <input
              type="text" value={newDef}
              onChange={e => setNewDef(e.target.value)}
              onKeyDown={e => e.key==="Enter" && addArg()}
              placeholder="valeur par défaut"
              style={{ ...S.input, fontSize:10 }}
            />
          </div>
        </div>
        <button onClick={addArg} style={{ ...S.btn, width:"100%", background:"#22C55E22", borderColor:"#22C55E", color:"#22C55E" }}>
          <i className="ti ti-plus" style={{ fontSize:11 }} /> Ajouter
        </button>
      </div>
    </>
  );
}

// ── FunctionCallFields ────────────────────────────────────────────────────────

function FunctionCallFields({ data, onChange }: { data:Record<string,unknown>; onChange:(p:Record<string,unknown>)=>void }) {
  const [loadedArgs, setLoadedArgs] = useState<{name:string;default_value:string}[]>([]);
  const [loading, setLoading]       = useState(false);
  const callArgs: { name:string; value:string }[] = (data.call_args as { name:string;value:string }[]) ?? [];
  const fnName  = (data.function_name as string) ?? "";
  const retVar  = (data.return_var as string) || (fnName ? `${fnName}_Return` : "");

  const loadFunction = async () => {
    setLoading(true);
    try {
      const { open }         = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await open({ title:"Choisir une fonction", filters:[{ name:"Auto Bot Function", extensions:["abfnc"] }], multiple:false, directory:false }) as string | null;
      if (!path) return;
      const raw = await readTextFile(path);
      const fnData = JSON.parse(raw) as { name:string; args:(string|{name:string;default_value:string})[] };
      const name   = fnData.name ?? path.split(/[/\\]/).pop()?.replace(/\.abfnc$/, "") ?? "fn";
      const args   = (fnData.args ?? []).map((a:string|{name:string;default_value:string}) =>
        typeof a === "string" ? { name:a, default_value:"" } : a
      );
      setLoadedArgs(args);
      onChange({
        function_name: name,
        call_args: args.map(a => ({ name:a.name, value: callArgs.find(c=>c.name===a.name)?.value ?? a.default_value ?? "" })),
        return_var: `${name}_Return`,
      });
    } catch(e) { console.error("[FunctionCall] load:", e); }
    finally { setLoading(false); }
  };

  const displayArgs = loadedArgs.length > 0 ? loadedArgs : callArgs.map(c => ({ name:c.name, default_value:"" }));

  const setArgValue = (name:string, value:string) => {
    const updated = callArgs.map(c => c.name===name ? { ...c, value } : c);
    if (!updated.find(c=>c.name===name)) updated.push({ name, value });
    onChange({ call_args: updated });
  };

  return (
    <>
      <div style={S.row}>
        <span style={S.label}>Fonction</span>
        <div style={{ display:"flex", gap:5, alignItems:"center" }}>
          <div style={{ flex:1, padding:"4px 8px", background:"#0e0818", border:"0.5px solid #3a2a4e", borderRadius:5, fontSize:11, color:fnName?"#c792ea":"#444", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {fnName || "— non définie —"}
          </div>
          <button onClick={loadFunction} disabled={loading} style={{ ...S.btn, background:"#A855F722", borderColor:"#A855F7", color:"#A855F7", flexShrink:0 }}>
            <i className={`ti ${loading?"ti-loader":"ti-folder-open"}`} style={{ fontSize:11 }} />
            {loading ? "…" : "Ouvrir"}
          </button>
        </div>
      </div>

      {displayArgs.length > 0 && (
        <div style={S.row}>
          <span style={S.label}>Arguments</span>
          {displayArgs.map(a => (
            <div key={a.name} style={{ marginBottom:6 }}>
              <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:2 }}>
                <span style={{ fontSize:9, color:"#A855F799", flex:1 }}>%{a.name}</span>
                {a.default_value && <span style={{ fontSize:8, color:"#555" }}>défaut: {a.default_value}</span>}
              </div>
              <SmartInput
                label=""
                value={callArgs.find(c=>c.name===a.name)?.value ?? a.default_value ?? ""}
                onChange={v => setArgValue(a.name, v)}
                placeholder={a.default_value ? `(défaut: ${a.default_value})` : `valeur pour %${a.name}`}
              />
            </div>
          ))}
        </div>
      )}

      <div style={S.row}>
        <span style={S.label}>Variable de retour</span>
        <input type="text" value={retVar} onChange={e => onChange({ return_var:e.target.value })}
          placeholder={fnName ? `${fnName}_Return` : "Return"} style={S.input} />
        <span style={{ fontSize:9, color:"#555", marginTop:3, display:"block" }}>
          → <span style={{ color:"#c792ea" }}>%{retVar || (fnName ? `${fnName}_Return` : "Return")}</span>
        </span>
      </div>
    </>
  );
}

// ── Inspector principal ───────────────────────────────────────────────────────

export function Inspector() {
  const { tabs, activeTabId, selectedNodeId, updateNodeData, removeNode, selectNode } = useEditorStore();
  const [modeTab, setModeTab]           = useState<"normal"|"advanced">("normal");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [picking, setPicking]           = useState(false);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const node      = activeTab?.nodes.find(n => n.id === selectedNodeId);

  const pickPixelAndCoords = async () => {
    if (!node) return;
    setPicking(true);
    try {
      if ('EyeDropper' in window) {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        const pos = await invoke<{ x: number; y: number }>("get_cursor_position");
        const hex = result.sRGBHex.toUpperCase();
        const r = parseInt(hex.slice(1,3), 16);
        const g = parseInt(hex.slice(3,5), 16);
        const b = parseInt(hex.slice(5,7), 16);
        
        updateNodeData(node.id, {
          x: String(pos.x),
          y: String(pos.y),
          expected_hex: hex,
          expected_r: r,
          expected_g: g,
          expected_b: b,
        });
      } else {
        const currentData = node.data as Record<string, unknown>;
        const screenIdx = Number(currentData?.screen ?? 0);
        const r = await pickScreenRegion(screenIdx);
        const res = await invoke<{ r: number; g: number; b: number; hex: string }>(
          "capture_pixel_color",
          { x: r.x, y: r.y, screen: r.screen, expected: 0, tolerance: 0 }
        );
        updateNodeData(node.id, {
          x: String(r.x),
          y: String(r.y),
          screen: r.screen,
          expected_hex: res.hex.toUpperCase(),
          expected_r: res.r,
          expected_g: res.g,
          expected_b: res.b,
        });
      }
    } catch (err) {
      console.warn("Capture annulée ou erreur:", err);
    } finally {
      setPicking(false);
    }
  };

  const base: React.CSSProperties = {
    width:220, flexShrink:0, background:"#0e0e10",
    borderLeft:"0.5px solid #2a2a2e", display:"flex", flexDirection:"column",
    position:"relative", zIndex:10, overflow:"hidden",
  };

  if (!node) return (
    <aside style={base}>
      <VarPanel />
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <p style={{ fontSize:11, color:"#2a2a2e", textAlign:"center", padding:"0 20px" }}>Sélectionne un bloc</p>
      </div>
    </aside>
  );

  const data = node.data as Record<string,unknown>;
  const kind = data.kind as string;
  const meta = BLOCK_CATALOG.find(m => m.kind === kind);
  const patch = (p:Record<string,unknown>) => updateNodeData(node.id, p);
  const undeletable = ["start","function_args","function_return"].includes(kind);

  // Blocs qui ont un champ écran
  const hasScreen = ["mouse_move","mouse_click","mouse_scroll","pixel_color","ocr","image_match"].includes(kind);

  const defaultKeys = meta?.defaultData ? Object.keys(meta.defaultData) : [];

  const genericFields = Object.entries(data)
    .filter(([k,v]) => !BLACKLIST.has(k) && !defaultKeys.includes(k) && typeof v !== "object" && !Array.isArray(v));

  return (
    <aside style={base}>
      <VarPanel />

      {/* En-tête nœud */}
      <div style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 12px", borderBottom:"0.5px solid #2a2a2e" }}>
        <div style={{ width:17, height:17, borderRadius:4, background:meta?.color??"#888", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <i className={`ti ${meta?.icon??"ti-box"}`} style={{ fontSize:9, color:"#fff" }} />
        </div>
        <span style={{ fontSize:11, fontWeight:500, color:"#d0d0d0", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {data.label as string}
        </span>
      </div>

      <InspectorTabs value={modeTab} onChange={setModeTab} />

      <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>
        {modeTab === "advanced" ? (
          <AdvancedFields data={data} onChange={patch} />
        ) : (
          <>
            {/* Alias custom setting */}
            <div style={S.row}>
              <span style={S.label}>Surnom (Alias)</span>
              <input
                type="text"
                value={(data.alias as string) ?? ""}
                onChange={e => patch({ alias: e.target.value })}
                placeholder="Ex: Looper"
                style={S.input}
              />
            </div>

            {/* ── Départ ── */}
            {kind==="start" && (
              <p style={{ fontSize:11, color:"#555", textAlign:"center", marginTop:20 }}>
                Nœud de départ.<br/>Connectez au premier bloc.
              </p>
            )}

            {/* ── Arguments Fonction ── */}
            {kind==="function_args" && <FunctionArgsFields data={data} onChange={patch} />}

            {/* ── Retour Fonction ── */}
            {kind==="function_return" && (
              <SmartInput
                label="Valeur de retour (expression / %var)"
                value={(data.value as string)??""}
                onChange={v => patch({ value:v })}
                placeholder="%result"
              />
            )}

            {/* ── Appel Fonction ── */}
            {kind==="function_call" && <FunctionCallFields data={data} onChange={patch} />}

            {/* ── XY + capture ── */}
            {["mouse_move","mouse_click","mouse_scroll","pixel_color"].includes(kind) && (
              <>
                <SmartInput label="X" value={(data.x as string)??"0"} onChange={v => patch({ x:v })}
                  capture onCaptureY={y => patch({ y:String(y) })} />
                <SmartInput label="Y" value={(data.y as string)??"0"} onChange={v => patch({ y:v })} />
              </>
            )}

            {/* ── Sélection écran — pour tous les blocs qui en ont un ── */}
            {hasScreen && kind !== "image_match" && kind !== "ocr" && (
              <ScreenPickerButton
                screen={Number(data.screen ?? 0)}
                onSelect={s => patch({ screen: s })}
              />
            )}

            {/* ── Mouse click ── */}
            {kind==="mouse_click" && (
              <>
                <div style={S.row}>
                  <span style={S.label}>Bouton souris</span>
                  <div style={{ display:"flex", gap:4 }}>
                    {(["left","right","middle"] as MouseButton[]).map(b => (
                      <button key={b} onClick={() => patch({ button:b })} style={{
                        ...S.btn, flex:1,
                        background: data.button===b ? "#E84C1E22" : "#111113",
                        borderColor: data.button===b ? "#E84C1E" : "#2a2a2e",
                        color: data.button===b ? "#E84C1E" : "#666",
                      }}>{b}</button>
                    ))}
                  </div>
                </div>
                <BoolField label="Double-clic" value={!!data.double_click} onChange={v => patch({ double_click:v })} />
                <SmartInput label="Durée déplacement (ms)" value={(data.travel_ms as string)??"100"} onChange={v => patch({ travel_ms:v })} />
                <SmartInput label="Délai après (ms)" value={(data.delay_after_ms as string)??"0"} onChange={v => patch({ delay_after_ms:v })} />
              </>
            )}

            {/* ── Mouse move ── */}
            {kind==="mouse_move" && (
              <>
                <SmartInput label="Durée déplacement (ms)" value={(data.travel_ms as string)??"100"} onChange={v => patch({ travel_ms:v })} />
                <BoolField label="Relatif" value={!!data.relative} onChange={v => patch({ relative:v })} />
              </>
            )}

            {/* ── Mouse scroll ── */}
            {kind==="mouse_scroll" && (
              <>
                <SmartInput label="Delta X" value={(data.delta_x as string)??"0"} onChange={v => patch({ delta_x:v })} />
                <SmartInput label="Delta Y" value={(data.delta_y as string)??"3"} onChange={v => patch({ delta_y:v })} />
                <SmartInput label="Durée déplacement (ms)" value={(data.travel_ms as string)??"0"} onChange={v => patch({ travel_ms:v })} />
              </>
            )}

            {/* ── Clavier ── */}
            {kind==="key_press" && (
              <>
                <SmartInput label="Touche / combinaison" value={(data.key_combo as string)??"F5"} onChange={v => patch({ key_combo:v })} placeholder="F5, ctrl+c, …" />
                <button onClick={() => setKeyboardOpen(true)} style={{ ...S.btn, width:"100%", marginBottom:9 }}>
                  <i className="ti ti-keyboard" style={{ fontSize:11 }} />Ouvrir le clavier
                </button>
                <SmartInput label="Maintien (ms)" value={(data.hold_ms as string)??"0"} onChange={v => patch({ hold_ms:v })} />
              </>
            )}
            {kind==="type_text" && (
              <>
                <SmartInput label="Texte (%var, %% = %)" value={(data.text as string)??""} onChange={v => patch({ text:v })} multiline placeholder="Bonjour %prenom !!" />
                <SmartInput label="Délai inter-caractères (ms)" value={(data.delay_between_chars_ms as string)??"0"} onChange={v => patch({ delay_between_chars_ms:v })} />
              </>
            )}

            {/* ── Math ── */}
            {kind==="math" && (
              <>
                <div style={S.row}>
                  <span style={S.label}>Variable cible</span>
                  <input type="text" value={(data.target_var as string)??"result"} onChange={e => patch({ target_var:e.target.value })} style={S.input} />
                </div>
                <SmartInput label="Expression" value={(data.expression as string)??"%i * 2"} onChange={v => patch({ expression:v })} placeholder="%i * 2 + 100" />
              </>
            )}

            {/* ── Attendre ── */}
            {kind==="wait" && <WaitFields data={data} onChange={patch} />}

            {/* ── For loop ── */}
            {kind==="for_loop" && (
              <>
                <div style={S.row}>
                  <span style={S.label}>Variable de boucle</span>
                  <input type="text" value={(data.var_name as string)??"i"} onChange={e => patch({ var_name:e.target.value })} style={S.input} />
                </div>
                <SmartInput label="De"  value={(data.from as string)??"0"}  onChange={v => patch({ from:v })} />
                <SmartInput
                  label="À"
                  value={data.infinite ? "∞" : ((data.to as string) ?? "10")}
                  onChange={v => patch({ to: v })}
                  disabled={!!data.infinite}
                />
                <SmartInput label="Pas" value={(data.step as string)??"1"}  onChange={v => patch({ step:v })} />
                <BoolField label="Mode Infini (∞)" value={!!data.infinite} onChange={v => {
                  if (v) {
                    patch({ infinite: v, to: "∞" });
                  } else {
                    patch({ infinite: v, to: "10" });
                  }
                }} />
                <div style={{ padding:"5px 8px", background:"#111113", borderRadius:5, border:"0.5px solid #2a2a2e", fontSize:9, color:"#555" }}>
                  <span style={{ color:"#7F77DD" }}>▶ corps</span> → blocs dans la boucle<br/>
                  <span style={{ color:"#7F77DD" }}>↩ retour</span> → fin d'itération<br/>
                  <span style={{ color:"#E24B4A" }}>⏏ break</span> → sortie anticipée
                </div>
              </>
            )}

            {/* ── Set variable ── */}
            {kind==="set_variable" && (() => {
              const vars = (data.vars as { name: string; value: string }[]) ?? [];
              const allVars = vars.length > 0 ? vars : [{ name: (data.name as string) ?? "myVar", value: (data.value as string) ?? "0" }];

              const updateVar = (index: number, key: "name" | "value", val: string) => {
                const newVars = [...allVars];
                newVars[index] = { ...newVars[index], [key]: val };
                const patchObj: Record<string, any> = { vars: newVars };
                if (index === 0) {
                  patchObj[key] = val;
                }
                patch(patchObj);
              };

              const addVar = () => {
                const newVars = [...allVars, { name: `newVar${allVars.length + 1}`, value: "0" }];
                patch({ vars: newVars });
              };

              const removeVar = (index: number) => {
                if (allVars.length <= 1) return;
                const newVars = allVars.filter((_, i) => i !== index);
                const patchObj: Record<string, any> = { vars: newVars };
                patchObj.name = newVars[0].name;
                patchObj.value = newVars[0].value;
                patch(patchObj);
              };

              return (
                <>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 8, fontFamily: "monospace" }}>
                    Définir une ou plusieurs variables locales :
                  </div>
                  {allVars.map((v, i) => (
                    <div key={i} style={{ marginBottom: 10, padding: 8, background: "#111113", borderRadius: 6, border: "0.5px solid #2a2a2e" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 9, color: "#7F77DD", fontWeight: "bold" }}>Variable #{i + 1}</span>
                        {allVars.length > 1 && (
                          <button onClick={() => removeVar(i)} title="Supprimer" style={{ ...S.btn, padding: "1px 4px", color: "#E24B4A", borderColor: "#E24B4A33" }}>
                            <i className="ti ti-trash" style={{ fontSize: 9 }} />
                          </button>
                        )}
                      </div>
                      <div style={S.row}>
                        <span style={S.label}>Nom</span>
                        <input type="text" value={v.name} onChange={e => updateVar(i, "name", e.target.value)} style={S.input} />
                      </div>
                      <SmartInput label="Valeur" value={v.value} onChange={val => updateVar(i, "value", val)} />
                    </div>
                  ))}
                  <button onClick={addVar} style={{ ...S.btn, width: "100%", background: "#7F77DD22", borderColor: "#7F77DD", color: "#7F77DD", marginTop: 5 }}>
                    <i className="ti ti-plus" style={{ fontSize: 11 }} /> Ajouter une variable
                  </button>
                </>
              );
            })()}

            {/* ── Random ── */}
            {kind==="random" && (
              <>
                <RandomModeField data={data} onChange={patch} />
                {data.mode==="list" ? (
                  <SmartInput label="Éléments (virgule)" value={(data.list_items as string)??"a,b,c"} onChange={v => patch({ list_items:v })} />
                ) : data.mode==="bool" ? null : (
                  <>
                    <SmartInput label={data.mode==="str"?"Longueur min":"Min"} value={(data.min as string)??"0"} onChange={v => patch({ min:v })} />
                    <SmartInput label={data.mode==="str"?"Longueur max":"Max"} value={(data.max as string)??"100"} onChange={v => patch({ max:v })} />
                  </>
                )}
                <BoolField label="Seed fixe" value={!!data.use_seed} onChange={v => patch({ use_seed:v })} />
                {!!data.use_seed && <SmartInput label="Valeur seed" value={(data.seed as string)??"42"} onChange={v => patch({ seed:v })} />}
                <SmartInput label="Var. de sortie" value={(data.output_var as string)??"rnd"} onChange={v => patch({ output_var:v })} />
              </>
            )}

            {/* ── Si ── */}
            {kind==="if" && (
              <>
                <SmartInput label="Condition" value={(data.condition as string)??"%myVar > 0"} onChange={v => patch({ condition:v })} multiline placeholder="%score > 100 && %alive == true" />
                <div style={{ padding:"5px 8px", background:"#111113", borderRadius:5, border:"0.5px solid #2a2a2e", fontSize:9, color:"#555", lineHeight:1.6 }}>
                  <span style={{ color:"#c792ea" }}>%var</span> → valeur · Opérateurs: <span style={{ color:"#EF9F27" }}>== != &gt; &lt; &gt;= &lt;=</span><br/>
                  Logique: <span style={{ color:"#EF9F27" }}>&amp;&amp; || </span>
                </div>
              </>
            )}

            {/* ── Pixel color ── */}
            {kind==="pixel_color" && (
              <>
                <button
                  onClick={pickPixelAndCoords}
                  disabled={picking}
                  style={{
                    ...S.btn,
                    width: "100%",
                    marginBottom: 10,
                    background: picking ? "#1D9E7522" : "#111113",
                    borderColor: "#1D9E75",
                    color: "#1D9E75",
                    fontWeight: "bold",
                  }}
                >
                  <i className={`ti ${picking ? "ti-loader" : "ti-color-picker"}`} style={{ marginRight: 6 }} />
                  {picking ? "Sélectionnez sur l'écran..." : "Pipette (Pos + Couleur)"}
                </button>
                <ColorField data={data} onChange={patch} />
                 <div style={S.row}>
                  <span style={S.label}>Tolérance ({(data.tolerance as number)??10})</span>
                  <input type="range" min={0} max={255} step={1} value={(data.tolerance as number)??10} onChange={e => patch({ tolerance:Number(e.target.value) })} style={{ width:"100%", accentColor:"#1D9E75" }} />
                </div>
                <SmartInput label="Itérations"     value={(data.iterations  as string)??"1"}   onChange={v => patch({ iterations:v })} />
                <SmartInput label="Cool-down (ms)" value={(data.cooldown_ms as string)??"250"} onChange={v => patch({ cooldown_ms:v })} />
                <SmartInput label="Var. de sortie" value={(data.output_var as string)??"pixelMatch"} onChange={v => patch({ output_var:v })} />
                <ScreenPickerButton screen={Number(data.screen??0)} onSelect={s => patch({ screen:s })} />
                <div style={{ marginTop: 10, display: "flex", gap: 5, alignItems: "center" }}>
                  <button
                    onClick={async () => {
                      try {
                        const expectedHex = data.color_format === "rgb"
                          ? `#${((data.expected_r as number ?? 255) << 16 | (data.expected_g as number ?? 0) << 8 | (data.expected_b as number ?? 0)).toString(16).padStart(6, "0")}`
                          : String(data.expected_hex ?? "#FF0000");
                        const res = await invoke<boolean>("test_pixel_color", {
                          x: Number(data.x ?? 0),
                          y: Number(data.y ?? 0),
                          screen: Number(data.screen ?? 0),
                          expectedHex,
                          tolerance: Number(data.tolerance ?? 10)
                        });
                        alert(res ? "Succès : La couleur correspond !" : "Échec : La couleur ne correspond pas.");
                      } catch (e) {
                        alert("Erreur de test: " + String(e));
                      }
                    }}
                    style={{ ...S.btn, flex: 1, background: "#1D9E7522", borderColor: "#1D9E75", color: "#1D9E75", fontWeight: "bold" }}
                  >
                    <i className="ti ti-test-pipe" style={{ fontSize: 11 }} /> TESTER PIXEL
                  </button>
                </div>
              </>
            )}

            {/* ── Image match — inclut son propre ScreenPickerButton ── */}
            {kind==="image_match" && <ImageFields data={data} onChange={patch} />}

            {/* ── OCR ── */}
            {kind==="ocr" && (
              <OcrFields data={data} onChange={patch} />
            )}

            {/* ── Array nodes ── */}
            {kind==="array_push" && (
              <>
                <div style={S.row}>
                  <span style={S.label}>Nom de l'array</span>
                  <input type="text" value={(data.array_var as string)??"myArray"} onChange={e => patch({ array_var:e.target.value })} style={S.input} />
                </div>
                <SmartInput label="Valeurs à push (séparées par virgules)" value={(data.values as string)??""} onChange={v => patch({ values:v })} placeholder="val1, val2" />
                <div style={S.row}>
                  <span style={S.label}>Position</span>
                  <div style={{ display:"flex", gap:4 }}>
                    {(["back","front"] as const).map(pos => (
                      <button key={pos} onClick={() => patch({ position:pos })} style={{
                        ...S.btn, flex:1,
                        background: data.position===pos ? "#0EA5E922" : "#111113",
                        borderColor: data.position===pos ? "#0EA5E9" : "#2a2a2e",
                        color: data.position===pos ? "#0EA5E9" : "#666",
                      }}>{pos==="back"?"À la fin (back)":"Au début (front)"}</button>
                    ))}
                  </div>
                </div>
                <BoolField label="Unique (éviter doublons)" value={!!data.unique} onChange={v => patch({ unique:v })} />
              </>
            )}

            {kind==="array_merge" && (
              <>
                <SmartInput label="Arrays à fusionner (noms séparés par virgules)" value={(data.array_vars as string)??"arr1,arr2"} onChange={v => patch({ array_vars:v })} />
                <div style={S.row}>
                  <span style={S.label}>Variable de sortie</span>
                  <input type="text" value={(data.output_var as string)??"merged"} onChange={e => patch({ output_var:e.target.value })} style={S.input} />
                </div>
              </>
            )}

            {kind==="array_get" && (
              <>
                <div style={S.row}>
                  <span style={S.label}>Nom de l'array</span>
                  <input type="text" value={(data.array_var as string)??"myArray"} onChange={e => patch({ array_var:e.target.value })} style={S.input} />
                </div>
                <SmartInput label="Index" value={(data.index as string)??"0"} onChange={v => patch({ index:v })} />
                <div style={S.row}>
                  <span style={S.label}>Variable de sortie</span>
                  <input type="text" value={(data.output_var as string)??"item"} onChange={e => patch({ output_var:e.target.value })} style={S.input} />
                </div>
              </>
            )}

            {kind==="array_search" && (
              <>
                <div style={S.row}>
                  <span style={S.label}>Nom de l'array</span>
                  <input type="text" value={(data.array_var as string)??"myArray"} onChange={e => patch({ array_var:e.target.value })} style={S.input} />
                </div>
                <SmartInput label="Valeurs à chercher (séparées par virgules)" value={(data.values as string)??""} onChange={v => patch({ values:v })} />
                <div style={S.row}>
                  <span style={S.label}>Mode de recherche</span>
                  <div style={{ display:"flex", gap:4 }}>
                    {(["first","last","all"] as const).map(m => (
                      <button key={m} onClick={() => patch({ mode:m })} style={{
                        ...S.btn, flex:1,
                        background: data.mode===m ? "#0EA5E922" : "#111113",
                        borderColor: data.mode===m ? "#0EA5E9" : "#2a2a2e",
                        color: data.mode===m ? "#0EA5E9" : "#666",
                      }}>{m==="first"?"Premier":m==="last"?"Dernier":"Tous"}</button>
                    ))}
                  </div>
                </div>
                <div style={S.row}>
                  <span style={S.label}>Variable de sortie</span>
                  <input type="text" value={(data.output_var as string)??"idx"} onChange={e => patch({ output_var:e.target.value })} style={S.input} />
                </div>
              </>
            )}

            {kind==="array_delete" && (
              <>
                <div style={S.row}>
                  <span style={S.label}>Nom de l'array</span>
                  <input type="text" value={(data.array_var as string)??"myArray"} onChange={e => patch({ array_var:e.target.value })} style={S.input} />
                </div>
                <SmartInput label="Index à supprimer" value={(data.index as string)??"0"} onChange={v => patch({ index:v })} />
              </>
            )}

            {/* ── Dict nodes ── */}
            {kind==="dict_add" && (() => {
              const pairs = (data.pairs as { key: string; value: string }[]) ?? [{ key: "", value: "" }];
              const updatePair = (index: number, fld: "key" | "value", val: string) => {
                const newPairs = [...pairs];
                newPairs[index] = { ...newPairs[index], [fld]: val };
                patch({ pairs: newPairs });
              };
              const addPair = () => {
                patch({ pairs: [...pairs, { key: "", value: "" }] });
              };
              const removePair = (index: number) => {
                if (pairs.length <= 1) return;
                patch({ pairs: pairs.filter((_, i) => i !== index) });
              };
              return (
                <>
                  <div style={S.row}>
                    <span style={S.label}>Nom du Dict</span>
                    <input type="text" value={(data.dict_var as string)??"myDict"} onChange={e => patch({ dict_var:e.target.value })} style={S.input} />
                  </div>
                  <span style={S.label}>Paires Clé/Valeur</span>
                  {pairs.map((p, i) => (
                    <div key={i} style={{ marginBottom: 10, padding: 8, background: "#111113", borderRadius: 6, border: "0.5px solid #2a2a2e" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 9, color: "#F59E0B", fontWeight: "bold" }}>Paire #{i + 1}</span>
                        {pairs.length > 1 && (
                          <button onClick={() => removePair(i)} style={{ ...S.btn, padding: "1px 4px", color: "#E24B4A", borderColor: "#E24B4A33" }}>
                            <i className="ti ti-trash" style={{ fontSize: 9 }} />
                          </button>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <div style={{ flex: 1 }}>
                          <span style={S.label}>Clé</span>
                          <input type="text" value={p.key} onChange={e => updatePair(i, "key", e.target.value)} style={S.input} placeholder="ex: nom" />
                        </div>
                        <div style={{ flex: 2 }}>
                          <span style={S.label}>Valeur</span>
                          <input type="text" value={p.value} onChange={e => updatePair(i, "value", e.target.value)} style={S.input} placeholder="ex: Jean" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button onClick={addPair} style={{ ...S.btn, width: "100%", background: "#F59E0B22", borderColor: "#F59E0B", color: "#F59E0B", marginTop: 5 }}>
                    <i className="ti ti-plus" style={{ fontSize: 11 }} /> Ajouter une paire
                  </button>
                </>
              );
            })()}

            {kind==="dict_combine" && (
              <>
                <SmartInput label="Dicts à combiner (noms séparés par virgules)" value={(data.dict_vars as string)??"dict1,dict2"} onChange={v => patch({ dict_vars:v })} />
                <div style={S.row}>
                  <span style={S.label}>Variable de sortie</span>
                  <input type="text" value={(data.output_var as string)??"combined"} onChange={e => patch({ output_var:e.target.value })} style={S.input} />
                </div>
              </>
            )}

            {kind==="dict_find" && (
              <>
                <div style={S.row}>
                  <span style={S.label}>Nom du Dict</span>
                  <input type="text" value={(data.dict_var as string)??"myDict"} onChange={e => patch({ dict_var:e.target.value })} style={S.input} />
                </div>
                <SmartInput label="Clé à chercher" value={(data.key as string)??""} onChange={v => patch({ key:v })} />
                <div style={S.row}>
                  <span style={S.label}>Variable de sortie</span>
                  <input type="text" value={(data.output_var as string)??"value"} onChange={e => patch({ output_var:e.target.value })} style={S.input} />
                </div>
              </>
            )}

            {kind==="dict_remove" && (
              <>
                <div style={S.row}>
                  <span style={S.label}>Nom du Dict</span>
                  <input type="text" value={(data.dict_var as string)??"myDict"} onChange={e => patch({ dict_var:e.target.value })} style={S.input} />
                </div>
                <SmartInput label="Clé à supprimer" value={(data.key as string)??""} onChange={v => patch({ key:v })} />
              </>
            )}

            {kind==="iterations" && (
              <>
                <SmartInput
                  label="Nombre d'itérations"
                  value={data.infinite ? "∞" : ((data.count as string) ?? "10")}
                  onChange={v => patch({ count: v })}
                  disabled={!!data.infinite}
                />
                <BoolField label="Mode Infini (∞)" value={!!data.infinite} onChange={v => {
                  if (v) {
                    patch({ infinite: v, count: "∞" });
                  } else {
                    patch({ infinite: v, count: "10" });
                  }
                }} />
                <div style={{ padding:"5px 8px", background:"#111113", borderRadius:5, border:"0.5px solid #2a2a2e", fontSize:9, color:"#555" }}>
                  <span style={{ color:"#7F77DD" }}>▶ corps</span> → blocs dans la boucle
                </div>
              </>
            )}

            {kind==="foreach" && (
              <>
                <div style={S.row}>
                  <span style={S.label}>Nom de la collection (ARRAY / DICT / STRING)</span>
                  <input type="text" value={(data.collection_var as string)??"myArray"} onChange={e => patch({ collection_var:e.target.value })} style={S.input} />
                </div>
                <div style={{ padding:"5px 8px", background:"#111113", borderRadius:5, border:"0.5px solid #2a2a2e", fontSize:9, color:"#555", lineHeight:1.6 }}>
                  <span style={{ color:"#7F77DD" }}>▶ corps</span> → blocs dans la boucle<br/>
                  Variables disponibles :<br/>
                  • Array/String : <span style={{ color:"#c792ea" }}>%x</span> (valeur), <span style={{ color:"#c792ea" }}>%foreachindex</span><br/>
                  • Dict : <span style={{ color:"#c792ea" }}>%key</span>, <span style={{ color:"#c792ea" }}>%value</span>, <span style={{ color:"#c792ea" }}>%foreachindex</span>
                </div>
              </>
            )}

            {kind==="switch" && (() => {
              const cases = (data.cases as string[]) ?? ["1", "2"];
              const updateCase = (idx: number, val: string) => {
                const newCases = [...cases];
                newCases[idx] = val;
                patch({ cases: newCases });
              };
              const addCase = () => {
                patch({ cases: [...cases, `Option ${cases.length + 1}`] });
              };
              const removeCase = (idx: number) => {
                if (cases.length <= 1) return;
                patch({ cases: cases.filter((_, i) => i !== idx) });
              };
              return (
                <>
                  <SmartInput label="Expression à évaluer" value={(data.expression as string)??""} onChange={v => patch({ expression:v })} />
                  <span style={S.label}>Cas d'évaluation (Conditions)</span>
                  {cases.map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 6 }}>
                      <input
                        type="text"
                        value={c}
                        onChange={e => updateCase(i, e.target.value)}
                        style={{ ...S.input, flex: 1 }}
                        placeholder={`Cas #${i + 1}`}
                      />
                      {cases.length > 1 && (
                        <button
                          onClick={() => removeCase(i)}
                          style={{ ...S.btn, padding: "4px 8px", color: "#E24B4A", borderColor: "#E24B4A33" }}
                          title="Supprimer la condition"
                        >
                          <i className="ti ti-trash" style={{ fontSize: 9 }} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addCase}
                    style={{ ...S.btn, width: "100%", background: "#EF9F2722", borderColor: "#EF9F27", color: "#EF9F27", marginTop: 5, marginBottom: 10 }}
                  >
                    <i className="ti ti-plus" style={{ fontSize: 11 }} /> Ajouter Condition
                  </button>
                  <div style={{ padding:"5px 8px", background:"#111113", borderRadius:5, border:"0.5px solid #2a2a2e", fontSize:9, color:"#555" }}>
                    Les ports de sorties correspondants seront créés sur la droite du nœud Switch.
                  </div>
                </>
              );
            })()}

            {kind==="console" && (
              <>
                <SmartInput label="Texte à logguer (supporte %var)" value={(data.text as string)??""} onChange={v => patch({ text:v })} multiline />
              </>
            )}

            {kind==="ia" && (
              <>
                <div style={S.row}>
                  <span style={S.label}>Mode Inférence</span>
                  <div style={{ display:"flex", gap:4, marginBottom:8 }}>
                    {([["text","Texte (LLM)"],["image","Vision (VLM)"]] as const).map(([m,lbl]) => (
                      <button key={m} onClick={() => patch({ mode:m })} style={{
                        ...S.btn, flex:1,
                        background: data.mode===m ? "#3B82F622" : "#111113",
                        borderColor: data.mode===m ? "#3B82F6" : "#2a2a2e",
                        color: data.mode===m ? "#3B82F6" : "#666",
                      }}>{lbl}</button>
                    ))}
                  </div>
                </div>
                <SmartInput label="Prompt / Consigne" value={(data.prompt as string)??""} onChange={v => patch({ prompt:v })} multiline />
                <div style={S.row}>
                  <span style={S.label}>Source Modèle</span>
                  <div style={{ display:"flex", gap:4, marginBottom:8 }}>
                    {([["external","API Externe"],["local","Inférence Locale"]] as const).map(([src,lbl]) => (
                      <button key={src} onClick={() => patch({ api_mode:src })} style={{
                        ...S.btn, flex:1,
                        background: data.api_mode===src ? "#3B82F622" : "#111113",
                        borderColor: data.api_mode===src ? "#3B82F6" : "#2a2a2e",
                        color: data.api_mode===src ? "#3B82F6" : "#666",
                      }}>{lbl}</button>
                    ))}
                  </div>
                </div>
                {data.api_mode === "external" && (
                  <div style={S.row}>
                    <span style={S.label}>Clé API</span>
                    <input type="password" value={(data.api_key as string)??""} onChange={e => patch({ api_key:e.target.value })} style={S.input} placeholder="sk-..." />
                  </div>
                )}
                <div style={S.row}>
                  <span style={S.label}>Nom du modèle</span>
                  <input type="text" value={(data.model_name as string)??""} onChange={e => patch({ model_name:e.target.value })} style={S.input} placeholder="ex: gpt-4o, ollama/llama3" />
                </div>
                <SmartInput label="Variable de sortie" value={(data.output_var as string)??"response"} onChange={v => patch({ output_var:v })} />
              </>
            )}

            {kind==="vpo" && (
              <>
                <div style={S.row}>
                  <span style={S.label}>Classe à détecter (YOLO)</span>
                  <input type="text" value={(data.class_name as string)??"person"} onChange={e => patch({ class_name:e.target.value })} style={S.input} placeholder="person, car, dog..." />
                </div>
                <div style={S.row}>
                  <span style={S.label}>Seuil de confiance ({String(data.threshold??"0.5")})</span>
                  <input type="range" min={0.1} max={1.0} step={0.05} value={Number(data.threshold??"0.5")} onChange={e => patch({ threshold:e.target.value })} style={{ width:"100%", accentColor:"#10B981" }} />
                </div>
                <SmartInput label="Variable de sortie" value={(data.output_var as string)??"vpoMatch"} onChange={v => patch({ output_var:v })} />
              </>
            )}

            {kind==="history" && (() => {
              const nodesList = activeTab?.nodes ?? [];
              const loggableNodes = nodesList.filter(n =>
                ["cmd", "python", "ocr", "ia", "vpo"].includes(n.data.kind as string)
              );
              return (
                <div style={S.row}>
                  <span style={S.label}>Nœud cible lié</span>
                  <select
                    value={(data.targetNodeId as string) ?? ""}
                    onChange={e => {
                      const id = e.target.value;
                      const targetNode = loggableNodes.find(n => n.id === id);
                      patch({
                        targetNodeId: id,
                        targetNodeLabel: targetNode ? (targetNode.data.label as string) : ""
                      });
                    }}
                    style={{ ...S.input, background: "#0e0e10" }}
                  >
                    <option value="">-- Choisir un nœud --</option>
                    {loggableNodes.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.data.label as string} ({n.id})
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}

            {kind==="cmd" && <CmdFields data={data} onChange={patch} nodeId={node.id} />}
            {kind==="python" && <PythonFields data={data} onChange={patch} nodeId={node.id} />}

            {/* Generic fallback */}
            {genericFields.map(([k,v]) => (
              <SmartInput key={k} label={k.replace(/_/g," ")} value={String(v??"")} onChange={val => patch({ [k]:val })} />
            ))}
          </>
        )}
      </div>

      {/* Bouton supprimer */}
      {!undeletable && (
        <div style={{ padding:"8px 12px", borderTop:"0.5px solid #2a2a2e" }}>
          <button onClick={() => { removeNode(node.id); selectNode(null); }} style={{
            width:"100%", padding:"5px 0", background:"none", color:"#E24B4A",
            border:"0.5px solid #E24B4A33", borderRadius:5, fontSize:11,
            fontFamily:"monospace", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:5,
          }}>
            <i className="ti ti-trash" style={{ fontSize:12 }} /> Supprimer
          </button>
        </div>
      )}

      {keyboardOpen && (
        <KeyboardModal onConfirm={combo => patch({ key_combo:combo })} onClose={() => setKeyboardOpen(false)} />
      )}
    </aside>
  );
}
