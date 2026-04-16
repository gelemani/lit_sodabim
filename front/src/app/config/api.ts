export const API_URL = "http://localhost:5080";
export const API_PREFIX = "api";

/* The `API_HEADERS` constant is defining an object that contains headers commonly used in HTTP
requests. In this case, the headers are specifying that the content type of the request body is JSON
(`'Content-Type': 'application/json'`) and that the client can accept JSON responses (`'Accept':
'application/json'`). These headers are typically included in requests to specify the format of the
data being sent or received. */
export const API_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "ngrok-skip-browser-warning": true,
};

export interface LoginRequest {
  login: string;
  password: string;
}

export interface RegisterRequest {
  login: string;
  userName: string;
  userSurname: string;
  email: string;
  password: string;
  companyName: string;
  companyPosition: string;
}

export interface AuthResponse {
  userId: number;
  token?: string;
  companyName?: string;
  userSurname?: string;
  userName?: string;
  login?: string;
  email?: string;
  companyPosition?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface StoredUserInfo {
  id: number;
  login: string;
  userName: string;
  userSurname: string;
  email: string;
  password: string;
  confirmPassword: string;
  companyName: string;
  companyPosition: string;
}

export interface Project {
  id: number;
  creatorId: number;
  title: string;
  createdAt: string;
  lastModified: string;
  accessLevel: string;
  projectFiles: ProjectFile[];
  projectAccesses: {
    userId: number;
    accessLevel: string;
    grantedAt: string;
  }[];
  projectAccessCreate?: ProjectAccessCreate[];
}

export interface ProjectFile {
  id: number;
  projectId: number;
  fileName: string;
  fileData: string; // base64 or omitted on frontend
  createdAt: string;
  lastModified: string;
  contentType: string;
  fileSize?: number;
  fileType?: string;
  uploadDate?: string;
  userId?: number;
  filePath?: string;
}

export interface ProjectAccess {
  id: number;
  projectId: number;
  userId: number;
  accessLevel: string;
  grantedAt: string;
  project: Project;
  StoredUserInfo: StoredUserInfo[];
}

export interface ProjectAccessCreate {
  userId: number;
  accessLevel: string;
  grantedAt: string;
}

export interface ProjectCreate {
  creatorId: number;
  title: string;
  createdAt: string;
  lastModified: string;
  accessLevel: string;
  projectFiles: ProjectFile[];
  projectAccesses: {
    userId: number;
    accessLevel: string;
    grantedAt: string;
  }[];
}
