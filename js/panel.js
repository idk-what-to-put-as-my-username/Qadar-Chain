import { onNodeSelected, links, nodes, selectNode, CEtoAH } from './state.js';

const sidebar = document.getElementById('sidebar');
const sidebarHeader = document.querySelector('.sidebar-header');
const sidebarContent = document.querySelector('.sidebar-content');

function selectNodeById(id) {
    const node = nodes.find(n => n.id === id);
    if (node) selectNode(node);
}

function formatNodeInfo(node) {
    if (!node) {
        return `
            <div class="panel-card panel-card-empty">
                <div class="panel-card-name">Select a node</div>
                <div class="panel-card-desc">Click any node on the graph to show its information here.</div>
            </div>
        `;
    }

    // Find causes: links where target is this node
    const causes = links
        .filter(l => l.target === node.id)
        .map(l => nodes.find(n => n.id === l.source))
        .filter(Boolean);

    // Find effects: links where source is this node
    const effects = links
        .filter(l => l.source === node.id)
        .map(l => nodes.find(n => n.id === l.target))
        .filter(Boolean);

    const causesHtml = causes.length ? `
        <div class="panel-section">
            <div class="panel-section-label">Led to this</div>
            <div class="panel-links">
                ${causes.map(c => `<div class="panel-link" onclick="selectNodeById('${c.id}')">← ${c.name}</div>`).join('')}
            </div>
        </div>
    ` : '';

    const effectsHtml = effects.length ? `
        <div class="panel-section">
            <div class="panel-section-label">Rippled into</div>
            <div class="panel-links">
                ${effects.map(e => `<div class="panel-link" onclick="selectNodeById('${e.id}')">→ ${e.name}</div>`).join('')}
            </div>
        </div>
    ` : '';

    return `
        <div class="panel-card">
            <div class="panel-card-name">${node.name}</div>
            <div class="panel-card-desc">${node.desc || 'No description available.'}</div>
            <div class="panel-card-time">
                <span><strong>Year: </strong> ${node.year ?? '—'} CE &nbsp/ <span class="ah-time">${CEtoAH(node.year, 1) ?? '—'} AH</span></span>
            </div>
            ${causesHtml}
            ${effectsHtml}
        </div>
    `;
}

function renderSidebarPanel(node) {
    if (node) {
        sidebar.classList.add('open')
    }

    sidebarHeader.innerHTML = '<span class="sidebar-title"> N O D E &nbsp I N F O </span>'

    sidebarContent.innerHTML = formatNodeInfo(node)
    sidebarContent.scrollTop = 0;
}

renderSidebarPanel(null);
onNodeSelected(renderSidebarPanel);

// Make selectNodeById global for onclick
window.selectNodeById = selectNodeById;
