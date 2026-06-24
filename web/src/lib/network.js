// Faithful port of the original app/client/lib/network.coffee.
// A D3 v3 force-directed graph of <circle> "bubble" nodes connected by links.
// Behaviour is kept identical to the original; only Meteor's `check` is
// replaced by a lightweight type assert and CoffeeScript syntax is translated.
import $ from 'jquery'

// d3 v3 is loaded as a classic script (see index.html) because its UMD wrapper
// needs a non-strict global `this`; bundling it as ESM breaks (`this.document`).
const d3 = window.d3

function check(value, Type) {
  if (Type === String && typeof value !== 'string') throw new Error('expected String, got ' + value)
  if (Type === Number && typeof value !== 'number') throw new Error('expected Number, got ' + value)
  if (Type === Object && (value == null || typeof value !== 'object')) throw new Error('expected Object')
}

const STAR_IMG =
  'data:image/svg+xml;base64,PHN2ZyBpZD0ic3RhciIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMjcgMjYiPjxkZWZzPjxzdHlsZT4uYXtmaWxsOiNmZmY7fTwvc3R5bGU+PC9kZWZzPjx0aXRsZT5pY29uLXN0YXItd2hpdGU8L3RpdGxlPjxwYXRoIGNsYXNzPSJhIiBkPSJNMTMuNSwwLjE2TDkuMzMsOC42MSwwLDEwbDYuNzUsNi41OEw1LjE2LDI1Ljg0bDguMzQtNC4zOSw4LjM0LDQuMzktMS41OS05LjI5TDI3LDEwLDE3LjY3LDguNjFaIi8+PC9zdmc+'
const DEAD_IMG =
  'data:image/svg+xml;base64,PHN2ZyBpZD0iZGVhZFF1ZXN0aW9uIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MCA2Ij48ZGVmcz48c3R5bGU+LmF7ZmlsbDojZmZmO308L3N0eWxlPjwvZGVmcz48dGl0bGU+aWNvbi1kZWFkUXVlc3Rpb248L3RpdGxlPjxyZWN0IGNsYXNzPSJhIiB3aWR0aD0iNTAiIGhlaWdodD0iNiIvPjwvc3ZnPg=='

export class Network {
  constructor(ele, rMax) {
    this.element = ele
    this.radiusMax = rMax

    this.svgElementId = 'bubblesSVG'
    this.width = $(this.element).width()
    this.height = $(this.element).height()

    this.svg = d3
      .select(this.element)
      .append('svg')
      .attr('id', this.svgElementId)
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('pointer-events', 'all')
      .attr('xmlns', 'http://www.w3.org/2000/svg')
      .attr('xmlns:xlink', 'http://www.w3.org/1999/xlink')
      .attr('version', '1.1')

    this.linksG = this.svg.append('g').attr('id', 'links')
    this.nodesG = this.svg.append('g').attr('id', 'nodes')

    this.force = d3.layout.force()
    this.drag = this.force.drag()

    this.nodes = this.force.nodes()
    this.links = this.force.links()

    this._onNodeClick = null
    this._onNodeHover = null
    this.animateRadiusChange = false
  }

