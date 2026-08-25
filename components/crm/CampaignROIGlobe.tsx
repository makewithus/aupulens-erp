"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Loader2 } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

interface RoiTrendPoint {
  date: string;
  cumulativeBudget: number;
  cumulativeRevenue: number;
  roiPercentage: number;
}

const ZOOM_PRESETS = [
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "180D", days: 180 },
  { label: "1Y", days: 365 },
];

const GLOBE_RADIUS = 2.2;
const WRAPS = 4; // full spiral turns the ribbon makes around the globe
const MAX_MARKERS = 60; // hover-pickable points, sampled evenly regardless of window size

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function CampaignROIGlobe() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

  const [loading, setLoading] = useState(true);
  const [allPoints, setAllPoints] = useState<RoiTrendPoint[]>([]);
  const [windowDays, setWindowDays] = useState(90);

  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/crm/reports/roi-trend?days=365")
      .then((res) => res.json())
      .then((d) => {
        if (d.success) {
          const points: RoiTrendPoint[] = d.data.points;
          setAllPoints(points);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const visiblePoints = useMemo(() => {
    if (!allPoints.length) return [];
    const width = Math.min(allPoints.length, windowDays);
    return allPoints.slice(allPoints.length - width);
  }, [allPoints, windowDays]);

  const latestRoi = allPoints[allPoints.length - 1]?.roiPercentage || 0;
  const hasData = allPoints.some((p) => p.cumulativeBudget > 0);

  const setZoomDays = useCallback((days: number) => setWindowDays(days), []);

  useEffect(() => {
    if (loading || !hasData || visiblePoints.length < 2) return;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    if (!container || !tooltip) return;

    const bg = isDark ? 0x0a0a0a : 0xffffff;
    const ribbonPositive = 0x8ae06c;
    const ribbonNegative = 0xf56868;
    const ribbonColor = latestRoi >= 0 ? ribbonPositive : ribbonNegative;
    const gridColor = isDark ? 0x757575 : 0xbfbfbf;
    const markerColor = isDark ? 0xf2f2f2 : 0x0a0a0a;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 1.2, 6.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.minDistance = 3.5;
    controls.maxDistance = 12;
    controls.enablePan = false;

    // Inner solid globe
    const globeGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 48, 32);
    const globeMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x161616 : 0xf6f6f6,
      roughness: 0.85,
      metalness: 0.1,
    });
    scene.add(new THREE.Mesh(globeGeo, globeMat));

    // Outer wireframe shell for a "data globe" grid look
    const wireGeo = new THREE.SphereGeometry(GLOBE_RADIUS + 0.01, 24, 16);
    const wireMat = new THREE.MeshBasicMaterial({ color: gridColor, wireframe: true, transparent: true, opacity: 0.18 });
    scene.add(new THREE.Mesh(wireGeo, wireMat));

    // Starfield backdrop
    const starGeo = new THREE.BufferGeometry();
    const starCount = 300;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 20 + Math.random() * 20;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: gridColor, size: 0.04, transparent: true, opacity: 0.5 });
    scene.add(new THREE.Points(starGeo, starMat));

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.55 : 0.75));
    const key = new THREE.DirectionalLight(0xffffff, isDark ? 0.9 : 0.6);
    key.position.set(4, 5, 3);
    scene.add(key);
    const rim = new THREE.PointLight(ribbonColor, isDark ? 1.4 : 0.8, 20);
    rim.position.set(-4, -2, -3);
    scene.add(rim);

    // ── The ribbon: ROI trend spiral-wrapped around the globe ──────────────
    const n = visiblePoints.length;
    const roiValues = visiblePoints.map((p) => p.roiPercentage);
    const maxAbsRoi = Math.max(10, ...roiValues.map((v) => Math.abs(v)));
    const heightScale = 0.85;

    const curvePoints: THREE.Vector3[] = visiblePoints.map((p, i) => {
      const t = n === 1 ? 0 : i / (n - 1);
      const theta = t * WRAPS * Math.PI * 2;
      const phi = Math.PI * (0.5 - t) * 0.8; // sweeps from ~+72° to -72° latitude
      const normalized = Math.max(-1, Math.min(1, p.roiPercentage / maxAbsRoi));
      const r = GLOBE_RADIUS + normalized * heightScale;
      const x = r * Math.cos(phi) * Math.cos(theta);
      const y = r * Math.sin(phi);
      const z = r * Math.cos(phi) * Math.sin(theta);
      return new THREE.Vector3(x, y, z);
    });

    const curve = new THREE.CatmullRomCurve3(curvePoints);
    const tubeGeo = new THREE.TubeGeometry(curve, Math.max(64, n * 2), 0.035, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: ribbonColor,
      emissive: ribbonColor,
      emissiveIntensity: 0.5,
      roughness: 0.35,
      metalness: 0.2,
    });
    scene.add(new THREE.Mesh(tubeGeo, tubeMat));

    // Sparse hover-pickable markers along the ribbon
    const markerStep = Math.max(1, Math.floor(n / MAX_MARKERS));
    const markerGeo = new THREE.SphereGeometry(0.045, 10, 10);
    const markerMat = new THREE.MeshBasicMaterial({ color: markerColor });
    const markers: THREE.Mesh[] = [];
    for (let i = 0; i < n; i += markerStep) {
      const m = new THREE.Mesh(markerGeo, markerMat);
      m.position.copy(curvePoints[i]);
      m.userData.pointIndex = i;
      scene.add(m);
      markers.push(m);
    }

    function resize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markers, false);
      if (hits.length) {
        const idx = (hits[0].object as THREE.Mesh).userData.pointIndex as number;
        const p = visiblePoints[idx];
        tooltip.innerHTML = `
          <div class="font-medium">${fmtDate(p.date)}</div>
          <div class="mt-1 flex items-center gap-1.5"><span style="width:8px;height:8px;border-radius:1px;display:inline-block;background:#${ribbonColor.toString(16).padStart(6, "0")}"></span> ROI <b class="ml-1">${p.roiPercentage.toFixed(1)}%</b></div>
        `;
        tooltip.style.display = "block";
        tooltip.style.left = Math.min(e.clientX - rect.left + 14, rect.width - 190) + "px";
        tooltip.style.top = Math.max(0, e.clientY - rect.top - 50) + "px";
        controls.autoRotate = false;
      } else {
        tooltip.style.display = "none";
      }
    };
    const handlePointerLeave = () => { tooltip.style.display = "none"; };
    const handlePointerDown = () => { controls.autoRotate = false; };

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);
    container.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", resize);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
      container.removeEventListener("pointerdown", handlePointerDown);
      controls.dispose();
      renderer.dispose();
      globeGeo.dispose(); globeMat.dispose();
      wireGeo.dispose(); wireMat.dispose();
      starGeo.dispose(); starMat.dispose();
      tubeGeo.dispose(); tubeMat.dispose();
      markerGeo.dispose(); markerMat.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    };
  }, [isDark, visiblePoints, loading, hasData, latestRoi]);

  return (
    <div className={`rounded-lg p-6 font-mono w-full relative border ${isDark ? "bg-card border-border text-white" : "bg-white border-border text-foreground"}`}>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        <div>
          <h3 className={`text-lg font-normal uppercase mt-0.5 ${isDark ? "text-white" : "text-foreground"}`}>Campaign ROI Trend</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Ribbon height = ROI, wrapped by date — drag to rotate, scroll/pinch to zoom</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Current ROI</span>
            <span className={`text-sm font-semibold ${latestRoi >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{latestRoi.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {ZOOM_PRESETS.map((z) => (
          <button
            key={z.label}
            onClick={() => setZoomDays(z.days)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${
              windowDays === z.days
                ? isDark ? "border-violet-500 text-violet-300 bg-violet-950/30" : "border-violet-400 text-violet-700 bg-violet-50"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {z.label}
          </button>
        ))}
      </div>

      <div ref={containerRef} className="relative w-full h-[420px] touch-none">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading ROI trend…</div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No campaigns with committed budget yet.</div>
        ) : (
          <div ref={tooltipRef} className={`absolute pointer-events-none p-2.5 font-mono text-[11px] shadow-xl min-w-[170px] rounded-none hidden z-10 border ${isDark ? "bg-[#141414]/95 border-border text-white" : "bg-white/95 border-border text-foreground"}`} />
        )}
      </div>
    </div>
  );
}
