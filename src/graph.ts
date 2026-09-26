// ---------------------------------------------------------------------------
// Moteur de graphe 2D sur mesure : simulation à base de forces
// (répulsion électrostatique + ressorts + amortissement) et rendu Canvas
// natif, avec zoom, pan, drag de nœuds et survol interactif.
// ---------------------------------------------------------------------------
import type { GraphData, GraphEdge, NoteNode, PhysicsSettings, PhysicsVector } from "./types";

const TAG_PALETTE = [
  "#5eb0ff", "#ff7a7a", "#7bd88f", "#ffcb5e", "#c792ea",
  "#5ee6d6", "#ff9f5e", "#8fa3ff", "#ff6ec7", "#a3e635"
];

function colorForTag(tag: string | undefined): string {
  if (!tag) return "#8891a5";
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

export interface GraphCallbacks {
  onNodeClick?: (id: string) => void;
}

export class GraphEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private data: GraphData = { nodes: new Map(), edges: [] };
  private settings: PhysicsSettings = { repulsion: 1200, attraction: 20, damping: 0.85 };

  private zoom = 1;
  private panX = 0;
  private panY = 0;

  private dragging: NoteNode | null = null;
  private panning = false;
  private lastMouse: PhysicsVector = { x: 0, y: 0 };
  private hoveredId: string | null = null;

  private rafId = 0;
  private resizeObserver: ResizeObserver;
  private callbacks: GraphCallbacks;

  constructor(canvas: HTMLCanvasElement, callbacks: GraphCallbacks = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Contexte 2D indisponible");
    this.ctx = ctx;
    this.callbacks = callbacks;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    this.bindEvents();
    this.loop();
  }

  setPhysicsSettings(partial: Partial<PhysicsSettings>): void {
    this.settings = { ...this.settings, ...partial };
  }

  getPhysicsSettings(): PhysicsSettings {
    return this.settings;
  }

  getViewState() {
    return { zoom: this.zoom, panX: this.panX, panY: this.panY };
  }

  setViewState(zoom?: number, panX?: number, panY?: number): void {
    if (zoom !== undefined) this.zoom = zoom;
    if (panX !== undefined) this.panX = panX;
    if (panY !== undefined) this.panY = panY;
  }

  getNodePositions(): Record<string, PhysicsVector> {
    const out: Record<string, PhysicsVector> = {};
    for (const [id, n] of this.data.nodes) out[id] = { x: n.position.x, y: n.position.y };
    return out;
  }

  /** Remplace les données du graphe (nœuds/liens), en conservant les positions existantes si possible. */
  setData(
    nodes: { id: string; label: string; tags: string[] }[],
    edges: GraphEdge[],
    savedPositions?: Record<string, PhysicsVector>
  ): void {
    const inDeg = new Map<string, number>();
    const outDeg = new Map<string, number>();
    for (const e of edges) {
      outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
      inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    }

    const newNodes = new Map<string, NoteNode>();
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 600;

    nodes.forEach((n, i) => {
      const prev = this.data.nodes.get(n.id);
      const saved = savedPositions?.[n.id];
      const inD = inDeg.get(n.id) ?? 0;
      const outD = outDeg.get(n.id) ?? 0;
      const degree = inD + outD;

      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
      const radiusLayout = Math.min(w, h) / 3;
      const fallback: PhysicsVector = {
        x: w / 2 + Math.cos(angle) * radiusLayout,
        y: h / 2 + Math.sin(angle) * radiusLayout
      };

      newNodes.set(n.id, {
        id: n.id,
        label: n.label,
        tags: n.tags,
        radius: 6 + Math.min(18, degree * 2.2),
        color: colorForTag(n.tags[0]),
        position: prev?.position ?? saved ?? fallback,
        velocity: prev?.velocity ?? { x: 0, y: 0 },
        pinned: prev?.pinned ?? false,
        inDegree: inD,
        outDegree: outD
      });
    });

    this.data = { nodes: newNodes, edges };
  }

  resetView(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // --- Simulation physique --------------------------------------------------

  private step(): void {
    const nodes = [...this.data.nodes.values()];
    if (nodes.length === 0) return;
    const { repulsion, attraction, damping } = this.settings;

    // Répulsion électrostatique (Coulomb) entre chaque paire de nœuds — O(n²),
    // volontairement simple et suffisant pour des graphes de notes (< ~1000 nœuds).
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.pinned) continue;
      let fx = 0;
      let fy = 0;
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const b = nodes[j];
        let dx = a.position.x - b.position.x;
        let dy = a.position.y - b.position.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) distSq = 1;
        const dist = Math.sqrt(distSq);
        const force = repulsion / distSq;
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }
      a.velocity.x += fx * 0.02;
      a.velocity.y += fy * 0.02;
    }

    // Attraction élastique (ressort) le long des liens (loi de Hooke simplifiée).
    const springLength = 140;
    for (const edge of this.data.edges) {
      const a = this.data.nodes.get(edge.source);
      const b = this.data.nodes.get(edge.target);
      if (!a || !b) continue;
      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const stretch = dist - springLength;
      const force = (attraction / 100) * stretch;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned) {
        a.velocity.x += fx * 0.02;
        a.velocity.y += fy * 0.02;
      }
      if (!b.pinned) {
        b.velocity.x -= fx * 0.02;
        b.velocity.y -= fy * 0.02;
      }
    }

    // Attraction douce vers le centre pour éviter la dérive infinie du graphe.
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 600;
    for (const n of nodes) {
      if (n.pinned || n === this.dragging) continue;
      n.velocity.x += (w / 2 - n.position.x) * 0.0005;
      n.velocity.y += (h / 2 - n.position.y) * 0.0005;

      // Amortissement
      n.velocity.x *= damping;
      n.velocity.y *= damping;

      n.position.x += n.velocity.x;
      n.position.y += n.velocity.y;
    }
  }

  // --- Rendu -----------------------------------------------------------------

  private render(): void {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0f1115";
    ctx.fillRect(0, 0, w, h);

    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    const neighbors = this.hoveredId ? this.neighborSet(this.hoveredId) : null;

    // Liens
    for (const edge of this.data.edges) {
      const a = this.data.nodes.get(edge.source);
      const b = this.data.nodes.get(edge.target);
      if (!a || !b) continue;
      const dimmed = neighbors
        ? !(edge.source === this.hoveredId || edge.target === this.hoveredId)
        : false;
      ctx.strokeStyle = dimmed ? "rgba(120,130,150,0.08)" : "rgba(150,165,190,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.position.x, a.position.y);
      ctx.lineTo(b.position.x, b.position.y);
      ctx.stroke();
    }

    // Nœuds
    for (const n of this.data.nodes.values()) {
      const dimmed = neighbors ? !neighbors.has(n.id) && n.id !== this.hoveredId : false;
      ctx.globalAlpha = dimmed ? 0.25 : 1;

      ctx.beginPath();
      ctx.arc(n.position.x, n.position.y, n.radius, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.fill();

      if (n.id === this.hoveredId) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }

      if (this.zoom > 0.6 || n.id === this.hoveredId) {
        ctx.fillStyle = "rgba(230,235,245,0.9)";
        ctx.font = "12px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(n.label, n.position.x, n.position.y - n.radius - 6);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  private neighborSet(id: string): Set<string> {
    const set = new Set<string>();
    for (const e of this.data.edges) {
      if (e.source === id) set.add(e.target);
      if (e.target === id) set.add(e.source);
    }
    return set;
  }

  private loop = (): void => {
    this.step();
    this.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  // --- Interactions ------------------------------------------------------

  private screenToWorld(sx: number, sy: number): PhysicsVector {
    return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom };
  }

  private nodeAt(worldPos: PhysicsVector): NoteNode | null {
    for (const n of this.data.nodes.values()) {
      const dx = n.position.x - worldPos.x;
      const dy = n.position.y - worldPos.y;
      if (dx * dx + dy * dy <= n.radius * n.radius * 2.5) return n;
    }
    return null;
  }

  private bindEvents(): void {
    const c = this.canvas;

    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const before = this.screenToWorld(mx, my);
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoom = Math.min(4, Math.max(0.15, this.zoom * factor));
      const after = this.screenToWorld(mx, my);
      this.panX += (after.x - before.x) * this.zoom;
      this.panY += (after.y - before.y) * this.zoom;
    }, { passive: false });

    c.addEventListener("mousedown", (e) => {
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.screenToWorld(sx, sy);
      const hit = this.nodeAt(world);
      this.lastMouse = { x: sx, y: sy };
      if (hit) {
        this.dragging = hit;
        hit.pinned = true;
      } else {
        this.panning = true;
      }
    });

    window.addEventListener("mousemove", (e) => {
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (this.dragging) {
        const world = this.screenToWorld(sx, sy);
        this.dragging.position.x = world.x;
        this.dragging.position.y = world.y;
        this.dragging.velocity = { x: 0, y: 0 };
      } else if (this.panning) {
        this.panX += sx - this.lastMouse.x;
        this.panY += sy - this.lastMouse.y;
      } else {
        const world = this.screenToWorld(sx, sy);
        const hit = this.nodeAt(world);
        this.hoveredId = hit ? hit.id : null;
        c.style.cursor = hit ? "pointer" : "grab";
      }
      this.lastMouse = { x: sx, y: sy };
    });

    window.addEventListener("mouseup", () => {
      if (this.dragging) {
        this.dragging.pinned = false;
      }
      this.dragging = null;
      this.panning = false;
    });

    c.addEventListener("click", (e) => {
      const rect = c.getBoundingClientRect();
      const world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hit = this.nodeAt(world);
      if (hit && this.callbacks.onNodeClick) this.callbacks.onNodeClick(hit.id);
    });

    // Support tactile basique (mobile / Chromebook tactile)
    let touchStart: PhysicsVector | null = null;
    c.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      const rect = c.getBoundingClientRect();
      touchStart = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      const world = this.screenToWorld(touchStart.x, touchStart.y);
      const hit = this.nodeAt(world);
      if (hit) {
        this.dragging = hit;
        hit.pinned = true;
      } else {
        this.panning = true;
      }
    }, { passive: true });

    c.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      const rect = c.getBoundingClientRect();
      const sx = t.clientX - rect.left;
      const sy = t.clientY - rect.top;
      if (this.dragging) {
        const world = this.screenToWorld(sx, sy);
        this.dragging.position.x = world.x;
        this.dragging.position.y = world.y;
      } else if (this.panning && touchStart) {
        this.panX += sx - touchStart.x;
        this.panY += sy - touchStart.y;
      }
      touchStart = { x: sx, y: sy };
    }, { passive: true });

    c.addEventListener("touchend", () => {
      if (this.dragging) this.dragging.pinned = false;
      this.dragging = null;
      this.panning = false;
    });
  }
}
