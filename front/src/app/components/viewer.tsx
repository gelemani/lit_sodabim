"use client"

import React, { useEffect, useRef, useState, useCallback } from "react";
import { IfcViewerAPI } from "web-ifc-viewer";
import io from "socket.io-client";
import * as THREE from "three";
import { gsap } from "gsap";
import { apiService } from "@/app/services/api.service";

const socket = typeof window !== "undefined" && process.env.NEXT_PUBLIC_SOCKET_URL
    ? io(process.env.NEXT_PUBLIC_SOCKET_URL, { reconnection: false })
    : ({ emit: () => {}, on: () => {}, off: () => {} } as ReturnType<typeof io>);

interface Comment {
    text: string;
    elementName: string;
    elementId: number;
    userId?: number;
    userName?: string;
    createdAt?: string;
}

interface IfcElementProperties {
    id: number;
    Name?: { value: string };
    [key: string]: any;
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

const mapIfcStructureToTreeNode = (node: IfcSpatialNode): TreeNode => ({
    name: node.typeName || "Unnamed",
    expressID: node.expressID,
    children: node.children ? node.children.map(mapIfcStructureToTreeNode) : [],
});

// Асинхронное преобразование структуры IFC в дерево с именами из свойств Name
async function mapIfcStructureToTreeNodeWithNames(
    ifcManager: any,
    modelID: number,
    node: IfcSpatialNode
): Promise<TreeNode> {
    let name = node.typeName || "Unnamed";

    if (node.expressID !== undefined) {
        try {
            const props = await ifcManager.getItemProperties(modelID, node.expressID, true);
            const getVal = (o: unknown) => (o && typeof o === "object" && "value" in o ? String((o as { value: unknown }).value) : "");
            if (getVal(props?.Name)?.trim()) name = getVal(props.Name).trim();
            else if (getVal(props?.ObjectType)?.trim()) name = getVal(props.ObjectType).trim();
            else if (getVal(props?.Tag)?.trim()) name = getVal(props.Tag).trim();
        } catch {
            // ignore errors
        }
    }

    let children: TreeNode[] = [];
    if (node.children && node.children.length > 0) {
        children = await Promise.all(
            node.children.map((child) => mapIfcStructureToTreeNodeWithNames(ifcManager, modelID, child))
        );
    }

    return {
        name,
        expressID: node.expressID,
        children,
    };
}

/** Извлекает читаемое имя элемента (BIM 360 style: Name > ObjectType > Tag > type) */
function getElementDisplayName(props: IfcElementProperties, customNames: Record<string, string>): string {
    const id = props?.id ?? props?.expressID;
    const key = id != null ? String(id) : "";
    if (customNames[key]) return customNames[key];
    const getVal = (o: unknown) => (o && typeof o === "object" && "value" in o ? String((o as { value: unknown }).value) : "");
    const name = getVal(props?.Name)?.trim();
    if (name) return name;
    const objectType = getVal(props?.ObjectType)?.trim();
    if (objectType) return objectType;
    const tag = getVal(props?.Tag)?.trim();
    if (tag) return tag;
    const typeNum = props?.type;
    if (typeof typeNum === "number") return `Element ${typeNum}`;
    return props?.constructor?.name || "Unnamed";
}

const Viewer = ({
                    isAuthenticated,
                    file,
                }: {
    isAuthenticated: boolean;
    file?: File | null;
}) => {
    const [selectedElement, setSelectedElement] = useState<IfcElementProperties | null>(null);
    const [comments, setComments] = useState<Record<string, Comment[]>>({});
    const [newComment, setNewComment] = useState("");
    const [selectedCommentsId, setSelectedCommentsId] = React.useState<number | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [propertiesPanelCollapsed, setPropertiesPanelCollapsed] = useState(false);
    const [modelStructure, setModelStructure] = useState<TreeNode | null>(null);
    let [exploded, setExploded] = useState(false);
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(true);
    const toggleTreeCollapsed = () => setIsTreeCollapsed((prev) => !prev);
    const [selectedIDs, setSelectedIDs] = useState<Set<number>>(new Set());
    const [customNames, setCustomNames] = useState<Record<string, string>>({});
    const [treeSearch, setTreeSearch] = useState("");
    const [explodeScale, setExplodeScale] = useState(1);
    const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
    useEffect(() => {
        // Чтобы не появлялись одновременно два окна: центральное и слева.
        if (commentsPanelOpen) setIsModalOpen(false);
    }, [commentsPanelOpen]);
    const explodedSubsetsRef = useRef<THREE.Object3D[]>([]);
    const removedMeshesRef = useRef<{ mesh: THREE.Object3D; parent: THREE.Object3D }[]>([]);
    const viewer = useRef<IfcViewerAPI | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const currentUserId = typeof window !== "undefined" ? parseInt(localStorage.getItem("userId") || "0", 10) : 0;

    useEffect(() => {
        const projectId = sessionStorage.getItem("viewerProjectId") || "0";
        const fileId = sessionStorage.getItem("viewerFileId") || "0";
        const key = `bim_customNames_${projectId}_${fileId}`;
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw) as Record<string, string>;
                setCustomNames(typeof parsed === "object" && parsed ? parsed : {});
            } else {
                setCustomNames({});
            }
        } catch {
            setCustomNames({});
        }
    }, [file]);

    const saveCustomName = useCallback((expressId: number, name: string) => {
        const key = String(expressId);
        setCustomNames((prev) => {
            const next = { ...prev };
            if (name.trim()) next[key] = name.trim();
            else delete next[key];
            const p = sessionStorage.getItem("viewerProjectId") || "0";
            const f = sessionStorage.getItem("viewerFileId") || "0";
            try {
                localStorage.setItem(`bim_customNames_${p}_${f}`, JSON.stringify(next));
            } catch (_) {}
            return next;
        });
    }, []);

    useEffect(() => {
        if (!isAuthenticated || !containerRef.current) return;
        if (!viewer.current) {
            viewer.current = new IfcViewerAPI({ container: containerRef.current });
            viewer.current.grid.setGrid();
            viewer.current.axes.setAxes();
            const controls = viewer.current.context.ifcCamera.controls;
            controls.setBoundary(new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)));
            controls.azimuthAngle = 0;
            controls.maxDistance = 100;
            controls.minDistance = 1;
            controls.dollySpeed = 0.5;
            controls.setTarget(0, 0, 0);
            viewer.current.IFC.setWasmPath("../../../");
        }
        if (file && viewer.current) {
            const fileURL = URL.createObjectURL(file);
            viewer.current.IFC.loadIfcUrl(fileURL).then(async () => {
                const structure = await viewer.current!.IFC.loader.ifcManager.getSpatialStructure(0, true);
                const tree = await mapIfcStructureToTreeNodeWithNames(
                    viewer.current!.IFC.loader.ifcManager,
                    0,
                    structure
                );
                setModelStructure(tree);
            });
            viewer.current.grid.dispose();
            viewer.current.axes.dispose();
        }
        return () => {
            if (viewer.current) {
                viewer.current.dispose();
                viewer.current = null;
            }
        };
    }, [isAuthenticated, file]);

    const [userNameMap, setUserNameMap] = useState<Record<number, string>>({});

    useEffect(() => {
        apiService.getAllUsers().then((users) => {
            const map: Record<number, string> = {};
            for (const u of users) {
                map[u.id] = [u.userName, u.userSurname].filter(Boolean).join(" ") || `User ${u.id}`;
            }
            setUserNameMap(map);
        });
    }, []);

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
                        text: c.commentText,
                        elementName: c.elementName,
                        elementId: c.expressId,
                        userId: c.userId,
                        createdAt: c.createdAt,
                    });
                }
                setComments(grouped);
            }
        });
    }, [file]);

    useEffect(() => {
        const sessionId = "demo-project-room";
        socket.emit("join-room", sessionId);
        const onElementSelected = async (_element: { modelID: number; id: number }) => {
            // Не применяем highlight — он затемняет остальную модель
        };
        socket.on("element-selected", onElementSelected);
        return () => {
            socket.off("element-selected", onElementSelected);
        };
    }, []);

    const clearSelectionTree = useCallback(() => {
        if (!viewer.current) return;
        const scene = viewer.current.context.getScene();
        const models = viewer.current.context.items.pickableIfcModels;

        const toRemove = scene.children.filter((child: THREE.Object3D) =>
            child?.name?.startsWith("show-only-"),
        );
        toRemove.forEach((obj: THREE.Object3D) => scene.remove(obj));

        // Восстанавливаем видимость всех моделей
        models.forEach((m) => {
            m.visible = true;
        });

        setSelectedIDs(new Set());
    }, []);

    const clearSelection = useCallback(async () => {
        if (!viewer.current) return;
        try {
            viewer.current.IFC.unpickIfcItems();
            viewer.current.IFC.unPrepickIfcItems();
            viewer.current.IFC.unHighlightIfcItems();
        } catch {
            viewer.current?.IFC.unpickIfcItems();
        }
        clearSelectionTree();
        setSelectedElement(null);
        setIsModalOpen(false);
        setNewComment("");
    }, [clearSelectionTree]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") clearSelection();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [clearSelection]);

    const handleClick = useCallback(async () => {
        if (!viewer.current || !modelStructure) return;
        const v = viewer.current;
        const hit = v.context.castRayIfc();
        const faceIndex = hit?.faceIndex;
        if (
            !hit ||
            faceIndex === undefined ||
            faceIndex === null
        ) {
            clearSelection();
            return;
        }
        const mesh = hit.object as THREE.Mesh & { modelID?: number };
        const modelID = mesh.modelID;
        if (modelID === undefined || modelID === null) {
            clearSelection();
            return;
        }
        const expressId = v.IFC.loader.ifcManager.getExpressId(
            mesh.geometry,
            faceIndex,
        );
        if (expressId === undefined) {
            clearSelection();
            return;
        }

        v.IFC.unpickIfcItems();
        v.IFC.unPrepickIfcItems();
        v.IFC.unHighlightIfcItems();

        const visibleOk = v.context.items.pickableIfcModels.some((model) => {
            return (
                model.visible &&
                model.geometry.getAttribute("expressID")?.array.includes(expressId)
            );
        });
        if (!visibleOk && !isTreeCollapsed) return;

        // Фиолетовое выделение выбранного элемента:
        // используем pickIfcItemsByID, чтобы НЕ делать fade-away затемнение всей модели.
        try {
            const selector: any = v.IFC.selector;
            if (selector?.pickIfcItemsByID) {
                await selector.pickIfcItemsByID(modelID, [expressId], false, true);
            }
        } catch {
            // ignore selection highlight errors
        }

        const properties = await v.IFC.loader.ifcManager.getItemProperties(
            modelID,
            expressId,
        );
        if (!("id" in properties)) {
            properties.id = expressId;
        }
        setSelectedElement(properties);
        setNewComment("");
        setIsModalOpen(true);
    }, [isTreeCollapsed, modelStructure, clearSelection]);

    const saveComment = useCallback(async () => {
        if (!selectedElement) return;
        const elementId = selectedElement.id;
        const commentText = newComment.trim();
        if (!commentText) return;
        const elementName = getElementDisplayName(selectedElement, customNames);
        const projectId = parseInt(sessionStorage.getItem("viewerProjectId") || "0", 10);
        const fileId = parseInt(sessionStorage.getItem("viewerFileId") || "0", 10);
        const userId = parseInt(typeof window !== "undefined" ? localStorage.getItem("userId") || "0" : "0", 10);

        if (projectId && fileId) {
            const res = await apiService.postIfcComment(projectId, fileId, {
                expressId: elementId,
                elementName,
                elementDataJson: JSON.stringify(selectedElement),
                commentText,
                userId,
            });
            if (!res.success) {
                console.error("Ошибка сохранения комментария:", res.error);
                return;
            }
        }

        const elementIdStr = String(elementId);
        const now = new Date().toISOString();
        setComments((prev) => {
            const updated = { ...prev };
            if (!updated[elementIdStr]) updated[elementIdStr] = [];
            if (!updated[elementIdStr].some((c) => c.text === commentText)) {
                updated[elementIdStr].push({ text: commentText, elementName, elementId, userId, createdAt: now });
            }
            return updated;
        });
        setNewComment("");
    }, [newComment, selectedElement, customNames]);

    const openSelectedElementJsonWindow = useCallback(() => {
        if (!selectedElement) return;
        const newWindow = window.open("", "SelectedElementData", "width=600,height=400");
        if (!newWindow) return;
        newWindow.document.write(`
          <html>
            <head>
              <title>Данные выбранного элемента (JSON)</title>
              <style>
                body { font-family: sans-serif; padding: 10px; background: #fff; color: #000; }
                pre { white-space: pre-wrap; word-wrap: break-word; }
              </style>
            </head>
            <body>
              <h4>Данные выбранного элемента (JSON):</h4>
              <pre>${JSON.stringify(selectedElement, null, 2)}</pre>
            </body>
          </html>
        `);
        newWindow.document.close();
    }, [selectedElement]);

    const explodeModel = useCallback(async (scaleOverride?: number) => {
        if (!viewer.current) return;

        const scale = typeof scaleOverride === "number" ? scaleOverride : explodeScale;
        if (scale <= 0) return;

        const manager = viewer.current.IFC.loader.ifcManager;
        const scene = viewer.current.context.getScene();
        const meshes = viewer.current.context.items.pickableIfcModels;

        if (meshes.length === 0) return;

        const getAllExpressIDsFromGeometry = (mesh: typeof meshes[number]) => {
            const idAttr = mesh.geometry.getAttribute("expressID");
            if (!idAttr) return [];
            const ids = new Set<number>();
            for (let i = 0; i < idAttr.count; i++) {
                const v = idAttr.getX(i);
                if (!Number.isNaN(v)) ids.add(v);
            }
            return Array.from(ids);
        };

        // 6 фиксированных направлений (вектора) - меньше "корявости" за счет равномерного разнесения
        const directions = [
            new THREE.Vector3(1, 0, 0), // +X
            new THREE.Vector3(-1, 0, 0), // -X
            new THREE.Vector3(0, 1, 0), // +Y
            new THREE.Vector3(0, -1, 0), // -Y
            new THREE.Vector3(0, 0, 1), // +Z
            new THREE.Vector3(0, 0, -1), // -Z
        ];

        removedMeshesRef.current = [];
        explodedSubsetsRef.current = [];

        // Пары {modelID, expressID}, чтобы explode работал в моделях с несколькими IFC
        const targets: { modelID: number; expressID: number }[] = [];

        // Убираем оригинальные меши, но сначала собираем expressID
        for (const mesh of meshes) {
            const modelID = mesh.modelID;
            const expressIDs = getAllExpressIDsFromGeometry(mesh);
            for (const expressID of expressIDs) {
                targets.push({ modelID, expressID });
            }

            const parent = mesh.parent;
            if (parent) {
                parent.remove(mesh);
                removedMeshesRef.current.push({ mesh, parent });
            }
        }

        const EXPLODE_DISTANCE = 1.1 * scale; // заметно меньше, чем было

        for (let i = 0; i < targets.length; i++) {
            const { modelID, expressID } = targets[i];
            try {
                const direction = directions[i % directions.length];
                const subset = await manager.createSubset({
                    modelID,
                    ids: [expressID],
                    scene,
                    removePrevious: false,
                    customID: `explode-${modelID}-${expressID}`,
                });

                if (!subset) continue;

                subset.name = `explode-${modelID}-${expressID}`;
                subset.visible = true;

                const offset = direction.clone().multiplyScalar(EXPLODE_DISTANCE);
                // Важно: не телепортируем в (0,0,0), а смещаем относительно текущего положения
                subset.position.add(offset);

                (subset as THREE.Object3D & { userData: { direction?: THREE.Vector3 } }).userData = {
                    direction: direction.clone(),
                };
                explodedSubsetsRef.current.push(subset);
            } catch (e) {
                console.warn("Ошибка при разборке элемента", expressID, e);
            }
        }
    }, [explodeScale]);

    const resetExplodeModel = useCallback(async () => {
        if (!viewer.current) return;
        const scene = viewer.current.context.getScene();

        // 1) Возвращаем убранные оригинальные меши на место
        const removed = removedMeshesRef.current;
        removed.forEach(({ mesh, parent }) => {
            try {
                if (parent) parent.add(mesh);
                mesh.visible = true;
            } catch {
                /* ignore */
            }
        });
        removedMeshesRef.current = [];

        // 2) Находим explode-субсеты и анимируем их обратно, затем удаляем
        const explodeSubsets =
            explodedSubsetsRef.current.length > 0
                ? explodedSubsetsRef.current
                : scene.children.filter((c: THREE.Object3D) => c?.name?.startsWith("explode-"));

        explodeSubsets.forEach((subset) => {
            try {
                if (subset?.position) {
                    gsap.to(subset.position, { x: 0, y: 0, z: 0, duration: 0.6 });
                }
            } catch {
                /* ignore */
            }
        });

        setTimeout(() => {
            try {
                explodeSubsets.forEach((s: THREE.Object3D) => {
                    try {
                        scene.remove(s);
                    } catch {
                        /* ignore */
                    }
                });
            } finally {
                explodedSubsetsRef.current = [];
            }
        }, 750);
    }, []);

    const filterTreeBySearch = useCallback((node: TreeNode, query: string): TreeNode | null => {
        if (!query.trim()) return node;
        const q = query.toLowerCase().trim();
        const nameMatch = node.name.toLowerCase().includes(q);
        const filteredChildren = node.children
            ? node.children.map((c) => filterTreeBySearch(c, query)).filter((c): c is TreeNode => c !== null)
            : [];
        const childMatch = filteredChildren.length > 0;
        if (nameMatch || childMatch) {
            return { name: node.name, expressID: node.expressID, children: childMatch ? filteredChildren : node.children };
        }
        return null;
    }, []);

    const TreeNodeComponent = ({
                                   node,
                                   selectedIDs,
                                   setSelectedIDs,
                                   customNames,
                               }: {
        node: TreeNode;
        selectedIDs: Set<number>;
        setSelectedIDs: React.Dispatch<React.SetStateAction<Set<number>>>;
        customNames: Record<string, string>;
    }) => {
        const [expanded, setExpanded] = React.useState(true);

        const selected = selectedIDs.has(node.expressID ?? -1);
        const hasChildren = node.children && node.children.length > 0;
        const toggleExpanded = () => setExpanded(!expanded);

        const handleSelect = async () => {
            if (!viewer.current || node.expressID === undefined) return;

            const manager = viewer.current.IFC.loader.ifcManager;
            const scene = viewer.current.context.getScene();
            const model = viewer.current.context.items.pickableIfcModels[0];
            const modelID = model.modelID;
            const subsetId = `show-only-${node.expressID}`;

            try {
                const maybeSubset = scene.children.find(obj => obj.name === subsetId);
                if (maybeSubset) {
                    scene.remove(maybeSubset);
                    model.visible = true;

                    setSelectedIDs(prev => {
                        const updated = new Set(prev);
                        updated.delete(node.expressID!);
                        return updated;
                    });

                    return;
                }

                model.visible = false;

                const subset = await manager.createSubset({
                    modelID,
                    ids: [node.expressID],
                    material: undefined,
                    scene,
                    removePrevious: false,
                    customID: subsetId,
                });

                if (subset) {
                    subset.name = subsetId;
                    subset.visible = true;

                    setSelectedIDs(prev => {
                        const updated = new Set(prev);
                        updated.add(node.expressID!);
                        return updated;
                    });
                }
            } catch (err) {
                console.warn("Subset creation/removal failed:", err);
            }
        };

        return (
            <li>
                <div className="model-tree-row">
                    {hasChildren ? (
                        <div
                            onClick={toggleExpanded}
                            className="model-tree-arrow"
                            aria-label={expanded ? "Collapse" : "Expand"}
                        >
                            {expanded ? "▼" : "▶"}
                        </div>
                    ) : (
                        <div className="model-tree-arrow" />
                    )}
                    <span
                        className={`model-tree-name${selected ? " selected" : ""}`}
                        onClick={handleSelect}
                    >
                        {node.expressID != null && customNames[String(node.expressID)]
                            ? customNames[String(node.expressID)]
                            : node.name}
                    </span>
                </div>
                    {hasChildren && expanded && (
                    <ul className="model-tree-children">
                        {node.children!.map((child) => (
                            <TreeNodeComponent
                                key={child.expressID}
                                node={child}
                                selectedIDs={selectedIDs}
                                setSelectedIDs={setSelectedIDs}
                                customNames={customNames}
                            />
                        ))}
                    </ul>
                )}
            </li>
        );
    };

    return (
        <>
            {isAuthenticated && (
                <>
                    {/* Панель управления снизу */}
                    <div
                        style={{
                            position: "absolute",
                            bottom: 20,
                            left: "50%",
                            transform: "translateX(-50%)",
                            zIndex: 15,
                            display: "flex",
                            gap: 12,
                            backgroundColor: "#1F252E",
                            padding: "10px 20px",
                            borderRadius: 8,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                            border: "1px solid #ccc"
                        }}
                    >
                        <button
                            title={isTreeCollapsed ? "Показать структуру" : "Скрыть структуру"}
                            onClick={() => {
                                clearSelectionTree();
                                toggleTreeCollapsed();
                            }}
                            style={{
                                background: isTreeCollapsed ? "#2C333A" : "#374151",
                                color: "white",
                                padding: "6px 12px",
                                borderRadius: 4,
                                cursor: "pointer",
                            }}
                        >
                            Структура
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, color: "#94a3b8" }}>Разлёт:</span>
                            <input
                                type="range"
                                min="0.2"
                                max="4"
                                step="0.2"
                                value={explodeScale}
                                onChange={(e) => setExplodeScale(parseFloat(e.target.value))}
                                style={{ width: 80, accentColor: "#60a5fa" }}
                                title="Сила разложения модели"
                            />
                            <span style={{ fontSize: 11, color: "#64748b", minWidth: 28 }}>{explodeScale.toFixed(1)}</span>
                        </div>
                        <button
                            title={exploded ? "Собрать модель" : "Разобрать модель"}
                            onClick={() => {
                                void (async () => {
                                    if (!viewer.current) return;
                                    if (exploded) {
                                        await resetExplodeModel();
                                        setExploded(false);
                                        return;
                                    }
                                    if (explodeScale <= 0.001) return;
                                    await explodeModel(explodeScale);
                                    setExploded(true);
                                })();
                            }}
                            style={{
                                background: "#2C333A",
                                color: "white",
                                // border: "1px solid white",
                                padding: "6px 12px",
                                borderRadius: 4,
                                cursor: "pointer"
                            }}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </button>

                        <button
                            title={commentsPanelOpen ? "Скрыть все комментарии" : "Все комментарии"}
                            onClick={() =>
                                setCommentsPanelOpen((p) => {
                                    const next = !p;
                                    if (next) setIsModalOpen(false);
                                    return next;
                                })
                            }
                            style={{
                                background: commentsPanelOpen ? "#374151" : "#2C333A",
                                color: "white",
                                padding: "6px 12px",
                                borderRadius: 4,
                                cursor: "pointer",
                            }}
                        >
                            Комментарии
                        </button>
                        <button
                            title="Сбросить вид модели"
                            onClick={async () => {
                                if (!viewer.current) return;
                                try {
                                    await clearSelection();
                                    await resetExplodeModel();
                                    setExploded(false);
                                } catch (err) {
                                    console.error("Ошибка при сбросе модели:", err);
                                }
                            }}
                            style={{
                                background: "#2C333A",
                                color: "white",
                                padding: "6px 12px",
                                borderRadius: 4,
                                cursor: "pointer"
                            }}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                    
                    {/* Панель Model Tree с перетаскиванием */}
                    {!isTreeCollapsed && (
                    <div
                        style={{
                            position: "absolute",
                            left: 0,
                            top: 42,
                            zIndex: 20,
                            background: "#1F252E",
                            padding: 0,
                            maxHeight: "90vh",
                            overflow: "auto",
                            fontFamily: "Arial, sans-serif",
                            fontSize: 14,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.13)",
                            minWidth: 240,
                            borderRadius: 6,
                            border: "1px solid #ccc",
                            color: "#fff"
                        }}
                    >
                        <div style={{ padding: 10 }}>
                            <input
                                type="text"
                                placeholder="Поиск по структуре..."
                                value={treeSearch}
                                onChange={(e) => setTreeSearch(e.target.value)}
                                style={{
                                    width: "100%",
                                    marginBottom: 8,
                                    padding: "6px 10px",
                                    background: "#252a33",
                                    border: "1px solid #374151",
                                    borderRadius: 6,
                                    color: "#f1f5f9",
                                    fontSize: 13,
                                }}
                            />
                            <ul style={{ paddingLeft: 0, marginTop: 0 }}>
                                {modelStructure && (() => {
                                    const filtered = filterTreeBySearch(modelStructure, treeSearch);
                                    return filtered ? (
                                        <TreeNodeComponent
                                            node={filtered}
                                            selectedIDs={selectedIDs}
                                            setSelectedIDs={setSelectedIDs}
                                            customNames={customNames}
                                        />
                                    ) : (
                                        <li style={{ color: "#94a3b8", fontSize: 13 }}>Ничего не найдено</li>
                                    );
                                })()}
                            </ul>
                        </div>
                    </div>
                    )}

                    <div ref={containerRef} className="viewer-container" onClick={handleClick}/>
                    {isModalOpen && selectedElement && (
                        <div
                            className="modal-container bim360-panel"
                            style={{
                                position: "fixed",
                                right: 0,
                                top: 42,
                                bottom: 0,
                                width: 340,
                                maxWidth: "100%",
                                backgroundColor: "#1a1d24",
                                overflow: "auto",
                                boxShadow: "-4px 0 24px rgba(0,0,0,0.4)",
                                borderLeft: "1px solid #2d3748",
                                zIndex: 25,
                            }}
                        >
                            <div className="modal-header" style={{ borderBottom: "1px solid #2d3748", cursor: "default" }}>
                                <div className="modal-title">
                                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#e2e8f0" }}>
                                        Свойства элемента
                                    </h3>
                                    <button className="modal-close" onClick={clearSelection} title="Закрыть">
                                        &times;
                                    </button>
                                </div>
                            </div>

                            <div style={{ padding: 12 }}>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                        Название
                                    </label>
                                    <input
                                        type="text"
                                        value={customNames[String(selectedElement.id)] ?? getElementDisplayName(selectedElement, customNames)}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            const key = String(selectedElement.id);
                                            setCustomNames((prev) => (v !== "" ? { ...prev, [key]: v } : (() => { const n = { ...prev }; delete n[key]; return n; })()));
                                        }}
                                        onBlur={(e) => saveCustomName(selectedElement.id, e.target.value.trim())}
                                        placeholder="Кастомное название..."
                                        style={{
                                            width: "100%",
                                            marginTop: 4,
                                            padding: "8px 10px",
                                            background: "#252a33",
                                            border: "1px solid #374151",
                                            borderRadius: 6,
                                            color: "#f1f5f9",
                                            fontSize: 14,
                                        }}
                                    />
                                </div>

                                <div style={{ marginBottom: 16, fontSize: 12, color: "#94a3b8" }}>
                                    <span>ID: {selectedElement.id}</span>
                                    {selectedElement.ObjectType?.value && (
                                        <span style={{ display: "block", marginTop: 4 }}>
                                            Тип: {String(selectedElement.ObjectType.value)}
                                        </span>
                                    )}
                                </div>

                                <hr style={{ border: "none", borderTop: "1px solid #2d3748", margin: "12px 0" }} />

                                <label style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    Комментарий
                                </label>
                                <textarea
                                    className="modal-textarea"
                                    style={{
                                        marginTop: 4,
                                        marginBottom: 8,
                                        width: "100%",
                                        minHeight: 60,
                                        background: "#252a33",
                                        border: "1px solid #374151",
                                        borderRadius: 6,
                                        color: "#f1f5f9",
                                        padding: 8,
                                    }}
                                    placeholder="Добавьте комментарий к элементу..."
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                />
                                <div className="modal-buttons" style={{ gap: 8, marginBottom: 16 }}>
                                    <button className="save" onClick={saveComment} style={{ flex: 1 }}>
                                        Добавить
                                    </button>
                                    <button
                                        className="button modal-json-button"
                                        onClick={openSelectedElementJsonWindow}
                                        title="Открыть JSON свойств"
                                    >
                                        JSON
                                    </button>
                                </div>

                                <div className="modal-comments">
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                        <h4 style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>Комментарии ({Object.values(comments).flat().filter((c) => String(c.elementId) === String(selectedElement.id)).length})</h4>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsModalOpen(false);
                                                setCommentsPanelOpen(true);
                                            }}
                                            style={{ fontSize: 11, background: "transparent", border: "1px solid #64748b", color: "#94a3b8", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}
                                        >
                                            Все комментарии
                                        </button>
                                    </div>
                                    <ul style={{ paddingLeft: 16, margin: 0 }}>
                                        {(() => {
                                            const elComments = (comments[String(selectedElement.id)] ?? []);
                                            if (elComments.length === 0) return <li style={{ color: "#64748b" }}>Нет комментариев</li>;
                                            return elComments.map((comment, i) => (
                                                <li key={i} style={{ marginBottom: 8 }}>
                                                    <span
                                                        style={{ cursor: "pointer", color: "#60a5fa", textDecoration: "underline" }}
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (!viewer.current) return;
                                                            try {
                                                                const model = viewer.current.context.items.pickableIfcModels[0];
                                                                if (!model) return;
                                                                model.visible = true;
                                                                viewer.current.IFC.unPrepickIfcItems();
                                                                viewer.current.IFC.unHighlightIfcItems();
                                                                await viewer.current.IFC.selector.unpickIfcItems();

                                                                const selector: any = viewer.current.IFC.selector;
                                                                if (selector?.pickIfcItemsByID) {
                                                                    await selector.pickIfcItemsByID(
                                                                        model.modelID,
                                                                        [comment.elementId],
                                                                        false,
                                                                        true,
                                                                    );
                                                                }

                                                                const props = await viewer.current.IFC.loader.ifcManager.getItemProperties(model.modelID, comment.elementId);
                                                                if (!("id" in props)) props.id = comment.elementId;
                                                                setSelectedElement(props);
                                                            } catch (err) {
                                                                console.warn(err);
                                                            }
                                                        }}
                                                    >
                                                        {getElementDisplayName({ id: comment.elementId, Name: { value: comment.elementName } } as IfcElementProperties, customNames)}
                                                    </span>
                                                    : <span style={{ color: "#cbd5e1" }}>{comment.text}</span>
                                                    <span style={{ fontSize: 10, color: "#64748b", display: "block", marginTop: 2 }}>
                                                        {comment.userId === currentUserId ? "Вы" : (userNameMap[comment.userId ?? 0] ?? `User ${comment.userId}`)}, {comment.createdAt ? new Date(comment.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                                                    </span>
                                                </li>
                                            ));
                                        })()}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                    {commentsPanelOpen && (
                        <div style={{ position: "fixed", left: 20, top: 80, bottom: 100, width: 300, background: "#1a1d24", border: "1px solid #2d3748", borderRadius: 8, zIndex: 30, overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                            <div style={{ padding: 12, borderBottom: "1px solid #2d3748", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <h4 style={{ margin: 0, color: "#e2e8f0", fontSize: 14 }}>Все комментарии</h4>
                                <button onClick={() => setCommentsPanelOpen(false)} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18 }}>&times;</button>
                            </div>
                            <div style={{ padding: 12 }}>
                                {(() => {
                                    const all = Object.entries(comments).flatMap(([expressId, arr]) => arr.map(c => ({ ...c, expressId: Number(expressId) })));
                                    all.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
                                    if (all.length === 0) return <p style={{ color: "#64748b", fontSize: 13 }}>Нет комментариев</p>;
                                    return all.map((c, i) => (
                                        <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #2d3748" }}>
                                            <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 4 }}>{getElementDisplayName({ id: c.elementId, Name: { value: c.elementName } } as IfcElementProperties, customNames)}</div>
                                            <div style={{ color: "#cbd5e1", fontSize: 13 }}>{c.text}</div>
                                            <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>{c.userId === currentUserId ? "Вы" : (userNameMap[c.userId ?? 0] ?? `User ${c.userId}`)}, {c.createdAt ? new Date(c.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</div>
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