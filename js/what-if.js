// ─── What If Mode ─────────────────────────────────────────────────────────────
// Owns the toggle button UI, BFS cascade logic, and all what-if visual
// application / clearing. Receives live references to the D3 selections it
// needs to mutate (nodePoints, linkLines, linkGroups, mainGroup) via init().

import { links } from "./state.js";
import {
    whatIfMode, removedNode,
    toggleWhatIfMode, setRemovedNode,
    onWhatIfModeToggle, onRemovedNodeChange,
    selectedNode,
} from "./state.js";

// Selections injected from node-graph.js after the graph is rendered
let _nodePoints, _linkLines, _linkGroups, _mainGroup, _getLinkColor, _applySelectionVisuals, _internalSelectNode;

export function initWhatIf({ nodePoints, linkLines, linkGroups, mainGroup, getLinkColor, applySelectionVisuals, internalSelectNode }) {
    _nodePoints          = nodePoints;
    _linkLines           = linkLines;
    _linkGroups          = linkGroups;
    _mainGroup           = mainGroup;
    _getLinkColor        = getLinkColor;
    _applySelectionVisuals = applySelectionVisuals;
    _internalSelectNode  = internalSelectNode;

    _buildToggleButton();
    _registerCallbacks();
}

// ─── Toggle button ────────────────────────────────────────────────────────────
function _buildToggleButton() {
    const btn = document.createElement("button");
    btn.id        = "what-if-toggle";
    btn.className = "what-if-toggle";
    btn.title     = "What If Mode";
    btn.innerHTML = "What if?";
    document.body.appendChild(btn);

    btn.addEventListener("click", () => toggleWhatIfMode());

    // Keep button state in sync with the mode
    onWhatIfModeToggle((active) => btn.classList.toggle("active", active));
}

// ─── Cascade animation state ──────────────────────────────────────────────────
let _cascadeTimers = [];

function cancelCascade() {
    _cascadeTimers.forEach(t => clearTimeout(t));
    _cascadeTimers = [];
}

// BFS from removedId following outgoing links only → Map<nodeId, depth>
function bfsDownstreamDepths(removedId) {
    const depth = new Map();
    depth.set(removedId, 0);
    const queue = [removedId];
    while (queue.length) {
        const curr = queue.shift();
        for (const l of links) {
            const srcId = typeof l.source === "object" ? l.source.id : l.source;
            const tgtId = typeof l.target === "object" ? l.target.id : l.target;
            if (srcId === curr && !depth.has(tgtId)) {
                depth.set(tgtId, depth.get(curr) + 1);
                queue.push(tgtId);
            }
        }
    }
    return depth; // includes root at depth 0
}

// ─── Visual application ───────────────────────────────────────────────────────
function applyWhatIfVisuals(removedId) {
    cancelCascade();

    if (!removedId) {
        clearWhatIfVisuals();
        return;
    }

    // Clear any inline opacity styles from normal selection
    _nodePoints.style("opacity", null);
    _linkLines.style("opacity", null).style("stroke-width", null);
    _linkGroups.selectAll(".link-direction").remove();
    _mainGroup.selectAll(".whatif-ring").remove();

    // Reset all what-if classes so previous selection is fully cleared
    _nodePoints
        .classed("node-erased",   false)
        .classed("node-affected", false);
    _linkLines.classed("link-erased", false);
    _nodePoints.selectAll(".whatif-cross").remove();

    // Build depth map (root = 0, direct children = 1, grandchildren = 2, …)
    const depthMap = bfsDownstreamDepths(removedId);
    const maxDepth = Math.max(...depthMap.values());

    // Group nodes by depth
    const byDepth = new Map();
    depthMap.forEach((d, id) => {
        if (!byDepth.has(d)) byDepth.set(d, []);
        byDepth.get(d).push(id);
    });

    const WAVE_DELAY = 500; // ms between depth waves

    // Apply root immediately (depth 0)
    _nodePoints.each(function(n) {
        if (n.id !== removedId) return;
        const g = d3.select(this);
        g.classed("node-erased", true);
        g.selectAll(".whatif-cross").remove();
        const arm = 16, cy = 13;
        g.append("line").attr("class", "whatif-cross")
            .attr("x1", -arm).attr("y1", cy - arm)
            .attr("x2",  arm).attr("y2", cy + arm);
        g.append("line").attr("class", "whatif-cross")
            .attr("x1",  arm).attr("y1", cy - arm)
            .attr("x2", -arm).attr("y2", cy + arm);
    });

    // Also erase links touching root immediately
    _linkLines.each(function(l) {
        const srcId = typeof l.source === "object" ? l.source.id : l.source;
        const tgtId = typeof l.target === "object" ? l.target.id : l.target;
        if (srcId === removedId || tgtId === removedId) {
            d3.select(this).classed("link-erased", true);
        }
    });

    // Wave downstream nodes in, depth by depth
    for (let d = 1; d <= maxDepth; d++) {
        const waveIds = new Set(byDepth.get(d) ?? []);
        const delay   = d * WAVE_DELAY;

        const t = setTimeout(() => {
            _nodePoints.each(function(n) {
                if (waveIds.has(n.id)) d3.select(this).classed("node-affected", true);
            });
            _linkLines.each(function(l) {
                const tgtId = typeof l.target === "object" ? l.target.id : l.target;
                const srcId = typeof l.source === "object" ? l.source.id : l.source;
                if (waveIds.has(tgtId) || waveIds.has(srcId)) {
                    d3.select(this).classed("link-erased", true);
                }
            });
        }, delay);

        _cascadeTimers.push(t);
    }
}

export function clearWhatIfVisuals() {
    cancelCascade();
    _mainGroup.selectAll(".whatif-ring").remove();
    _nodePoints.selectAll(".whatif-cross").remove();
    _nodePoints
        .classed("node-erased",    false)
        .classed("node-affected",  false)
        .classed("node-surviving", false)
        .style("opacity", null);
    _linkLines
        .classed("link-erased", false)
        .style("opacity",       null)
        .style("stroke-width",  null);
}

// ─── Mode callbacks ───────────────────────────────────────────────────────────
function _registerCallbacks() {
    onWhatIfModeToggle((active) => {
        document.body.classList.toggle("what-if-active", active);

        if (active) {
            // Clear any existing node/link selection highlights when entering What If mode
            _nodePoints
                .classed("node-hovered",  false)
                .classed("node-muted",    false)
                .classed("node-selected", false)
                .classed("node-dimmed",   false)
                .style("opacity", null);
            _linkLines
                .classed("link-hovered", false)
                .classed("link-dimmed",  false)
                .style("opacity",        null)
                .style("stroke-width",   null)
                .attr("stroke", d => _getLinkColor(d));
            _linkGroups.selectAll(".link-direction").remove();
        } else {
            clearWhatIfVisuals();
            // Restore normal selection visuals if a node was selected before
            if (selectedNode) {
                _internalSelectNode(selectedNode);
                _applySelectionVisuals(selectedNode);
            }
        }
    });

    onRemovedNodeChange((node) => {
        if (whatIfMode) applyWhatIfVisuals(node?.id ?? null);
    });
}

// ─── Node click handler for What If mode (called from node-graph.js) ─────────
export function handleWhatIfNodeClick(d) {
    if (removedNode?.id === d.id) {
        setRemovedNode(null);
    } else {
        setRemovedNode(d);
    }
}