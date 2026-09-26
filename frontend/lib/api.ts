import axios from "axios";

export type UserRole = "PRODUCT_MANAGER" | "INTERNAL_TEAM" | "CLIENT_GUEST";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department: string | null;
  clientTenantId: string | null;
  avatarUrl: string | null;
}

export interface ProjectTask {
  id: string;
  title: string;
  description: string;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  department: string;
  isClientVisible: boolean;
  isBlocked?: boolean;
  version?: number;
  assignee?: { id: string; name: string; email: string; avatarUrl?: string | null } | null;
  attachments?: Array<{ id: string; fileName: string }>; 
  comments?: Array<{ id: string; content: string; isInternal?: boolean }>; 
  prerequisites?: Array<{ id: string; prerequisiteTask?: { id: string; title: string; status: string } | null }>; 
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  clientTenantId?: string | null;
  metrics?: {
    totalTasks: number;
    completedTasks: number;
    blockedTasks: number;
    inProgressTasks: number;
    todoTasks: number;
    completionPercentage: string;
  };
  tasks: ProjectTask[];
}

const baseURL = process.env.NEXT_PUBLIC_BE_URL ?? "http://localhost:4000";

export const api = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

export function getAuthHeaders(token?: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function signIn(email: string, password: string) {
  const { data } = await api.post("/api/auth/login", { email, password });
  return data;
}

export async function signUp(payload: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department: string | null;
  clientTenantId?: string | null;
  avatarUrl?: string | null;
}) {
  const { data } = await api.post("/api/auth/register", payload);
  return data;
}

export async function fetchUsers(token: string) {
  const { data } = await api.get("/api/users", { headers: getAuthHeaders(token) });
  return data;
}

export async function createProject(
  token: string,
  payload: {
    name: string;
    description?: string;
    status?: "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
    clientTenantId?: string | null;
  },
) {
  const { data } = await api.post("/api/projects", payload, {
    headers: getAuthHeaders(token),
  });
  return data;
}

export async function addProjectMember(
  token: string,
  projectId: string,
  payload: { userId: string; roleInProject: string },
) {
  const { data } = await api.post(`/api/projects/${projectId}/members`, payload, {
    headers: getAuthHeaders(token),
  });
  return data;
}

export async function createTask(
  token: string,
  payload: {
    projectId: string;
    title: string;
    description?: string;
    department: string;
    assigneeId?: string | null;
    isClientVisible?: boolean;
    dependencies?: string[];
  },
) {
  const { data } = await api.post("/api/tasks", payload, {
    headers: getAuthHeaders(token),
  });
  return data;
}

export async function createTaskDependency(
  token: string,
  taskId: string,
  dependencies: string[],
) {
  const { data } = await api.post(
    `/api/tasks/${taskId}/dependencies`,
    { dependencies },
    { headers: getAuthHeaders(token) },
  );
  return data;
}

export async function createAttachment(
  token: string,
  taskId: string,
  payload: {
    fileName: string;
    fileUrl: string;
    fileType?: string;
    fileSize?: number;
  },
) {
  const { data } = await api.post(`/api/tasks/${taskId}/attachments`, payload, {
    headers: getAuthHeaders(token),
  });
  return data;
}

export async function fetchProjects(token: string) {
  const { data } = await api.get("/api/projects", { headers: getAuthHeaders(token) });
  return data;
}

export async function fetchProject(projectId: string, token: string) {
  const { data } = await api.get(`/api/projects/${projectId}`, { headers: getAuthHeaders(token) });
  return data;
}

export async function fetchTasks(token: string, projectId?: string) {
  const query = projectId ? `?projectId=${projectId}` : "";
  const { data } = await api.get(`/api/tasks${query}`, { headers: getAuthHeaders(token) });
  return data;
}

export async function updateTaskStatus(
  token: string,
  taskId: string,
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED",
  version?: number,
) {
  const { data } = await api.patch(
    `/api/tasks/${taskId}`,
    { status, version },
    { headers: getAuthHeaders(token) },
  );

  return data;
}
