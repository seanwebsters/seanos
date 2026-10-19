"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { OfficeAgent, OfficeState } from "@/lib/founder/office";
import { api } from "./client";
import { Icon } from "./Icon";

type Three = typeof import("three");
type Scene = {
  update(state: OfficeState): void;
  select(key: string | null): void;
  dispose(): void;
};

const STATE_COLOR: Record<OfficeAgent["state"], string> = { working: "#3fae7a", waiting: "#e0a030", queued: "#5a8fd0", blocked: "#d0645a", idle: "#9b958a" };
const STATE_LABEL: Record<OfficeAgent["state"], string> = { working: "Working", waiting: "Waiting on you", queued: "Queued", blocked: "Blocked", idle: "Idle" };
const SKIN = ["#f1c9a5", "#d9a67e", "#a8714f", "#7a4e33", "#e8b894", "#c48c64"];
const HAIR = ["#2b211c", "#4a3226", "#151313", "#8a5a33", "#c9a26b", "#3a2a22"];

/** Seats: [x, z]. Agents face −x towards their monitors; the camera looks in from +x/+z. */
const SEATS: Record<string, [number, number]> = {
  strategist: [-6, -4.5], research: [-6, -1.5], analyst: [-6, 1.5], growth: [-6, 4.5],
  bizdev: [-1.5, -4.5], cfo: [-1.5, -1.5], fundraising: [-1.5, 1.5], investors: [-1.5, 4.5],
  operations: [3, -4.5], legal: [3, -1.5], chief_of_staff: [3.6, 3.2],
};

function short(name: string) {
  return name.replace("Legal & Compliance Coordinator", "Legal").replace("Business Development Agent", "BD").replace("Business Strategist", "Strategy").replace("Investor Research", "Investors").replace("Fundraising Advisor", "Fundraising").replace("Research Analyst", "Research").replace("Commercial Analyst", "Analyst").replace("Operations Lead", "Operations").replace("Growth Lead", "Growth");
}

