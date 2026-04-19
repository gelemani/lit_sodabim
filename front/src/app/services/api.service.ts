import axios, { AxiosInstance } from "axios";
import {
  API_URL,
  API_HEADERS,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  ApiResponse,
  Project,
  ProjectFile,
  StoredUserInfo,
  API_PREFIX,
  ProjectCreate,
} from "../config/api";

interface Comment {
  id: number;
  text: string;
  elementName: string;
  elementId: number;
  userId: number;
  userName: string;
  createdAt: string;
}

interface PreservedResponse<T> {
  $id: string;
  $values?: T[];
  total?: number;
  users?: T[] | { $id: string; $values: T[] };
  projects?: T[] | { $id: string; $values: T[] };
  data?: T[];
}

const isClient = typeof window !== "undefined";

class ApiService {
  private authToken: string | null | undefined = null;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_URL,
      headers: API_HEADERS,
    });
    console.log("API_URL:", API_URL);

    // Добавляем интерсептор для добавления токена авторизации
    this.axiosInstance.interceptors.request.use((config) => {
      if (this.authToken) {
        config.headers.Authorization = `Bearer ${this.authToken}`;
      }
      return config;
    });
  }

  async login(data: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await this.axiosInstance.post<ApiResponse<AuthResponse>>(
        `${API_PREFIX}/Auth/login`,
        data,
      );

      if (response.data.success && response.data.data) {
        this.authToken = response.data.data.token;

        if (isClient) {
          localStorage.setItem("authToken", response.data.data.token ?? "");
          localStorage.setItem("token", response.data.data.token ?? "");
          localStorage.setItem("userId", String(response.data.data.userId));
          // Сохраняем все дополнительные поля
          if (response.data.data.companyName) {
            localStorage.setItem("companyName", response.data.data.companyName);
          }
          if (response.data.data.userSurname) {
            localStorage.setItem("userSurname", response.data.data.userSurname);
          }
          if (response.data.data.userName) {
            localStorage.setItem("userName", response.data.data.userName);
          }
          if (response.data.data.login) {
            localStorage.setItem("login", response.data.data.login);
          }
          if (response.data.data.email) {
            localStorage.setItem("email", response.data.data.email);
          }
          if (response.data.data.companyPosition) {
            localStorage.setItem(
              "companyPosition",
              response.data.data.companyPosition,
            );
          }
        }
      }
      return response.data;
    } catch (error: unknown) {
      console.error("Ошибка при запросе:", error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return {
            success: false,
            error:
              "Неавторизованный доступ. Пожалуйста, проверьте свои учетные данные.",
          };
        }
      }
      return {
        success: false,
        error: axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : "Неизвестная ошибка",
      };
    }
  }

  async register(
    userData: RegisterRequest,
    companyData?: { companyName: string; companyPosition: string },
  ): Promise<ApiResponse<AuthResponse>> {
    try {
      // Регистрация пользователя
      console.log("Данные для регистрации пользователя:", userData);
      const userResponse = await this.axiosInstance.post<
        ApiResponse<AuthResponse>
      >(`${API_PREFIX}/Auth/register`, userData);
      console.log("Ответ от сервера (пользователь):", userResponse.data);

      if (!userResponse.data.success || !userResponse.data.data?.token) {
        return {
          success: false,
          error: userResponse.data.error || "Ошибка регистрации пользователя",
        };
      }

      this.authToken = userResponse.data.data.token;
      if (isClient) {
        localStorage.setItem("authToken", this.authToken);
      }

      // Если данные компании предоставлены, регистрируем компанию
      if (companyData) {
        console.log("Данные для регистрации компании:", companyData);
        const companyResponse = await this.axiosInstance.post<
          ApiResponse<AuthResponse>
        >(`${API_PREFIX}/company/register`, companyData);
        console.log("Ответ от сервера (компания):", companyResponse.data);

        if (
          !companyResponse.data.success ||
          !companyResponse.data.data?.userId
        ) {
          return {
            success: false,
            error: companyResponse.data.error || "Ошибка регистрации компании",
          };
        }

        return {
          success: true,
          data: { ...companyResponse.data.data, token: this.authToken },
        };
      }

      return {
        success: true,
        data: { ...userResponse.data.data, token: this.authToken },
      };
    } catch (error) {
      console.log("Ошибка при регистрации:", error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 409) {
          const backendError = error.response?.data?.error;
          return {
            success: false,
            error:
              backendError === "User already exists"
                ? "User already exists"
                : backendError ||
                  "Пользователь с таким логином или email уже зарегистрирован",
          };
        } else if (error.response?.status === 401) {
          return {
            success: false,
            error: "Неавторизованный доступ. Пожалуйста, войдите в систему.",
          };
        }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Ошибка регистрации",
      };
    }
  }

  async getUserInfo(userId: number): Promise<ApiResponse<StoredUserInfo>> {
    try {
      console.log(
        `[ApiService] Запрос информации о пользователе с userId=${userId}`,
      );
      const response = await this.axiosInstance.get<StoredUserInfo>(
        `${API_PREFIX}/Auth/getinfo?id=${userId}`,
      );

      console.log("[ApiService] Полученный ответ:", response);
      const userInfo = response.data;

      if (!userInfo) {
        console.warn("[ApiService] В ответе отсутствуют данные пользователя");
        return {
          success: false,
          error: "Данные пользователя отсутствуют в ответе сервера",
        };
      }

      if (isClient) {
        localStorage.setItem("userName", userInfo.userName || "");
        localStorage.setItem("userSurname", userInfo.userSurname || "");
        localStorage.setItem("companyName", userInfo.companyName || "");
        localStorage.setItem("companyPosition", userInfo.companyPosition || "");
        localStorage.setItem("login", userInfo.login || "");
        localStorage.setItem("email", userInfo.email || "");
        localStorage.setItem("password", userInfo.password || "");
        localStorage.setItem("confirmPassword", userInfo.confirmPassword || "");
      }

      return {
        success: true,
        data: userInfo,
      };
    } catch (error) {
      console.error(
        "[ApiService] Ошибка при получении информации о пользователе:",
        error,
      );
      return {
        success: false,
        error: axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : "Неизвестная ошибка",
      };
    }
  }

  // Инициализация аутентификации на клиентской стороне
  initializeAuth() {
    if (isClient) {
      const token =
        localStorage.getItem("token") ?? localStorage.getItem("authToken");
      if (token) {
        this.authToken = token;
      }
    }
  }

  async getMe(): Promise<ApiResponse<StoredUserInfo>> {
    try {
      const response = await this.axiosInstance.get<StoredUserInfo>(
        `${API_PREFIX}/Auth/me`,
      );
      const userInfo = response.data;

      if (!userInfo) {
        return {
          success: false,
          error: "Данные пользователя отсутствуют в ответе сервера",
        };
      }

      if (isClient) {
        localStorage.setItem("userId", String(userInfo.id));
        localStorage.setItem("userName", userInfo.userName || "");
        localStorage.setItem("userSurname", userInfo.userSurname || "");
        localStorage.setItem("companyName", userInfo.companyName || "");
        localStorage.setItem("companyPosition", userInfo.companyPosition || "");
        localStorage.setItem("login", userInfo.login || "");
        localStorage.setItem("email", userInfo.email || "");
      }

      return {
        success: true,
        data: {
          ...userInfo,
          password: "",
          confirmPassword: "",
        },
      };
    } catch (error) {
      return {
        success: false,
        error: axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : "Неизвестная ошибка",
      };
    }
  }

  logout() {
    this.authToken = null;
    if (isClient) {
      localStorage.removeItem("authToken");
      localStorage.removeItem("token");
      localStorage.removeItem("userId");
      localStorage.removeItem("userName");
      localStorage.removeItem("userSurname");
      localStorage.removeItem("companyName");
      localStorage.removeItem("companyPosition");
      localStorage.removeItem("email");
    }
  }

  async updateProfile(data: {
    userName: string;
    userSurname: string;
    email: string;
    companyName: string;
    companyPosition: string;
  }): Promise<ApiResponse<StoredUserInfo>> {
    try {
      const response = await this.axiosInstance.put<ApiResponse<StoredUserInfo>>(
        `${API_PREFIX}/Auth/profile`,
        data,
      );
      if (response.data.success && response.data.data && isClient) {
        localStorage.setItem("userName", response.data.data.userName ?? "");
        localStorage.setItem("userSurname", response.data.data.userSurname ?? "");
        localStorage.setItem("companyName", response.data.data.companyName ?? "");
        localStorage.setItem("companyPosition", response.data.data.companyPosition ?? "");
        localStorage.setItem("email", response.data.data.email ?? "");
      }
      return response.data;
    } catch (error) {
      return {
        success: false,
        error: axios.isAxiosError(error)
          ? error.response?.data?.error || error.message
          : "Ошибка обновления профиля",
      };
    }
  }

  async changePassword(data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<ApiResponse<void>> {
    try {
      const response = await this.axiosInstance.put<ApiResponse<void>>(
        `${API_PREFIX}/Auth/change-password`,
        data,
      );
      return response.data;
    } catch (error) {
      return {
        success: false,
        error: axios.isAxiosError(error)
          ? error.response?.data?.error || error.message
          : "Ошибка смены пароля",
      };
    }
  }

  async getAllUsers(): Promise<StoredUserInfo[]> {
    try {
      console.log("[ApiService] Fetching all users...");
      const response = await this.axiosInstance.get<
        PreservedResponse<StoredUserInfo>
      >(`${API_PREFIX}/Project/users`);
      console.log("[ApiService] Raw users response:", response);

      // Handle both regular and preserved reference formats
      let users: StoredUserInfo[] = [];
      if (Array.isArray(response.data)) {
        users = response.data;
      } else if (response.data.$values) {
        users = response.data.$values;
      } else if (response.data.users) {
        if (Array.isArray(response.data.users)) {
          users = response.data.users;
        } else if (response.data.users.$values) {
          users = response.data.users.$values;
        }
      }

      if (!Array.isArray(users)) {
        console.error(
          "[ApiService] Invalid users response format:",
          response.data,
        );
        return [];
      }

      return users.map((user) => ({
        ...user,
        password: "",
        confirmPassword: "",
        companyName: "",
        companyPosition: "",
      }));
    } catch (error) {
      console.error("[ApiService] Error in getAllUsers:", error);
      if (axios.isAxiosError(error)) {
        console.error("[ApiService] Error response:", error.response?.data);
      }
      return [];
    }
  }

  async getAllProjects(): Promise<Project[]> {
    try {
      console.log("[ApiService] Fetching all projects...");
      const response = await this.axiosInstance.get<PreservedResponse<Project>>(
        `${API_PREFIX}/Project/list`,
      );
      console.log("[ApiService] Raw projects response:", response);

      // Handle both regular and preserved reference formats
      let projects: Project[] = [];
      if (Array.isArray(response.data)) {
        projects = response.data;
      } else if (response.data.$values) {
        projects = response.data.$values;
      } else if (response.data.projects) {
        if (Array.isArray(response.data.projects)) {
          projects = response.data.projects;
        } else if (response.data.projects.$values) {
          projects = response.data.projects.$values;
        }
      }

      if (!Array.isArray(projects)) {
        console.error(
          "[ApiService] Invalid projects response format:",
          response.data,
        );
        return [];
      }

      return projects.map((project: Project & { userId?: number }) => ({
        ...project,
        creatorId: project.creatorId ?? project.userId ?? 0,
        title: project.title || "Без названия",
        accessLevel: project.accessLevel || "public",
        projectFiles: project.projectFiles || [],
        projectAccesses: project.projectAccesses ?? [],
        projectAccessCreate: project.projectAccessCreate ?? [],
      }));
    } catch (error) {
      console.error("[ApiService] Error in getAllProjects:", error);
      if (axios.isAxiosError(error)) {
        console.error("[ApiService] Error response:", error.response?.data);
      }
      return [];
    }
  }

  async getUserProjects(userId: string): Promise<ApiResponse<Project[]>> {
    try {
      console.log(`[ApiService] Fetching projects for user ${userId}...`);
      const response = await this.axiosInstance.get<PreservedResponse<Project>>(
        `${API_PREFIX}/Project?userId=${userId}`,
      );
      console.log("[ApiService] Raw user projects response:", response);

      // Handle both regular and preserved reference formats
      let projects: Project[] = [];
      if (response.data.$values) {
        projects = response.data.$values;
      } else if (Array.isArray(response.data)) {
        projects = response.data;
      }

      if (!Array.isArray(projects)) {
        console.error(
          "[ApiService] Invalid user projects response format:",
          response.data,
        );
        return {
          success: false,
          error: "Invalid response format",
        };
      }

      return {
        success: true,
        data: projects.map((project: Project & { userId?: number }) => ({
          ...project,
          creatorId: project.creatorId ?? project.userId ?? 0,
          title: project.title || "Без названия",
          accessLevel: project.accessLevel || "public",
          projectFiles: project.projectFiles || [],
          projectAccesses: project.projectAccesses ?? [],
          projectAccessCreate: project.projectAccessCreate ?? [],
        })),
      };
    } catch (error) {
      console.error("[ApiService] Error in getUserProjects:", error);
      if (axios.isAxiosError(error)) {
        console.error("[ApiService] Error response:", error.response?.data);
      }
      return {
        success: false,
        error: axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : "Unknown error",
      };
    }
  }

  async postUserProject(project: ProjectCreate): Promise<Project | undefined> {
    try {
      const body = {
        creatorId: project.creatorId,
        title: project.title,
        accessLevel: project.accessLevel,
        projectAccesses: project.projectAccesses?.map(a => ({ userId: a.userId, accessLevel: a.accessLevel })),
      };
      const response = await this.axiosInstance.post<Project>(
        `${API_PREFIX}/Project`,
        body,
      );
      return response.data;
    } catch (error) {
      console.error("Ошибка при создании проекта:", error);
      return undefined;
    }
  }

  async addProjectAccess(projectId: number, userId: number, accessLevel: string): Promise<void> {
    await this.axiosInstance.post(`${API_PREFIX}/Project/${projectId}/access`, { userId, accessLevel });
  }

  async removeProjectAccess(projectId: number, userId: number): Promise<void> {
    await this.axiosInstance.delete(`${API_PREFIX}/Project/${projectId}/access/${userId}`);
  }

  async putUserProject(
    projectId: number,
    project: Project,
  ): Promise<ApiResponse<Project>> {
    try {
      const body = {
        title: project.title,
        accessLevel: project.accessLevel,
        projectAccesses: project.projectAccesses?.map(a => ({ userId: a.userId, accessLevel: a.accessLevel })),
      };
      await this.axiosInstance.put(
        `${API_PREFIX}/Project/${projectId}`,
        body,
      );
      return { success: true };
    } catch (error) {
      console.error("[ApiService] Error updating project:", error);
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: error.response?.data?.message || "Failed to update project",
        };
      }
      return { success: false, error: "Failed to update project" };
    }
  }

  async deleteUserProject(projectId: number): Promise<ApiResponse<Project>> {
    try {
      const response = await this.axiosInstance.delete<ApiResponse<Project>>(
        `${API_PREFIX}/Project/${projectId}`,
      );
      console.log("Удаленный проект:", response.data);
      return response.data;
    } catch (error) {
      console.error("Ошибка при удалении проекта:", error);
      return {
        success: false,
        error: axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : "Неизвестная ошибка",
      };
    }
  }

  async getUserProjectFiles(
    userId: number,
    projectId: number,
  ): Promise<ApiResponse<ProjectFile[]>> {
    try {
      const response = await this.axiosInstance.get(
        `${API_PREFIX}/Project/${projectId}/files?userId=${userId}`,
      );
      const data = response.data;

      console.log("Полученные файлы проекта:", data);

      // Handle different response formats
      if (Array.isArray(data)) {
        return {
          success: true,
          data,
        };
      }

      // Handle preserved reference format
      if (data.$values && Array.isArray(data.$values)) {
        return {
          success: true,
          data: data.$values,
        };
      }

      // Handle standard ApiResponse format
      if (data.success !== undefined) {
        return data;
      }

      // If we get here, the format is unexpected
      console.error("Unexpected response format:", data);
      return {
        success: false,
        error: `Неверный формат ответа от сервера: ${JSON.stringify(data)}`,
      };
    } catch (error: unknown) {
      console.error("Ошибка при получении файлов проекта:", error);

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const errorMessage = error.response?.data?.message || error.message;
        console.error("Server error details:", {
          status,
          message: errorMessage,
          data: error.response?.data,
        });

        return {
          success: false,
          error: `Ошибка сервера (${status}): ${errorMessage}`,
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Неизвестная ошибка",
      };
    }
  }

  async PostProjectFile(
    projectId: number,
    file: File,
    userId: number,
  ): Promise<ApiResponse<ProjectFile | undefined>> {
    try {
      const formData = new FormData();
      formData.append("files", file);
      formData.append("userId", String(userId));

      const response = await this.axiosInstance.post<
        ApiResponse<ProjectFile | undefined>
      >(`${API_PREFIX}/Project/${projectId}/files`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log("Полученный файл:", response.data);
      return { success: true, data: (response.data as unknown) as ProjectFile | undefined };
    } catch (error) {
      console.error("Ошибка при загрузке файла:", error);
      return {
        success: false,
        error: axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : "Неизвестная ошибка",
      };
    }
  }

  async DownloadFilesZip(
    projectId: number,
  ): Promise<ApiResponse<Blob | undefined>> {
    try {
      const response = await this.axiosInstance.get<Blob>(
        `${API_PREFIX}/Project/${projectId}/files/download`,
        {
          responseType: "blob",
        },
      );
      console.log("Полученные файлы (blob):", response.data);
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error("Ошибка при загрузке файла:", error);
      return {
        success: false,
        error: axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : "Неизвестная ошибка",
      };
    }
  }

  // async DownloadFile(fileId: number): Promise<ApiResponse<Blob | undefined>> {
  //     try {
  //         const response = await this.axiosInstance.get<Blob>(`/Project/files/${fileId}/download`, {
  //             responseType: 'blob',
  //         });
  //         console.log("Полученный файл (blob):", response.data);
  //         return {
  //             success: true,
  //             data: response.data,
  //         };
  //     } catch (error) {
  //         console.error("Ошибка при загрузке файла:", error);
  //         return {
  //             success: false,
  //             error: axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Неизвестная ошибка',
  //         };
  //     }
  // }

  async DeleteProjectFile(
    fileId: number,
  ): Promise<ApiResponse<ProjectFile | undefined>> {
    try {
      await this.axiosInstance.delete(`${API_PREFIX}/Project/files/${fileId}`);
      console.log("Удаленный файл:", fileId);
      // Бэкенд возвращает 204 No Content без body
      return { success: true };
    } catch (error) {
      console.error("Ошибка при удалении файла проекта:", error);
      return {
        success: false,
        error: axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : "Неизвестная ошибка",
      };
    }
  }

  async RenameProjectFile(fileId: number, newFileName: string): Promise<void> {
    try {
      await this.axiosInstance.put(
        `${API_PREFIX}/Project/files/${fileId}/rename`,
        { NewFileName: newFileName },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      console.log("Имя файла обновлено");
    } catch (error) {
      console.error("Ошибка при обновлении имени файла:", error);
      throw error;
    }
  }

  async getIfcComments(
    projectId: number,
    fileId: number
  ): Promise<{ success: boolean; data?: Array<{ id: number; expressId: number; elementName: string; commentText: string; userId: number; createdAt: string; cameraPositionJson?: string; sketchSvg?: string }>; error?: string }> {
    try {
      const response = await this.axiosInstance.get(
        `${API_PREFIX}/Project/ifc-comments?projectId=${projectId}&fileId=${fileId}`
      );
      return { success: true, data: Array.isArray(response.data) ? response.data : [] };
    } catch (error) {
      console.error("Error getting IFC comments:", error);
      return {
        success: false,
        error: axios.isAxiosError(error) ? error.response?.data?.message || error.message : "Unknown error",
      };
    }
  }

  async postIfcComment(
    projectId: number,
    fileId: number,
    comment: { expressId: number; elementName: string; elementDataJson?: string; commentText: string; userId: number; cameraPositionJson?: string; sketchSvg?: string }
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const response = await this.axiosInstance.post(`${API_PREFIX}/Project/ifc-comments`, {
        projectId,
        projectFileId: fileId,
        expressId: comment.expressId,
        elementName: comment.elementName,
        elementDataJson: comment.elementDataJson,
        commentText: comment.commentText,
        userId: comment.userId,
        cameraPositionJson: comment.cameraPositionJson,
        sketchSvg: comment.sketchSvg,
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error("Error posting IFC comment:", error);
      return {
        success: false,
        error: axios.isAxiosError(error) ? error.response?.data?.message || error.message : "Unknown error",
      };
    }
  }

  async addComment(
    fileId: number,
    comment: { text: string; elementName: string; elementId: number },
  ): Promise<ApiResponse<Comment>> {
    console.log("Adding comment:", { fileId, comment });
    try {
      const response = await this.axiosInstance.post<ApiResponse<Comment>>(
        `${API_PREFIX}/Project/files/${fileId}/comments`,
        comment,
      );
      console.log("Add comment response:", response.data);
      return response.data;
    } catch (error) {
      console.error("Error adding comment:", error);
      if (axios.isAxiosError(error)) {
        console.error("Error details:", {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers,
        });
      }
      throw error;
    }
  }

  async getComments(fileId: number): Promise<ApiResponse<Comment[]>> {
    console.log("Getting comments for file:", fileId);
    try {
      const response = await this.axiosInstance.get<ApiResponse<Comment[]>>(
        `${API_PREFIX}/Project/files/${fileId}/comments`,
      );
      console.log("Get comments response:", response.data);
      return response.data;
    } catch (error) {
      console.error("Error getting comments:", error);
      if (axios.isAxiosError(error)) {
        console.error("Error details:", {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers,
        });
      }
      throw error;
    }
  }

  async deleteComment(
    fileId: number,
    commentId: number,
  ): Promise<ApiResponse<void>> {
    console.log("Deleting comment:", { fileId, commentId });
    try {
      const response = await this.axiosInstance.delete<ApiResponse<void>>(
        `${API_PREFIX}/Project/files/${fileId}/comments/${commentId}`,
      );
      console.log("Delete comment response:", response.data);
      return response.data;
    } catch (error) {
      console.error("Error deleting comment:", error);
      if (axios.isAxiosError(error)) {
        console.error("Error details:", {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers,
        });
      }
      throw error;
    }
  }

  async getProjectFiles(
    projectId: number,
  ): Promise<ApiResponse<ProjectFile[]>> {
    try {
      console.log(`[ApiService] Fetching files for project ${projectId}...`);
      const response = await this.axiosInstance.get(
          `${API_PREFIX}/Project/${projectId}/files`,
      );
      console.log("[ApiService] Raw response:", response);
      console.log(
          "[ApiService] Response data:",
          JSON.stringify(response.data, null, 2),
      );
      console.log("[ApiService] Response data type:", typeof response.data);
      console.log(
          "[ApiService] Response data keys:",
          Object.keys(response.data),
      );
      console.log("[ApiService] Response data.$values:", response.data.$values);
      console.log(
          "[ApiService] Response data.$values type:",
          typeof response.data.$values,
      );
      console.log(
          "[ApiService] Response data.$values is array:",
          Array.isArray(response.data.$values),
      );
      console.log(
          "[ApiService] Response data.$values length:",
          response.data.$values?.length,
      );

      // Try different response formats
      let files: ProjectFile[] = [];

      // Format 1: Direct array
      if (Array.isArray(response.data)) {
        console.log("[ApiService] Format 1: Direct array");
        files = response.data;
      }
      // Format 2: { $id: string, $values: ProjectFile[] }
      else if (response.data.$values) {
        console.log("[ApiService] Format 2: $values array");
        if (Array.isArray(response.data.$values)) {
          files = response.data.$values;
        } else if (typeof response.data.$values === "object") {
          // Handle case where $values might be an object with array properties
          const possibleArrays = Object.entries(response.data.$values)
              .filter(([_, value]) => Array.isArray(value))
              .map(([key, value]) => ({key, value}));

          if (possibleArrays.length > 0) {
            console.log("[ApiService] Found array in $values:", possibleArrays);
            files = possibleArrays[0].value as ProjectFile[];
          }
        }
      }
      // Format 3: { data: ProjectFile[] }
      else if (response.data.data && Array.isArray(response.data.data)) {
        console.log("[ApiService] Format 3: data array");
        files = response.data.data;
      }
      // Format 4: { files: ProjectFile[] }
      else if (response.data.files && Array.isArray(response.data.files)) {
        console.log("[ApiService] Format 4: files array");
        files = response.data.files;
      }
      // Format 5: { projectFiles: ProjectFile[] }
      else if (
          response.data.projectFiles &&
          Array.isArray(response.data.projectFiles)
      ) {
        console.log("[ApiService] Format 5: projectFiles array");
        files = response.data.projectFiles;
      }
      // Format 6: Single object with array properties
      else {
        console.log("[ApiService] Format 6: Checking for array properties");
        const possibleArrays = Object.entries(response.data)
            .filter(([_, value]) => Array.isArray(value))
            .map(([key, value]) => ({key, value}));

        if (possibleArrays.length > 0) {
          console.log("[ApiService] Found array properties:", possibleArrays);
          // Use the first array we find
          files = possibleArrays[0].value as ProjectFile[];
        }
      }

      console.log("[ApiService] Extracted files:", files);
      console.log("[ApiService] Files is array:", Array.isArray(files));
      console.log("[ApiService] Files length:", files.length);

      // If we have an empty array, that's valid - just return it
      if (Array.isArray(files)) {
        const processedFiles = files.map((file) => ({
          ...file,
          fileName: file.fileName || "Без названия",
          fileType: file.fileType || file.contentType || "unknown",
          fileSize: file.fileSize || 0,
          uploadDate:
              file.uploadDate || file.createdAt || new Date().toISOString(),
          userId: file.userId || 0,
          filePath: file.filePath || "",
        }));

        console.log("[ApiService] Processed files:", processedFiles);

        return {
          success: true,
          data: processedFiles,
        };
      }

      console.error(
          "[ApiService] Invalid project files response format:",
          response.data,
      );
      return {
        success: false,
        error: "Invalid response format",
      };
    } catch (error) {
      console.error("[ApiService] Error in getProjectFiles:", error);
      if (axios.isAxiosError(error)) {
        console.error("[ApiService] Error response:", error.response?.data);
        console.error("[ApiService] Error status:", error.response?.status);
        console.error("[ApiService] Error headers:", error.response?.headers);
      }
      return {
        success: false,
        error: axios.isAxiosError(error)
            ? error.response?.data?.message || error.message
            : "Unknown error",
      };
    }
  }

  async aiChat(message: string, elementProperties?: string): Promise<{ reply: string }> {
    const resp = await this.axiosInstance.post(`${API_PREFIX}/ai/chat`, { message, elementProperties });
    return resp.data as { reply: string };
  }
}

export const apiService = new ApiService();

// Инициализация аутентификации только на клиентской стороне
if (isClient) {
  apiService.initializeAuth();
}
