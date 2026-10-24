import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { DrawModel, PunchingType } from "../calc/types";
import { rebarDetail } from "../calc/detalhe";

interface Punch3DProps {
  draw: DrawModel;
  h: number;
  cover: number;
  phiMm: number;
  type: PunchingType;
}

export function Punch3D({ draw, h, cover, phiMm, type }: Punch3DProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const width = el.clientWidth || 800;
    const height = el.clientHeight || 560;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#1b1714");
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.5, 8000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, h * 0.4, 0);
    controls.maxPolarAngle = Math.PI * 0.62;

    scene.add(new THREE.AmbientLight("#f3e6d0", 0.55));
    const key = new THREE.DirectionalLight("#fff4e4", 1.15);
    key.position.set(80, 160, 40);
    scene.add(key);
    const fill = new THREE.DirectionalLight("#8eb4c9", 0.35);
    fill.position.set(-60, 40, -80);
    scene.add(fill);

    const { column, slab } = draw;
    const cx = (column.x0 + column.x1) / 2;
    const cz = (column.z0 + column.z1) / 2;
    const sx = (slab.x0 + slab.x1) / 2;
    const sz = (slab.z0 + slab.z1) / 2;
    const to = (x: number, y: number, z: number) => new THREE.Vector3(x - cx, y, cz - z);

    const slabGeo = new THREE.BoxGeometry(slab.x1 - slab.x0, h, slab.z1 - slab.z0);
    const slabMat = new THREE.MeshStandardMaterial({
      color: "#c4b39a",
      roughness: 0.86,
      metalness: 0.02,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.position.copy(to(sx, h / 2, sz));
    scene.add(slabMesh);

    const colGeo = new THREE.BoxGeometry(column.x1 - column.x0, h * 1.85, column.z1 - column.z0);
    const colMat = new THREE.MeshStandardMaterial({ color: "#3c4742", roughness: 0.7 });
    const colMesh = new THREE.Mesh(colGeo, colMat);
    colMesh.position.copy(to(cx, h * 0.55, cz));
    scene.add(colMesh);

    const surface = punchingSurface(draw, h, to);
    scene.add(surface);

    const ring = new THREE.BufferGeometry().setFromPoints(
      closeLoop(draw.perimeter, draw.perimeterClosed).map((p) => to(p.x, h + 0.4, p.z)),
    );
    scene.add(new THREE.Line(ring, new THREE.LineBasicMaterial({ color: "#f2d48a" })));

    const detail = rebarDetail({ hCm: h, coverCm: cover, phiMm, stMaxCm: 0.75 * Math.max(draw.d, 1) });
    if (draw.bars.length > 0 && detail.heightOk) {
      scene.add(type === "estribos" ? stirrupLines(draw, h, cover, detail.widthCm, detail.hookCm, to) : studMeshes(draw, h, cover, phiMm, to));
    }

    const span = Math.max(slab.x1 - slab.x0, slab.z1 - slab.z0, 80);
    camera.position.copy(to(cx + span * 0.15, h + span * 0.55, cz + span * 0.72));
    controls.target.copy(to(cx, h * 0.45, cz));
    controls.minDistance = span * 0.42;
    controls.update();

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      const w = el.clientWidth || 800;
      const hv = el.clientHeight || 560;
      camera.aspect = w / hv;
      camera.updateProjectionMatrix();
      renderer.setSize(w, hv);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [draw, h, cover, phiMm, type]);

  return (
    <div className="punch3d">
      <div ref={host} className="punch3d-host" />
      <p className="punch3d-note">Arraste para girar. A superfície âmbar liga a face do pilar ao perímetro C', através da espessura.</p>
    </div>
  );
}

function closeLoop(pts: { x: number; z: number }[], closed: boolean) {
  if (!closed || pts.length === 0) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-6) return pts;
  return [...pts, first];
}