async function buildScene(el: HTMLDivElement, initial: OfficeState, onPick: (key: string | null) => void): Promise<Scene> {
  const THREE: Three = await import("three");
  const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
  const { CSS2DRenderer, CSS2DObject } = await import("three/examples/jsm/renderers/CSS2DRenderer.js");
  // The office is always black, in light and dark mode: screens, labels and the window do the lighting.
  const dark = true;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = el.clientWidth < 700;
  const P = dark
    ? { floor: "#151515", rug: "#1f1f1f", wall: "#0f0f0f", wall2: "#0b0b0b", desk: "#2a2a2a", deskTop: "#333333", chair: "#202020", trim: "#262626", amb: 1.0, sun: 1.7 }
    : { floor: "#e6d6bd", rug: "#d6c09a", wall: "#f4ede1", wall2: "#ebe2d3", desk: "#a77f5c", deskTop: "#c79e76", chair: "#3b3836", trim: "#d8cbb6", amb: 0.9, sun: 2.2 };

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.setSize(el.clientWidth, el.clientHeight);
  Object.assign(labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  el.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const target = new THREE.Vector3(-0.8, 1.4, 0);
  camera.position.set(17, 15, 17).add(target);
  const fit = () => {
    const w = el.clientWidth, h = el.clientHeight, aspect = w / h;
    let halfH = 8.6;
    const narrow = aspect < 1.1;
    if (aspect * halfH < (narrow ? 10.8 : 12.5)) halfH = (narrow ? 10.8 : 12.5) / aspect;
    const lift = narrow ? halfH * 0.14 : 0;
    // On wide screens, slide the room right so the page title has clear space on the left.
    const shift = aspect > 1.5 ? aspect * halfH * 0.2 : 0;
    camera.left = -aspect * halfH - shift; camera.right = aspect * halfH - shift; camera.top = halfH + lift; camera.bottom = -halfH + lift;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labels.setSize(w, h);
  };
  fit();
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minZoom = 0.8; controls.maxZoom = 2.4;
  controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.1;
  const az = Math.PI / 4;
  controls.minAzimuthAngle = az - 0.75; controls.maxAzimuthAngle = az + 0.75;
  controls.update();

  // Light
  scene.add(new THREE.HemisphereLight(dark ? "#d8d4ff" : "#fff6e8", dark ? "#1a1410" : "#c8b49a", P.amb));
  const sun = new THREE.DirectionalLight(dark ? "#ffd2a8" : "#fff1dc", P.sun);
  sun.position.set(6, 14, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const windowGlow = new THREE.PointLight(dark ? "#ff9e6b" : "#ffd9a8", dark ? 18 : 10, 18, 1.6);
  windowGlow.position.set(5, 3.5, -5.5);
  scene.add(windowGlow);

  const mat = (color: string, extra: Partial<import("three").MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
  const box = (w: number, h: number, d: number, m: import("three").Material, x: number, y: number, z: number, parent: import("three").Object3D = scene) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Room
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.3, 14), mat(P.floor));
  floor.position.set(0, -0.15, 0); floor.receiveShadow = true; scene.add(floor);
  for (let i = -9; i <= 9; i += 1.5) box(0.02, 0.005, 14, mat(dark ? "#1d1d1d" : "#dcc9ad"), i, 0.003, 0);
  const rug = new THREE.Mesh(new THREE.BoxGeometry(11, 0.04, 11.5), mat(P.rug));
  rug.position.set(-3.6, 0.02, 0); rug.receiveShadow = true; scene.add(rug);
  box(20, 6, 0.3, mat(P.wall), 0, 3, -7.15);
  box(0.3, 6, 14.3, mat(P.wall2), -10.15, 3, 0);
  box(20, 0.25, 0.1, mat(P.trim), 0, 0.12, -6.97);
  box(0.1, 0.25, 14, mat(P.trim), -9.97, 0.12, 0);

  // Window with a London-at-dusk view, painted on a canvas.
  const view = document.createElement("canvas");
  view.width = 1024; view.height = 420;
  const v = view.getContext("2d")!;
  const sky = v.createLinearGradient(0, 0, 0, 420);
  sky.addColorStop(0, dark ? "#1b1838" : "#5a4a86"); sky.addColorStop(0.55, dark ? "#7a4462" : "#c9798a"); sky.addColorStop(1, dark ? "#e0855a" : "#f4b27a");
  v.fillStyle = sky; v.fillRect(0, 0, 1024, 420);
  v.fillStyle = dark ? "#120f1a" : "#3b2a3e";
  const sil = [[0, 330], [60, 300], [90, 300], [90, 250], [130, 250], [130, 310], [200, 310], [200, 120], [215, 80], [230, 120], [230, 310], [300, 290], [360, 290], [360, 220], [400, 220], [400, 300], [470, 300], [520, 60], [570, 300], [640, 300], [640, 240], [700, 240], [700, 280], [780, 280], [780, 200], [820, 200], [820, 290], [900, 290], [900, 250], [1024, 250], [1024, 420], [0, 420]];
  v.beginPath(); sil.forEach(([x, y], i) => (i ? v.lineTo(x, y) : v.moveTo(x, y))); v.fill();
  v.strokeStyle = v.fillStyle; v.lineWidth = 4; v.beginPath(); v.arc(310, 230, 70, 0, Math.PI * 2); v.stroke();
  v.fillStyle = "#ffcf8a";
  for (let i = 0; i < 120; i++) v.fillRect((i * 97) % 1000 + 10, 300 + ((i * 37) % 110), 4, 6);
  const viewTex = new THREE.CanvasTexture(view); viewTex.colorSpace = THREE.SRGBColorSpace;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.9), new THREE.MeshBasicMaterial({ map: viewTex, toneMapped: false }));
  glass.position.set(4.6, 3.3, -6.98); scene.add(glass);
  const frameM = mat(dark ? "#3a332d" : "#ffffff");
  box(7.3, 0.15, 0.15, frameM, 4.6, 4.8, -6.92); box(7.3, 0.2, 0.3, frameM, 4.6, 1.8, -6.9);
  for (const x of [1, 4.6, 8.2]) box(0.12, 3.1, 0.15, frameM, x, 3.3, -6.92);

  // Whiteboard: live counts only.
  const wb = document.createElement("canvas"); wb.width = 512; wb.height = 300;
  const wbTex = new THREE.CanvasTexture(wb); wbTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.35), new THREE.MeshBasicMaterial({ map: wbTex, toneMapped: false }));
  board.position.set(-4.5, 3.2, -6.98); scene.add(board);
  box(4.2, 0.08, 0.2, mat("#9b958a"), -4.5, 2, -6.9);
  const drawBoard = (s: OfficeState) => {
    const g = wb.getContext("2d")!;
    g.fillStyle = "#fbfaf6"; g.fillRect(0, 0, 512, 300);
    g.fillStyle = "#1d1c1a"; g.font = "600 34px Inter, sans-serif"; g.fillText("Founder OS", 28, 56);
    g.font = "24px Inter, sans-serif"; g.fillStyle = "#4a4740";
    const w = s.agents.filter((a) => a.state === "working").length;
    g.fillText(`${w} working · ${s.queued} queued`, 28, 110);
    g.fillText(`${s.agents.filter((a) => a.state === "waiting").length} waiting on you`, 28, 150);
    g.fillText(`${s.agents.reduce((n, a) => n + a.doneToday, 0)} steps done today`, 28, 190);
    g.fillStyle = "#3fae7a"; g.fillRect(28, 230, Math.min(456, 456 * (w / Math.max(1, s.agents.length))), 10);
    g.strokeStyle = "#d9d3c7"; g.strokeRect(28, 230, 456, 10);
    wbTex.needsUpdate = true;
  };

  // Decor
  const plant = (x: number, z: number, s = 1) => {
    box(0.5 * s, 0.6 * s, 0.5 * s, mat(dark ? "#5b4a3d" : "#d8c3a5"), x, 0.3 * s, z);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62 * s, 0), mat(dark ? "#3f6b4c" : "#6f9a6a", { flatShading: true }));
    leaves.position.set(x, 1.15 * s, z); leaves.castShadow = true; scene.add(leaves);
  };
  plant(-9.2, -6.2, 1.3); plant(9.1, -6.2, 1.1); plant(-9.2, 6.1, 1); plant(8.6, 1.2, 0.9);
  // Bookshelf on the left wall
  box(0.6, 3.2, 3.4, mat(P.desk), -9.65, 1.6, 2.6);
  const bookColors = ["#c96f53", "#5a8fd0", "#e0a030", "#3fae7a", "#8a6bbf", "#d9c7a3"];
  for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) box(0.35, 0.5 + ((i * 7 + r) % 3) * 0.08, 0.26, mat(bookColors[(i + r) % 6]), -9.45, 0.45 + r * 0.78, 1.1 + i * 0.34);
  // Coffee point
  box(2.4, 1, 1, mat(P.desk), 7.4, 0.5, -6.3);
  box(0.5, 0.6, 0.45, mat("#2f2c2a"), 7, 1.3, -6.3);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.2, 12), mat("#ffffff")); mug.position.set(7.8, 1.1, -6.2); scene.add(mug);

  // Desks and agents
  type Seat = {
    a: OfficeAgent; group: import("three").Group; body: import("three").Mesh; head: import("three").Mesh; armL: import("three").Group; armR: import("three").Group;
    screen: HTMLCanvasElement; tex: import("three").CanvasTexture; ring: import("three").Mesh; label: HTMLDivElement; phase: number; lines: number[];
  };
  const seats = new Map<string, Seat>();
  const pickables: import("three").Object3D[] = [];
  initial.agents.forEach((a, i) => {
    const [x, z] = SEATS[a.key] ?? [0, 0];
    const big = a.key === "chief_of_staff";
    const group = new THREE.Group(); group.position.set(x, 0, z); scene.add(group);
    const dw = big ? 1.5 : 1.2, dl = big ? 3 : 2.3;
    box(dw, 0.08, dl, mat(P.deskTop), 0, 0.76, 0, group);
    for (const [lx, lz] of [[-dw / 2 + 0.08, -dl / 2 + 0.08], [-dw / 2 + 0.08, dl / 2 - 0.08], [dw / 2 - 0.08, -dl / 2 + 0.08], [dw / 2 - 0.08, dl / 2 - 0.08]]) box(0.07, 0.74, 0.07, mat(P.desk), lx, 0.37, lz, group);
    if (big) box(dw - 0.1, 0.7, 0.06, mat(P.desk), -0.1, 0.4, 0, group).rotation.y = Math.PI / 2;
    // Monitor
    const screen = document.createElement("canvas"); screen.width = 256; screen.height = 160;
    const tex = new THREE.CanvasTexture(screen); tex.colorSpace = THREE.SRGBColorSpace;
    box(0.06, 0.62, 1.05, mat("#1d1c1f", { roughness: 0.4 }), -0.32, 1.27, 0, group);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.55), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    scr.rotation.y = Math.PI / 2; scr.position.set(-0.285, 1.27, 0); group.add(scr);
    box(0.06, 0.2, 0.06, mat("#2a2a2d"), -0.32, 0.9, 0, group);
    box(0.25, 0.02, 0.3, mat("#2a2a2d"), -0.32, 0.81, 0, group);
    box(0.25, 0.03, 0.62, mat(dark ? "#3a3a3e" : "#e9e6df"), 0.1, 0.815, 0, group);
    if (i % 3 === 0) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.16, 10), mat(["#c96f53", "#ffffff", "#5a8fd0"][i % 3])); m.position.set(0.2, 0.88, dl / 2 - 0.35); group.add(m); }
    // Chair
    const chairM = mat(P.chair);
    box(0.62, 0.1, 0.62, chairM, 0.95, 0.5, 0, group);
    box(0.08, 0.38, 0.56, chairM, 1.3, 0.74, 0, group);
    box(0.06, 0.45, 0.06, mat("#555"), 0.95, 0.24, 0, group);
    // Status ring on the floor
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 40), new THREE.MeshBasicMaterial({ color: STATE_COLOR.idle, transparent: true, opacity: 0.0 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(0.9, 0.05, 0); group.add(ring);
    // Person
    const person = new THREE.Group(); person.position.set(0.9, 0, 0); person.scale.setScalar(1.18); group.add(person);
    const shirt = mat(a.hue, { roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.42, 6, 14), shirt);
    body.position.set(0, 0.98, 0); body.castShadow = true; person.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 16), mat(SKIN[i % SKIN.length], { roughness: 0.7 }));
    head.position.set(-0.03, 1.56, 0); head.castShadow = true; person.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.225, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), mat(HAIR[(i * 5) % HAIR.length]));
    hair.rotation.z = -0.35; head.add(hair);
    for (const s of [-1, 1]) box(0.36, 0.14, 0.14, mat(dark ? "#2b2b33" : "#3a3f55"), -0.1, 0.6, s * 0.12, person);
    const arm = (side: number) => {
      const g = new THREE.Group(); g.position.set(-0.02, 1.18, side * 0.27); person.add(g);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.28, 4, 8), shirt);
      upper.position.set(-0.17, -0.12, 0); upper.rotation.z = 1.1; upper.castShadow = true; g.add(upper);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), mat(SKIN[i % SKIN.length]));
      hand.position.set(-0.38, -0.33, -side * 0.05); g.add(hand);
      return g;
    };
    const armL = arm(-1), armR = arm(1);
    for (const m of [body, head]) { m.userData.agent = a.key; pickables.push(m); }
    // Label
    const label = document.createElement("div");
    label.style.pointerEvents = "auto";
    label.addEventListener("click", (e) => { e.stopPropagation(); onPick(a.key); });
    const obj = new CSS2DObject(label); obj.position.set(0.9, big ? 2.55 : 2.4, 0); group.add(obj);
    seats.set(a.key, { a, group, body, head, armL, armR, screen, tex, ring, label, phase: i * 1.7, lines: Array.from({ length: 9 }, (_, k) => 30 + ((k * 53 + i * 17) % 150)) });
  });

  let selected: string | null = null;
  const drawScreen = (s: Seat, t: number) => {
    const g = s.screen.getContext("2d")!;
    const st = s.a.state;
    g.fillStyle = st === "idle" ? (dark ? "#0d0d10" : "#1a1b20") : "#101820";
    g.fillRect(0, 0, 256, 160);
    if (st === "working") {
      const off = Math.floor(t * 6) % 18;
      for (let k = 0; k < 9; k++) {
        g.fillStyle = k % 3 === 0 ? s.a.hue : "#7fb8a0";
        g.globalAlpha = 0.85;
        g.fillRect(16 + (k % 2) * 12, 14 + k * 16 - off * 0.5, s.lines[(k + Math.floor(t * 3)) % 9], 6);
      }
      g.globalAlpha = 1;
      g.fillStyle = "#3fae7a"; g.fillRect(0, 150, 256 * Math.max(0.04, s.a.task?.progress ?? 0), 10);
    } else if (st === "waiting" || st === "blocked" || st === "queued") {
      g.fillStyle = STATE_COLOR[st]; g.font = "600 26px Inter, sans-serif"; g.textAlign = "center";
      g.fillText(st === "waiting" ? "Needs you" : st === "blocked" ? "Blocked" : "Up next", 128, 90);
    } else {
      g.fillStyle = dark ? "#2a2a30" : "#33343c"; g.font = "600 22px Inter, sans-serif"; g.textAlign = "center"; g.fillText(s.a.glyph, 128, 88);
    }
    s.tex.needsUpdate = true;
  };
  const drawLabel = (s: Seat) => {
    const a = s.a;
    const sel = selected === a.key;
    s.label.className = `select-none cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium shadow-md ring-1 transition ${sel ? "bg-ink text-bg ring-ink" : "bg-surface/95 text-ink ring-line"}`;
    // On small screens idle desks show only initials, so labels don't pile up.
    const compact = el.clientWidth < 640 && !sel;
    s.label.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap"><span style="width:7px;height:7px;border-radius:9px;background:${STATE_COLOR[a.state]};${a.state === "working" ? "animation:pulse2 1.6s ease-in-out infinite" : ""}"></span>${compact ? (a.state === "idle" ? a.glyph : short(a.name)) : short(a.name)}</span>`;
    if (compact) s.label.className += ` !px-1.5 !py-0.5 !text-[10px] ${a.state === "idle" ? "opacity-75" : ""}`;
    s.label.title = `${a.name}: ${STATE_LABEL[a.state]}${a.task ? ` · ${a.task.title}` : ""}`;
  };
  const apply = (state: OfficeState) => {
    for (const a of state.agents) {
      const s = seats.get(a.key);
      if (!s) continue;
      s.a = a;
      const m = s.ring.material as import("three").MeshBasicMaterial;
      m.color.set(STATE_COLOR[a.state]); m.opacity = a.state === "idle" ? 0 : 0.85;
      drawScreen(s, 0); drawLabel(s);
    }
    drawBoard(state);
  };
  apply(initial);

  // Picking
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let down: [number, number] | null = null;
  const hit = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    return ray.intersectObjects(pickables, false)[0]?.object.userData.agent as string | undefined;
  };
  const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    onPick(hit(e) ?? null);
  };
  const onMove = (e: PointerEvent) => { renderer.domElement.style.cursor = hit(e) ? "pointer" : "grab"; };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointermove", onMove);

  // Loop: renders only while visible; motion only for agents with real work.
  let visible = true, raf = 0, last = performance.now(), lastScreen = 0;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); });
  io.observe(el);
  const clock = new THREE.Clock();
  const loop = () => {
    cancelAnimationFrame(raf);
    if (!visible || document.hidden) return;
    raf = requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    const now = performance.now();
    if (!reduced) {
      for (const s of seats.values()) {
        const w = s.a.state === "working";
        const k = t * (w ? 9 : 1.2) + s.phase;
        s.body.position.y = 0.98 + Math.sin(t * 1.6 + s.phase) * (w ? 0.008 : 0.012);
        s.head.rotation.z = w ? Math.sin(t * 0.7 + s.phase) * 0.05 - 0.08 : Math.sin(t * 0.4 + s.phase) * 0.12 + 0.12;
        s.head.rotation.y = w ? 0 : Math.sin(t * 0.25 + s.phase) * 0.5;
        s.armL.rotation.z = w ? Math.sin(k) * 0.12 : 0.55;
        s.armR.rotation.z = w ? Math.sin(k + 1.7) * 0.12 : 0.55;
        s.ring.scale.setScalar(w ? 1 + Math.sin(t * 3 + s.phase) * 0.06 : 1);
      }
      if (now - lastScreen > 180) { for (const s of seats.values()) if (s.a.state === "working") drawScreen(s, t); lastScreen = now; }
    }
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
    last = now;
  };
  void last;
  const onVis = () => { if (!document.hidden) loop(); };
  document.addEventListener("visibilitychange", onVis);
  const ro = new ResizeObserver(() => { fit(); renderer.render(scene, camera); labels.render(scene, camera); });
  ro.observe(el);
  loop();

  return {
    update: (s) => apply(s),
    select: (key) => { selected = key; for (const s of seats.values()) drawLabel(s); },
    dispose: () => {
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as import("three").Mesh;
        m.geometry?.dispose();
        const mm = m.material as import("three").Material | import("three").Material[] | undefined;
        (Array.isArray(mm) ? mm : mm ? [mm] : []).forEach((x) => { (x as import("three").MeshBasicMaterial).map?.dispose(); x.dispose(); });
      });
      renderer.dispose();
      el.innerHTML = "";
    },
  };
}

