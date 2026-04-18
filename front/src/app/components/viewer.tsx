"use client"

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { IfcViewerAPI } from "web-ifc-viewer";
import * as THREE from "three";
import { gsap } from "gsap";
import * as signalR from "@microsoft/signalr";
import { apiService } from "@/app/services/api.service";
import AnnotationCanvas from "./AnnotationCanvas";
import CommentWithSketch from "./CommentWithSketch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5080";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CameraSnapshot { position: THREE.Vector3Like; target: THREE.Vector3Like }

interface PresenceUser { userId: number; userName: string; userSurname: string }
interface RemoteCursor { userId: number; name: string; nx: number; ny: number; color: string }

interface Comment {
    id?: number;
    text: string;
    elementName: string;
    elementId: number;
    userId?: number;
    createdAt?: string;
    cameraPositionJson?: string;
    sketchSvg?: string;
}

interface IfcElementProperties {
    id: number;
    Name?: { value: string };
    [key: string]: unknown;
}

interface IfcSpatialNode {
    typeName: string;
    expressID?: number;
    children?: IfcSpatialNode[];
}

interface TreeNode {
    name: string;
    expressID?: number;
    children?: TreeNode[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const getVal = (o: unknown) =>
    o && typeof o === "object" && "value" in o ? String((o as { value: unknown }).value) : "";

function getElementDisplayName(props: IfcElementProperties, customNames: Record<string, string>): string {
    const id = props?.id ?? (props as Record<string, unknown>)?.expressID;
    const key = id != null ? String(id) : "";
    if (customNames[key]) return customNames[key];
    const name = getVal(props?.Name)?.trim();
    if (name) return name;
    const objectType = getVal(props?.ObjectType as unknown)?.trim();
    if (objectType) return objectType;
    const tag = getVal(props?.Tag as unknown)?.trim();
    if (tag) return tag;
    const typeNum = props?.type;
    if (typeof typeNum === "number") return `Element ${typeNum}`;
    return "Unnamed";
}

async function mapIfcStructureToTreeNodeWithNames(
    ifcManager: Record<string, (...args: unknown[]) => Promise<unknown>>,
    modelID: number,
    node: IfcSpatialNode
): Promise<TreeNode> {
    let name = node.typeName || "Unnamed";
    if (node.expressID !== undefined) {
        try {
            const props = await ifcManager.getItemProperties(modelID, node.expressID, true) as IfcElementProperties;
            if (getVal(props?.Name)?.trim()) name = getVal(props.Name)!.trim();
            else if (getVal(props?.ObjectType as unknown)?.trim()) name = getVal(props?.ObjectType as unknown)!.trim();
            else if (getVal(props?.Tag as unknown)?.trim()) name = getVal(props?.Tag as unknown)!.trim();
        } catch { /* ignore */ }
    }
    const children = node.children
        ? await Promise.all(node.children.map(c => mapIfcStructureToTreeNodeWithNames(ifcManager, modelID, c)))
        : [];
    return { name, expressID: node.expressID, children };
}

function isWebGLSupported(): boolean {
    try {
        const canvas = document.createElement("canvas");
        return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
    } catch { return false; }
}

// ── Component ─────────────────────────────────────────────────────────────────
const Viewer = ({ isAuthenticated, file }: { isAuthenticated: boolean; file?: File | null }) => {
    const viewer = useRef<IfcViewerAPI | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const hubRef = useRef<signalR.HubConnection | null>(null);

    const [webGLSupported] = useState(() => (typeof window !== "undefined" ? isWebGLSupported() : true));
    const [loadProgress, setLoadProgress] = useState<number | null>(null);
    const [selectedElement, setSelectedElement] = useState<IfcElementProperties | null>(null);
    const [comments, setComments] = useState<Record<string, Comment[]>>({});
    const [newComment, setNewComment] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
    const [modelStructure, setModelStructure] = useState<TreeNode | null>(null);
    const [explodeValue, setExplodeValue] = useState(0); // 0 = collapsed, 1 = full
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(true);
    const [selectedIDs, setSelectedIDs] = useState<Set<number>>(new Set());
    const [customNames, setCustomNames] = useState<Record<string, string>>({});
    const [treeSearch, setTreeSearch] = useState("");
    const [userNameMap, setUserNameMap] = useState<Record<number, string>>({});
    const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
    const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);

    const groupKeyRef = useRef<string>("");
    const lastCursorSendRef = useRef<number>(0);

    // Annotation / sketch state
    const [drawMode, setDrawMode] = useState(false);
    const [sketchSvg, setSketchSvg] = useState<string | null>(null);
    const [sketchOverlay, setSketchOverlay] = useState<{ svg: string; label: string } | null>(null);
    const savedCameraRef = useRef<CameraSnapshot | null>(null);

    // Explode refs
    interface ExplodeData { subset: THREE.Object3D; dir: THREE.Vector3; baseDist: number }
    const explodeDataRef = useRef<ExplodeData[]>([]);
    const explodedSubsetsRef = useRef<THREE.Object3D[]>([]);
    const removedMeshesRef = useRef<{ mesh: THREE.Object3D; parent: THREE.Object3D }[]>([]);
    const explodePreparedRef = useRef(false);
    const explodePreparingRef = useRef(false);
    const pendingExplodeRef = useRef(0);

    const currentUserId = typeof window !== "undefined" ? parseInt(localStorage.getItem("userId") || "0", 10) : 0;

    // ── SignalR ────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthenticated || !file) return;
        const projectId = sessionStorage.getItem("viewerProjectId") || "0";
        const fileId = sessionStorage.getItem("viewerFileId") || "0";
        const groupKey = `project-${projectId}-file-${fileId}`;
        groupKeyRef.current = groupKey;

        const cursorColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];
        const colorForUser = (uid: number) => cursorColors[uid % cursorColors.length];