  update() {
    const onNodeClick = this._onNodeClick
    const onNodeHover = this._onNodeHover
    const node = this.nodesG.selectAll('g.node').data(this.nodes, (d) => d.id)
    const nodeEnter = node
      .enter()
      .append('g')
      .on('click', (d) => {
        if (onNodeClick) onNodeClick(d)
      })
      .on('mouseover', (d) => {
        if (onNodeHover) onNodeHover(d)
      })
      .on('mouseout', (d) => {
        if (onNodeHover) onNodeHover(null)
      })
      .call(this.drag)
    nodeEnter.append('circle')
    nodeEnter.append('image')

    node.attr('class', (d) => (d.classes != null ? 'node ' + d.classes : 'node'))
    node
      .selectAll('circle')
      .style('fill', (d) => d.fillColor)
      .style('fill-opacity', (d) => (d.fillOpacity != null ? d.fillOpacity : 1.0))
      .style('stroke', (d) => d.strokeColor)
      .style('stroke-width', (d) => d.strokeWidth)

    if (this.animateRadiusChange) {
      node
        .selectAll('circle')
        .transition()
        .duration(1200)
        .attr('r', (d) => d.radius)
    } else {
      node.selectAll('circle').attr('r', (d) => d.radius)
    }

    node
      .selectAll('image')
      .attr('xlink:href', (d) => (d.image != null ? d.image : null))
      .attr('width', (d) => (d.imageWidth != null ? d.imageWidth : 0))
      .attr('height', (d) => (d.imageWidth != null ? d.imageWidth : 0))
      .attr('x', (d) => (d.imageX != null ? d.imageX : 0))
      .attr('y', (d) => (d.imageY != null ? d.imageY : 0))

    node.exit().remove()

    const link = this.linksG.selectAll('line.link').data(this.links, (d) => d.id)
    link
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', (d) => d.strokeColor)
      .style('stroke-width', (d) => d.strokeWidth)
      .attr('stroke-opacity', 0.8)
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y)
    link.attr('linkDistance', (d) => d.linkDistance)
    link.exit().remove()

