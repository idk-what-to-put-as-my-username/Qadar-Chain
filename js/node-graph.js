import { nodes, links } from "./state.js";
import { selectNode, selectedNode, onNodeSelected, selectLink, selectedLink } from "./state.js";
import { linkThickness, nodeRadius, defaultColour, highlight, maxLen, forceLinkDistance, forceLinkStrength, forceRepulsionStrength, forceCollisionRadius, glowControl } from "./state.js";
import { whatIfMode } from "./state.js";
import { ERAS, NODE_ERA_MAP, ERA_BRIDGE_LINKS } from "./state.js";
import { onEraFilterChange, isNodeOnSelectedEras, areAllErasActive, onTimelineChange, isNodeBeforePresent } from "./state.js";


import { initWhatIf, handleWhatIfNodeClick } from "./what-if.js";
import { initLoader } from "./loader.js";

// ─── SVG setup ────────────────────────────────────────────────────────────────
const width  = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select("#node-graph")
    .attr("viewBox", `0, 0, ${width}, ${height}`);

const defs      = svg.select("defs");
const mainGroup = svg.select("#main-g");

let simulation, linkGroups, linkLines, nodePoints, nodeCircles, nodeNames;
let bridgeLinkGroups;

// ─── Colour helpers ───────────────────────────────────────────────────────────
function rgbToRgba(rgb, alpha) {
    return rgb.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
}

function getLinkColor(l) {
    const srcId  = typeof l.source === "object" ? l.source.id : l.source;
    const tgtId  = typeof l.target === "object" ? l.target.id : l.target;
    const srcEra = NODE_ERA_MAP[srcId];
    const tgtEra = NODE_ERA_MAP[tgtId];
    if (srcEra && srcEra === tgtEra) {
        const era = ERAS.find(e => e.id === srcEra);
        if (era) return rgbToRgba(era.color, 0.4);
    }
    return rgbToRgba(defaultColour, 0.25);
}

// ─── Gradients ────────────────────────────────────────────────────────────────
function createGradient(id, colour, stops) {
    defs.append("radialGradient")
        .attr("id", id)
        .selectAll("stop")
        .data([
            { offset: `${stops[0] * 100}%`, color: rgbToRgba(colour, 1)   },
            { offset: `${stops[1] * 100}%`, color: rgbToRgba(colour, 0.5) },
            { offset: `${stops[2] * 100}%`, color: rgbToRgba(colour, 0)   },
        ])
        .enter().append("stop")
        .attr("offset",     d => d.offset)
        .attr("stop-color", d => d.color);
}

function createEraGradient(eraId, colour) {
    const gradId = `eraGlow-${eraId}`;
    defs.select(`#${gradId}`).remove();
    defs.append("radialGradient")
        .attr("id", gradId)
        .selectAll("stop")
        .data([
            { offset: `${glowControl.reg[0] * 100}%`, color: rgbToRgba(colour, 1)   },
            { offset: `${glowControl.reg[1] * 100}%`, color: rgbToRgba(colour, 0.5) },
            { offset: `${glowControl.reg[2] * 100}%`, color: rgbToRgba(colour, 0)   },
        ])
        .enter().append("stop")
        .attr("offset",     d => d.offset)
        .attr("stop-color", d => d.color);
    return gradId;
}

// Initialise gradients
ERAS.forEach(era => createEraGradient(era.id, era.color));
createGradient("defaultGlow", defaultColour, glowControl.reg);

// ─── Zoom / pan ───────────────────────────────────────────────────────────────
const zoomBehaviour = d3.zoom()
    .scaleExtent([0.2, 2.5])
    .on("zoom", (e) => { mainGroup.attr("transform", e.transform); });
svg.call(zoomBehaviour);

const initialScale = 0.272;
const { cx: initCx, cy: initCy } = _getVisualCenter();
svg.call(
    zoomBehaviour.transform,
    d3.zoomIdentity
        .translate(initCx - (width  / 2) * initialScale,
                   initCy - (height / 2) * initialScale)
        .scale(initialScale)
);