        const connection = new signalR.HubConnectionBuilder()
            .withUrl(`${API_BASE}/hubs/comments`)
            .withAutomaticReconnect()
            .build();

        connection.on("PresenceUpdated", (users: PresenceUser[]) => {
            setPresenceUsers(users);
        });

        connection.on("CursorUpdated", (positions: { userId: number; userName: string; userSurname: string; nx: number; ny: number }[]) => {
            setRemoteCursors(positions
                .filter(p => p.userId !== currentUserId)
                .map(p => ({
                    userId: p.userId,
                    name: `${p.userName} ${p.userSurname}`.trim() || `User ${p.userId}`,
                    nx: p.nx,
                    ny: p.ny,
                    color: colorForUser(p.userId),
                }))
            );
        });

        connection.on("NewComment", (payload: {
            id: number; expressId: number; elementName: string;
            commentText: string; userId: number; createdAt: string;
            cameraPositionJson?: string; sketchSvg?: string;
        }) => {
            if (payload.userId === currentUserId) return;
            const key = String(payload.expressId);
            setComments(prev => {
                const updated = { ...prev };
                if (!updated[key]) updated[key] = [];
                if (!updated[key].some(c => c.id === payload.id)) {
                    updated[key].push({
                        id: payload.id,
                        text: payload.commentText,
                        elementName: payload.elementName,
                        elementId: payload.expressId,
                        userId: payload.userId,
                        createdAt: payload.createdAt,
                        cameraPositionJson: payload.cameraPositionJson,
                        sketchSvg: payload.sketchSvg,
                    });
                }
                return updated;
            });
        });

        const uName = localStorage.getItem("userName") || "";
        const uSurname = localStorage.getItem("userSurname") || "";

        connection.start()
            .then(() => connection.invoke("JoinProject", groupKey, currentUserId, uName, uSurname))
            .catch(e => console.warn("SignalR connect failed:", e));