function closestOnColumn(draw: DrawModel, x: number, z: number) {
  const { x0, x1, z0, z1 } = draw.column;
  const cx = Math.min(x1, Math.max(x0, x));
  const cz = Math.min(z1, Math.max(z0, z));
  if (x > x0 && x < x1 && z > z0 && z < z1) {
    const options = [
      { d: x - x0, p: { x: x0, z } },
      { d: x1 - x, p: { x: x1, z } },
      { d: z - z0, p: { x, z: z0 } },
      { d: z1 - z, p: { x, z: z1 } },
    ];
    options.sort((a, b) => a.d - b.d);
    return options[0].p;
  }
  return { x: cx, z: cz };
}

function punchingSurface(draw: DrawModel, h: number, to: (x: number, y: number, z: number) => THREE.Vector3) {
  const pts = draw.perimeter;
  const positions: number[] = [];
  const push = (p: THREE.Vector3) => positions.push(p.x, p.y, p.z);
  const n = pts.length;
  const last = draw.perimeterClosed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const ca = closestOnColumn(draw, a.x, a.z);
    const cb = closestOnColumn(draw, b.x, b.z);
    const A = to(a.x, h * 0.12, a.z);
    const B = to(b.x, h * 0.12, b.z);
    const CA = to(ca.x, h * 0.92, ca.z);
    const CB = to(cb.x, h * 0.92, cb.z);
    push(CA); push(A); push(CB);
    push(CB); push(A); push(B);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: "#e39b45",
    transparent: true,
    opacity: 0.72,
    roughness: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

function studMeshes(
  draw: DrawModel,
  h: number,
  cover: number,
  phiMm: number,
  to: (x: number, y: number, z: number) => THREE.Vector3,
) {
  const group = new THREE.Group();
  const r = Math.max(phiMm / 20, 0.35);
  const shaftGeo = new THREE.CylinderGeometry(r, r, Math.max(h - 2 * cover, 1), 6);
  const headGeo = new THREE.CylinderGeometry(r * 2.4, r * 2.4, r * 1.1, 8);
  const mat = new THREE.MeshStandardMaterial({ color: "#c4622d", metalness: 0.45, roughness: 0.35 });
  const shafts = new THREE.InstancedMesh(shaftGeo, mat, draw.bars.length);
  const headsTop = new THREE.InstancedMesh(headGeo, mat, draw.bars.length);
  const headsBot = new THREE.InstancedMesh(headGeo, mat, draw.bars.length);
  const dummy = new THREE.Object3D();
  draw.bars.forEach((bar, i) => {
    dummy.position.copy(to(bar.x, h / 2, bar.z));
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    shafts.setMatrixAt(i, dummy.matrix);
    dummy.position.copy(to(bar.x, h - cover, bar.z));
    dummy.updateMatrix();
    headsTop.setMatrixAt(i, dummy.matrix);
    dummy.position.copy(to(bar.x, cover, bar.z));
    dummy.updateMatrix();
    headsBot.setMatrixAt(i, dummy.matrix);
  });
  group.add(shafts, headsTop, headsBot);
  return group;
}

function stirrupLines(
  draw: DrawModel,
  h: number,
  cover: number,
  widthCm: number,
  hookCm: number,
  to: (x: number, y: number, z: number) => THREE.Vector3,
) {
  const positions: number[] = [];
  const y0 = cover;
  const y1 = h - cover;
  const k = hookCm * Math.SQRT1_2;
  for (const bar of draw.bars) {
    const tx = Math.cos(bar.angle);
    const tz = Math.sin(bar.angle);
    const leg = (sign: number, y: number) => to(bar.x + tx * sign * widthCm * 0.5, y, bar.z + tz * sign * widthCm * 0.5);
    const tip = (sign: number) =>
      to(
        bar.x + tx * sign * (widthCm * 0.5 - k),
        y0 + k,
        bar.z + tz * sign * (widthCm * 0.5 - k),
      );
    const pts = [tip(-1), leg(-1, y0), leg(-1, y1), leg(1, y1), leg(1, y0), tip(1)];
    for (let i = 0; i < pts.length - 1; i++) {
      positions.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#f0c9a0" }));
}