    const collide = this.collide
    const nodes = this.nodes
    const radiusMax = this.radiusMax
    const width = this.width
    const height = this.height
    this.force.on('tick', () => {
      const now = Date.now()
      node
        .each(collide(0.5, nodes, radiusMax))
        .attr('transform', (d) => {
          d.x = Math.max(d.radius, Math.min(width - d.radius, d.x))
          if (d.xMax != null && d.xMaxT < now && d.x + d.radius / 2 > d.xMax) {
            d.x = d.xMax - d.radius / 2
          }
          d.y = Math.max(d.radius, Math.min(height - d.radius, d.y))
          return 'translate( ' + d.x + ', ' + d.y + ' )'
        })

      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y)
    })

    this.force
      .size([this.width, this.height])
      .gravity(0.0)
      .charge(-100)
      .linkDistance((d) => d.linkDistance)
      .friction(0.4)
      .start()
  }

  onNodeClick(f) {
    this._onNodeClick = f
  }
  onNodeHover(f) {
    this._onNodeHover = f
  }

  findNode(id) {
    for (const i in this.nodes) {
      if (this.nodes[i].id === id) return this.nodes[i]
    }
    return undefined
  }

  findNodeIndex(id) {
    let i = 0
    while (i < this.nodes.length) {
      if (this.nodes[i].id === id) return i
      i++
    }
    return undefined
  }

  findLinkIndex(id) {
    let i = 0
    while (i < this.links.length) {
      if (this.links[i].id === id) return i
      i++
    }
    return undefined
  }

  addNode(node) {
    check(node.id, String)
    this.nodes.push(node)
    this.update()
  }

  changeNode(node) {
    check(node.id, String)
    const n = this.nodes[this.findNodeIndex(node.id)]
    if (n != null) {
      if (node.radius != null) n.radius = node.radius
      if (node.fillColor != null) n.fillColor = node.fillColor
      if (node.fillOpacity != null) n.fillOpacity = node.fillOpacity
      if (node.strokeWidth != null) n.strokeWidth = node.strokeWidth
      if (node.strokeColor != null) n.strokeColor = node.strokeColor
      if (node.x != null) n.x = node.x
      if (node.y != null) n.y = node.y
      if (node.px != null) n.px = node.px
      if (node.py != null) n.py = node.py
      if (node.fixed != null) n.fixed = node.fixed
      if (n.fixed != null && n.fixed === true) {
        n.x = n.px
        n.y = n.py
      }
      if (node.xMax != null) n.xMax = node.xMax
      if (node.xMaxT != null) n.xMaxT = node.xMaxT
      if (node.removeXMax) {
        delete n.xMax
        delete n.xMaxT
      }
      if (node.classes != null) n.classes = node.classes
      if (node.removeClasses) delete n.classes
      if (node.isFavorite != null) {
        if (node.isFavorite) {
          n.isFavorite = true
          n.image = STAR_IMG
          n.imageWidth = 20
          n.imageHeight = 20
          n.imageX = -10
          n.imageY = -10.5
        } else {
          n.isFavorite = false
        }
      }
      if (node.isDead != null && !n.isFavorite) {
        if (node.isDead) {
          n.isDead = true
          n.image = DEAD_IMG
          n.imageWidth = 40
          n.imageHeight = 20
          n.imageX = -20
          n.imageY = -20
        } else {
          n.isDead = false
        }
      }
      if (!n.isDead && !n.isFavorite) delete n.image
      if (node.hoverable != null) {
        if (node.hoverable) n.hoverable = true
        else delete n.hoverable
      }
      this.update()
    } else {
      console.log('Network changeNode: node (' + node.id + ') not found')
    }
  }

  removeNode(id) {
    let i = 0
    const n = this.findNode(id)
    while (i < this.links.length) {
      if (this.links[i].source === n || this.links[i].target === n) {
        this.links.splice(i, 1)
      } else {
        i++
      }
    }
    this.nodes.splice(this.findNodeIndex(id), 1)
    this.update()
  }

  addLink(link) {
    check(link.sourceId, String)
    check(link.targetId, String)
    check(link.linkDistance, Number)
    link.id = link.sourceId + '__' + link.targetId
    link.source = this.findNode(link.sourceId)
    link.target = this.findNode(link.targetId)
    check(link.source, Object)
    check(link.target, Object)
    delete link.sourceId
    delete link.targetId
    this.links.push(link)
    this.update()
  }

  changeLink(link) {
    check(link.sourceId, String)
    check(link.targetId, String)
    const l = this.links[this.findLinkIndex(link.sourceId + '__' + link.targetId)]
    l.linkDistance = link.linkDistance
    this.update()
  }

  removeLink(link) {
    check(link.sourceId, String)
    check(link.targetId, String)
    const i = this.findLinkIndex(link.sourceId + '__' + link.targetId)
    if (i != null) this.links.splice(i, 1)
    this.update()
  }

  removeAllLinks() {
    this.links.length = 0
    this.update()
  }

  removeAllNodes() {
    this.nodes.length = 0
    this.update()
  }

  resize() {
    this.width = $(this.element).width()
    this.height = $(this.element).height()
    const svg = document.getElementById(this.svgElementId)
    svg.setAttribute('width', this.width)
    svg.setAttribute('height', this.height)
    this.update()
  }

  getElement() {
    return this.element
  }

  appendGradient(id, c0, c1) {
    const gradient = this.svg.append('defs').append('linearGradient').attr('id', id)
    gradient.append('stop').attr('offset', '0%').attr('stop-color', c0)
    gradient.append('stop').attr('offset', '100%').attr('stop-color', c1)
  }

  setRadiusMax(rMax) {
    this.radiusMax = rMax
  }

  // Resolves collisions between d and all other circles.
  // http://stackoverflow.com/questions/11339348/avoid-d3-js-circles-overlapping
  collide(alpha, nodes, radiusMax) {
    const padding = 5 // separation between same-color circles
    const clusterPadding = 6 // separation between different-color circles

    const quadtree = d3.geom.quadtree(nodes)
    return (d) => {
      const r0 = d.radius + radiusMax + Math.max(padding, clusterPadding)
      const nx1 = d.x - r0
      const nx2 = d.x + r0
      const ny1 = d.y - r0
      const ny2 = d.y + r0
      quadtree.visit((quad, x1, y1, x2, y2) => {
        if (quad.point && quad.point !== d) {
          let x = d.x - quad.point.x
          let y = d.y - quad.point.y
          let l = Math.sqrt(x * x + y * y)
          const r = d.radius + quad.point.radius + (d.cluster === quad.point.cluster ? padding : clusterPadding)
          if (l < r) {
            l = ((l - r) / l) * alpha
            d.x -= x *= l
            d.y -= y *= l
            quad.point.x += x
            quad.point.y += y
          }
        }
        return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1
      })
    }
  }
}
