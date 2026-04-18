"use client";

import { createContext, useContext } from "react";
import React, { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { apiService } from "@/app/services/api.service";
import { Project, StoredUserInfo } from "@/app/config/api";
import Header from "@/app/components/header";
import ClipLoader from "react-spinners/ClipLoader";
import Notification from "@/app/components/Notification";
import axios from "axios";

interface ProjectsPageProps {
  isAuthenticated: boolean;
  onSelectProject: (project: string) => void;
  companyName: string;
  registerData: { companyName: string };
}

interface UserContextType {
  companyName: string;
  userName: string;
}

const UserContext = createContext<UserContextType>({ companyName: "", userName: "" });
const useUserContext = () => useContext(UserContext);

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarBg(id: number): string {
  const pals = [
    "linear-gradient(135deg,#3b82f6,#8b5cf6)",
    "linear-gradient(135deg,#06b6d4,#3b82f6)",
    "linear-gradient(135deg,#8b5cf6,#ec4899)",
    "linear-gradient(135deg,#22c55e,#3b82f6)",
    "linear-gradient(135deg,#f97316,#ef4444)",
  ];
  return pals[id % pals.length];
}

function initials(name: string, surname: string) {
  return [(name || "?")[0], surname?.[0]].filter(Boolean).join("").toUpperCase();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", background: "#0f1117",
  border: "1px solid #2d3748", borderRadius: 8, color: "#f1f5f9",
  fontSize: 13, outline: "none", boxSizing: "border-box",
};

// ── Card skeleton ─────────────────────────────────────────────────────────────
const Skeleton = () => (
  <div style={{ background: "#131720", border: "1px solid #1e2433", borderRadius: 14, padding: 24, height: 160 }}>
    <div style={{ height: 16, width: "60%", background: "#1e2433", borderRadius: 6, marginBottom: 12, animation: "shimmer 1.5s infinite" }} />
    <div style={{ height: 12, width: "40%", background: "#1e2433", borderRadius: 4, marginBottom: 8 }} />
    <div style={{ height: 12, width: "80%", background: "#1e2433", borderRadius: 4 }} />
  </div>
);

// ── Main content ──────────────────────────────────────────────────────────────
const ProjectsPageContent = ({ onSelectProject = () => {} }: ProjectsPageProps) => {
  const router = useRouter();
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [allUsers, setAllUsers] = useState<StoredUserInfo[]>([]);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { companyName } = useUserContext();

  const currentUserId = typeof window !== "undefined" ? parseInt(localStorage.getItem("userId") || "0") : 0;

  const [newProject, setNewProject] = useState<Omit<Project, "id">>({
    creatorId: currentUserId,
    title: "",
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    accessLevel: "viewer",
    projectFiles: [],
    projectAccesses: [],
    projectAccessCreate: [],
  });

  const filteredProjects = projects.filter((p) =>
    p.title.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const refetchProjects = async () => {
    setIsLoading(true);
    try {
      const res = await apiService.getUserProjects(String(currentUserId));
      setProjects(res.success && Array.isArray(res.data) ? res.data : []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refetchProjects();
    void apiService.getAllUsers().then(users => {
      if (Array.isArray(users)) setAllUsers(users);
    });
  }, []);

  const handleSelectProject = (proj: Project) => {
    setSelectedProject(proj.title);
    onSelectProject(proj.title);
    localStorage.setItem("projectId", proj.id.toString());
    localStorage.setItem("projectTitle", proj.title);
    router.push(`/projectFiles?project=${encodeURIComponent(proj.title)}`);
  };

  const handleCreateProject = async (data: { title: string; accessLevel: string }) => {
    if (!data.title.trim()) { setNotification({ message: "Название не может быть пустым", type: "error" }); return; }
    try {
      const now = new Date().toISOString();
      const accesses = [...(newProject.projectAccessCreate ?? []).map(a => ({ userId: a.userId, accessLevel: a.accessLevel, grantedAt: now }))];
      if (!accesses.some(a => a.userId === currentUserId)) {
        accesses.push({ userId: currentUserId, accessLevel: "Admin", grantedAt: now });
      }
      const result = await apiService.postUserProject({
        creatorId: currentUserId, title: data.title,
        createdAt: now, lastModified: now,
        accessLevel: data.accessLevel === "private" ? "viewer" : data.accessLevel,
        projectFiles: [], projectAccesses: accesses,
      });
      if (!result) { setNotification({ message: "Не удалось создать проект", type: "error" }); return; }
      for (const file of selectedFiles) await apiService.PostProjectFile(result.id, file, currentUserId);
      await refetchProjects();
      setNotification({ message: `Проект "${data.title}" создан`, type: "success" });
      setShowProjectForm(false);
      setSelectedFiles([]);
    } catch (err) {
      if (axios.isAxiosError(err)) console.error(err.response?.data);
      setNotification({ message: "Не удалось создать проект", type: "error" });
    }
  };

  const handleEditProject = (proj: Project) => {
    const accessCreate = (proj.projectAccesses ?? [])
      .filter(a => a.userId !== proj.creatorId)
      .map(a => ({ userId: a.userId, accessLevel: a.accessLevel, grantedAt: a.grantedAt }));
    setNewProject({ ...proj, projectAccessCreate: accessCreate, projectAccesses: proj.projectAccesses ?? [] });
    setEditingProjectId(proj.id);
    setShowProjectForm(true);
  };

  const handleUpdateProject = async () => {
    if (editingProjectId === null) return;
    if (!newProject.title.trim()) { setNotification({ message: "Название не может быть пустым", type: "error" }); return; }
    const now = new Date().toISOString();
    try {
      const accesses = [...(newProject.projectAccessCreate ?? []).map(a => ({ userId: a.userId, accessLevel: a.accessLevel, grantedAt: now }))];
      if (!accesses.some(a => a.userId === currentUserId)) {
        accesses.push({ userId: currentUserId, accessLevel: "Admin", grantedAt: now });
      }
      const response = await apiService.putUserProject(editingProjectId, {
        id: editingProjectId, creatorId: newProject.creatorId, title: newProject.title,
        createdAt: newProject.createdAt, lastModified: now,
        accessLevel: newProject.accessLevel,
        projectFiles: [],
        projectAccesses: accesses,
      });
      if (!response.success) throw new Error(response.error);
      for (const file of selectedFiles) await apiService.PostProjectFile(editingProjectId, file, currentUserId);
      await refetchProjects();
      setNotification({ message: "Проект обновлён", type: "success" });
      setEditingProjectId(null);
      setShowProjectForm(false);
      setSelectedFiles([]);
    } catch {
      setNotification({ message: "Не удалось обновить проект", type: "error" });
    }
  };

  const handleDeleteProject = async (id: number) => {
    if (!confirm("Удалить проект?")) return;
    try {
      const res = await apiService.deleteUserProject(id);
      if (res.success) { await refetchProjects(); setActiveMenuId(null); }
      else throw new Error(res.error);
    } catch { setNotification({ message: "Не удалось удалить проект", type: "error" }); }
  };

  const getUserLabel = (uid: number) => {
    const u = allUsers.find(x => x.id === uid);
    return u ? [u.userName, u.userSurname].filter(Boolean).join(" ").trim() || u.email || `User ${uid}` : `User ${uid}`;
  };

  const openCreate = () => {
    setNewProject({ creatorId: currentUserId, title: "", createdAt: new Date().toISOString(), lastModified: new Date().toISOString(), accessLevel: "viewer", projectFiles: [], projectAccesses: [], projectAccessCreate: [] });
    setEditingProjectId(null);
    setShowProjectForm(true);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", color: "#e2e8f0" }}>
      {notification && (
        <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />
      )}
      <Header centralString={companyName} />

      <main style={{ paddingTop: 72, maxWidth: 1200, margin: "0 auto", padding: "72px 32px 48px" }}>
        {/* Page header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: -0.5 }}>Проекты</h1>
            {companyName && <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>{companyName}</p>}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative" }}>
              <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                width="15" height="15" fill="none" stroke="#64748b" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Поиск проекта..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ ...inp, paddingLeft: 34, width: 220, fontSize: 13 }}
                onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                onBlur={e => { e.target.style.borderColor = "#2d3748"; }}
              />
            </div>
            <button onClick={openCreate}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "9px 16px", background: "linear-gradient(135deg,#3b82f6,#2563eb)",
                color: "#fff", border: "none", borderRadius: 9, cursor: "pointer",
                fontSize: 13, fontWeight: 600, boxShadow: "0 2px 8px rgba(59,130,246,0.25)",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
            >
              <svg width="15" height="15" fill="none" stroke="#fff" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Создать проект
            </button>
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))", gap: 18 }}>
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} />)}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 96, gap: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "#131720", border: "1px solid #1e2433", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="28" height="28" fill="none" stroke="#475569" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3" />
              </svg>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8", margin: 0 }}>
                {searchTerm ? "Проекты не найдены" : "Нет проектов"}
              </p>
              <p style={{ fontSize: 13, color: "#475569", margin: "6px 0 0" }}>
                {searchTerm ? "Попробуйте другой запрос" : "Создайте первый проект"}
              </p>
            </div>
            {!searchTerm && (
              <button onClick={openCreate}
                style={{ padding: "9px 20px", background: "#1a1d24", border: "1px solid #2d3748", borderRadius: 9, color: "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                Создать проект
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))", gap: 18 }}
            className="animate-fade-in">
            {filteredProjects.map((proj) => {
              const isOwner = proj.creatorId === currentUserId;
              const memberIds = [proj.creatorId, ...(proj.projectAccesses ?? []).filter(a => a.userId !== proj.creatorId).map(a => a.userId)];
              return (
                <div
                  key={proj.id}
                  className="glass-card"
                  style={{ padding: 20, cursor: "pointer", position: "relative" }}
                  onClick={() => handleSelectProject(proj)}
                >
                  {/* Actions menu */}
                  <div
                    style={{ position: "absolute", top: 14, right: 14, zIndex: 10 }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setActiveMenuId(prev => prev === proj.id ? null : proj.id)}
                      style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: "4px 6px", borderRadius: 6, lineHeight: 1 }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#1e2433"; e.currentTarget.style.color = "#e2e8f0"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#64748b"; }}
                    >
                      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </button>
                    {activeMenuId === proj.id && (
                      <>
                        <div onClick={() => setActiveMenuId(null)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                        <div className="animate-fade-in" style={{
                          position: "absolute", top: 32, right: 0,
                          background: "#131720", border: "1px solid #1e2433",
                          borderRadius: 10, padding: 4, width: 160, zIndex: 50,
                          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                        }}>
                          {isOwner ? (
                            <>
                              <button onClick={() => { handleEditProject(proj); setActiveMenuId(null); }}
                                style={{ width: "100%", background: "none", border: "none", color: "#e2e8f0", padding: "8px 12px", textAlign: "left", fontSize: 13, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                                onMouseEnter={e => { e.currentTarget.style.background = "#1e2433"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "none"; }}>
                                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                Редактировать
                              </button>
                              <button onClick={() => void handleDeleteProject(proj.id)}
                                style={{ width: "100%", background: "none", border: "none", color: "#ef4444", padding: "8px 12px", textAlign: "left", fontSize: 13, borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                                onMouseEnter={e => { e.currentTarget.style.background = "#1c1215"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "none"; }}>
                                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                Удалить
                              </button>
                            </>
                          ) : (
                            <div style={{ padding: "8px 12px", fontSize: 12, color: "#64748b" }}>
                              Доступ: {proj.accessLevel}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Card body */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      background: "linear-gradient(135deg,#1e3a5f,#1e2d52)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "1px solid #2d3d6b",
                    }}>
                      <svg width="18" height="18" fill="none" stroke="#60a5fa" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                          {proj.title}
                        </h3>
                        {!isOwner && (
                          <span style={{ fontSize: 10, padding: "2px 7px", background: "rgba(59,130,246,0.15)", color: "#60a5fa", borderRadius: 10, border: "1px solid rgba(59,130,246,0.25)", flexShrink: 0 }}>
                            Shared
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: "#475569", margin: "3px 0 0" }}>
                        Изменён {fmtDate(proj.lastModified)}
                      </p>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {/* Member avatars */}
                    <div style={{ display: "flex", alignItems: "center" }}>
                      {memberIds.slice(0, 4).map((uid, i) => {
                        const u = allUsers.find(x => x.id === uid);
                        const ini = initials(u?.userName ?? "", u?.userSurname ?? "");
                        return (
                          <div key={uid} title={getUserLabel(uid)}
                            style={{
                              width: 24, height: 24, borderRadius: "50%", fontSize: 9, fontWeight: 700, color: "#fff",
                              background: avatarBg(uid),
                              display: "flex", alignItems: "center", justifyContent: "center",
                              border: "2px solid #131720",
                              marginLeft: i === 0 ? 0 : -6, zIndex: memberIds.length - i,
                            }}>
                            {ini}
                          </div>
                        );
                      })}
                      {memberIds.length > 4 && (
                        <div style={{ width: 24, height: 24, borderRadius: "50%", fontSize: 9, fontWeight: 700, color: "#94a3b8", background: "#1e2433", border: "2px solid #131720", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: -6 }}>
                          +{memberIds.length - 4}
                        </div>
                      )}
                    </div>

                    {/* File count */}
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748b" }}>
                      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {(proj.projectFiles ?? []).length} файлов
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal */}
      {showProjectForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowProjectForm(false); }}>
          <div className="animate-fade-in"
            style={{ background: "#131720", border: "1px solid #1e2433", borderRadius: 16, padding: 28, width: "100%", maxWidth: 500, color: "#e2e8f0", boxShadow: "0 24px 64px rgba(0,0,0,0.6)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>
                {editingProjectId ? "Редактировать проект" : "Новый проект"}
              </h2>
              <button onClick={() => setShowProjectForm(false)}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 20, padding: "0 4px", lineHeight: 1 }}>&times;</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 5 }}>Название проекта</label>
                <input type="text" placeholder="Жилой комплекс «Заря»"
                  style={inp} value={newProject.title}
                  onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                  onFocus={e => { e.target.style.borderColor = "#3b82f6"; }}
                  onBlur={e => { e.target.style.borderColor = "#2d3748"; }} />
              </div>

              <div>
                <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 5 }}>Добавить участников</label>
                <select
                  style={{ ...inp, color: "#94a3b8" }}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id && !(newProject.projectAccessCreate ?? []).some(a => a.userId === id)) {
                      setNewProject({ ...newProject, projectAccessCreate: [...(newProject.projectAccessCreate ?? []), { userId: id, accessLevel: "viewer", grantedAt: new Date().toISOString() }] });
                    }
                  }}
                  value=""
                  aria-label="Выберите пользователя">
                  <option value="" disabled>Выберите пользователя...</option>
                  {allUsers.filter(u => !(newProject.projectAccessCreate ?? []).some(a => a.userId === u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.userName} {u.userSurname} ({u.email})</option>
                  ))}
                </select>

                {(newProject.projectAccessCreate ?? []).length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {(newProject.projectAccessCreate ?? []).map((ua) => {
                      const u = allUsers.find(x => x.id === ua.userId);
                      return (
                        <div key={ua.userId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f1117", border: "1px solid #1e2433", borderRadius: 8, padding: "7px 10px" }}>
                          <span style={{ fontSize: 13, color: "#e2e8f0" }}>{u?.userName} {u?.userSurname}</span>
                          <button onClick={() => setNewProject({ ...newProject, projectAccessCreate: (newProject.projectAccessCreate ?? []).filter(x => x.userId !== ua.userId) })}
                            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* File drop */}
              <div>
                <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 5 }}>Файлы проекта</label>
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
                  onDrop={e => { e.preventDefault(); setIsDragging(false); setSelectedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}
                  style={{
                    border: `2px dashed ${isDragging ? "#3b82f6" : "#2d3748"}`,
                    borderRadius: 10, padding: "20px 16px", textAlign: "center",
                    background: isDragging ? "rgba(59,130,246,0.05)" : "transparent",
                    transition: "all 0.15s",
                  }}>
                  <input type="file" multiple onChange={e => { if (e.target.files) setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} className="hidden" id="fileInput" />
                  <label htmlFor="fileInput" style={{ cursor: "pointer", fontSize: 13, color: "#3b82f6" }}>Выберите файлы</label>
                  <span style={{ fontSize: 13, color: "#475569" }}> или перетащите их сюда</span>
                </div>
                {selectedFiles.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {selectedFiles.map((f, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f1117", border: "1px solid #1e2433", borderRadius: 7, padding: "6px 10px" }}>
                        <span style={{ fontSize: 12, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                        <button onClick={() => setSelectedFiles(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16, padding: 0, flexShrink: 0, marginLeft: 8 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowProjectForm(false)}
                style={{ padding: "9px 20px", background: "transparent", border: "1px solid #2d3748", borderRadius: 9, color: "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                Отмена
              </button>
              <button
                onClick={() => {
                  if (editingProjectId !== null) void handleUpdateProject();
                  else void handleCreateProject({ title: newProject.title, accessLevel: newProject.accessLevel });
                }}
                style={{ padding: "9px 20px", background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                {editingProjectId ? "Сохранить" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Wrapper ───────────────────────────────────────────────────────────────────
const ProjectsPage = () => {
  const [companyName, setCompanyName] = useState("");
  const [userName, setUserName] = useState("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;
      const storedCompany = localStorage.getItem("companyName")?.trim() || "";
      const storedUser = localStorage.getItem("userName")?.trim() || "";
      const params = new URLSearchParams(window.location.search);
      const fromUrl = decodeURIComponent(params.get("companyName") || "").trim();
      let name = fromUrl || storedCompany;
      let uname = storedUser;
      if (!name || !uname) {
        try {
          const res = await apiService.getMe();
          if (!cancelled && res.success && res.data) {
            if (!name && res.data.companyName) name = res.data.companyName.trim();
            if (!uname && res.data.userName) uname = res.data.userName.trim();
            if (res.data.companyName) localStorage.setItem("companyName", res.data.companyName);
            if (res.data.userName) localStorage.setItem("userName", res.data.userName);
          }
        } catch { /* keep localStorage */ }
      }
      if (!cancelled) { setCompanyName(name); setUserName(uname); setIsReady(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!isReady) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ClipLoader size={36} color="#3b82f6" loading />
      </div>
    );
  }

  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0f1117" }} />}>
      <UserContext.Provider value={{ companyName, userName }}>
        <ProjectsPageContent isAuthenticated onSelectProject={() => {}} companyName={companyName} registerData={{ companyName }} />
      </UserContext.Provider>
    </Suspense>
  );
};

export default ProjectsPage;