        hubRef.current = connection;
        return () => { connection.stop(); };
    }, [isAuthenticated, file, currentUserId]);

    // ── Custom names persistence ───────────────────────────────────────────────
    useEffect(() => {
        const projectId = sessionStorage.getItem("viewerProjectId") || "0";
        const fileId = sessionStorage.getItem("viewerFileId") || "0";
        try {
            const raw = localStorage.getItem(`bim_customNames_${projectId}_${fileId}`);
            setCustomNames(raw ? (JSON.parse(raw) as Record<string, string>) : {});
        } catch { setCustomNames({}); }
    }, [file]);

    const saveCustomName = useCallback((expressId: number, name: string) => {
        setCustomNames(prev => {
            const next = { ...prev };
            if (name.trim()) next[String(expressId)] = name.trim();
            else delete next[String(expressId)];
            const p = sessionStorage.getItem("viewerProjectId") || "0";
            const f = sessionStorage.getItem("viewerFileId") || "0";
            try { localStorage.setItem(`bim_customNames_${p}_${f}`, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
    }, []);

    // ── IFC viewer init ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthenticated || !containerRef.current || !webGLSupported) return;
        if (!viewer.current) {
            viewer.current = new IfcViewerAPI({ container: containerRef.current });
            viewer.current.grid.setGrid();
            viewer.current.axes.setAxes();
            const controls = viewer.current.context.ifcCamera.controls;
            controls.azimuthAngle = 0;
            controls.maxDistance = 2000;
            controls.minDistance = 0.1;
            controls.dollySpeed = 0.5;
            controls.setTarget(0, 0, 0);
            viewer.current.IFC.setWasmPath("../../../");
        }
        if (file && viewer.current) {
            setLoadProgress(0);
            const fileURL = URL.createObjectURL(file);
            (viewer.current.IFC as unknown as {
                loadIfcUrl: (url: string, onProgress?: (e: ProgressEvent) => void) => Promise<unknown>
            }).loadIfcUrl(fileURL, (e: ProgressEvent) => {
                if (e.lengthComputable) setLoadProgress(Math.round((e.loaded / e.total) * 100));
            }).then(async () => {
                setLoadProgress(null);
                const structure = await viewer.current!.IFC.loader.ifcManager.getSpatialStructure(0, true);
                const tree = await mapIfcStructureToTreeNodeWithNames(
                    viewer.current!.IFC.loader.ifcManager as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>,
                    0, structure as IfcSpatialNode
                );
                setModelStructure(tree);
            }).catch(() => setLoadProgress(null));
            viewer.current.grid.dispose();
            viewer.current.axes.dispose();
        }
        return () => {
            if (viewer.current) { viewer.current.dispose(); viewer.current = null; }
        };
    }, [isAuthenticated, file, webGLSupported]);

    // ── Load existing comments ─────────────────────────────────────────────────
    useEffect(() => {
        const projectId = parseInt(sessionStorage.getItem("viewerProjectId") || "0", 10);
        const fileId = parseInt(sessionStorage.getItem("viewerFileId") || "0", 10);
        if (!projectId || !fileId || !file) return;
        apiService.getIfcComments(projectId, fileId).then((res) => {
            if (res.success && res.data) {
                const grouped: Record<string, Comment[]> = {};
                for (const c of res.data) {
                    const key = String(c.expressId);
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push({
                        id: c.id,
                        text: c.commentText,
                        elementName: c.elementName,
                        elementId: c.expressId,
                        userId: c.userId,
                        createdAt: c.createdAt,
                        cameraPositionJson: (c as Record<string, unknown>).cameraPositionJson as string | undefined,
                        sketchSvg: (c as Record<string, unknown>).sketchSvg as string | undefined,
                    });
                }
                setComments(grouped);
            }
        });
    }, [file]);

    useEffect(() => {
        apiService.getAllUsers().then(users => {
            const map: Record<number, string> = {};
            for (const u of users) map[u.id] = [u.userName, u.userSurname].filter(Boolean).join(" ") || `User ${u.id}`;
            setUserNameMap(map);
        });
    }, []);

    // ── Camera helpers ─────────────────────────────────────────────────────────
    const captureCamera = useCallback((): CameraSnapshot | null => {
        if (!viewer.current) return null;
        const controls = viewer.current.context.ifcCamera.controls;
        const pos = new THREE.Vector3();
        const tgt = new THREE.Vector3();
        controls.getPosition(pos);
        controls.getTarget(tgt);
        return { position: { x: pos.x, y: pos.y, z: pos.z }, target: { x: tgt.x, y: tgt.y, z: tgt.z } };
    }, []);

    const flyToCamera = useCallback((snap: CameraSnapshot) => {
        if (!viewer.current) return;
        const controls = viewer.current.context.ifcCamera.controls;
        controls.setLookAt(
            snap.position.x, snap.position.y, snap.position.z,
            snap.target.x, snap.target.y, snap.target.z,
            true
        );
    }, []);

    // ── Selection helpers ──────────────────────────────────────────────────────
    const clearSelectionTree = useCallback(() => {
        if (!viewer.current) return;
        const scene = viewer.current.context.getScene();
        const models = viewer.current.context.items.pickableIfcModels;
        scene.children.filter((c: THREE.Object3D) => c?.name?.startsWith("show-only-")).forEach((o: THREE.Object3D) => scene.remove(o));
        models.forEach((m: THREE.Object3D) => { m.visible = true; });
        setSelectedIDs(new Set());
    }, []);

    const clearSelection = useCallback(async () => {
        if (!viewer.current) return;
        try { viewer.current.IFC.unpickIfcItems(); viewer.current.IFC.unPrepickIfcItems(); viewer.current.IFC.unHighlightIfcItems(); } catch { viewer.current?.IFC.unpickIfcItems(); }
        clearSelectionTree();
        setSelectedElement(null);
        setIsModalOpen(false);
        setNewComment("");
        setSketchSvg(null);
        setSketchOverlay(null);
    }, [clearSelectionTree]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") { if (drawMode) setDrawMode(false); else void clearSelection(); }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [clearSelection, drawMode]);

    // ── Click handler ──────────────────────────────────────────────────────────
    const handleClick = useCallback(async () => {
        if (!viewer.current || !modelStructure || drawMode) return;
        const v = viewer.current;
        const hit = v.context.castRayIfc();
        if (!hit || hit.faceIndex === undefined || hit.faceIndex === null) { clearSelection(); return; }
        const mesh = hit.object as THREE.Mesh & { modelID?: number };
        const modelID = mesh.modelID;
        if (modelID === undefined) { clearSelection(); return; }
        const expressId = v.IFC.loader.ifcManager.getExpressId(mesh.geometry, hit.faceIndex);
        if (expressId === undefined) { clearSelection(); return; }

        v.IFC.unpickIfcItems(); v.IFC.unPrepickIfcItems(); v.IFC.unHighlightIfcItems();
        try {
            const selector = v.IFC.selector as Record<string, (...args: unknown[]) => Promise<void>>;
            if (selector?.pickIfcItemsByID) await selector.pickIfcItemsByID(modelID, [expressId], false, true);
        } catch { /* ignore */ }

        const properties = await v.IFC.loader.ifcManager.getItemProperties(modelID, expressId);
        if (!("id" in properties)) properties.id = expressId;
        setSelectedElement(properties as IfcElementProperties);
        setNewComment("");
        setSketchSvg(null);
        setIsModalOpen(true);
    }, [isTreeCollapsed, modelStructure, clearSelection, drawMode]);

    // ── Save comment ───────────────────────────────────────────────────────────
    const saveComment = useCallback(async () => {
        if (!selectedElement || !newComment.trim()) return;
        const elementId = selectedElement.id;
        const commentText = newComment.trim();
        const elementName = getElementDisplayName(selectedElement, customNames);
        const projectId = parseInt(sessionStorage.getItem("viewerProjectId") || "0", 10);
        const fileId = parseInt(sessionStorage.getItem("viewerFileId") || "0", 10);
        const userId = parseInt(localStorage.getItem("userId") || "0", 10);

        const cameraSnapshot = captureCamera();
        const cameraPositionJson = cameraSnapshot ? JSON.stringify(cameraSnapshot) : undefined;

        if (projectId && fileId) {
            const res = await apiService.postIfcComment(projectId, fileId, {
                expressId: elementId,
                elementName,
                elementDataJson: JSON.stringify(selectedElement),
                commentText,
                userId,
                cameraPositionJson,
                sketchSvg: sketchSvg ?? undefined,
            });
            if (!res.success) { console.error("Ошибка сохранения:", res.error); return; }
            const saved = res.data as { id?: number };
            const now = new Date().toISOString();
            setComments(prev => {
                const updated = { ...prev };
                const key = String(elementId);
                if (!updated[key]) updated[key] = [];
                updated[key].push({ id: saved?.id, text: commentText, elementName, elementId, userId, createdAt: now, cameraPositionJson, sketchSvg: sketchSvg ?? undefined });
                return updated;
            });
        }
        setNewComment("");
        setSketchSvg(null);
    }, [newComment, selectedElement, customNames, sketchSvg, captureCamera]);

    // ── Draw mode ──────────────────────────────────────────────────────────────
    const enterDrawMode = useCallback(() => {
        savedCameraRef.current = captureCamera();
        setDrawMode(true);
    }, [captureCamera]);

    const onSketchSaved = useCallback((svg: string) => {
        setSketchSvg(svg);
        setDrawMode(false);
    }, []);

    // ── Cursor tracking (native listener — bypasses camera-controls stopPropagation) ──
    const drawModeRef = useRef(drawMode);
    useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!hubRef.current || !containerRef.current || drawModeRef.current) return;
            const now = Date.now();
            if (now - lastCursorSendRef.current < 50) return;
            lastCursorSendRef.current = now;
            const rect = containerRef.current.getBoundingClientRect();
            if (
                e.clientX < rect.left || e.clientX > rect.right ||
                e.clientY < rect.top || e.clientY > rect.bottom
            ) return;
            const nx = (e.clientX - rect.left) / rect.width;
            const ny = (e.clientY - rect.top) / rect.height;
            hubRef.current.invoke("UpdateCursor", groupKeyRef.current, nx, ny).catch(() => {});
        };
        window.addEventListener("mousemove", onMove, { passive: true });
        return () => window.removeEventListener("mousemove", onMove);
    }, []);

    // ── Explode (BIM360-style radial, live slider) ────────────────────────────
    const prepareExplodeData = useCallback(async () => {
        if (explodePreparedRef.current || explodePreparingRef.current || !viewer.current) return;
        explodePreparingRef.current = true;

        const manager = viewer.current.IFC.loader.ifcManager;
        const scene = viewer.current.context.getScene();
        const meshes = viewer.current.context.items.pickableIfcModels;
        if (!meshes.length) { explodePreparingRef.current = false; return; }

        removedMeshesRef.current = [];
        const targets: { modelID: number; expressID: number }[] = [];
        for (const mesh of meshes) {
            const idAttr = mesh.geometry.getAttribute("expressID");
            if (idAttr) {
                const ids = new Set<number>();
                for (let i = 0; i < idAttr.count; i++) {
                    const v = idAttr.getX(i);
                    if (!Number.isNaN(v)) ids.add(v);
                }
                ids.forEach(id => targets.push({ modelID: mesh.modelID, expressID: id }));
            }
            if (mesh.parent) {
                mesh.parent.remove(mesh);
                removedMeshesRef.current.push({ mesh, parent: mesh.parent });
            }
        }

        const subsets: THREE.Object3D[] = [];
        for (const { modelID, expressID } of targets) {
            try {
                const s = await manager.createSubset({
                    modelID, ids: [expressID], scene,
                    removePrevious: false, customID: `explode-${modelID}-${expressID}`,
                });
                if (!s) continue;
                s.name = `explode-${modelID}-${expressID}`;
                s.visible = true;
                subsets.push(s);
            } catch { /* ignore */ }
        }

        // Compute model bounding sphere from all subsets
        const modelBox = new THREE.Box3();
        for (const s of subsets) {
            try { const b = new THREE.Box3().setFromObject(s); if (!b.isEmpty()) modelBox.union(b); } catch { /* ignore */ }
        }
        const modelCenter = new THREE.Vector3();
        if (!modelBox.isEmpty()) modelBox.getCenter(modelCenter);
        const modelRadius = modelBox.isEmpty() ? 10 : modelBox.min.distanceTo(modelBox.max) * 0.5;
        const baseOffset = modelRadius * 0.5; // minimum radial push for all elements

        const data: ExplodeData[] = subsets.map((subset, i) => {
            try {
                const box = new THREE.Box3().setFromObject(subset);
                const centroid = new THREE.Vector3();
                if (!box.isEmpty()) box.getCenter(centroid);
                let dir = centroid.clone().sub(modelCenter);
                if (dir.lengthSq() < 0.001) {
                    // Fibonacci sphere fallback for elements at exact center
                    const phi = Math.PI * (3 - Math.sqrt(5));
                    const y = 1 - (i / Math.max(subsets.length - 1, 1)) * 2;
                    const r = Math.sqrt(Math.max(0, 1 - y * y));
                    dir = new THREE.Vector3(Math.cos(phi * i) * r, y, Math.sin(phi * i) * r);
                } else {
                    dir.normalize();
                }
                const dist = box.isEmpty() ? 0 : centroid.distanceTo(modelCenter);
                return { subset, dir, baseDist: baseOffset + dist };
            } catch {
                return { subset, dir: new THREE.Vector3(0, 1, 0), baseDist: baseOffset };
            }
        });

        explodeDataRef.current = data;
        explodedSubsetsRef.current = subsets;
        explodePreparedRef.current = true;
        explodePreparingRef.current = false;
    }, []);

    const applyExplodePositions = useCallback((value: number) => {
        if (!explodePreparedRef.current) return;
        explodeDataRef.current.forEach(({ subset, dir, baseDist }) => {
            const disp = dir.clone().multiplyScalar(value * baseDist);
            subset.position.set(disp.x, disp.y, disp.z);
        });
    }, []);

    const handleExplodeSlider = useCallback(async (value: number) => {
        setExplodeValue(value);
        pendingExplodeRef.current = value;

        if (value > 0) {
            if (!explodePreparedRef.current && !explodePreparingRef.current) {
                await prepareExplodeData();
                applyExplodePositions(pendingExplodeRef.current);
            } else if (explodePreparedRef.current) {
                applyExplodePositions(value);
            }
        } else {
            // Collapse: animate to 0 then cleanup
            if (!explodePreparedRef.current) return;
            explodeDataRef.current.forEach(({ subset }) => {
                gsap.to(subset.position, { x: 0, y: 0, z: 0, duration: 0.5, ease: "power2.inOut" });
            });
            setTimeout(() => {
                const scene = viewer.current?.context.getScene();
                explodeDataRef.current.forEach(({ subset }) => { try { scene?.remove(subset); } catch { /* ignore */ } });
                removedMeshesRef.current.forEach(({ mesh, parent }) => { try { parent.add(mesh); mesh.visible = true; } catch { /* ignore */ } });
                explodeDataRef.current = [];
                explodedSubsetsRef.current = [];
                removedMeshesRef.current = [];
                explodePreparedRef.current = false;
            }, 600);
        }
    }, [prepareExplodeData, applyExplodePositions]);

    const resetExplodeModel = useCallback(() => {
        if (!viewer.current) return;
        const scene = viewer.current.context.getScene();
        explodeDataRef.current.forEach(({ subset }) => { try { scene.remove(subset); } catch { /* ignore */ } });
        removedMeshesRef.current.forEach(({ mesh, parent }) => { try { parent.add(mesh); mesh.visible = true; } catch { /* ignore */ } });
        explodeDataRef.current = [];
        explodedSubsetsRef.current = [];
        removedMeshesRef.current = [];
        explodePreparedRef.current = false;
        setExplodeValue(0);
    }, []);

    // ── Tree filter ────────────────────────────────────────────────────────────
    const filterTreeBySearch = useCallback((node: TreeNode, query: string): TreeNode | null => {
        if (!query.trim()) return node;
        const q = query.toLowerCase();
        const nameMatch = node.name.toLowerCase().includes(q);
        const filteredChildren = (node.children ?? []).map(c => filterTreeBySearch(c, query)).filter((c): c is TreeNode => c !== null);
        if (nameMatch || filteredChildren.length > 0) return { ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children };
        return null;
    }, []);

    // ── Tree node component ────────────────────────────────────────────────────
    const TreeNodeComponent = ({ node }: { node: TreeNode }) => {
        const [expanded, setExpanded] = React.useState(true);
        const selected = selectedIDs.has(node.expressID ?? -1);
        const hasChildren = node.children && node.children.length > 0;

        const handleSelect = async () => {
            if (!viewer.current || node.expressID === undefined) return;
            const manager = viewer.current.IFC.loader.ifcManager;
            const scene = viewer.current.context.getScene();
            const model = viewer.current.context.items.pickableIfcModels[0];
            const subsetId = `show-only-${node.expressID}`;
            try {
                const existing = scene.children.find((o: THREE.Object3D) => o.name === subsetId);
                if (existing) { scene.remove(existing); model.visible = true; setSelectedIDs(prev => { const s = new Set(prev); s.delete(node.expressID!); return s; }); return; }
                model.visible = false;
                const subset = await manager.createSubset({ modelID: model.modelID, ids: [node.expressID], scene, removePrevious: false, customID: subsetId });
                if (subset) { subset.name = subsetId; subset.visible = true; setSelectedIDs(prev => new Set([...prev, node.expressID!])); }
            } catch { /* ignore */ }
        };

        return (
            <li>
                <div className="model-tree-row">
                    {hasChildren
                        ? <div onClick={() => setExpanded(!expanded)} className="model-tree-arrow">{expanded ? "▼" : "▶"}</div>
                        : <div className="model-tree-arrow" />}
                    <span className={`model-tree-name${selected ? " selected" : ""}`} onClick={handleSelect}>
                        {node.expressID != null && customNames[String(node.expressID)] ? customNames[String(node.expressID)] : node.name}
                    </span>
                </div>
                {hasChildren && expanded && (
                    <ul className="model-tree-children">
                        {node.children!.map(child => <TreeNodeComponent key={child.expressID} node={child} />)}
                    </ul>
                )}
            </li>
        );
    };

    // ── Comment helpers ────────────────────────────────────────────────────────
    const renderCommentMeta = (c: Comment) => (
        <span style={{ fontSize: 10, color: "#64748b", display: "block", marginTop: 2 }}>
            {c.userId === currentUserId ? "Вы" : (userNameMap[c.userId ?? 0] ?? `User ${c.userId}`)},{" "}
            {c.createdAt ? new Date(c.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
        </span>
    );

    const handleCommentClick = useCallback(async (comment: Comment) => {
        if (!viewer.current) return;
        try {
            const model = viewer.current.context.items.pickableIfcModels[0];
            if (!model) return;
            model.visible = true;
            viewer.current.IFC.unPrepickIfcItems();
            viewer.current.IFC.unHighlightIfcItems();
            await viewer.current.IFC.selector.unpickIfcItems();
            const selector = viewer.current.IFC.selector as Record<string, (...args: unknown[]) => Promise<void>>;
            if (selector?.pickIfcItemsByID) await selector.pickIfcItemsByID(model.modelID, [comment.elementId], false, true);
            const props = await viewer.current.IFC.loader.ifcManager.getItemProperties(model.modelID, comment.elementId);
            if (!("id" in props)) props.id = comment.elementId;
            setSelectedElement(props as IfcElementProperties);

            if (comment.cameraPositionJson) {
                try { flyToCamera(JSON.parse(comment.cameraPositionJson) as CameraSnapshot); } catch { /* ignore */ }
            }
            if (comment.sketchSvg) {
                setSketchOverlay({ svg: comment.sketchSvg, label: comment.elementName });
            } else {
                setSketchOverlay(null);
            }
        } catch (err) { console.warn(err); }
    }, [flyToCamera]);

    // ── Render ─────────────────────────────────────────────────────────────────
    if (!webGLSupported) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "80vh", color: "#e2e8f0", gap: 12 }}>
                <svg width="48" height="48" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>Браузер не поддерживает WebGL</h2>
                <p style={{ color: "#94a3b8", textAlign: "center", maxWidth: 400 }}>
                    Для просмотра 3D-моделей используйте Chrome, Firefox или Edge последних версий.
                </p>
            </div>
        );
    }

    // ── Toolbar button helper ──────────────────────────────────────────────────
    const TBtn = ({ icon, label, active, onClick, danger }: {
        icon: React.ReactNode; label: string; active?: boolean;
        onClick: () => void; danger?: boolean;
    }) => (
        <button title={label} onClick={onClick} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            padding: "6px 10px", minWidth: 48,
            background: active ? (danger ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)") : "transparent",
            border: active ? `1px solid ${danger ? "rgba(239,68,68,0.4)" : "rgba(59,130,246,0.35)"}` : "1px solid transparent",
            borderRadius: 8, cursor: "pointer",
            color: active ? (danger ? "#f87171" : "#60a5fa") : "#94a3b8",
            fontSize: 10, fontWeight: 500, letterSpacing: "0.02em",
            transition: "all 0.15s", lineHeight: 1,
        }}
        onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#e2e8f0"; } }}
        onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; } }}>
            {icon}
            <span>{label}</span>
        </button>
    );

    return (
        <>
            {isAuthenticated && (
                <>
                    {/* ── Loading ── */}
                    {loadProgress !== null && (
                        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(10,12,18,0.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
                            <div style={{ width: 48, height: 48, border: "3px solid #1e2433", borderTop: "3px solid #3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                            <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 500 }}>Загрузка модели {loadProgress}%</div>
                            <div style={{ width: 280, background: "#1e2433", borderRadius: 6, height: 4, overflow: "hidden" }}>
                                <div style={{ height: "100%", background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", width: `${loadProgress}%`, transition: "width 0.3s" }} />
                            </div>
                        </div>
                    )}

                    {/* ── Annotation canvas (portal) ── */}
                    {drawMode && createPortal(
                        <div style={{ position: "fixed", inset: 0, top: 50, zIndex: 9999, pointerEvents: "all" }}>
                            <AnnotationCanvas active={true} onSave={onSketchSaved} onCancel={() => setDrawMode(false)} />
                        </div>,
                        document.body
                    )}

                    {/* ── Sketch overlay ── */}
                    {sketchOverlay && (
                        <div style={{ position: "absolute", inset: 0, top: 50, zIndex: 40, pointerEvents: "none" }}>
                            <div dangerouslySetInnerHTML={{ __html: sketchOverlay.svg }} style={{ width: "100%", height: "100%", opacity: 0.65 }} />
                            <button onClick={() => setSketchOverlay(null)} style={{
                                position: "absolute", top: 12, right: isModalOpen ? 352 : 12, pointerEvents: "all",
                                background: "rgba(26,29,36,0.9)", backdropFilter: "blur(8px)",
                                color: "#e2e8f0", border: "1px solid #374151", borderRadius: 7,
                                padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500,
                            }}>Скрыть эскиз</button>
                        </div>
                    )}

                    {/* ── Presence avatars (top-right) ── */}
                    {presenceUsers.length > 0 && (
                        <div style={{ position: "fixed", top: 58, right: isModalOpen ? 352 : 16, zIndex: 20, display: "flex", alignItems: "center", gap: 4, transition: "right 0.2s" }}>
                            {presenceUsers.slice(0, 6).map((u) => {
                                const ini = [u.userName?.[0], u.userSurname?.[0]].filter(Boolean).join("").toUpperCase() || "?";
                                const isMe = u.userId === currentUserId;
                                return (
                                    <div key={u.userId} title={`${u.userName} ${u.userSurname}`.trim() || `User ${u.userId}`} style={{
                                        width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
                                        background: isMe ? "linear-gradient(135deg,#3b82f6,#8b5cf6)" : "linear-gradient(135deg,#10b981,#059669)",
                                        border: isMe ? "2px solid rgba(59,130,246,0.6)" : "2px solid rgba(16,185,129,0.4)",
                                        boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                                    }}>{ini}</div>
                                );
                            })}
                            {presenceUsers.length > 6 && (
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#252a33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#64748b", border: "2px solid #374151" }}>
                                    +{presenceUsers.length - 6}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Bottom toolbar ── */}
                    <div style={{
                        position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
                        zIndex: 15, display: "flex", alignItems: "center", gap: 2,
                        background: "rgba(20,23,30,0.92)", backdropFilter: "blur(16px)",
                        padding: "5px 8px", borderRadius: 14,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.07)",
                    }}>
                        <TBtn active={!isTreeCollapsed} onClick={() => { clearSelectionTree(); setIsTreeCollapsed(p => !p); }} label="Структура"
                            icon={<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>} />

                        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />

                        {/* Explode slider + label */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 10px" }}>
                            <span style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                                Разлёт {explodeValue > 0 ? `${Math.round(explodeValue * 100)}%` : "выкл"}
                            </span>
                            <input type="range" min={0} max={1} step={0.02} value={explodeValue}
                                onChange={e => void handleExplodeSlider(parseFloat(e.target.value))}
                                style={{ width: 90, accentColor: "#60a5fa", cursor: "pointer" }} />
                        </div>

                        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />

                        <TBtn active={commentsPanelOpen}
                            onClick={() => setCommentsPanelOpen(p => { const n = !p; if (n) setIsModalOpen(false); return n; })}
                            label="Комментарии"
                            icon={<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>} />

                        <TBtn active={drawMode} onClick={enterDrawMode} label="Рисовать"
                            icon={<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>} />

                        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />

                        <TBtn onClick={() => { void clearSelection(); resetExplodeModel(); }} label="Сбросить"
                            icon={<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>} />
                    </div>

                    {/* ── Model tree panel ── */}
                    {!isTreeCollapsed && (
                        <div style={{
                            position: "fixed", left: 0, top: 50, bottom: 0, width: 260, zIndex: 20,
                            background: "rgba(18,21,28,0.96)", backdropFilter: "blur(12px)",
                            borderRight: "1px solid rgba(255,255,255,0.07)",
                            display: "flex", flexDirection: "column",
                            boxShadow: "4px 0 24px rgba(0,0,0,0.4)",
                        }}>
                            <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" }}>Структура</span>
                                <button onClick={() => setIsTreeCollapsed(true)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 2, borderRadius: 4, display: "flex" }}>
                                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            <div style={{ padding: "8px 10px" }}>
                                <div style={{ position: "relative" }}>
                                    <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="12" height="12" fill="none" stroke="#475569" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input type="text" placeholder="Поиск..." value={treeSearch} onChange={e => setTreeSearch(e.target.value)} style={{
                                        width: "100%", padding: "6px 8px 6px 26px", background: "rgba(255,255,255,0.04)",
                                        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7,
                                        color: "#e2e8f0", fontSize: 12, boxSizing: "border-box", outline: "none",
                                    }} />
                                </div>
                            </div>
                            <div style={{ flex: 1, overflow: "auto", padding: "0 6px 12px" }}>
                                <ul style={{ paddingLeft: 0, margin: 0 }}>
                                    {modelStructure && (() => {
                                        const filtered = filterTreeBySearch(modelStructure, treeSearch);
                                        return filtered
                                            ? <TreeNodeComponent node={filtered} />
                                            : <li style={{ color: "#475569", fontSize: 12, padding: "8px 8px" }}>Ничего не найдено</li>;
                                    })()}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* ── Remote cursors ── */}
                    {remoteCursors.length > 0 && (
                        <div style={{ position: "absolute", inset: 0, top: 50, pointerEvents: "none", zIndex: 35, overflow: "hidden" }}>
                            {remoteCursors.map(cursor => (
                                <div key={cursor.userId} style={{
                                    position: "absolute", left: `${cursor.nx * 100}%`, top: `${cursor.ny * 100}%`,
                                    pointerEvents: "none", transform: "translate(2px,2px)",
                                    transition: "left 0.08s linear, top 0.08s linear",
                                }}>
                                    <svg width="13" height="17" viewBox="0 0 14 18" fill="none">
                                        <path d="M1 1l12 8-6.5 1L4 17z" fill={cursor.color} stroke="#000" strokeWidth="1" strokeLinejoin="round" />
                                    </svg>
                                    <span style={{
                                        display: "inline-block", marginTop: 1, marginLeft: 2,
                                        background: cursor.color, color: "#fff", fontSize: 9, fontWeight: 700,
                                        padding: "1px 5px", borderRadius: 3, whiteSpace: "nowrap",
                                        boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
                                    }}>{cursor.name}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div ref={containerRef} className="viewer-container" onClick={handleClick} />

                    {/* ── Properties + comments panel ── */}
                    {isModalOpen && selectedElement && (
                        <div style={{
                            position: "fixed", right: 0, top: 50, bottom: 0, width: 340,
                            background: "rgba(16,19,26,0.97)", backdropFilter: "blur(16px)",
                            borderLeft: "1px solid rgba(255,255,255,0.07)",
                            boxShadow: "-8px 0 32px rgba(0,0,0,0.5)",
                            zIndex: 25, display: "flex", flexDirection: "column", overflow: "hidden",
                        }}>
                            {/* Panel header */}
                            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Свойства</span>
                                <button onClick={clearSelection} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 4, borderRadius: 6, display: "flex" }}
                                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#94a3b8"; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#475569"; }}>
                                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            <div style={{ flex: 1, overflow: "auto", padding: "14px 16px" }}>
                                {/* Element name */}
                                <div style={{ marginBottom: 14 }}>
                                    <label style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Название</label>
                                    <input type="text"
                                        value={customNames[String(selectedElement.id)] ?? getElementDisplayName(selectedElement, customNames)}
                                        onChange={e => { const v = e.target.value; setCustomNames(prev => v ? { ...prev, [String(selectedElement.id)]: v } : (() => { const n = { ...prev }; delete n[String(selectedElement.id)]; return n; })()); }}
                                        onBlur={e => saveCustomName(selectedElement.id, e.target.value.trim())}
                                        style={{ width: "100%", marginTop: 5, padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, color: "#f1f5f9", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
                                </div>

                                {/* Meta */}
                                <div style={{ marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 11, color: "#475569", background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.06)" }}>
                                        ID {selectedElement.id}
                                    </span>
                                    {(selectedElement.ObjectType as { value?: string })?.value && (
                                        <span style={{ fontSize: 11, color: "#475569", background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.06)" }}>
                                            {String((selectedElement.ObjectType as { value: string }).value)}
                                        </span>
                                    )}
                                </div>

                                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14, marginBottom: 14 }}>
                                    <CommentWithSketch
                                        commentText={newComment}
                                        onCommentTextChange={setNewComment}
                                        sketchSvg={sketchSvg}
                                        onDrawRequest={enterDrawMode}
                                        onDeleteSketch={() => setSketchSvg(null)}
                                        onSave={saveComment}
                                    />
                                </div>

                                {/* Comment list */}
                                <div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                        <span style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                                            Комментарии ({(comments[String(selectedElement.id)] ?? []).length})
                                        </span>
                                        <button onClick={() => { setIsModalOpen(false); setCommentsPanelOpen(true); }}
                                            style={{ fontSize: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#64748b", padding: "2px 8px", borderRadius: 5, cursor: "pointer" }}>
                                            Все
                                        </button>
                                    </div>
                                    {(() => {
                                        const elComments = comments[String(selectedElement.id)] ?? [];
                                        if (!elComments.length) return <p style={{ fontSize: 12, color: "#374151", margin: 0 }}>Нет комментариев</p>;
                                        return elComments.map((comment, i) => (
                                            <div key={i} style={{ marginBottom: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                                                <div style={{ cursor: "pointer", color: "#60a5fa", fontSize: 11, fontWeight: 500, marginBottom: 4 }}
                                                    onClick={() => void handleCommentClick(comment)}>
                                                    {getElementDisplayName({ id: comment.elementId, Name: { value: comment.elementName } } as IfcElementProperties, customNames)}
                                                </div>
                                                <div style={{ color: "#cbd5e1", fontSize: 12, lineHeight: 1.5 }}>{comment.text}</div>
                                                {comment.sketchSvg && (
                                                    <div dangerouslySetInnerHTML={{ __html: comment.sketchSvg }}
                                                        onClick={() => setSketchOverlay({ svg: comment.sketchSvg!, label: comment.elementName })}
                                                        style={{ marginTop: 6, maxHeight: 56, overflow: "hidden", background: "#0a0c12", borderRadius: 5, cursor: "pointer", border: "1px solid rgba(255,255,255,0.06)", lineHeight: 0 }} />
                                                )}
                                                {comment.cameraPositionJson && (
                                                    <button onClick={() => { try { flyToCamera(JSON.parse(comment.cameraPositionJson!)); } catch { /* ignore */ } }}
                                                        style={{ marginTop: 6, fontSize: 10, background: "transparent", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", padding: "2px 8px", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                                        <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.869v6.262a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                        Перейти
                                                    </button>
                                                )}
                                                {renderCommentMeta(comment)}
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── All comments panel ── */}
                    {commentsPanelOpen && (
                        <div style={{
                            position: "fixed", left: !isTreeCollapsed ? 268 : 12, top: 58, bottom: 80, width: 300,
                            background: "rgba(16,19,26,0.97)", backdropFilter: "blur(16px)",
                            border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12,
                            zIndex: 30, display: "flex", flexDirection: "column",
                            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                            transition: "left 0.2s",
                        }}>
                            <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Комментарии</span>
                                <button onClick={() => setCommentsPanelOpen(false)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 4, borderRadius: 6, display: "flex" }}>
                                    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            <div style={{ flex: 1, overflow: "auto", padding: "10px 12px" }}>
                                {(() => {
                                    const all = Object.entries(comments).flatMap(([, arr]) => arr);
                                    all.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
                                    if (!all.length) return <p style={{ color: "#374151", fontSize: 13, margin: 0 }}>Нет комментариев</p>;
                                    return all.map((c, i) => (
                                        <div key={i} style={{ marginBottom: 8, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                                            <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 500, marginBottom: 4, cursor: "pointer" }} onClick={() => void handleCommentClick(c)}>
                                                {getElementDisplayName({ id: c.elementId, Name: { value: c.elementName } } as IfcElementProperties, customNames)}
                                            </div>
                                            <div style={{ color: "#cbd5e1", fontSize: 12, lineHeight: 1.5 }}>{c.text}</div>
                                            {c.sketchSvg && (
                                                <div dangerouslySetInnerHTML={{ __html: c.sketchSvg }}
                                                    onClick={() => setSketchOverlay({ svg: c.sketchSvg!, label: c.elementName })}
                                                    style={{ marginTop: 6, maxHeight: 44, overflow: "hidden", background: "#0a0c12", borderRadius: 5, cursor: "pointer", border: "1px solid rgba(255,255,255,0.06)", lineHeight: 0 }} />
                                            )}
                                            {c.cameraPositionJson && (
                                                <button onClick={() => { try { flyToCamera(JSON.parse(c.cameraPositionJson!)); } catch { /* ignore */ } }}
                                                    style={{ marginTop: 5, fontSize: 10, background: "transparent", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
                                                    Перейти к виду
                                                </button>
                                            )}
                                            {renderCommentMeta(c)}
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                    )}
                </>
            )}
        </>
    );
};

export default Viewer;
