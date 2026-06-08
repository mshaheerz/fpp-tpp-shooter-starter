import { state } from './state'
import { setActiveTool } from './tools'

/** Kenney asset catalog — defines all palette items */
export const KENNEY_CATALOG: Record<string, { label: string; file: string; color: string }[]> = {
  'Industrial Buildings': [
    { label: 'Building A', file: 'industrial/Models/GLB format/building-a.glb', color: '#7a6a5a' },
    { label: 'Building B', file: 'industrial/Models/GLB format/building-b.glb', color: '#7a6a5a' },
    { label: 'Building C', file: 'industrial/Models/GLB format/building-c.glb', color: '#7a6a5a' },
    { label: 'Building D', file: 'industrial/Models/GLB format/building-d.glb', color: '#7a6a5a' },
    { label: 'Building F', file: 'industrial/Models/GLB format/building-f.glb', color: '#7a6a5a' },
    { label: 'Building H', file: 'industrial/Models/GLB format/building-h.glb', color: '#7a6a5a' },
    { label: 'Building J', file: 'industrial/Models/GLB format/building-j.glb', color: '#7a6a5a' },
    { label: 'Building L', file: 'industrial/Models/GLB format/building-l.glb', color: '#7a6a5a' },
    { label: 'Building N', file: 'industrial/Models/GLB format/building-n.glb', color: '#7a6a5a' },
    { label: 'Building P', file: 'industrial/Models/GLB format/building-p.glb', color: '#7a6a5a' },
    { label: 'Building R', file: 'industrial/Models/GLB format/building-r.glb', color: '#7a6a5a' },
    { label: 'Chimney Large', file: 'industrial/Models/GLB format/chimney-large.glb', color: '#7a6a5a' },
    { label: 'Chimney Medium', file: 'industrial/Models/GLB format/chimney-medium.glb', color: '#7a6a5a' },
    { label: 'Chimney Small', file: 'industrial/Models/GLB format/chimney-small.glb', color: '#7a6a5a' },
    { label: 'Detail Tank', file: 'industrial/Models/GLB format/detail-tank.glb', color: '#6b7b8d' },
  ],
  'Suburban': [
    { label: 'House A', file: 'suburban/Models/GLB format/building-type-a.glb', color: '#8a9a7a' },
    { label: 'House B', file: 'suburban/Models/GLB format/building-type-b.glb', color: '#8a9a7a' },
    { label: 'House C', file: 'suburban/Models/GLB format/building-type-c.glb', color: '#8a9a7a' },
    { label: 'House E', file: 'suburban/Models/GLB format/building-type-e.glb', color: '#8a9a7a' },
    { label: 'House G', file: 'suburban/Models/GLB format/building-type-g.glb', color: '#8a9a7a' },
    { label: 'House I', file: 'suburban/Models/GLB format/building-type-i.glb', color: '#8a9a7a' },
    { label: 'House K', file: 'suburban/Models/GLB format/building-type-k.glb', color: '#8a9a7a' },
    { label: 'House M', file: 'suburban/Models/GLB format/building-type-m.glb', color: '#8a9a7a' },
    { label: 'Driveway Short', file: 'suburban/Models/GLB format/driveway-short.glb', color: '#8a8a8a' },
    { label: 'Fence 1x3', file: 'suburban/Models/GLB format/fence-1x3.glb', color: '#6a7a5a' },
    { label: 'Fence 1x4', file: 'suburban/Models/GLB format/fence-1x4.glb', color: '#6a7a5a' },
    { label: 'Tree Large', file: 'suburban/Models/GLB format/tree-large.glb', color: '#5a8a4a' },
    { label: 'Tree Small', file: 'suburban/Models/GLB format/tree-small.glb', color: '#5a8a4a' },
  ],
  'Prototype / Walls': [
    { label: 'Wall', file: 'prototype/Models/GLB format/wall.glb', color: '#8a8070' },
    { label: 'Wall Low', file: 'prototype/Models/GLB format/wall-low.glb', color: '#8a8070' },
    { label: 'Wall Corner', file: 'prototype/Models/GLB format/wall-corner.glb', color: '#8a8070' },
    { label: 'Wall Window', file: 'prototype/Models/GLB format/wall-window-medium.glb', color: '#8a8070' },
    { label: 'Wall Window Small', file: 'prototype/Models/GLB format/wall-window-small.glb', color: '#8a8070' },
    { label: 'Crate (color)', file: 'prototype/Models/GLB format/crate-color.glb', color: '#8b6a3b' },
    { label: 'Crate', file: 'prototype/Models/GLB format/crate.glb', color: '#8b6a3b' },
    { label: 'Target A Round', file: 'prototype/Models/GLB format/target-a-round.glb', color: '#ecd46e' },
    { label: 'Target A Square', file: 'prototype/Models/GLB format/target-a-square.glb', color: '#ecd46e' },
    { label: 'Target B Round', file: 'prototype/Models/GLB format/target-b-round.glb', color: '#ecd46e' },
    { label: 'Target B Square', file: 'prototype/Models/GLB format/target-b-square.glb', color: '#ecd46e' },
  ],
  'Roads': [
    { label: 'Tile Low', file: 'roads/Models/GLB format/tile-low.glb', color: '#6a6a6a' },
    { label: 'Road Straight', file: 'roads/Models/GLB format/road-straight.glb', color: '#5a5a5a' },
    { label: 'Road Crossroad', file: 'roads/Models/GLB format/road-crossroad.glb', color: '#5a5a5a' },
    { label: 'Road Intersection', file: 'roads/Models/GLB format/road-intersection.glb', color: '#5a5a5a' },
    { label: 'Road End Barrier', file: 'roads/Models/GLB format/road-end-barrier.glb', color: '#5a5a5a' },
    { label: 'Light Curved', file: 'roads/Models/GLB format/light-curved.glb', color: '#7a7a5a' },
    { label: 'Construction Cone', file: 'roads/Models/GLB format/construction-cone.glb', color: '#e0615d' },
    { label: 'Construction Barrier', file: 'roads/Models/GLB format/construction-barrier.glb', color: '#e0615d' },
    { label: 'Construction Light', file: 'roads/Models/GLB format/construction-light.glb', color: '#e0615d' },
  ],
}

