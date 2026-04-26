import { nodes, links } from "./state.js"
import { selectNode, selectedNode, onNodeSelected } from "./state.js"
import { link, node, highlight, maxLen, forceLinkDistance, forceLinkStrength, forceRepulsionStrength, forceCollisionRadius, glowControl, onRerender } from "./state.js"

const width = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select("#node-graph")
    .attr("viewBox", `0, 0, ${width}, ${height}`)

const defs = svg.select("defs")

const mainGroup = svg.select("#main-g")

let simulation, linkGroups, linkLines, nodePoints, nodeCircles, nodeNames

// converts "rgb(r, g, b)" into "rgba(r, g, b, a)"
function rgbToRgba(rgb, alpha) {
    return rgb.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
}

function createGradient(id, colour, stops) {
    defs.append("radialGradient")
        .attr("id", id)
        .selectAll("stop")
        .data([
            { offset: `${stops[0]*100}%`, color: rgbToRgba(colour, 1)   },
            { offset: `${stops[1]*100}%`, color: rgbToRgba(colour, 0.5) },
            { offset: `${stops[2]*100}%`, color: rgbToRgba(colour, 0)   }
        ])
        .enter()
        .append("stop")
        .attr("offset", d => d.offset)
        .attr("stop-color", d => d.color);
}

// Initial gradient
createGradient("initGlow", node.colour, glowControl.reg);

//zooming and panning
svg.call(d3.zoom()
    .scaleExtent([0.3, 2.5])
    .on("zoom", (e) => { mainGroup.attr("transform", e.transform); }))


//physics
simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(x => x.id).distance(forceLinkDistance).strength(forceLinkStrength))
    .force("repulsion", d3.forceManyBody().strength(forceRepulsionStrength))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide(forceCollisionRadius))

//rendering links
linkGroups = mainGroup.append("g").selectAll("g")
    .data(links).enter().append("g")
    .attr("class", "link-group")

linkGroups.append("line")
    .attr("class", "link-hitbox")
    .attr("stroke", "transparent")
    .attr("stroke-width", Math.max(8, link.thickness + 4))
    .attr("pointer-events", "stroke")
    .on("mouseenter", function(e, l) {
        if (selectedNode) return;
        d3.select(this.parentNode).select(".link-line")
            .classed("link-hovered", true)
            .attr("stroke", highlight.colour);
    })
    .on("mouseleave", function(e, l) {
        if (selectedNode) return;
        d3.select(this.parentNode).select(".link-line")
            .classed("link-hovered", false)
            .attr("stroke", link.colour);
    });

linkLines = linkGroups.append("line")
    .attr("class", "link-line")
    .attr("stroke", link.colour)
    .attr("stroke-width", link.thickness)
    .attr("pointer-events", "none")

//rendering nodes
nodePoints = mainGroup.append("g").selectAll("g")
    .data(nodes).enter().append("g")
    .attr("class", "node-points")
    .call(d3.drag()
        .on("start", (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }))

//rendering node circles
nodeCircles = nodePoints.append("circle")
    .attr("class", "node-circle")
    .attr("r", node.radius)
    .attr("fill", "url(#initGlow)")

//rendering node names
nodeNames = nodePoints.append("text")
    .attr("class", "node-name")
    .attr("text-anchor", "middle")
    .attr("dy", 26)
    .attr("fill", node.colour)
    .text(d => d.name.length > maxLen ? d.name.slice(0, maxLen - 2) + "…" : d.name)

//simulating everything
simulation.on("tick", () => {
    linkGroups.selectAll("line")
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
    nodePoints
        .attr("transform", d => `translate(${d.x}, ${d.y})`)
})

createGradient("hoverGlow", highlight.colour, glowControl.sel);

function bfsDistances(sourceId) {
    const dist = new Map();
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
    return Math.min(sd, td); // link's distance = closer of its two endpoints
}

nodeCircles
    .on("mouseenter", function(e, d) {
        if (selectedNode) return;
        const nodeGroup = d3.select(this.parentNode);
        nodeGroup.classed("node-hovered", true);
        nodePoints.filter(n => n.id !== d.id).classed("node-muted", true);
    })
    .on("mouseleave", function(e, d) {
        if (selectedNode) return;
        const nodeGroup = d3.select(this.parentNode);
        nodeGroup.classed("node-hovered", false);
        nodePoints.filter(n => n.id !== d.id).classed("node-muted", false);
    })
    .on("click", function(e, d) {
    const alreadySelected = selectedNode?.id === d.id;

    // Reset everything
    nodePoints
        .classed("node-hovered", false)
        .classed("node-muted", false)
        .classed("node-selected", false)
        .style("opacity", null);
    linkLines
        .classed("link-hovered", false)
        .classed("link-dimmed", false)
        .style("opacity", null)
        .style("stroke-width", null);
    // Remove all animated direction lines
    linkGroups.selectAll(".link-direction").remove();

    if (alreadySelected) {
        selectNode(null);
        return;
    }

    const distMap = bfsDistances(d.id);
    const maxDist = Math.max(...distMap.values());

    // Opacity curve for nodes: selected = 1, distance 1 = 0.7, farther fades to 0.15
    nodePoints.style("opacity", n => {
        if (n.id === d.id) return 1;
        const nd = distMap.get(n.id) ?? (maxDist + 1);
        return Math.max(0.15, 1 - nd * 0.28);
    });

    // Opacity curve for links: distance 0 (adjacent) = 1, fades out with distance
    linkLines
        .style("opacity", l => {
            const ld = getLinkDistance(l, distMap);
            if (ld === Infinity) return 0.05;
            return Math.max(0.08, 1 - ld * 0.3);
        })
        .style("stroke-width", l => {
            const ld = getLinkDistance(l, distMap);
            return ld === 0 ? "2px" : null;
        });

    // Add animated direction indicators for adjacent links
    linkGroups.each(function(l) {
        const ld = getLinkDistance(l, distMap);
        if (ld === 0) {
            // Remove existing animated line if present
            d3.select(this).select(".link-direction").remove();
            // Add new animated direction line
                    d3.select(this).append("line")
                .attr("class", "link-direction")
                .attr("stroke", highlight.colour)
                .attr("stroke-width", 3)
                .attr("x1", l.source.x)
                .attr("y1", l.source.y)
                .attr("x2", l.target.x)
                .attr("y2", l.target.y);
        }
    });

    d3.select(this.parentNode).classed("node-selected", true);
    selectNode(d);
});





// React to settings changes
onRerender(() => {
    defs.select("#initGlow").remove();
    defs.select("#hoverGlow").remove();
    createGradient("initGlow", node.colour, glowControl.reg);
    createGradient("hoverGlow", highlight.colour, glowControl.sel);
    linkLines.attr("stroke", link.colour);
    nodeNames.attr("fill", node.colour);
});