export function Office3D({ initial, className = "h-[380px]", overlay }: { initial: OfficeState; className?: string; overlay?: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [state, setState] = useState(initial);
  const [sel, setSel] = useState<string | null>(null);
  const [list, setList] = useState(false);
  const [failed, setFailed] = useState(false);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const el = host.current!;
    try {
      const c = document.createElement("canvas");
      if (!(c.getContext("webgl2") || c.getContext("webgl"))) throw new Error("no webgl");
    } catch {
      setFailed(true);
      return;
    }
    buildScene(el, initial, (k) => setSel(k)).then((s) => {
      if (!alive) s.dispose();
      else sceneRef.current = s;
    }).catch(() => setFailed(true));
    return () => { alive = false; sceneRef.current?.dispose(); sceneRef.current = null; };
    // The scene is built once; updates flow through sceneRef.
  }, []);
  useEffect(() => { sceneRef.current?.update(state); }, [state]);
  useEffect(() => { sceneRef.current?.select(sel); setSent(null); setMsg(""); }, [sel]);
  useEffect(() => {
    const busy = state.agents.some((a) => a.state === "working" || a.state === "queued");
    const t = setInterval(async () => {
      try { setState(await api<OfficeState>("/api/founder/office", undefined, "GET")); } catch {}
    }, busy ? 4000 : 15000);
    return () => clearInterval(t);
  }, [state]);

  const a = state.agents.find((x) => x.key === sel) ?? null;
  const working = state.agents.filter((x) => x.state === "working").length;
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={host} className="absolute inset-0 isolate" aria-hidden={!failed} />
      {failed && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-muted">3D isn&apos;t available on this device. Use the list view.</div>}
      {overlay}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <span className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium ring-1 ring-line"><span className={`h-1.5 w-1.5 rounded-full ${working ? "animate-pulse2 bg-sage" : "bg-faint"}`} />{working ? `${working} working` : state.queued ? `${state.queued} queued` : "All idle"}</span>
        <button onClick={() => setList(!list)} className="glass rounded-full px-3 py-1.5 text-[12px] font-medium ring-1 ring-line">{list ? "3D view" : "List view"}</button>
      </div>
      {list && (
        <div className="glass absolute inset-x-3 bottom-3 top-14 z-10 overflow-y-auto rounded-2xl p-2 ring-1 ring-line">
          {state.agents.map((x) => (
            <button key={x.key} onClick={() => { setSel(x.key); setList(false); }} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-raised">
              <span className="h-2 w-2 rounded-full" style={{ background: STATE_COLOR[x.state] }} />
              <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{x.name}</span><span className="block truncate text-[11.5px] text-muted">{STATE_LABEL[x.state]}{x.task ? ` · ${x.task.title}` : ""}</span></span>
              <span className="text-[11px] text-faint">{x.doneToday} today</span>
            </button>
          ))}
        </div>
      )}
      {a && !list && (
        <div className="glass absolute inset-x-3 bottom-3 z-10 rounded-2xl p-4 shadow-2xl ring-1 ring-line sm:inset-x-auto sm:left-4 sm:w-[340px]">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-[#141413]" style={{ background: a.hue }}>{a.glyph}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{a.name}</div>
              <div className="text-[12px] leading-snug text-muted">{a.role}</div>
            </div>
            <button aria-label="Close" onClick={() => setSel(null)} className="text-faint"><Icon name="close" size={16} /></button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[12.5px]"><span className="h-2 w-2 rounded-full" style={{ background: STATE_COLOR[a.state] }} />{STATE_LABEL[a.state]}{a.doneToday ? <span className="text-faint">· {a.doneToday} step{a.doneToday > 1 ? "s" : ""} done today</span> : null}</div>
          {a.task && (
            <Link href={`/tasks/${a.task.id}`} className="mt-2 block rounded-xl bg-raised p-2.5">
              <div className="truncate text-[13px] font-medium">{a.task.title}</div>
              {a.task.step && <div className="truncate text-[11.5px] text-muted">{a.task.step}</div>}
              {a.state === "working" && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line"><div className="h-full bg-sage" style={{ width: `${Math.round(a.task.progress * 100)}%` }} /></div>}
            </Link>
          )}
          {!a.task && a.last && <Link href={`/tasks/${a.last.id}`} className="mt-2 block truncate text-[12px] text-muted">Last finished: {a.last.title}</Link>}
          {sent ? (
            <Link href={`/tasks/${sent}`} className="mt-3 flex items-center gap-2 text-[12.5px] text-sage"><Icon name="check" size={14} /> Sent to the Chief of Staff to plan and route</Link>
          ) : (
            <form className="mt-3 flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              if (!msg.trim()) return;
              const j = await api<{ task: { id: string } }>("/api/tasks", { instruction: `For the ${a.name}: ${msg}` });
              setSent(j.task.id);
            }}>
              <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={`Give ${short(a.name)} a task…`} className="min-w-0 flex-1 rounded-full bg-raised px-3 py-2 text-[13px] outline-none placeholder:text-faint" />
              <button disabled={!msg.trim()} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-bg disabled:opacity-40" aria-label="Send"><Icon name="send" size={14} /></button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
