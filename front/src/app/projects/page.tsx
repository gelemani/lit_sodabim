"use client";

import { createContext, useContext } from "react";
import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
} //qweqweqwwqeq

interface UserContextType {
  companyName: string;
  userName: string;
}

const UserContext = createContext<UserContextType>({
  companyName: "",
  userName: "",
});
const useUserContext = () => useContext(UserContext);

const ProjectsPageContent = ({
  onSelectProject = () => {},
}: ProjectsPageProps) => {
  const router = useRouter();
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const searchInputText: string = "Поиск проекта...";
  const [allUsers, setAllUsers] = useState<StoredUserInfo[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [newProject, setNewProject] = useState<Omit<Project, "id">>({
    creatorId: parseInt(localStorage.getItem("userId") || "0"),
    title: "",
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    accessLevel: "viewer",
    projectFiles: [],
    projectAccesses: [],
    projectAccessCreate: [],
  });
  const { companyName, userName } = useUserContext();
  const searchParams = useSearchParams();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleMenuToggle = (id: number) => {
    setActiveMenuId((prev) => (prev === id ? null : id));
  };

  const closeMenu = () => setActiveMenuId(null);

  const filteredProjects = projects.filter((proj) =>
    proj.title.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const refetchProjects = async () => {
    setIsLoading(true);
    try {
      const userIdRaw = localStorage.getItem("userId");
      const userId = userIdRaw ? Number(userIdRaw) : 0;
      const response = await apiService.getUserProjects(String(userId));
      if (response.success && Array.isArray(response.data)) {
        setProjects(response.data);
      } else {
        setProjects([]);
      }
    } catch (error) {
      console.error("[ProjectsPage] Error fetching projects:", error);
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  };

  const refetchAllData = async () => {
    try {
      const [projectsRes, usersRes] = await Promise.all([
        apiService.getAllProjects(),
        apiService.getAllUsers(),
      ]);
      if (Array.isArray(projectsRes)) setAllProjects(projectsRes);
      else setAllProjects([]);
      if (Array.isArray(usersRes)) setAllUsers(usersRes);
      else setAllUsers([]);
    } catch (error) {
      console.error("[ProjectsPage] Error fetching data:", error);
      setAllProjects([]);
      setAllUsers([]);
    }
  };

  useEffect(() => {
    void refetchProjects();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log("[ProjectsPage] Fetching all data...");
        const [projectsRes, usersRes] = await Promise.all([
          apiService.getAllProjects(),
          apiService.getAllUsers(),
        ]);
        console.log("[ProjectsPage] All projects:", projectsRes);
        console.log("[ProjectsPage] All users:", usersRes);

        if (Array.isArray(projectsRes)) {
          console.log("[ProjectsPage] Setting all projects:", projectsRes);
          setAllProjects(projectsRes);
        } else {
          console.error(
            "[ProjectsPage] Invalid projects response:",
            projectsRes,
          );
          setAllProjects([]);
        }

        if (Array.isArray(usersRes)) {
          console.log("[ProjectsPage] Setting all users:", usersRes);
          setAllUsers(usersRes);
        } else {
          console.error("[ProjectsPage] Invalid users response:", usersRes);
          setAllUsers([]);
        }
      } catch (error) {
        console.error("[ProjectsPage] Error fetching data:", error);
        setAllProjects([]);
        setAllUsers([]);
      }
    };
    void fetchData();
  }, []);

  const handleSelectProject = (project: string) => {
    setSelectedProject(project);
    onSelectProject(project);
    const foundProject = projects.find((p) => p.title === project);
    if (foundProject) {
      localStorage.setItem("projectId", foundProject.id.toString());
      localStorage.setItem("projectTitle", foundProject.title);
    } else {
      localStorage.setItem("projectTitle", project);
    }
    router.push(`/projectFiles?project=${encodeURIComponent(project)}`);
  };

  const handleCreateProject = async (data: {
    title: string;
    accessLevel: string;
  }) => {
    if (!data.title.trim()) {
      setNotification({
        message: "Название проекта не может быть пустым",
        type: "error",
      });
      return;
    }

    try {
      const userId = parseInt(localStorage.getItem("userId") || "0", 10);
      const now = new Date().toISOString();

      // Create project access entries
      const projectAccesses = (newProject.projectAccessCreate || []).map(
        (access) => ({
          userId: access.userId,
          accessLevel: access.accessLevel,
          grantedAt: now,
        }),
      );

      // Add creator as admin if not already included
      if (!projectAccesses.some((access) => access.userId === userId)) {
        projectAccesses.push({
          userId: userId,
          accessLevel: "Admin",
          grantedAt: now,
        });
      }

      const newProjectData = {
        creatorId: userId,
        title: data.title,
        createdAt: now,
        lastModified: now,
        accessLevel:
          data.accessLevel === "private" ? "viewer" : data.accessLevel,
        projectFiles: [],
        projectAccesses: projectAccesses,
      };

      console.log(
        "[ProjectsPage] Creating project with data:",
        JSON.stringify(newProjectData, null, 2),
      );
      const result = await apiService.postUserProject(newProjectData);

      if (!result) {
        console.error("Failed to create project");
        setNotification({
          message: "Не удалось создать проект. Пожалуйста, попробуйте снова.",
          type: "error",
        });
        return;
      }

      // Upload files if any were selected
      if (selectedFiles.length > 0) {
        console.log("[ProjectsPage] Uploading files:", selectedFiles.length);
        for (const file of selectedFiles) {
          const uploadResult = await apiService.PostProjectFile(
            result.id,
            file,
            userId,
          );
          if (!uploadResult.success) {
            console.error(
              "[ProjectsPage] Failed to upload file:",
              uploadResult.error,
            );
          }
        }
      }

      // Refresh projects list and all data
      await refetchProjects();
      await refetchAllData();
      const created = (
        await apiService.getUserProjects(String(userId))
      ).data?.find((p) => p.id === result.id);
      if (created) {
        localStorage.setItem("projectId", created.id.toString());
        localStorage.setItem("projectTitle", created.title);
      }

      // Show success message
      const addedUsersCount = projectAccesses.length - 1; // Subtract 1 for the creator
      setNotification({
        message: `Проект "${data.title}" успешно создан${addedUsersCount > 0 ? ` и доступ предоставлен ${addedUsersCount} пользователям` : ""}`,
        type: "success",
      });

      setShowProjectForm(false);
      setSelectedFiles([]);
    } catch (error) {
      console.error("[ProjectsPage] Error creating project:", error);
      if (axios.isAxiosError(error)) {
        console.error(
          "[ProjectsPage] Server error details:",
          error.response?.data,
        );
      }
      setNotification({
        message: "Не удалось создать проект. Пожалуйста, попробуйте снова.",
        type: "error",
      });
    }
  };

  const handleEditProject = (proj: Project) => {
    setNewProject({
      ...proj,
      projectAccessCreate: proj.projectAccessCreate ?? [],
      projectAccesses: proj.projectAccesses ?? [],
    });
    setEditingProjectId(proj.id);
    setShowProjectForm(true);
  };

  const handleUpdateProject = async () => {
    if (editingProjectId === null) return;

    if (!newProject.title.trim()) {
      setNotification({
        message: "Название проекта не может быть пустым",
        type: "error",
      });
      return;
    }

    const now = new Date().toISOString();
    const updatedProject: Project = {
      id: editingProjectId,
      creatorId: newProject.creatorId,
      title: newProject.title,
      createdAt: newProject.createdAt,
      lastModified: now,
      accessLevel:
        newProject.accessLevel === "private"
          ? "viewer"
          : newProject.accessLevel,
      projectFiles: Array.isArray(newProject.projectFiles)
        ? newProject.projectFiles
        : [],
      projectAccesses: (newProject.projectAccessCreate ?? []).map((access) => ({
        userId: access.userId,
        accessLevel: access.accessLevel,
        grantedAt: now,
      })),
    };

    try {
      console.log(
        "[ProjectsPage] Updating project with data:",
        JSON.stringify(updatedProject, null, 2),
      );
      const response = await apiService.putUserProject(
        editingProjectId,
        updatedProject,
      );

      if (!response.success) {
        throw new Error(response.error || "Failed to update project");
      }

      // Upload new files if any were selected
      if (selectedFiles.length > 0) {
        const userId = parseInt(localStorage.getItem("userId") || "0");
        for (const file of selectedFiles) {
          const uploadResult = await apiService.PostProjectFile(
            editingProjectId,
            file,
            userId,
          );
          if (!uploadResult.success) {
            console.error("Failed to upload file:", uploadResult.error);
          }
        }
      }

      // Refresh projects list and all data
      await refetchProjects();
      await refetchAllData();
      const updated = projects.find((p) => p.id === editingProjectId);
      if (updated) {
        localStorage.setItem("projectId", updated.id.toString());
        localStorage.setItem("projectTitle", updated.title);
      }

      setNotification({
        message: "Проект успешно обновлен",
        type: "success",
      });

      setEditingProjectId(null);
      setShowProjectForm(false);
      setSelectedFiles([]);
    } catch (error) {
      console.error("[ProjectsPage] Error updating project:", error);
      if (axios.isAxiosError(error)) {
        const errorMessage =
          error.response?.data?.message || "Не удалось обновить проект";
        setNotification({
          message: errorMessage,
          type: "error",
        });
      } else {
        setNotification({
          message: "Не удалось обновить проект. Пожалуйста, попробуйте снова.",
          type: "error",
        });
      }
    }
  };

  const handleDeleteProject = async (id: number) => {
    const confirmed = confirm("Удалить проект?");
    if (!confirmed) return;

    try {
      const response = await apiService.deleteUserProject(id);
      if (response.success) {
        await refetchProjects();
        await refetchAllData();
        setSearchTerm("");
        setActiveMenuId(null);
      } else {
        throw new Error(response.error || "Failed to delete project");
      }
    } catch (error) {
      console.error("Ошибка при удалении проекта:", error);
      // alert("Не удалось удалить проект. Пожалуйста, попробуйте снова.");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="p-8 bg-background-color text-text-color">
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
      <Header centralString={companyName} backHref="/" />

      <main className="mt-8">
        <div
          className="flex justify-center items-center mb-8 gap-4"
          style={{ marginTop: "44px" }}
        >
          <input
            type="text"
            placeholder={searchInputText}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 pr-10 w-full rounded-lg border border-gray-300 text-black"
          />
          <button
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            onClick={() => {
              setNewProject({
                creatorId: parseInt(localStorage.getItem("userId") || "0"),
                title: "",
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                accessLevel: "viewer",
                projectFiles: [],
                projectAccesses: [],
                projectAccessCreate: [],
              });
              setEditingProjectId(null);
              setShowProjectForm(true);
            }}
          >
            Создать проект
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <ClipLoader size={50} color={"#3B82F6"} loading={true} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.length === 0 ? (
              <div className="flex justify-center col-span-full">
                <p className="text-center text-lg">Проекты не найдены</p>
              </div>
            ) : (
              filteredProjects.map((proj) => (
                <div
                  key={proj.id}
                  className="relative bg-button-bg border border-button-hover p-6 rounded-lg transition transform hover:scale-105"
                >
                  {activeMenuId === proj.id && (
                    <div
                      onClick={closeMenu}
                      className="fixed inset-0 bg-black bg-opacity-30 z-40"
                    />
                  )}

                  <div className="absolute top-2 right-2 z-50">
                    <div className="relative">
                      <button
                        onClick={() => handleMenuToggle(proj.id)}
                        className="text-white text-xl font-bold px-2 focus:outline-none"
                      >
                        ⋯
                      </button>

                      {activeMenuId === proj.id && (
                        <div
                          className="flex flex-col absolute top-0 left-[-10.5rem] w-40 bg-white text-black rounded-xl shadow-xl z-50 overflow-hidden text-sm"
                          onMouseLeave={closeMenu}
                        >
                          {proj.creatorId ===
                          parseInt(localStorage.getItem("userId") || "0") ? (
                            <>
                              <button
                                className="px-4 py-3 text-left hover:bg-blue-500"
                                onClick={() => handleEditProject(proj)}
                              >
                                Редактировать
                              </button>
                              <button
                                className="px-4 py-3 text-left hover:bg-blue-500"
                                onClick={() => handleDeleteProject(proj.id)}
                              >
                                Удалить
                              </button>
                            </>
                          ) : (
                            <div className="px-4 py-3 text-left text-gray-500">
                              Уровень доступа:{" "}
                              {proj.accessLevel === "private"
                                ? "viewer"
                                : proj.accessLevel}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    onClick={() => handleSelectProject(proj.title)}
                    className="cursor-pointer z-10 relative"
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="text-2xl font-semibold">{proj.title}</h3>
                      {proj.creatorId !==
                        parseInt(localStorage.getItem("userId") || "0") && (
                        <span className="px-2 py-1 text-xs bg-blue-500 text-white rounded-full">
                          Shared
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      ID пользователя: {proj.creatorId}
                    </p>
                    <div className="mt-4 text-sm text-gray-300">
                      <p>
                        <b>Создан:</b>{" "}
                        {new Date(proj.createdAt).toLocaleDateString()}
                      </p>
                      <p>
                        <b>Изменён:</b>{" "}
                        {new Date(proj.lastModified).toLocaleDateString()}
                      </p>
                      <p>
                        <b>Доступ:</b>{" "}
                        {proj.accessLevel === "private"
                          ? "viewer"
                          : proj.accessLevel}
                      </p>
                      <p>
                        <b>С доступом:</b>{" "}
                        {(() => {
                          const getUserName = (uid: number) => {
                            const u = allUsers.find((x) => x.id === uid);
                            return u ? [u.userName, u.userSurname].filter(Boolean).join(" ").trim() || u.email || `User ${uid}` : `User ${uid}`;
                          };
                          const parts = [
                            `${getUserName(proj.creatorId)} (владелец)`,
                            ...(proj.projectAccesses ?? [])
                              .filter((pa) => pa.userId !== proj.creatorId)
                              .map((pa) => `${getUserName(pa.userId)} (${pa.accessLevel})`),
                          ];
                          return parts.join(", ");
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {selectedProject && (
          <p className="text-center text-xl font-semibold mt-6">
            Выбран проект: <b>{selectedProject}</b>
          </p>
        )}

        {showProjectForm && (
          <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex justify-center items-center p-4 overflow-y-auto">
            <div
              style={{ background: "#242B35" }}
              className="rounded-lg p-4 sm:p-6 w-full max-w-[500px] text-white my-4"
            >
              <h2 className="text-xl font-semibold mb-4">
                {editingProjectId ? "Изменить проект" : "Создать проект"}
              </h2>

              <input
                type="text"
                placeholder="Название проекта (от 3 символов)"
                className="w-full mb-3 p-2 border border-gray-300 rounded text-black"
                value={newProject.title}
                onChange={(e) =>
                  setNewProject({ ...newProject, title: e.target.value })
                }
              />

              {/*                             <div className="mb-3">
                                <label className="block mb-2 font-medium">Уровень доступа:</label>
                                <div className="flex flex-col gap-2">
                                    {['viewer', 'public', 'admin'].map(level => (
                                        <label key={level} className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name="accessLevel"
                                                value={level}
                                                checked={newProject.accessLevel === level}
                                                onChange={(e) => setNewProject({
                                                    ...newProject,
                                                    accessLevel: e.target.value
                                                })}
                                            />
                                            {level.charAt(0).toUpperCase() + level.slice(1)}
                                        </label>
                                    ))}
                                </div>
                            </div>
 */}
              <div className="mb-4">
                <label className="block mb-2 font-medium">
                  Добавить пользователей:
                </label>
                <select
                  className="w-full p-2 border border-gray-300 rounded text-black"
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (
                      id &&
                      !(newProject.projectAccessCreate ?? []).some(
                        (ua) => ua.userId === id,
                      )
                    ) {
                      setNewProject({
                        ...newProject,
                        projectAccessCreate: [
                          ...(newProject.projectAccessCreate ?? []),
                          {
                            userId: id,
                            accessLevel: "viewer",
                            grantedAt: new Date().toISOString(),
                          },
                        ],
                      });
                    }
                  }}
                  value=""
                  aria-label="Выберите пользователя для добавления в проект"
                >
                  <option value="" disabled>
                    Выберите пользователя...
                  </option>
                  {allUsers
                    .filter(
                      (u) =>
                        !(newProject.projectAccessCreate ?? []).some(
                          (ua) => ua.userId === u.id,
                        ),
                    )
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.userName} {user.userSurname} ({user.email})
                      </option>
                    ))}
                </select>

                <div className="mt-2 max-h-32 overflow-y-auto">
                  {(newProject.projectAccessCreate ?? []).map((ua) => {
                    const user = allUsers.find((u) => u.id === ua.userId);
                    return (
                      <div
                        key={ua.userId}
                        className="flex justify-between items-center mt-1 bg-gray-700 p-2 rounded"
                      >
                        <div>
                          <span className="font-medium">
                            {user?.userName} {user?.userSurname}
                          </span>
                          <span className="text-sm text-gray-300 ml-2">
                            ({ua.accessLevel})
                          </span>
                        </div>
                        <button
                          className="text-red-400 hover:text-red-600"
                          onClick={() => {
                            setNewProject({
                              ...newProject,
                              projectAccessCreate: (
                                newProject.projectAccessCreate ?? []
                              ).filter((item) => item.userId !== ua.userId),
                            });
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mb-4">
                <label className="block mb-2 font-medium">Файлы проекта:</label>
                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center ${
                    isDragging
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-300"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    id="fileInput"
                  />
                  <label
                    htmlFor="fileInput"
                    className="cursor-pointer text-blue-500 hover:text-blue-600"
                  >
                    Выберите файлы
                  </label>
                  <span className="mx-2">или перетащите их сюда</span>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center mt-1 bg-gray-700 p-2 rounded"
                      >
                        <span className="text-sm truncate">{file.name}</span>
                        <button
                          className="text-red-400 hover:text-red-600 ml-2"
                          onClick={() => removeFile(index)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <button
                  className="px-4 py-2 bg-gray-500 rounded"
                  onClick={() => setShowProjectForm(false)}
                >
                  Отмена
                </button>
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  onClick={() => {
                    if (editingProjectId !== null) {
                      handleUpdateProject();
                    } else {
                      void handleCreateProject({
                        title: newProject.title,
                        accessLevel: newProject.accessLevel,
                      });
                    }
                  }}
                >
                  {editingProjectId ? "Сохранить" : "Создать"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

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
        const token =
          localStorage.getItem("token") ?? localStorage.getItem("authToken");
        const uid = parseInt(localStorage.getItem("userId") || "0", 10);
        try {
          if (token) {
            const res = await apiService.getMe();
            if (!cancelled && res.success && res.data) {
              if (!name && res.data.companyName)
                name = res.data.companyName.trim();
              if (!uname && res.data.userName)
                uname = res.data.userName.trim();
              if (res.data.companyName)
                localStorage.setItem("companyName", res.data.companyName);
              if (res.data.userName)
                localStorage.setItem("userName", res.data.userName);
            }
          } else if (uid > 0) {
            const res = await apiService.getUserInfo(uid);
            if (!cancelled && res.success && res.data) {
              if (!name && res.data.companyName)
                name = res.data.companyName.trim();
              if (!uname && res.data.userName)
                uname = res.data.userName.trim();
              if (res.data.companyName)
                localStorage.setItem("companyName", res.data.companyName);
              if (res.data.userName)
                localStorage.setItem("userName", res.data.userName);
            }
          }
        } catch {
          /* keep localStorage values */
        }
      }

      if (!cancelled) {
        setCompanyName(name);
        setUserName(uname);
        setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isReady) {
    return (
      <div className="flex justify-center items-center h-48">
        <ClipLoader size={50} color={"#3B82F6"} loading={true} />
      </div>
    );
  }

  return (
    <Suspense fallback={<div>Загрузка...</div>}>
      <UserContext.Provider value={{ companyName, userName }}>
        <ProjectsPageContent
          isAuthenticated={true}
          onSelectProject={() => {}}
          companyName={companyName}
          registerData={{ companyName }}
        />
      </UserContext.Provider>
    </Suspense>
  );
};

export default ProjectsPage;