// ─── Simulation ───────────────────────────────────────────────────────────────
simulation = d3.forceSimulation(nodes)
    .force("link",      d3.forceLink(links).id(x => x.id).distance(forceLinkDistance).strength(forceLinkStrength))
    .force("repulsion", d3.forceManyBody().strength(forceRepulsionStrength))
    .force("center",    d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide(forceCollisionRadius));

// ─── Render links ─────────────────────────────────────────────────────────────
linkGroups = mainGroup.append("g").selectAll("g")
    .data(links).enter().append("g")
    .attr("class", "link-group");

linkGroups.append("line")
    .attr("class",         "link-hitbox")
    .attr("stroke",        "transparent")
    .attr("stroke-width",  Math.max(8, linkThickness + 4))
    .attr("pointer-events","stroke")
    .on("mouseenter", function(e, l) {
        if (selectedNode || selectedLink || whatIfMode) return;
        d3.select(this.parentNode).select(".link-line")
            .classed("link-hovered", true)
            .attr("stroke", highlight.colour);
    })
    .on("mouseleave", function(e, l) {
        if (selectedNode || selectedLink || whatIfMode) return;
        d3.select(this.parentNode).select(".link-line")
            .classed("link-hovered", false)
            .attr("stroke", getLinkColor(l));
    })
    .on("click", function(e, l) {
        e.stopPropagation();
        if (whatIfMode) return;

        const srcId = typeof l.source === "object" ? l.source.id : l.source;
        const tgtId = typeof l.target === "object" ? l.target.id : l.target;
        const alreadySelected = selectedLink &&
            (typeof selectedLink.source === "object" ? selectedLink.source.id : selectedLink.source) === srcId &&
            (typeof selectedLink.target === "object" ? selectedLink.target.id : selectedLink.target) === tgtId;

        // Clear node selection
        nodePoints
            .classed("node-hovered",  false)
            .classed("node-muted",    false)
            .classed("node-selected", false)
            .style("opacity", null);
        _internalSelectNode(null);

        // Clear all link visuals
        linkLines
            .classed("link-hovered", false)
            .classed("link-dimmed",  false)
            .style("opacity",        null)
            .style("stroke-width",   null)
            .attr("stroke", d => getLinkColor(d));
        linkGroups.selectAll(".link-direction").remove();

        if (alreadySelected) {
            selectLink(null);
            applyVisibilityFilter();
            return;
        }

        applyLinkSelectionVisuals(l);
        selectLink(l);
    });

linkLines = linkGroups.append("line")
    .attr("class",         "link-line")
    .attr("stroke",        d => getLinkColor(d))
    .attr("stroke-width",  linkThickness)
    .attr("pointer-events","none");

// ─── Bridge links ─────────────────────────────────────────────────────────────
const bridgeLinksData = ERA_BRIDGE_LINKS.map(bl => ({
    ...bl,
    source: nodes.find(n => n.id === bl.source) || bl.source,
    target: nodes.find(n => n.id === bl.target) || bl.target,
}));

bridgeLinkGroups = mainGroup.append("g").selectAll("g")
    .data(bridgeLinksData).enter().append("g")
    .attr("class",   "link-group bridge-link-group")
    .style("opacity", 0);

