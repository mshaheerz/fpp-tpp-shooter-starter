/**
 * All CSS for the Map Studio editor.
 * Injected as a style tag so the HTML stays minimal.
 */
export function injectStyles() {
  const style = document.createElement('style')
  style.textContent = `
:root {
  --bg: #0e1117;
  --panel: #171b24;
  --panel-hover: #1f2532;
  --border: #2a3040;
  --text: #d0d4da;
  --text-dim: #8891a0;
  --accent: #f5c451;
  --accent-dim: rgba(245,196,81,0.15);
  --danger: #e0615d;
  --green: #4caf7d;
  --radius: 6px;
  --panel-width: 260px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; background: var(--bg); color: var(--text); font: 13px/1.5 system-ui, -apple-system, sans-serif; }
#viewport { position: fixed; inset: 0; }
#viewport canvas { display: block; width: 100%; height: 100%; }

/* === Toolbar === */
#toolbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  height: 44px; display: flex; align-items: center; gap: 6px;
  padding: 0 10px; background: rgba(14,17,23,0.95);
  border-bottom: 1px solid var(--border); backdrop-filter: blur(8px);
}
#toolbar .logo { font-weight: 800; font-size: 14px; color: var(--accent); letter-spacing: 0.06em; margin-right: 10px; }
#toolbar .logo span { color: var(--text); font-weight: 400; }
.tb-group { display: flex; gap: 3px; align-items: center; }
.tb-btn, .tb-select {
  background: transparent; border: 1px solid var(--border); border-radius: 5px;
  color: var(--text); padding: 5px 10px; font-size: 11px; cursor: pointer;
  transition: all 120ms ease; white-space: nowrap; line-height: 1.4;
}
.tb-btn:hover, .tb-select:hover { background: var(--panel-hover); border-color: var(--accent); color: #fff; }
.tb-btn.primary { background: var(--accent); color: #1a1206; font-weight: 700; border-color: var(--accent); }
.tb-btn.primary:hover { filter: brightness(1.1); }
.tb-btn:disabled { opacity: 0.4; cursor: default; }
.tb-btn:disabled:hover { background: transparent; border-color: var(--border); color: var(--text); }
.tb-sep { width: 1px; height: 24px; background: var(--border); margin: 0 4px; }
#transform-group .tb-btn { padding: 5px 8px; font-size: 10px; }
#transform-group .tb-btn.active {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: var(--accent);
}

/* === Left Panel (Assets + Scene) === */
#left-panel {
  position: fixed; left: 0; top: 44px; bottom: 0; z-index: 90;
  width: var(--panel-width);
  background: rgba(14,17,23,0.92); border-right: 1px solid var(--border);
  backdrop-filter: blur(8px);
  display: flex; flex-direction: column;
}
.panel-tabs {
  display: flex; border-bottom: 1px solid var(--border);
}
.panel-tab {
  flex: 1; background: transparent; border: none;
  color: var(--text-dim); padding: 8px 6px; font-size: 11px; cursor: pointer;
  font-weight: 600; transition: all 100ms ease;
}
.panel-tab:hover { color: var(--text); background: var(--panel-hover); }
.panel-tab.active { color: var(--accent); border-bottom: 2px solid var(--accent); }
.panel-content { display: none; flex: 1; overflow-y: auto; }
.panel-content.active { display: block; }
.panel-content::-webkit-scrollbar { width: 4px; }
.panel-content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

/* === Palette (inside left panel) === */
#palette { padding: 8px; }
.palette-section { margin-bottom: 8px; }
.palette-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--text-dim); margin-bottom: 4px; cursor: pointer;
  display: flex; align-items: center; gap: 4px; padding: 2px 4px; border-radius: 3px;
}
.palette-label:hover { color: var(--text); background: var(--panel-hover); }
.palette-section.collapsed .palette-items { display: none; }
.palette-items { display: flex; flex-direction: column; gap: 1px; }
.palette-item {
  display: flex; align-items: center; gap: 6px; padding: 3px 6px;
  border-radius: 4px; cursor: pointer; transition: all 80ms ease;
  font-size: 11px;
}
.palette-item:hover { background: var(--panel-hover); }
.palette-item.active { background: var(--accent-dim); border: 1px solid rgba(245,196,81,0.3); }
.palette-item .dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.2);
}
.search-input {
  width: 100%; background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 4px 6px; color: var(--text); font-size: 11px;
  margin-bottom: 6px;
}
.search-input:focus { border-color: var(--accent); outline: none; }

/* === Hierarchy (inside left panel) === */
#hierarchy { padding: 8px; }
.hierarchy-header {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--text-dim); margin-bottom: 6px;
}
.hierarchy-item {
  display: flex; align-items: center; gap: 6px; padding: 4px 6px;
  border-radius: 4px; cursor: pointer; font-size: 11px;
  transition: all 80ms ease;
}
.hierarchy-item:hover { background: var(--panel-hover); }
.hierarchy-item.selected { background: var(--accent-dim); color: var(--accent); }
.hierarchy-item .dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.hierarchy-item .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* === Right Panel (Inspector) === */
#inspector-panel {
  position: fixed; right: 0; top: 44px; bottom: 0; z-index: 90;
  width: var(--panel-width);
  background: rgba(14,17,23,0.92); border-left: 1px solid var(--border);
  backdrop-filter: blur(8px);
  overflow-y: auto;
}
#inspector-panel::-webkit-scrollbar { width: 4px; }
#inspector-panel::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
.inspector-header {
  padding: 8px 10px; font-size: 12px; font-weight: 700; color: var(--text-dim);
  text-transform: uppercase; letter-spacing: 0.1em;
  border-bottom: 1px solid var(--border);
}
.inspector-empty {
  padding: 20px; text-align: center; color: var(--text-dim); font-size: 12px;
}
.inspector-section {
  border-bottom: 1px solid var(--border); padding: 8px 10px;
}
.inspector-section-title {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-dim); margin-bottom: 6px;
}
.inspector-row {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;
  gap: 8px;
}
.inspector-row label {
  color: var(--text-dim); font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em; min-width: 60px;
}
.inspector-row input, .inspector-row select {
  flex: 1; background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 4px 6px; color: var(--text); font-size: 11px;
}
.inspector-row input:focus { border-color: var(--accent); outline: none; }
.inspector-actions {
  display: flex; gap: 6px; padding: 8px 10px;
}
.inspector-actions button {
  flex: 1; padding: 5px 8px; border-radius: 4px; border: 1px solid var(--border);
  background: transparent; color: var(--text); cursor: pointer; font-size: 11px; font-weight: 600;
}
.inspector-actions button:hover { background: var(--panel-hover); }
.inspector-actions .delete { border-color: var(--danger); color: var(--danger); }
.inspector-actions .delete:hover { background: rgba(224,97,93,0.15); }
.inspector-actions .duplicate { border-color: var(--accent); color: var(--accent); }
.inspector-actions .duplicate:hover { background: var(--accent-dim); }

/* === Status Bar === */
#status {
  position: fixed; bottom: 6px; left: 50%; transform: translateX(-50%); z-index: 90;
  background: rgba(14,17,23,0.85); border: 1px solid var(--border);
  border-radius: 5px; padding: 4px 14px; font-size: 10px; color: var(--text-dim);
  backdrop-filter: blur(4px); white-space: nowrap; pointer-events: none;
}
#status strong { color: var(--text); }
.selection-count {
  position: fixed; left: 50%; top: 50px; transform: translateX(-50%); z-index: 89;
  background: var(--accent-dim); border: 1px solid var(--accent);
  border-radius: 5px; padding: 2px 12px; font-size: 10px; color: var(--accent);
  display: none; pointer-events: none;
}
.selection-count.visible { display: block; }

/* === Modals === */
.modal-overlay {
  position: fixed; inset: 0; z-index: 999; display: flex;
  align-items: center; justify-content: center;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
}
.modal-overlay.hidden { display: none; }
.modal {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 20px; max-width: 460px; width: 90vw;
}
.modal h2 { margin-bottom: 12px; font-size: 15px; color: #fff; }
.modal p { color: var(--text-dim); font-size: 12px; margin-bottom: 12px; }
.modal textarea {
  width: 100%; min-height: 180px; background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 8px; color: var(--text); font: 11px/1.4 monospace;
  resize: vertical; margin-bottom: 10px;
}
.modal-actions { display: flex; gap: 6px; justify-content: flex-end; }
`
  document.head.appendChild(style)
}