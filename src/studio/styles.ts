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
  --radius: 8px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; background: var(--bg); color: var(--text); font: 13px/1.5 system-ui, -apple-system, sans-serif; }
#viewport { position: fixed; inset: 0; }
#viewport canvas { display: block; width: 100%; height: 100%; }
#toolbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  height: 48px; display: flex; align-items: center; gap: 8px;
  padding: 0 14px; background: rgba(14,17,23,0.92);
  border-bottom: 1px solid var(--border); backdrop-filter: blur(8px);
}
#toolbar .logo { font-weight: 800; font-size: 15px; color: var(--accent); letter-spacing: 0.06em; margin-right: 14px; }
#toolbar .logo span { color: var(--text); font-weight: 400; }
.tb-group { display: flex; gap: 4px; align-items: center; }
.tb-btn, .tb-select {
  background: transparent; border: 1px solid var(--border); border-radius: 6px;
  color: var(--text); padding: 6px 12px; font-size: 12px; cursor: pointer;
  transition: all 120ms ease; white-space: nowrap; line-height: 1.4;
}
.tb-btn:hover, .tb-select:hover { background: var(--panel-hover); border-color: var(--accent); color: #fff; }
.tb-btn.primary { background: var(--accent); color: #1a1206; font-weight: 700; border-color: var(--accent); }
.tb-btn.primary:hover { filter: brightness(1.1); }
.tb-btn:disabled { opacity: 0.4; cursor: default; }
.tb-btn:disabled:hover { background: transparent; border-color: var(--border); color: var(--text); }
.tb-sep { width: 1px; height: 28px; background: var(--border); margin: 0 6px; }
#palette {
  position: fixed; left: 10px; top: 60px; z-index: 90;
  width: 220px; max-height: calc(100vh - 80px); overflow-y: auto;
  background: rgba(14,17,23,0.92); border: 1px solid var(--border);
  border-radius: var(--radius); backdrop-filter: blur(8px);
  padding: 12px;
}
#palette::-webkit-scrollbar { width: 4px; }
#palette::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
.palette-section { margin-bottom: 14px; }
.palette-section:last-child { margin-bottom: 0; }
.palette-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.12em; color: var(--text-dim); margin-bottom: 6px; cursor: pointer;
  display: flex; align-items: center; gap: 6px;
}
.palette-label:hover { color: var(--text); }
.palette-section.collapsed .palette-items { display: none; }
.palette-items { display: flex; flex-direction: column; gap: 1px; }
.palette-item {
  display: flex; align-items: center; gap: 8px; padding: 4px 8px;
  border-radius: 5px; cursor: pointer; transition: all 100ms ease;
  font-size: 11px;
}
.palette-item:hover { background: var(--panel-hover); }
.palette-item.active { background: var(--accent-dim); border: 1px solid rgba(245,196,81,0.3); }
.palette-item .dot {
  width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.2);
}
#props-panel {
  position: fixed; right: 10px; top: 60px; z-index: 90;
  width: 250px; max-height: calc(100vh - 80px); overflow-y: auto;
  background: rgba(14,17,23,0.92); border: 1px solid var(--border);
  border-radius: var(--radius); backdrop-filter: blur(8px);
  padding: 12px; display: none;
}
#props-panel.visible { display: block; }
#props-panel::-webkit-scrollbar { width: 4px; }
#props-panel::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
.prop-header { font-weight: 700; font-size: 14px; margin-bottom: 10px; color: #fff; }
.prop-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.prop-row label { color: var(--text-dim); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.prop-row input, .prop-row select {
  width: 110px; background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 4px 8px; color: var(--text); font-size: 12px;
}
.prop-row input:focus { border-color: var(--accent); outline: none; }
.prop-actions { display: flex; gap: 6px; margin-top: 12px; }
.prop-actions button {
  flex: 1; padding: 6px 10px; border-radius: 5px; border: 1px solid var(--border);
  background: transparent; color: var(--text); cursor: pointer; font-size: 12px; font-weight: 600;
}
.prop-actions button:hover { background: var(--panel-hover); }
.prop-actions .delete { border-color: var(--danger); color: var(--danger); }
.prop-actions .delete:hover { background: rgba(224,97,93,0.15); }
#status {
  position: fixed; bottom: 8px; left: 50%; transform: translateX(-50%); z-index: 90;
  background: rgba(14,17,23,0.85); border: 1px solid var(--border);
  border-radius: 6px; padding: 5px 16px; font-size: 11px; color: var(--text-dim);
  backdrop-filter: blur(4px); white-space: nowrap; pointer-events: none;
}
#status strong { color: var(--text); }
.modal-overlay {
  position: fixed; inset: 0; z-index: 999; display: flex;
  align-items: center; justify-content: center;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
}
.modal-overlay.hidden { display: none; }
.modal {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 24px; max-width: 480px; width: 90vw;
}
.modal h2 { margin-bottom: 14px; font-size: 16px; color: #fff; }
.modal p { color: var(--text-dim); font-size: 13px; margin-bottom: 14px; }
.modal textarea {
  width: 100%; min-height: 200px; background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 8px; color: var(--text); font: 12px/1.5 monospace;
  resize: vertical; margin-bottom: 12px;
}
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
.search-input {
  width: 100%; background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 5px 8px; color: var(--text); font-size: 12px;
  margin-bottom: 8px;
}
.search-input:focus { border-color: var(--accent); outline: none; }
.selection-count {
  position: fixed; left: 50%; top: 56px; transform: translateX(-50%); z-index: 89;
  background: var(--accent-dim); border: 1px solid var(--accent);
  border-radius: 6px; padding: 3px 14px; font-size: 11px; color: var(--accent);
  display: none; pointer-events: none;
}
.selection-count.visible { display: block; }
`
  document.head.appendChild(style)
}