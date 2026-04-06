import NODES from "../data/nodes.json" with { type: "json" };
import LINKS from "../data/links.json" with { type: "json" };

const nodes = NODES.map(x => ({ ...x }));
const links = LINKS.map(x => ({ ...x }));

const width = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select("#node-graph")
    .attr("viewBox", `0, 0, ${width}, ${height}`)

const defs = svg.select("defs")

const mainGroup = svg.select("#main-g")

let simulation, linkLines, nodePoints, nodeCircles, nodeNames;

let linkColour = "#ffffff",
    linkThickness = 1,
    nodeColour = "#ffffff",
    nodeRadius = 10,
    forceLinkDistance = 90,
    forceLinkStrength = 0.5,
    forceRepulsionStrength = -380,
    forceCollisionRadius = 38

defs.append("radialGradient")
    .attr("id", "glow")
    .selectAll("stop")
    .data([
        { offset: "20%", color: "rgb(255, 255, 255)" },
        { offset: "40%", color: "rgba(255, 255, 255, 0.5)" },
        { offset: "90%", color: "rgba(255, 255, 255, 0)" }
    ])
    .enter()
    .append("stop")
    .attr("offset", d => d.offset)
    .attr("stop-color", d => d.color)


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
linkLines = mainGroup.append("g").selectAll("line")
    .data(links).enter().append("line")
    .attr("class", "link-line")
    .attr("stroke", linkColour)
    .attr("stroke-width", linkThickness)

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
    .attr("r", nodeRadius)
    //.attr("fill", nodeColour)
    .attr("fill", "url(#glow)")

//rendering node names
nodeNames = nodePoints.append("text")
    .attr("class", "node-name")
    .attr("text-anchor", "middle")
    .attr("dy", 26)
    .attr("fill", nodeColour)
    .text(d => d.name.length > 10 ? d.name.slice(0, 8) + "…" : d.name)

//simulating everything
simulation.on("tick", () => {
    linkLines
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
    nodePoints
        .attr("transform", d => `translate(${d.x}, ${d.y})`)
})
