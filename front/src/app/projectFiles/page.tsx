"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import ClipLoader from "react-spinners/ClipLoader";
import { apiService } from "@/app/services/api.service";
import { Project, ProjectFile } from "@/app/config/api";
import useFileViewer from "@/app/components/hooks/useFileViewer";
import Header from "@/app/components/header";
import JSZip from "jszip";

// ── Utils ─────────────────────────────────────────────────────────────────────

function getExt(name: string) {
  return name.split(".").pop()?.trim().toUpperCase() ?? "—";
}

function truncate(name: string, max = 40) {
  if (name.length <= max) return name;
  const ext = name.split(".").pop();
  return `${name.slice(0, max - 3)}...${ext}`;
}

function fmtSize(bytes?: number) {
  if (!bytes) return "—";
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + " МБ";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " КБ";
  return bytes + " Б";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

function extColor(ext: string): string {
  const map: Record<string, string> = {
    IFC: "#3b82f6", RVT: "#8b5cf6", DWG: "#f97316",
    PDF: "#ef4444", DXF: "#06b6d4", NWD: "#22c55e", NWC: "#22c55e",
  };
  return map[ext] ?? "#64748b";
}

// ── Component ─────────────────────────────────────────────────────────────────

const Page = (): React.JSX.Element => {
  const router = useRouter();
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentProjectTitle, setCurrentProjectTitle] = useState("");
  const [currentProjectId, setCurrentProjectId] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileCacheRef = useRef<Map<number, File>>(new Map());
  const { openFileInViewer } = useFileViewer();

  const userId = typeof window !== "undefined" ? Number(localStorage.getItem("userId")) : 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCurrentProjectId(Number(localStorage.getItem("projectId")) || 0);
    setCurrentProjectTitle(localStorage.getItem("projectTitle") || "");
    setCompanyName(localStorage.getItem("companyName") || "");
  }, []);

  const refetchFiles = async () => {
    if (!userId || !currentProjectId) return;
    setIsLoadingFiles(true);
    try {
      const result = await apiService.getUserProjectFiles(userId, currentProjectId);
      if (result.success && Array.isArray(result.data)) {
        const zipResult = await apiService.DownloadFilesZip(currentProjectId);
        if (zipResult.success && zipResult.data) {
          const zip = await JSZip.loadAsync(zipResult.data);
          setProjectFiles(result.data.map(f => {
            const entry = zip.file(f.fileName);
            return { ...f, fileSize: entry ? (entry as Record<string, unknown>)._data?.uncompressedSize as number ?? 0 : 0 };
          }));
        } else {
          setProjectFiles(result.data);
        }
        setError(null);
      } else {
        setError("Не удалось загрузить файлы");
      }
    } catch {
      setError("Ошибка загрузки файлов");
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => { void refetchFiles(); }, [userId, currentProjectId]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const menu = document.getElementById("ctx-menu");
      if (menu && !menu.contains(e.target as Node)) { setContextMenuPos(null); setSelectedFileId(null); }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filteredFiles = projectFiles.filter(f => f.fileName.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !currentProjectId || !userId) return;
    for (const file of Array.from(files)) {
      await apiService.PostProjectFile(currentProjectId, file, userId);
    }
    await refetchFiles();
  };

  const handleOpenFile = async (file: ProjectFile) => {
    try {
      const cached = fileCacheRef.current.get(file.id);
      if (cached) { await openFileInViewer({ file: cached, url: URL.createObjectURL(cached), fileId: file.id, projectId: currentProjectId }); return; }
      const result = await apiService.DownloadFilesZip(currentProjectId);
      if (!result.success || !result.data) return;
      const zip = await JSZip.loadAsync(result.data);
      const entry = zip.file(file.fileName);
      if (!entry) return;
      const blob = await entry.async("blob");
      const opened = new File([blob], file.fileName, { type: "application/octet-stream" });
      fileCacheRef.current.set(file.id, opened);
      await openFileInViewer({ file: opened, url: URL.createObjectURL(opened), fileId: file.id, projectId: currentProjectId });
    } catch (err) { console.error(err); }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm("Удалить файл?")) return;
    const result = await apiService.DeleteProjectFile(fileId);
    if (!result?.error) { await refetchFiles(); setSelectedFileId(null); setContextMenuPos(null); }
  };

  const handleRenameFile = async (fileId: number, current: string) => {
    const newName = prompt("Новое имя файла:", current);
    if (newName && newName.trim() && newName !== current) {
      await apiService.RenameProjectFile(fileId, newName.trim());
      setProjectFiles(prev => prev.map(f => f.id === fileId ? { ...f, fileName: newName.trim() } : f));
    }
    setContextMenuPos(null);
    setSelectedFileId(null);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", color: "#e2e8f0" }}
      onClick={() => { setContextMenuPos(null); setSelectedFileId(null); }}>
      <Header centralString={currentProjectTitle} backHref="/projects" />

      <main style={{ paddingTop: 72, maxWidth: 1100, margin: "0 auto", padding: "72px 32px 48px" }}>
        {/* Page header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: -0.5 }}>Файлы проекта</h1>
            {currentProjectTitle && <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>{currentProjectTitle}</p>}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative" }}>
              <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                width="14" height="14" fill="none" stroke="#64748b" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" placeholder="Поиск файла..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                style={{ padding: "9px 12px 9px 32px", background: "#131720", border: "1px solid #2d3748", borderRadius: 8, color: "#f1f5f9", fontSize: 13, outline: "none", width: 220 }}
                onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                onBlur={e => { e.target.style.borderColor = "#2d3748"; }} />
            </div>
            <label>
              <input id="file-upload" type="file" multiple accept="*" onChange={e => void handleFileUpload(e.target.files)} style={{ display: "none" }} />
              <button type="button"
                onClick={() => document.getElementById("file-upload")?.click()}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 16px", background: "linear-gradient(135deg,#3b82f6,#2563eb)",
                  color: "#fff", border: "none", borderRadius: 9, cursor: "pointer",
                  fontSize: 13, fontWeight: 600, boxShadow: "0 2px 8px rgba(59,130,246,0.25)",
                }}>
                <svg width="14" height="14" fill="none" stroke="#fff" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Добавить файл
              </button>
            </label>
          </div>
        </div>

        {/* Drop zone overlay */}
        {isDragging && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(59,130,246,0.12)", border: "2px dashed #3b82f6", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ background: "#131720", border: "1px solid #3b82f6", borderRadius: 16, padding: "32px 48px", textAlign: "center" }}>
              <svg width="36" height="36" fill="none" stroke="#3b82f6" viewBox="0 0 24 24" style={{ margin: "0 auto 12px" }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p style={{ color: "#60a5fa", fontWeight: 600, fontSize: 15, margin: 0 }}>Отпустите файлы для загрузки</p>
            </div>
          </div>
        )}

        {isLoadingFiles ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
            <ClipLoader size={36} color="#3b82f6" loading />
          </div>
        ) : error ? (
          <div style={{ background: "#1c1215", border: "1px solid #7f1d1d", borderRadius: 10, padding: "16px 20px", color: "#fca5a5", fontSize: 14 }}>{error}</div>
        ) : filteredFiles.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 80, gap: 14 }}>
            <div style={{ width: 60, height: 60, borderRadius: 14, background: "#131720", border: "1px solid #1e2433", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="26" height="26" fill="none" stroke="#475569" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>{searchTerm ? "Файлы не найдены" : "Нет файлов. Загрузите первый файл."}</p>
          </div>
        ) : (
          <div style={{ background: "#131720", border: "1px solid #1e2433", borderRadius: 14, overflow: "hidden" }}
            className="animate-fade-in"
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); void handleFileUpload(e.dataTransfer.files); }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 80px 100px 40px", gap: 0, padding: "10px 20px", borderBottom: "1px solid #1e2433", background: "#0f1117" }}>
              {["Имя файла", "Изменён", "Тип", "Размер", ""].map((h, i) => (
                <div key={i} style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</div>
              ))}
            </div>

            {/* Rows */}
            {filteredFiles.map((file) => {
              const ext = getExt(file.fileName);
              const color = extColor(ext);
              const isSelected = selectedFileId === file.id;
              return (
                <div key={file.id}
                  onClick={(e) => { e.stopPropagation(); setSelectedFileId(file.id); setContextMenuPos({ x: e.clientX, y: e.clientY }); }}
                  onDoubleClick={() => void handleOpenFile(file)}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 140px 80px 100px 40px", gap: 0,
                    padding: "12px 20px", borderBottom: "1px solid #1e2433",
                    background: isSelected ? "#1a2030" : "transparent",
                    cursor: "pointer", alignItems: "center",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#151b26"; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Name */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                      background: `${color}18`, border: `1px solid ${color}30`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700, color, letterSpacing: 0.3,
                    }}>
                      {ext.slice(0, 4)}
                    </div>
                    <span style={{ fontSize: 13, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {truncate(file.fileName)}
                    </span>
                  </div>
                  {/* Date */}
                  <div style={{ fontSize: 12, color: "#64748b" }}>{fmtDate(file.lastModified)}</div>
                  {/* Type badge */}
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 600, color, background: `${color}18`, border: `1px solid ${color}30`, borderRadius: 6, padding: "2px 7px", letterSpacing: 0.3 }}>
                      {ext}
                    </span>
                  </div>
                  {/* Size */}
                  <div style={{ fontSize: 12, color: "#64748b" }}>{fmtSize(file.fileSize)}</div>
                  {/* Open btn */}
                  <div>
                    <button
                      onClick={e => { e.stopPropagation(); void handleOpenFile(file); }}
                      title="Открыть"
                      style={{ background: "none", border: "1px solid #2d3748", borderRadius: 7, padding: "5px 8px", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.color = "#60a5fa"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "#2d3748"; e.currentTarget.style.color = "#64748b"; }}
                    >
                      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Context menu */}
      {contextMenuPos && selectedFileId !== null && (() => {
        const file = projectFiles.find(f => f.id === selectedFileId);
        if (!file) return null;
        return (
          <div id="ctx-menu" className="animate-fade-in"
            style={{
              position: "fixed", top: contextMenuPos.y, left: contextMenuPos.x,
              background: "#131720", border: "1px solid #1e2433",
              borderRadius: 10, padding: 4, zIndex: 9999, width: 180,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
            onClick={e => e.stopPropagation()}>
            {[
              { label: "Открыть", icon: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14", action: () => { void handleOpenFile(file); setContextMenuPos(null); setSelectedFileId(null); }, danger: false },
              { label: "Переименовать", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z", action: () => void handleRenameFile(file.id, file.fileName), danger: false },
              { label: "Удалить", icon: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16", action: () => void handleDeleteFile(file.id), danger: true },
            ].map(item => (
              <button key={item.label} onClick={item.action}
                style={{ width: "100%", background: "none", border: "none", color: item.danger ? "#ef4444" : "#e2e8f0", padding: "8px 12px", textAlign: "left", fontSize: 13, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", gap: 9 }}
                onMouseEnter={e => { e.currentTarget.style.background = item.danger ? "#1c1215" : "#1e2433"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                {item.label}
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
};

export default Page;
