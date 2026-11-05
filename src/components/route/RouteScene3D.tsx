import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { buildChildrenMap, getMainObjects } from '@/lib/objectTree';
import { getReadinessTone, READINESS_TONE_HEX, type ReadinessTone } from '@/lib/readiness';
import { TYPE_ABBREVIATIONS } from '@/components/route/typeVisuals';
import type { DbObject } from '@/lib/types';

const SPACING = 18;
const CHILD_RADIUS = 6;
const FLY_DURATION_MS = 900;
const FLY_DISTANCE = 30;
const BACKGROUND = 0x0b1220;

const LABEL_TONE_TEXT: Record<ReadinessTone, string> = {
  gray: 'text-slate-300',
  red: 'text-red-400',
  amber: 'text-amber-300',
  green: 'text-emerald-400',
};

interface Entry {
  group: THREE.Group;
  body: THREE.Mesh;
  label: CSS2DObject;
  position: THREE.Vector3;
}

interface Flight {
  startedAt: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
}

interface SceneContext {
  renderer: THREE.WebGLRenderer;
  css: CSS2DRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  content: THREE.Group;
  entries: Map<string, Entry>;
  flight: Flight | null;
  initialized: boolean;
}

interface RouteScene3DProps {
  objects: DbObject[];
  visibleIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function computeLayout(objects: DbObject[]) {
  const mains = getMainObjects(objects);
  const childrenMap = buildChildrenMap(objects);
  const positions = new Map<string, THREE.Vector3>();

  mains.forEach((m, i) => {
    positions.set(m.id, new THREE.Vector3(i * SPACING, 0, Math.sin(i * 0.8) * 10));
  });
  for (const m of mains) {
    const base = positions.get(m.id);
    if (!base) continue;
    const kids = childrenMap.get(m.id) || [];
    kids.forEach((k, j) => {
      const angle = (j - (kids.length - 1) / 2) * 0.45 + Math.PI / 2;
      positions.set(
        k.id,
        base.clone().add(new THREE.Vector3(Math.cos(angle) * CHILD_RADIUS, 0, Math.sin(angle) * CHILD_RADIUS)),
      );
    });
  }

  return { positions, trunkPoints: mains.map((m) => positions.get(m.id)!).filter(Boolean) };
}

function makeArc(inner: number, outer: number, arcLength: number, color: number, opacity: number): THREE.Mesh {
  const geometry = new THREE.RingGeometry(inner, outer, 64, 1, Math.PI / 2, arcLength);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.05;
  return mesh;
}

function createLabel(obj: DbObject, onSelect: (id: string) => void): CSS2DObject {
  const tone = getReadinessTone(obj.progress_percent);
  const el = document.createElement('button');
  el.type = 'button';
  el.className =
    'pointer-events-auto whitespace-nowrap rounded-md border border-white/10 bg-slate-900/85 px-2 py-1 text-[11px] text-white shadow-lg transition-colors hover:border-white/40';

  const abbr = document.createElement('span');
  abbr.className = 'mr-1 text-slate-400';
  abbr.textContent = TYPE_ABBREVIATIONS[obj.type];

  const name = document.createElement('span');
  name.textContent = obj.name;

  const value = document.createElement('span');
  value.className = `ml-1.5 font-semibold ${LABEL_TONE_TEXT[tone]}`;
  value.textContent = `${obj.progress_percent}%`;

  el.append(abbr, name, value);
  el.addEventListener('click', (event) => {
    event.stopPropagation();
    onSelect(obj.id);
  });
  return new CSS2DObject(el);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
      node.geometry.dispose();
      (node.material as THREE.Material).dispose();
    }
  });
}

function rebuildScene(ctx: SceneContext, objects: DbObject[], onSelect: (id: string) => void) {
  for (const entry of ctx.entries.values()) entry.label.element.remove();
  ctx.entries.clear();
  disposeObject(ctx.content);
  ctx.content.clear();

  const { positions, trunkPoints } = computeLayout(objects);

  if (trunkPoints.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(trunkPoints);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 300, 0.35, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x334155, emissive: 0x0f2a44, roughness: 0.6 }),
    );
    ctx.content.add(tube);
  }

  for (const obj of objects) {
    const pos = positions.get(obj.id);
    if (!pos) continue;
    const isMain = obj.parent_id === null;
    const color = READINESS_TONE_HEX[getReadinessTone(obj.progress_percent)];

    const group = new THREE.Group();
    group.position.copy(pos);

    const geometry = isMain ? new THREE.SphereGeometry(1.6, 24, 16) : new THREE.OctahedronGeometry(0.9);
    const body = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.4 }),
    );
    body.position.y = isMain ? 1.6 : 1;
    body.userData.objectId = obj.id;
    group.add(body);

    const innerRadius = isMain ? 2.3 : 1.4;
    const outerRadius = innerRadius + 0.4;
    group.add(makeArc(innerRadius, outerRadius, Math.PI * 2, 0x334155, 0.6));
    if (obj.progress_percent > 0) {
      group.add(makeArc(innerRadius, outerRadius, (Math.PI * 2 * obj.progress_percent) / 100, color, 1));
    }

    const label = createLabel(obj, onSelect);
    label.position.set(0, isMain ? 4.2 : 3, 0);
    group.add(label);

    if (!isMain && obj.parent_id) {
      const parentPos = positions.get(obj.parent_id);
      if (parentPos) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(parentPos.x, 0.05, parentPos.z),
            new THREE.Vector3(pos.x, 0.05, pos.z),
          ]),
          new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.7 }),
        );
        ctx.content.add(line);
      }
    }

    ctx.content.add(group);
    ctx.entries.set(obj.id, { group, body, label, position: pos.clone() });
  }

  if (!ctx.initialized && trunkPoints.length > 0) {
    const center = trunkPoints.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(trunkPoints.length);
    ctx.controls.target.copy(center);
    ctx.camera.position.copy(center).add(new THREE.Vector3(0, 60, 90));
    ctx.initialized = true;
  }
}