// ─── Render nodes ─────────────────────────────────────────────────────────────
nodePoints = mainGroup.append("g").selectAll("g")
    .data(nodes).enter().append("g")
    .attr("class", "node-points")
    .call(d3.drag()
        .on("start", (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag",  (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end",   (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

nodeCircles = nodePoints.append("circle")
    .attr("class", "node-circle")
    .attr("r",     nodeRadius)
    .attr("fill",  d => {
        const eraId = NODE_ERA_MAP[d.id];
        return eraId ? `url(#eraGlow-${eraId})` : "url(#defaultGlow)";
    });

nodeNames = nodePoints.append("text")
    .attr("class",        "node-name")
    .attr("text-anchor",  "middle")
    .attr("dy",           26)
    .attr("fill",         d => {
        const eraId = NODE_ERA_MAP[d.id];
        const era   = ERAS.find(e => e.id === eraId);
        return era ? era.color : defaultColour;
    })
    .text(d => d.name.length > maxLen ? d.name.slice(0, maxLen - 2) + "…" : d.name);

// Hover-glow gradient (needs nodePoints to exist first so hover works)
ERAS.forEach(era => createEraGradient(era.id, era.color));
createGradient("hoverGlow", highlight.colour, glowControl.sel);

// ─── Tick ─────────────────────────────────────────────────────────────────────
simulation.on("tick", () => {
    linkGroups.selectAll("line")
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
    nodePoints.attr("transform", d => `translate(${d.x}, ${d.y})`);
    bridgeLinkGroups.selectAll("line")
        .attr("x1", d => (typeof d.source === "object" ? d.source.x : 0))
        .attr("y1", d => (typeof d.source === "object" ? d.source.y : 0))
        .attr("x2", d => (typeof d.target === "object" ? d.target.x : 0))
        .attr("y2", d => (typeof d.target === "object" ? d.target.y : 0));
});

// ─── Visibility filter (era + timeline present year) ─────────────────────────
function getNodeId(d) {
    return typeof d === "object" ? d.id : d;
}

let _prevVisibleIds = new Set();
let _initialLoad    = true;
let _followAnimId   = null;

function applyVisibilityFilter() {
    const allActive    = areAllErasActive();
    const visibleNodes = nodes.filter(n => isNodeOnSelectedEras(n.id) && isNodeBeforePresent(n.id));
    const visibleLinks = links.filter(l => {
        const srcId = getNodeId(l.source);
        const tgtId = getNodeId(l.target);
        return isNodeOnSelectedEras(srcId) && isNodeOnSelectedEras(tgtId)
            && isNodeBeforePresent(srcId) && isNodeBeforePresent(tgtId);
    });

    // Pan camera to newly revealed nodes, then follow them as they settle
    const newlyVisible = visibleNodes.filter(n => !_prevVisibleIds.has(n.id));
    if (newlyVisible.length > 0) {
        if (_followAnimId !== null) {
            cancelAnimationFrame(_followAnimId);
            _followAnimId = null;
        }

        const FOLLOW_DURATION = 1200;
        const followStart     = performance.now();

        function followNodes(now) {
            const elapsed  = now - followStart;
            const progress = Math.min(elapsed / FOLLOW_DURATION, 1);
            const avgX     = newlyVisible.reduce((s, n) => s + (n.x ?? 0), 0) / newlyVisible.length;
            const avgY     = newlyVisible.reduce((s, n) => s + (n.y ?? 0), 0) / newlyVisible.length;
            const t        = d3.zoomTransform(svg.node());
            const { cx, cy } = _getVisualCenter();
            const targetX  = cx - avgX * t.k;
            const targetY  = cy - avgY * t.k;
            const strength = 1 - progress;
            const newTx    = t.x + (targetX - t.x) * (0.12 + strength * 0.08);
            const newTy    = t.y + (targetY - t.y) * (0.12 + strength * 0.08);

            svg.call(zoomBehaviour.transform, d3.zoomIdentity.translate(newTx, newTy).scale(t.k));

            _followAnimId = progress < 1 ? requestAnimationFrame(followNodes) : null;
        }

        _followAnimId = requestAnimationFrame(followNodes);
    }

    _prevVisibleIds = new Set(visibleNodes.map(n => n.id));

    simulation.nodes(visibleNodes);
    simulation.force("link").links(visibleLinks);
    if (_initialLoad) {
        _initialLoad = false;
    } else {
        simulation.alpha(0.3).restart();
    }

    nodePoints.each(function(d) {
        const visible = visibleNodes.some(vn => vn.id === d.id);
        d3.select(this)
            .classed("era-hidden", !visible)
            .style("opacity",        visible ? null : 0)
            .style("pointer-events", visible ? null : "none");
    });

    linkGroups.each(function(d) {
        const srcId   = getNodeId(d.source);
        const tgtId   = getNodeId(d.target);
        const visible = isNodeOnSelectedEras(srcId) && isNodeOnSelectedEras(tgtId)
                     && isNodeBeforePresent(srcId) && isNodeBeforePresent(tgtId);
        d3.select(this)
            .classed("era-hidden", !visible)
            .style("opacity", visible ? null : 0);
    });

    bridgeLinkGroups
        .style("opacity",        allActive ? 1    : 0)
        .style("pointer-events", allActive ? null : "none");
}

onEraFilterChange(() => {
    if (!whatIfMode) _internalSelectNode(null);
    nodePoints
        .classed("node-hovered",  false)
        .classed("node-muted",    false)
        .classed("node-selected", false)
        .style("opacity", null);
    linkLines
        .classed("link-hovered", false)
        .classed("link-dimmed",  false)
        .style("opacity",        null)
        .style("stroke-width",   null);
    linkGroups.selectAll(".link-direction").remove();
    applyVisibilityFilter();
});

onTimelineChange(() => {
    applyVisibilityFilter();
    if (selectedNode) applySelectionVisuals(selectedNode);
});

// Seed prevVisible so initial nodes don't animate in from centre
_prevVisibleIds = new Set(
    nodes.filter(n => isNodeOnSelectedEras(n.id) && isNodeBeforePresent(n.id)).map(n => n.id)
);
applyVisibilityFilter();

// ─── Background click to deselect ─────────────────────────────────────────────
svg.on("click", function(e) {
    if (whatIfMode) return;
    if (!selectedNode && !selectedLink) return;
    if (e.target === svg.node() || e.target === mainGroup.node()) {
        deselectAll();
    }
});

function deselectAll() {
    nodePoints
        .classed("node-hovered",  false)
        .classed("node-muted",    false)
        .classed("node-selected", false)
        .style("opacity", null);
    linkLines
        .classed("link-hovered", false)
        .classed("link-dimmed",  false)
        .style("opacity",        null)
        .style("stroke-width",   null)
        .attr("stroke", l => getLinkColor(l));
    linkGroups.selectAll(".link-direction").remove();
    _internalSelectNode(null);
    selectLink(null);
    applyVisibilityFilter();
}

// ─── BFS helpers ──────────────────────────────────────────────────────────────
function bfsDistances(sourceId) {
    const dist  = new Map();
    dist.set(sourceId, 0);
    const queue = [sourceId];
    while (queue.length) {
        const curr = queue.shift();
        for (const l of links) {
            const neighbor = l.source.id === curr ? l.target.id
                           : l.target.id === curr ? l.source.id
                           : null;
            if (neighbor !== null && !dist.has(neighbor)) {
                dist.set(neighbor, dist.get(curr) + 1);
                queue.push(neighbor);
            }
        }
    }
    return dist;
}

function getLinkDistance(link, distMap) {
    const sd = distMap.get(link.source.id) ?? Infinity;
    const td = distMap.get(link.target.id) ?? Infinity;
    return Math.min(sd, td);
}

// ─── Selection visuals ────────────────────────────────────────────────────────
function applySelectionVisuals(node) {
    const distMap = bfsDistances(node.id);
    const maxDist = Math.max(...distMap.values());

    nodePoints.style("opacity", n => {
        if (!isNodeOnSelectedEras(n.id) || !isNodeBeforePresent(n.id)) return 0;
        if (n.id === node.id) return 1;
        const nd = distMap.get(n.id) ?? (maxDist + 1);
        return Math.max(0.15, 1 - nd * 0.254);
    });

    linkLines
        .style("opacity", l => {
            const ld = getLinkDistance(l, distMap);
            if (ld === Infinity) return 0.05;
            return Math.max(0.08, 1 - ld * 0.272);
        })
        .style("stroke-width", l => getLinkDistance(l, distMap) === 0 ? "2px" : null);

    linkGroups.selectAll(".link-direction").remove();
    linkGroups.each(function(l) {
        if (getLinkDistance(l, distMap) === 0) {
            d3.select(this).append("line")
                .attr("class",        "link-direction")
                .attr("stroke",       highlight.colour)
                .attr("stroke-width", 3)
                .attr("x1", l.source.x)
                .attr("y1", l.source.y)
                .attr("x2", l.target.x)
                .attr("y2", l.target.y);
        }
    });

    nodePoints.filter(n => n.id === node.id).classed("node-selected", true);
}

function applyLinkSelectionVisuals(link) {
    const srcId   = typeof link.source === "object" ? link.source.id : link.source;
    const tgtId   = typeof link.target === "object" ? link.target.id : link.target;
    const distSrc = bfsDistances(srcId);
    const distTgt = bfsDistances(tgtId);
    const distMap = new Map();
    const allIds  = new Set([...distSrc.keys(), ...distTgt.keys()]);
    allIds.forEach(id => {
        distMap.set(id, Math.min(distSrc.get(id) ?? Infinity, distTgt.get(id) ?? Infinity));
    });

    nodePoints.style("opacity", n => {
        if (!isNodeOnSelectedEras(n.id) || !isNodeBeforePresent(n.id)) return 0;
        const nd = distMap.get(n.id) ?? Infinity;
        if (nd === Infinity) return 0.08;
        return Math.max(0.15, 1 - nd * 0.254);
    });

    linkLines
        .style("opacity", l => {
            const lSrc = typeof l.source === "object" ? l.source.id : l.source;
            const lTgt = typeof l.target === "object" ? l.target.id : l.target;
            if (lSrc === srcId && lTgt === tgtId) return 1;
            const ld = getLinkDistance(l, distMap);
            if (ld === Infinity) return 0.05;
            return Math.max(0.08, 1 - ld * 0.272);
        })
        .style("stroke-width", l => {
            const lSrc = typeof l.source === "object" ? l.source.id : l.source;
            const lTgt = typeof l.target === "object" ? l.target.id : l.target;
            return (lSrc === srcId && lTgt === tgtId) ? "2px" : null;
        })
        .attr("stroke", l => getLinkColor(l));

    linkGroups.selectAll(".link-direction").remove();
    linkGroups.each(function(l) {
        const lSrc = typeof l.source === "object" ? l.source.id : l.source;
        const lTgt = typeof l.target === "object" ? l.target.id : l.target;
        if (lSrc === srcId && lTgt === tgtId) {
            d3.select(this).append("line")
                .attr("class",        "link-direction")
                .attr("stroke",       highlight.colour)
                .attr("stroke-width", 3)
                .attr("x1", link.source.x ?? link.source)
                .attr("y1", link.source.y ?? 0)
                .attr("x2", link.target.x ?? link.target)
                .attr("y2", link.target.y ?? 0);
        }
    });
}

// ─── Node click / hover ───────────────────────────────────────────────────────
let _internalSelecting = false;

// fromGraph=true only when the user clicked a node circle directly on the graph.
// All other call-sites (focusNode, era filter restore, what-if exit) pass false
// so that "ting" is not replayed for programmatic selections.
function _internalSelectNode(node, fromGraph = false) {
    _internalSelecting = true;
    selectNode(node, fromGraph);
    _internalSelecting = false;
}

nodeCircles
    .on("mouseenter", function(e, d) {
        if (selectedNode || selectedLink || whatIfMode) return;
        if (!isNodeOnSelectedEras(d.id)) return;
        d3.select(this.parentNode).classed("node-hovered", true);
        nodePoints.filter(n => n.id !== d.id && isNodeOnSelectedEras(n.id)).classed("node-muted", true);
    })
    .on("mouseleave", function(e, d) {
        if (selectedNode || selectedLink || whatIfMode) return;
        d3.select(this.parentNode).classed("node-hovered", false);
        nodePoints.filter(n => n.id !== d.id).classed("node-muted", false);
    })
    .on("click", function(e, d) {
        e.stopPropagation();
        if (!isNodeOnSelectedEras(d.id)) return;

        if (whatIfMode) {
            handleWhatIfNodeClick(d);
            return;
        }

        const alreadySelected = selectedNode?.id === d.id;

        nodePoints
            .classed("node-hovered",  false)
            .classed("node-muted",    false)
            .classed("node-selected", false)
            .style("opacity", null);
        linkLines
            .classed("link-hovered", false)
            .classed("link-dimmed",  false)
            .style("opacity",        null)
            .style("stroke-width",   null)
            .attr("stroke", l => getLinkColor(l));
        linkGroups.selectAll(".link-direction").remove();
        selectLink(null);

        if (alreadySelected) {
            _internalSelectNode(null);
            applyVisibilityFilter();
            return;
        } else {
            applySelectionVisuals(d);
            _internalSelectNode(d, true); // ← graph click: play ting
        }

    });

// React to external node selections (e.g. from timeline dots or search)
onNodeSelected((node) => {
    if (_internalSelecting) return;
    if (whatIfMode) return;

    nodePoints
        .classed("node-hovered",  false)
        .classed("node-muted",    false)
        .classed("node-selected", false)
        .style("opacity", null);
    linkLines
        .classed("link-hovered", false)
        .classed("link-dimmed",  false)
        .style("opacity",        null)
        .style("stroke-width",   null);
    linkGroups.selectAll(".link-direction").remove();

    if (!node) { applyVisibilityFilter(); return; }

    applySelectionVisuals(node);
});

// ─── Camera helpers ───────────────────────────────────────────────────────────
function _getVisualCenter() {
    const svgEl     = svg.node();
    const svgWidth  = svgEl.clientWidth  || window.innerWidth;
    const svgHeight = svgEl.clientHeight || (window.innerHeight - 80);

    const sidebarEl = document.getElementById("sidebar");
    const sidebarW  = (sidebarEl && sidebarEl.classList.contains("open"))
        ? (sidebarEl.getBoundingClientRect().width || 0)
        : 0;

    const timelineInner = document.getElementById("timeline-inner");
    const timelineTab   = document.getElementById("timeline-tab");
    const tlPanelEl     = document.getElementById("timeline-panel");
    let timelineH = 0;
    if (tlPanelEl) {
        const tlContainer = document.getElementById("timeline-container");
        const isOpen  = tlContainer && tlContainer.classList.contains("open");
        const tabH    = timelineTab  ? timelineTab.getBoundingClientRect().height  : 0;
        const innerH  = (isOpen && timelineInner)
            ? timelineInner.getBoundingClientRect().height : 0;
        timelineH = tabH + innerH;
    }

    return {
        cx: sidebarW + (svgWidth  - sidebarW) / 2,
        cy:            (svgHeight - timelineH) / 2,
    };
}

function _panToNode(node, { zoom = false } = {}) {
    if (!node || node.x == null || node.y == null) return;
    const { cx, cy } = _getVisualCenter();

    if (zoom) {
        const targetScale = 1.2;
        svg.transition().duration(600).ease(d3.easeCubicInOut)
            .call(zoomBehaviour.transform,
                d3.zoomIdentity
                    .translate(cx - node.x * targetScale, cy - node.y * targetScale)
                    .scale(targetScale));
    } else {
        const t = d3.zoomTransform(svg.node());
        svg.transition().duration(500).ease(d3.easeCubicInOut)
            .call(zoomBehaviour.transform,
                d3.zoomIdentity
                    .translate(cx - node.x * t.k, cy - node.y * t.k)
                    .scale(t.k));
    }
}

// ─── Global helpers (used by search, sidebar, panel) ──────────────────────────
window.focusNode = function(nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    nodePoints
        .classed("node-hovered",  false)
        .classed("node-muted",    false)
        .classed("node-selected", false)
        .style("opacity", null);
    linkLines
        .classed("link-hovered", false)
        .classed("link-dimmed",  false)
        .style("opacity",        null)
        .style("stroke-width",   null);
    linkGroups.selectAll(".link-direction").remove();

    applySelectionVisuals(node);
    _internalSelectNode(node);
    _panToNode(node, { zoom: true });
};

// ─── Wire up What If and Loader (after all D3 refs are ready) ─────────────────
initWhatIf({
    nodePoints,
    linkLines,
    linkGroups,
    mainGroup,
    getLinkColor,
    applySelectionVisuals,
    internalSelectNode: _internalSelectNode,
});

initLoader(simulation);