/** Build the palette DOM and attach event handlers */
export function buildPalette() {
  const container = document.getElementById('palette')
  if (!container) return

  let html = ''
  html += `<div class="palette-section"><div class="palette-label">▶ Spawns</div><div class="palette-items">
    <div class="palette-item" data-tool="playerSpawn"><span class="dot" style="background:#4caf7d"></span>Player Spawn</div>
    <div class="palette-item" data-tool="enemySpawn"><span class="dot" style="background:#e0615d"></span>Enemy Spawn</div>
    <div class="palette-item" data-tool="waypoint"><span class="dot" style="background:#42a5f5"></span>Waypoint</div>
  </div></div>`
  html += `<input class="search-input" id="palette-search" placeholder="Search assets..." />`

  for (const [sectionName, items] of Object.entries(KENNEY_CATALOG)) {
    html += `<div class="palette-section"><div class="palette-label">▶ ${sectionName}</div><div class="palette-items">`
    for (const item of items) {
      const toolKey = 'prop' + item.file.replace(/\//g, '/')
      html += `<div class="palette-item" data-tool="${toolKey}" data-asset="${item.file}" data-search="${item.label.toLowerCase()} ${sectionName.toLowerCase()}">
        <span class="dot" style="background:${item.color}"></span>${item.label}</div>`
    }
    html += `</div></div>`
  }

  container.innerHTML = html

  // Collapse/expand sections
  container.querySelectorAll('.palette-label').forEach(label => {
    label.addEventListener('click', () => {
      const section = label.closest('.palette-section')
      if (section) section.classList.toggle('collapsed')
    })
  })

  // Search filter
  const searchInput = document.getElementById('palette-search') as HTMLInputElement
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase()
      container.querySelectorAll<HTMLElement>('.palette-item').forEach(el => {
        const search = el.dataset.search || ''
        const tool = el.dataset.tool || ''
        el.style.display = (!q || search.includes(q) || tool.toLowerCase().includes(q)) ? '' : 'none'
      })
      container.querySelectorAll<HTMLElement>('.palette-section').forEach(section => {
        const items = section.querySelectorAll<HTMLElement>('.palette-items .palette-item')
        const visible = Array.from(items).some(el => el.style.display !== 'none')
        section.style.display = ((section.querySelector('.palette-label')?.textContent?.trim().startsWith('▶') ?? false) && !visible) ? 'none' : ''
      })
    })
  }

  // Tool click
  container.querySelectorAll('.palette-item').forEach(el => {
    el.addEventListener('click', () => {
      const tool = (el as HTMLElement).dataset.tool!
      setActiveTool(state.activeTool === tool ? null : tool)
    })
  })
}