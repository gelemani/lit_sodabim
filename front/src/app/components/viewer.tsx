"use client"

import React, { useEffect, useRef, useState, useCallback } from "react";
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
    const [exploded, setExploded] = useState(false);
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(true);
    const [selectedIDs, setSelectedIDs] = useState<Set<number>>(new Set());
    const [customNames, setCustomNames] = useState<Record<string, string>>({});
    const [treeSearch, setTreeSearch] = useState("");
    const [explodeScale, setExplodeScale] = useState(1);
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

    const explodedSubsetsRef = useRef<THREE.Object3D[]>([]);
    const removedMeshesRef = useRef<{ mesh: THREE.Object3D; parent: THREE.Object3D }[]>([]);

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

    // ── Explode ────────────────────────────────────────────────────────────────
    const explodeModel = useCallback(async (scaleOverride?: number) => {
        if (!viewer.current) return;
        const scale = typeof scaleOverride === "number" ? scaleOverride : explodeScale;
        if (scale <= 0) return;
        const manager = viewer.current.IFC.loader.ifcManager;
        const scene = viewer.current.context.getScene();
        const meshes = viewer.current.context.items.pickableIfcModels;
        if (meshes.length === 0) return;

        removedMeshesRef.current = [];
        explodedSubsetsRef.current = [];

        // Collect element IDs from all meshes
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

        // Create subsets for each element
        const subsets: THREE.Object3D[] = [];
        for (const { modelID, expressID } of targets) {
            try {
                const subset = await manager.createSubset({
                    modelID, ids: [expressID], scene,
                    removePrevious: false,
                    customID: `explode-${modelID}-${expressID}`,
                });
                if (!subset) continue;
                subset.name = `explode-${modelID}-${expressID}`;
                subset.visible = true;
                subsets.push(subset);
            } catch { /* ignore */ }
        }

        // Compute model bounding box center from all subset geometries
        const modelBox = new THREE.Box3();
        for (const s of subsets) {
            try {
                const box = new THREE.Box3().setFromObject(s);
                if (!box.isEmpty()) modelBox.union(box);
            } catch { /* ignore */ }
        }
        const modelCenter = new THREE.Vector3();
        if (!modelBox.isEmpty()) modelBox.getCenter(modelCenter);

        // Animate each subset outward from its natural centroid
        subsets.forEach((subset, i) => {
            try {
                const box = new THREE.Box3().setFromObject(subset);
                const center = new THREE.Vector3();
                if (!box.isEmpty()) box.getCenter(center);

                let dir = center.clone().sub(modelCenter);
                if (dir.lengthSq() < 0.0001) {
                    // Fallback: fibonacci sphere for elements at model center
                    const phi = Math.PI * (3 - Math.sqrt(5));
                    const y = 1 - (i / Math.max(subsets.length - 1, 1)) * 2;
                    const r = Math.sqrt(Math.max(0, 1 - y * y));
                    dir = new THREE.Vector3(Math.cos(phi * i) * r, y, Math.sin(phi * i) * r);
                } else {
                    dir.normalize();
                }

                const dist = Math.max(1, box.isEmpty() ? 1 : center.distanceTo(modelCenter));
                const offset = dir.multiplyScalar(scale * (1 + dist * 0.3));

                gsap.to(subset.position, {
                    x: offset.x, y: offset.y, z: offset.z,
                    duration: 0.9,
                    ease: "power2.out",
                    delay: i * 0.004,
                });
            } catch { /* ignore */ }
        });

        explodedSubsetsRef.current = subsets;
    }, [explodeScale]);

    const resetExplodeModel = useCallback(async () => {
        if (!viewer.current) return;
        const scene = viewer.current.context.getScene();
        removedMeshesRef.current.forEach(({ mesh, parent }) => {
            try { parent.add(mesh); mesh.visible = true; } catch { /* ignore */ }
        });
        removedMeshesRef.current = [];
        const subsets = explodedSubsetsRef.current.length > 0
            ? explodedSubsetsRef.current
            : scene.children.filter((c: THREE.Object3D) => c?.name?.startsWith("explode-"));
        subsets.forEach((s, i) => {
            try {
                gsap.to(s.position, {
                    x: 0, y: 0, z: 0,
                    duration: 0.7,
                    ease: "power2.inOut",
                    delay: i * 0.003,
                });
            } catch { /* ignore */ }
        });
        setTimeout(() => {
            subsets.forEach(s => { try { scene.remove(s); } catch { /* ignore */ } });
            explodedSubsetsRef.current = [];
        }, 900);
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

    return (
        <>
            {isAuthenticated && (
                <>
                    {/* Loading progress */}
                    {loadProgress !== null && (
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 60, background: "#1a1d24ee", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
                            <div style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 500 }}>Загрузка модели...</div>
                            <div style={{ width: 320, background: "#374151", borderRadius: 8, height: 8, overflow: "hidden" }}>
                                <div style={{ height: "100%", background: "#3b82f6", width: `${loadProgress}%`, transition: "width 0.2s" }} />
                            </div>
                            <div style={{ color: "#94a3b8", fontSize: 14 }}>{loadProgress}%</div>
                        </div>
                    )}

                    {/* Annotation canvas overlay */}
                    <div style={{ position: "fixed", inset: 0, top: 42, zIndex: drawMode ? 200 : -1, pointerEvents: drawMode ? "all" : "none" }}>
                        <AnnotationCanvas
                            active={drawMode}
                            onSave={onSketchSaved}
                            onCancel={() => setDrawMode(false)}
                        />
                    </div>

                    {/* Sketch overlay when viewing a comment */}
                    {sketchOverlay && (
                        <div style={{ position: "absolute", inset: 0, top: 42, zIndex: 40, pointerEvents: "none" }}>
                            <div dangerouslySetInnerHTML={{ __html: sketchOverlay.svg }} style={{ width: "100%", height: "100%", opacity: 0.7 }} />
                            <button
                                onClick={() => setSketchOverlay(null)}
                                style={{ position: "absolute", top: 12, right: 12, pointerEvents: "all", background: "#1a1d24cc", color: "#e2e8f0", border: "1px solid #374151", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}
                            >
                                Скрыть эскиз
                            </button>
                        </div>
                    )}

                    {/* Presence indicator */}
                    {presenceUsers.length > 0 && (
                        <div style={{ position: "absolute", top: 54, right: 16, zIndex: 20, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, color: "#94a3b8", marginRight: 2 }}>Сейчас смотрят:</span>
                            {presenceUsers.slice(0, 5).map((u) => {
                                const initials = [u.userName?.[0], u.userSurname?.[0]].filter(Boolean).join("").toUpperCase() || "?";
                                const isMe = u.userId === currentUserId;
                                return (
                                    <div key={u.userId} title={`${u.userName} ${u.userSurname}`.trim() || `User ${u.userId}`}
                                        style={{
                                            width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                                            fontSize: 11, fontWeight: 600, color: "#fff", cursor: "default", flexShrink: 0,
                                            background: isMe ? "linear-gradient(135deg,#3b82f6,#8b5cf6)" : "linear-gradient(135deg,#10b981,#059669)",
                                            border: isMe ? "2px solid #3b82f6" : "2px solid #10b981",
                                            boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                                        }}>
                                        {initials}
                                    </div>
                                );
                            })}
                            {presenceUsers.length > 5 && (
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#374151", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#94a3b8", border: "2px solid #4b5563" }}>
                                    +{presenceUsers.length - 5}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Bottom toolbar */}
                    <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 15, display: "flex", gap: 12, backgroundColor: "#1F252E", padding: "10px 20px", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.3)", border: "1px solid #ccc" }}>
                        <button title={isTreeCollapsed ? "Показать структуру" : "Скрыть структуру"}
                            onClick={() => { clearSelectionTree(); setIsTreeCollapsed(p => !p); }}
                            style={{ background: isTreeCollapsed ? "#2C333A" : "#374151", color: "white", padding: "6px 12px", borderRadius: 4, cursor: "pointer" }}>
                            Структура
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, color: "#94a3b8" }}>Разлёт:</span>
                            <input type="range" min="0.2" max="4" step="0.2" value={explodeScale}
                                onChange={e => setExplodeScale(parseFloat(e.target.value))}
                                style={{ width: 80, accentColor: "#60a5fa" }} />
                            <span style={{ fontSize: 11, color: "#64748b", minWidth: 28 }}>{explodeScale.toFixed(1)}</span>
                        </div>
                        <button title={exploded ? "Собрать модель" : "Разобрать модель"}
                            onClick={() => void (async () => { if (!viewer.current) return; if (exploded) { await resetExplodeModel(); setExploded(false); } else { await explodeModel(explodeScale); setExploded(true); } })()}
                            style={{ background: "#2C333A", color: "white", padding: "6px 12px", borderRadius: 4, cursor: "pointer" }}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </button>
                        <button title={commentsPanelOpen ? "Скрыть все комментарии" : "Все комментарии"}
                            onClick={() => setCommentsPanelOpen(p => { const n = !p; if (n) setIsModalOpen(false); return n; })}
                            style={{ background: commentsPanelOpen ? "#374151" : "#2C333A", color: "white", padding: "6px 12px", borderRadius: 4, cursor: "pointer" }}>
                            Комментарии
                        </button>
                        <button title="Сбросить вид модели"
                            onClick={async () => { try { await clearSelection(); await resetExplodeModel(); setExploded(false); } catch { /* ignore */ } }}
                            style={{ background: "#2C333A", color: "white", padding: "6px 12px", borderRadius: 4, cursor: "pointer" }}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>

                    {/* Model tree */}
                    {!isTreeCollapsed && (
                        <div style={{ position: "absolute", left: 0, top: 42, zIndex: 20, background: "#1F252E", maxHeight: "90vh", overflow: "auto", minWidth: 240, borderRadius: 6, border: "1px solid #ccc", color: "#fff" }}>
                            <div style={{ padding: 10 }}>
                                <input type="text" placeholder="Поиск по структуре..." value={treeSearch} onChange={e => setTreeSearch(e.target.value)}
                                    style={{ width: "100%", marginBottom: 8, padding: "6px 10px", background: "#252a33", border: "1px solid #374151", borderRadius: 6, color: "#f1f5f9", fontSize: 13 }} />
                                <ul style={{ paddingLeft: 0, marginTop: 0 }}>
                                    {modelStructure && (() => {
                                        const filtered = filterTreeBySearch(modelStructure, treeSearch);
                                        return filtered
                                            ? <TreeNodeComponent node={filtered} />
                                            : <li style={{ color: "#94a3b8", fontSize: 13 }}>Ничего не найдено</li>;
                                    })()}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Remote cursors overlay */}
                    {remoteCursors.length > 0 && (
                        <div style={{ position: "absolute", inset: 0, top: 42, pointerEvents: "none", zIndex: 35, overflow: "hidden" }}>
                            {remoteCursors.map(cursor => (
                                <div key={cursor.userId} style={{
                                    position: "absolute",
                                    left: `${cursor.nx * 100}%`,
                                    top: `${cursor.ny * 100}%`,
                                    pointerEvents: "none",
                                    transform: "translate(2px, 2px)",
                                    transition: "left 0.08s linear, top 0.08s linear",
                                }}>
                                    <svg width="14" height="18" viewBox="0 0 14 18" fill="none" style={{ display: "block" }}>
                                        <path d="M1 1l12 8-6.5 1L4 17z" fill={cursor.color} stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
                                    </svg>
                                    <span style={{
                                        display: "inline-block", marginTop: 2, marginLeft: 2,
                                        background: cursor.color, color: "#fff",
                                        fontSize: 10, fontWeight: 600,
                                        padding: "1px 5px", borderRadius: 3,
                                        whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                                    }}>
                                        {cursor.name}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div ref={containerRef} className="viewer-container" onClick={handleClick} />

                    {/* Element properties + comment panel */}
                    {isModalOpen && selectedElement && (
                        <div style={{ position: "fixed", right: 0, top: 42, bottom: 0, width: 340, backgroundColor: "#1a1d24", overflow: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.4)", borderLeft: "1px solid #2d3748", zIndex: 25 }}>
                            <div style={{ borderBottom: "1px solid #2d3748", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#e2e8f0" }}>Свойства элемента</h3>
                                <button onClick={clearSelection} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 20 }}>&times;</button>
                            </div>
                            <div style={{ padding: 12 }}>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Название</label>
                                    <input type="text"
                                        value={customNames[String(selectedElement.id)] ?? getElementDisplayName(selectedElement, customNames)}
                                        onChange={e => { const v = e.target.value; setCustomNames(prev => v ? { ...prev, [String(selectedElement.id)]: v } : (() => { const n = { ...prev }; delete n[String(selectedElement.id)]; return n; })()); }}
                                        onBlur={e => saveCustomName(selectedElement.id, e.target.value.trim())}
                                        style={{ width: "100%", marginTop: 4, padding: "8px 10px", background: "#252a33", border: "1px solid #374151", borderRadius: 6, color: "#f1f5f9", fontSize: 14, boxSizing: "border-box" }} />
                                </div>
                                <div style={{ marginBottom: 16, fontSize: 12, color: "#94a3b8" }}>
                                    <span>ID: {selectedElement.id}</span>
                                    {(selectedElement.ObjectType as { value?: string })?.value && (
                                        <span style={{ display: "block", marginTop: 4 }}>Тип: {String((selectedElement.ObjectType as { value: string }).value)}</span>
                                    )}
                                </div>
                                <hr style={{ border: "none", borderTop: "1px solid #2d3748", margin: "12px 0" }} />

                                <CommentWithSketch
                                    commentText={newComment}
                                    onCommentTextChange={setNewComment}
                                    sketchSvg={sketchSvg}
                                    onDrawRequest={enterDrawMode}
                                    onDeleteSketch={() => setSketchSvg(null)}
                                    onSave={saveComment}
                                />

                                <div style={{ marginTop: 16 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                        <h4 style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
                                            Комментарии ({(comments[String(selectedElement.id)] ?? []).length})
                                        </h4>
                                        <button onClick={() => { setIsModalOpen(false); setCommentsPanelOpen(true); }}
                                            style={{ fontSize: 11, background: "transparent", border: "1px solid #64748b", color: "#94a3b8", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
                                            Все комментарии
                                        </button>
                                    </div>
                                    <ul style={{ paddingLeft: 16, margin: 0 }}>
                                        {(() => {
                                            const elComments = comments[String(selectedElement.id)] ?? [];
                                            if (elComments.length === 0) return <li style={{ color: "#64748b" }}>Нет комментариев</li>;
                                            return elComments.map((comment, i) => (
                                                <li key={i} style={{ marginBottom: 10 }}>
                                                    <span style={{ cursor: "pointer", color: "#60a5fa", textDecoration: "underline" }}
                                                        onClick={() => void handleCommentClick(comment)}>
                                                        {getElementDisplayName({ id: comment.elementId, Name: { value: comment.elementName } } as IfcElementProperties, customNames)}
                                                    </span>
                                                    : <span style={{ color: "#cbd5e1" }}>{comment.text}</span>
                                                    {comment.sketchSvg && (
                                                        <div
                                                            dangerouslySetInnerHTML={{ __html: comment.sketchSvg }}
                                                            onClick={() => setSketchOverlay({ svg: comment.sketchSvg!, label: comment.elementName })}
                                                            style={{ marginTop: 4, maxHeight: 60, overflow: "hidden", background: "#0f1117", borderRadius: 4, cursor: "pointer", border: "1px solid #374151", lineHeight: 0 }}
                                                        />
                                                    )}
                                                    {comment.cameraPositionJson && (
                                                        <button onClick={() => { try { flyToCamera(JSON.parse(comment.cameraPositionJson!)); } catch { /* ignore */ } }}
                                                            style={{ fontSize: 10, background: "transparent", border: "1px solid #374151", color: "#60a5fa", padding: "1px 6px", borderRadius: 3, cursor: "pointer", marginTop: 2 }}>
                                                            📷 Перейти к позиции
                                                        </button>
                                                    )}
                                                    {renderCommentMeta(comment)}
                                                </li>
                                            ));
                                        })()}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* All comments panel */}
                    {commentsPanelOpen && (
                        <div style={{ position: "fixed", left: 20, top: 80, bottom: 100, width: 300, background: "#1a1d24", border: "1px solid #2d3748", borderRadius: 8, zIndex: 30, overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                            <div style={{ padding: 12, borderBottom: "1px solid #2d3748", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <h4 style={{ margin: 0, color: "#e2e8f0", fontSize: 14 }}>Все комментарии</h4>
                                <button onClick={() => setCommentsPanelOpen(false)} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18 }}>&times;</button>
                            </div>
                            <div style={{ padding: 12 }}>
                                {(() => {
                                    const all = Object.entries(comments).flatMap(([, arr]) => arr);
                                    all.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
                                    if (all.length === 0) return <p style={{ color: "#64748b", fontSize: 13 }}>Нет комментариев</p>;
                                    return all.map((c, i) => (
                                        <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #2d3748" }}>
                                            <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 4, cursor: "pointer", textDecoration: "underline" }}
                                                onClick={() => void handleCommentClick(c)}>
                                                {getElementDisplayName({ id: c.elementId, Name: { value: c.elementName } } as IfcElementProperties, customNames)}
                                            </div>
                                            <div style={{ color: "#cbd5e1", fontSize: 13 }}>{c.text}</div>
                                            {c.sketchSvg && (
                                                <div dangerouslySetInnerHTML={{ __html: c.sketchSvg }}
                                                    onClick={() => setSketchOverlay({ svg: c.sketchSvg!, label: c.elementName })}
                                                    style={{ marginTop: 4, maxHeight: 50, overflow: "hidden", background: "#0f1117", borderRadius: 4, cursor: "pointer", border: "1px solid #374151", lineHeight: 0 }} />
                                            )}
                                            {c.cameraPositionJson && (
                                                <button onClick={() => { try { flyToCamera(JSON.parse(c.cameraPositionJson!)); } catch { /* ignore */ } }}
                                                    style={{ fontSize: 10, background: "transparent", border: "1px solid #374151", color: "#60a5fa", padding: "1px 6px", borderRadius: 3, cursor: "pointer", marginTop: 4 }}>
                                                    📷 Перейти к позиции
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
