"use client";

import { useEffect, useRef, useState } from "react";
import { useThemeStore } from "@/store/themeStore";

export function DataFlowTopologyChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

  const [speedMul, setSpeedMul] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const speedMulRef = useRef(1);
  speedMulRef.current = speedMul;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;

    if (!canvas || !container || !tooltip) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W: number, H: number, cX: number, cY: number, R: number;
    let rotY = 0,
      rotX = 0.3;
    let isDragging = false,
      dragStartX = 0,
      dragStartY = 0,
      dragRotY = 0,
      dragRotX = 0;
    let mouseX = -1000,
      mouseY = -1000;

    // Subsystem nodes placed on a sphere
    const nodes = [
      { name: "Finance", lat: 40, lon: -30, color: "#6366f1", size: 8, msgs: "2.4M" },
      { name: "Supply Chain", lat: 25, lon: 45, color: "#e11d48", size: 7, msgs: "1.2M" },
      { name: "Inventory", lat: -15, lon: 80, color: "#3b82f6", size: 7, msgs: "1.5M" },
      { name: "Human Resources", lat: 10, lon: -75, color: "#f59e0b", size: 7, msgs: "1.3M" },
      { name: "CRM", lat: 55, lon: 10, color: "#facc15", size: 9, msgs: "890K" },
      { name: "Warehouse Mgmt", lat: -35, lon: -50, color: "#ec4899", size: 6, msgs: "1.1M" },
      { name: "Billing", lat: -50, lon: 30, color: "#8b5cf6", size: 7, msgs: "980K" },
      { name: "Sales & Order", lat: 15, lon: 130, color: "#22c55e", size: 5, msgs: "420K" },
      { name: "Manufacturing", lat: -20, lon: -120, color: "#1e3a5f", size: 5, msgs: "350K" },
      { name: "Marketing", lat: 35, lon: -150, color: "#14f195", size: 6, msgs: "610K" },
      { name: "E-commerce", lat: -55, lon: 100, color: "#a78bfa", size: 4, msgs: "210K" },
      { name: "Procurement", lat: 0, lon: 170, color: "#dc2626", size: 5, msgs: "380K" }
    ];

    // Connections between nodes (edges)
    const edges = [
      [0, 1],
      [0, 2],
      [0, 4],
      [1, 3],
      [1, 5],
      [2, 6],
      [2, 7],
      [3, 4],
      [3, 8],
      [4, 5],
      [4, 6],
      [5, 9],
      [6, 7],
      [6, 10],
      [7, 11],
      [8, 9],
      [9, 10],
      [10, 11],
      [0, 9],
      [1, 6],
      [2, 4],
      [3, 7],
      [5, 8],
      [0, 6],
      [4, 10],
      [1, 11]
    ];

    // Animated particles on edges
    interface Particle {
      edge: number;
      t: number;
      speed: number;
      size: number;
      alpha: number;
    }
    const particles: Particle[] = [];
    for (let i = 0; i < 60; i++) {
      const edgeIdx = Math.floor(Math.random() * edges.length);
      particles.push({
        edge: edgeIdx,
        t: Math.random(),
        speed: 0.002 + Math.random() * 0.006,
        size: 1 + Math.random() * 1.5,
        alpha: 0.3 + Math.random() * 0.5
      });
    }

    const ringSegments = 60;

    function toRad(deg: number) {
      return (deg * Math.PI) / 180;
    }

    function sphereToXYZ(lat: number, lon: number, r: number) {
      const la = toRad(lat),
        lo = toRad(lon);
      return {
        x: r * Math.cos(la) * Math.sin(lo),
        y: -r * Math.sin(la),
        z: r * Math.cos(la) * Math.cos(lo)
      };
    }

    interface Point3D {
      x: number;
      y: number;
      z: number;
    }

    function rotatePoint(p: Point3D) {
      // Rotate around X axis
      let y1 = p.y * Math.cos(rotX) - p.z * Math.sin(rotX);
      let z1 = p.y * Math.sin(rotX) + p.z * Math.cos(rotX);
      // Rotate around Y axis
      let x2 = p.x * Math.cos(rotY) + z1 * Math.sin(rotY);
      let z2 = -p.x * Math.sin(rotY) + z1 * Math.cos(rotY);
      return { x: x2, y: y1, z: z2 };
    }

    function project(p3d: Point3D) {
      const perspective = 600;
      const scale = perspective / (perspective + p3d.z);
      return {
        x: cX + p3d.x * scale,
        y: cY + p3d.y * scale,
        z: p3d.z,
        scale: scale
      };
    }

    function resize() {
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cX = W / 2;
      cY = H / 2;
      R = Math.min(W, H) * 0.35;
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);

      // ââ Atmosphere glow ââ
      const atmGrad = ctx.createRadialGradient(cX, cY, R * 0.6, cX, cY, R * 1.4);
      atmGrad.addColorStop(0, "rgba(99, 102, 241, 0.02)");
      atmGrad.addColorStop(0.5, "rgba(139, 92, 246, 0.04)");
      atmGrad.addColorStop(0.8, "rgba(167, 139, 250, 0.02)");
      atmGrad.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(cX, cY, R * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = atmGrad;
      ctx.fill();

      // ââ Wireframe latitude/longitude rings ââ
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
      ctx.lineWidth = 0.5;

      // Latitude rings
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        for (let s = 0; s <= ringSegments; s++) {
          const lon = (s / ringSegments) * 360;
          const p3 = sphereToXYZ(lat, lon, R);
          const rp = rotatePoint(p3);
          const pp = project(rp);
          if (rp.z < 0) {
            ctx.globalAlpha = 0.3;
          } else {
            ctx.globalAlpha = 0.8;
          }
          if (s === 0) ctx.moveTo(pp.x, pp.y);
          else ctx.lineTo(pp.x, pp.y);
        }
        ctx.globalAlpha = 1;
        ctx.stroke();
      }

      // Longitude rings
      for (let lon = 0; lon < 360; lon += 30) {
        ctx.beginPath();
        for (let s = 0; s <= ringSegments; s++) {
          const lat = -90 + (s / ringSegments) * 180;
          const p3 = sphereToXYZ(lat, lon, R);
          const rp = rotatePoint(p3);
          const pp = project(rp);
          ctx.globalAlpha = rp.z < 0 ? 0.15 : 0.5;
          if (s === 0) ctx.moveTo(pp.x, pp.y);
          else ctx.lineTo(pp.x, pp.y);
        }
        ctx.globalAlpha = 1;
        ctx.stroke();
      }

      // ââ Project all nodes ââ
      const projected = nodes.map((n) => {
        const p3 = sphereToXYZ(n.lat, n.lon, R);
        const rp = rotatePoint(p3);
        const pp = project(rp);
        return { ...n, p3: rp, p2: pp, visible: rp.z > -R * 0.3 };
      });

      // ââ Draw edges (behind sphere first, then front) ââ
      const sortedEdges = edges
        .map((e) => {
          const a = projected[e[0]],
            b = projected[e[1]];
          const avgZ = (a.p3.z + b.p3.z) / 2;
          return { e, avgZ, a, b };
        })
        .sort((a, b) => a.avgZ - b.avgZ);

      sortedEdges.forEach(({ a, b }) => {
        const behind = a.p3.z < 0 && b.p3.z < 0;
        const alpha = behind ? 0.06 : Math.max(0.08, Math.min(0.3, (a.p3.z + b.p3.z + R * 2) / (R * 4)));
        ctx.strokeStyle = `rgba(167, 139, 250, ${alpha})`;
        ctx.lineWidth = behind ? 0.5 : 1;
        ctx.beginPath();
        ctx.moveTo(a.p2.x, a.p2.y);

        // Curved edge (via midpoint lifted off sphere)
        const midP3 = {
          x: (a.p3.x + b.p3.x) / 2,
          y: (a.p3.y + b.p3.y) / 2,
          z: (a.p3.z + b.p3.z) / 2
        };
        const midLen = Math.sqrt(midP3.x * midP3.x + midP3.y * midP3.y + midP3.z * midP3.z);
        const liftR = R * 1.15;
        const midLifted = {
          x: (midP3.x / midLen) * liftR,
          y: (midP3.y / midLen) * liftR,
          z: (midP3.z / midLen) * liftR
        };
        const midPP = project(midLifted);
        ctx.quadraticCurveTo(midPP.x, midPP.y, b.p2.x, b.p2.y);
        ctx.stroke();
      });

      // ââ Draw particles ââ
      particles.forEach((p) => {
        p.t += p.speed;
        if (p.t > 1) p.t -= 1;

        const edge = edges[p.edge];
        const a = projected[edge[0]],
          b = projected[edge[1]];
        const t = p.t;
        // Interpolate along curved path
        const midP3 = {
          x: (a.p3.x + b.p3.x) / 2,
          y: (a.p3.y + b.p3.y) / 2,
          z: (a.p3.z + b.p3.z) / 2
        };
        const midLen = Math.sqrt(midP3.x * midP3.x + midP3.y * midP3.y + midP3.z * midP3.z) || 1;
        const liftR = R * 1.15;
        const mp = {
          x: (midP3.x / midLen) * liftR,
          y: (midP3.y / midLen) * liftR,
          z: (midP3.z / midLen) * liftR
        };
        // Quadratic bezier in 3D
        const it = 1 - t;
        const px3 = it * it * a.p3.x + 2 * it * t * mp.x + t * t * b.p3.x;
        const py3 = it * it * a.p3.y + 2 * it * t * mp.y + t * t * b.p3.y;
        const pz3 = it * it * a.p3.z + 2 * it * t * mp.z + t * t * b.p3.z;
        const pp = project({ x: px3, y: py3, z: pz3 });

        if (pz3 < -R * 0.5) return;

        const depthAlpha = Math.max(0.1, Math.min(1, (pz3 + R) / (R * 2)));
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, p.size * pp.scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167, 139, 250, ${p.alpha * depthAlpha})`;
        ctx.fill();
      });

      // ââ Draw nodes (sorted by depth, farthest first) ââ
      projected.sort((a, b) => a.p3.z - b.p3.z);

      let hoveredNode: any = null;

      projected.forEach((n) => {
        const behind = n.p3.z < -R * 0.3;
        const depthFactor = Math.max(0.15, (n.p3.z + R) / (R * 2));
        const nodeSize = n.size * n.p2.scale * (behind ? 0.5 : 1);

        // Check hover
        const dx = mouseX - n.p2.x,
          dy = mouseY - n.p2.y;
        const isHovered = Math.sqrt(dx * dx + dy * dy) < nodeSize + 8 && !behind;
        if (isHovered) hoveredNode = n;

        // Outer glow
        if (!behind) {
          const glowGrad = ctx.createRadialGradient(n.p2.x, n.p2.y, 0, n.p2.x, n.p2.y, nodeSize * 3);
          glowGrad.addColorStop(0, n.color + "30");
          glowGrad.addColorStop(1, "transparent");
          ctx.beginPath();
          ctx.arc(n.p2.x, n.p2.y, nodeSize * 3, 0, Math.PI * 2);
          ctx.fillStyle = glowGrad;
          ctx.fill();
        }

        // Node sphere (3D-ish with gradient)
        const nodeGrad = ctx.createRadialGradient(
          n.p2.x - nodeSize * 0.3,
          n.p2.y - nodeSize * 0.3,
          nodeSize * 0.1,
          n.p2.x,
          n.p2.y,
          nodeSize
        );
        nodeGrad.addColorStop(0, "#fff");
        nodeGrad.addColorStop(0.3, n.color);
        nodeGrad.addColorStop(1, n.color + (behind ? "40" : "cc"));

        ctx.beginPath();
        ctx.arc(n.p2.x, n.p2.y, nodeSize, 0, Math.PI * 2);
        ctx.fillStyle = nodeGrad;
        ctx.globalAlpha = behind ? 0.25 : depthFactor;
        ctx.fill();

        // Highlight ring if hovered
        if (isHovered) {
          ctx.strokeStyle = n.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(n.p2.x, n.p2.y, nodeSize + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Label
        if (!behind && depthFactor > 0.5) {
          ctx.globalAlpha = depthFactor * 0.9;
          ctx.font = `${Math.round(9 * n.p2.scale)}px "Roboto Mono", monospace`;
          ctx.textAlign = "center";
          ctx.fillStyle = isDark ? "#ccc" : "#444";
          ctx.fillText(n.name, n.p2.x, n.p2.y + nodeSize + 14);
        }

        ctx.globalAlpha = 1;
      });

      // Tooltip
      if (hoveredNode) {
        tooltip.innerHTML = `<b style="color:${hoveredNode.color}">₹{hoveredNode.name}</b><br><span style="color:#757575">Workflows:</span> ${hoveredNode.msgs}`;
        tooltip.style.display = "block";
        tooltip.style.left = hoveredNode.p2.x + 18 + "px";
        tooltip.style.top = hoveredNode.p2.y - 20 + "px";
      } else {
        tooltip.style.display = "none";
      }
    }

    let animFrame: number;
    function animate() {
      if (!isDragging) {
        rotY += 0.004 * speedMulRef.current;
      }
      draw();
      animFrame = requestAnimationFrame(animate);
    }

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragRotY = rotY;
      dragRotX = rotX;
      canvas.style.cursor = "grabbing";
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;

      if (isDragging) {
        rotY = dragRotY + (e.clientX - dragStartX) * 0.005;
        rotX = dragRotX + (e.clientY - dragStartY) * 0.005;
        rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
      canvas.style.cursor = "grab";
    };

    const handleMouseLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", resize);

    canvas.style.cursor = "grab";

    resize();
    animate();

    return () => {
      cancelAnimationFrame(animFrame);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", resize);
    };
  }, [isDark]);

  return (
    <div className="bg-card border border-border rounded-none p-6 font-mono w-full relative flex flex-col items-center">
      <div className="w-full flex justify-between items-center mb-4">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Enterprise Data Flow Topology
          </span>
          <h3 className="text-sm font-normal text-foreground uppercase mt-0.5">
            3D Integration Mesh
          </h3>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full h-[400px] flex items-center justify-center">
        <canvas ref={canvasRef} className="block w-full h-full"></canvas>

        {/* 3D Sphere Tooltip */}
        <div
          ref={tooltipRef}
          className={`absolute pointer-events-none border border-border p-2 font-mono text-[11px] shadow-xl min-w-[120px] rounded-none hidden z-10 backdrop-blur-md ${isDark ? "bg-[#0c0c12]/95 text-white" : "bg-white/95 text-foreground"}`}
        ></div>

        {/* Speed Controls */}
        <div className="flex gap-2 absolute bottom-4 left-1/2 -translate-x-1/2 text-[9px] z-10">
          <button
            onClick={() => setSpeedMul(0)}
            className={`cursor-pointer px-2.5 py-1 border transition-colors ${
              speedMul === 0
                ? "bg-foreground/10 text-foreground border-foreground"
                : "bg-accent/40 text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            Pause
          </button>
          <button
            onClick={() => setSpeedMul(1)}
            className={`cursor-pointer px-2.5 py-1 border transition-colors ${
              speedMul === 1
                ? "bg-foreground/10 text-foreground border-foreground"
                : "bg-accent/40 text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            Rotate
          </button>
          <button
            onClick={() => setSpeedMul(3)}
            className={`cursor-pointer px-2.5 py-1 border transition-colors ${
              speedMul === 3
                ? "bg-foreground/10 text-foreground border-foreground"
                : "bg-accent/40 text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            Fast
          </button>
        </div>
      </div>
    </div>
  );
}