function applyVisibility(ctx: SceneContext, visibleIds: Set<string>) {
  for (const [id, entry] of ctx.entries) entry.group.visible = visibleIds.has(id);
}

function applySelection(ctx: SceneContext, selectedId: string | null) {
  for (const [id, entry] of ctx.entries) {
    const selected = id === selectedId;
    entry.body.scale.setScalar(selected ? 1.35 : 1);
    (entry.body.material as THREE.MeshStandardMaterial).emissiveIntensity = selected ? 0.7 : 0.15;
    entry.label.element.classList.toggle('ring-2', selected);
    entry.label.element.classList.toggle('ring-white', selected);
  }
}

function startFlight(ctx: SceneContext, selectedId: string | null) {
  const entry = selectedId ? ctx.entries.get(selectedId) : undefined;
  if (!entry) return;
  const direction = ctx.camera.position.clone().sub(ctx.controls.target);
  if (direction.lengthSq() < 1) direction.set(0, 1, 1);
  direction.setLength(FLY_DISTANCE);
  ctx.flight = {
    startedAt: performance.now(),
    fromPos: ctx.camera.position.clone(),
    toPos: entry.position.clone().add(direction),
    fromTarget: ctx.controls.target.clone(),
    toTarget: entry.position.clone(),
  };
}

export default function RouteScene3D({ objects, visibleIds, selectedId, onSelect }: RouteScene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<SceneContext | null>(null);
  const onSelectRef = useRef(onSelect);
  const viewRef = useRef({ visibleIds, selectedId });

  useEffect(() => {
    onSelectRef.current = onSelect;
    viewRef.current = { visibleIds, selectedId };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND);
    scene.fog = new THREE.Fog(BACKGROUND, 220, 520);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const css = new CSS2DRenderer();
    css.domElement.style.position = 'absolute';
    css.domElement.style.top = '0';
    css.domElement.style.left = '0';
    css.domElement.style.pointerEvents = 'none';
    container.appendChild(css.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 12;
    controls.maxDistance = 300;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(40, 80, 30);
    scene.add(sun);
    const grid = new THREE.GridHelper(800, 80, 0x1e293b, 0x152033);
    grid.position.y = -0.02;
    scene.add(grid);

    const content = new THREE.Group();
    scene.add(content);

    const ctx: SceneContext = {
      renderer, css, scene, camera, controls, content,
      entries: new Map(), flight: null, initialized: false,
    };
    ctxRef.current = ctx;

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      css.setSize(w, h);
      camera.aspect = w / h || 1;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt: { x: number; y: number } | null = null;
    const handlePointerDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; };
    const handlePointerUp = (e: PointerEvent) => {
      if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const pickables = [...ctx.entries.values()].filter((entry) => entry.group.visible).map((entry) => entry.body);
      const hit = raycaster.intersectObjects(pickables, false)[0];
      if (hit) onSelectRef.current(hit.object.userData.objectId as string);
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    let frameId = 0;
    const animate = (now: number) => {
      frameId = requestAnimationFrame(animate);
      if (ctx.flight) {
        const t = Math.min(1, (now - ctx.flight.startedAt) / FLY_DURATION_MS);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        camera.position.lerpVectors(ctx.flight.fromPos, ctx.flight.toPos, e);
        controls.target.lerpVectors(ctx.flight.fromTarget, ctx.flight.toTarget, e);
        if (t >= 1) ctx.flight = null;
      }
      controls.update();
      renderer.render(scene, camera);
      css.render(scene, camera);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      for (const entry of ctx.entries.values()) entry.label.element.remove();
      disposeObject(content);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      css.domElement.remove();
      ctxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    rebuildScene(ctx, objects, (id) => onSelectRef.current(id));
    applyVisibility(ctx, viewRef.current.visibleIds);
    applySelection(ctx, viewRef.current.selectedId);
  }, [objects]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (ctx) applyVisibility(ctx, visibleIds);
  }, [visibleIds]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    applySelection(ctx, selectedId);
    startFlight(ctx, selectedId);
  }, [selectedId]);

  return <div ref={containerRef} className="relative w-full h-full overflow-hidden" />;
}
