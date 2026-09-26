"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  addProjectMember,
  createAttachment,
  createProject,
  createTask,
  createTaskDependency,
  fetchProjects,
  fetchUsers,
  signIn,
  signUp,
  type Project,
  updateTaskStatus,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store";

const loginSchema = z.object({
  email: z.string().email("Email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["PRODUCT_MANAGER", "INTERNAL_TEAM", "CLIENT_GUEST"]),
  department: z.enum(["PM", "UIUX", "FRONTEND", "BACKEND", "CLIENT"]),
  clientTenantId: z.string().optional().or(z.literal("")),
  avatarUrl: z.string().url().optional().or(z.literal("")),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;
type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
const statusOrder: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];
const roleOptions = [
  { value: "PRODUCT_MANAGER", label: "Product Manager" },
  { value: "INTERNAL_TEAM", label: "Internal Team" },
  { value: "CLIENT_GUEST", label: "Client Guest" },
] as const;
const departmentOptions = [
  { value: "PM", label: "PM" },
  { value: "UIUX", label: "UI/UX" },
  { value: "FRONTEND", label: "Frontend" },
  { value: "BACKEND", label: "Backend" },
  { value: "CLIENT", label: "Client" },
] as const;

function getStatusClasses(status: string) {
  switch (status) {
    case "DONE":
      return "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-400/40 shadow-sm shadow-emerald-200";
    case "IN_PROGRESS":
      return "bg-blue-500/15 text-blue-800 ring-1 ring-blue-400/40 shadow-sm shadow-blue-200";
    case "BLOCKED":
      return "bg-orange-500/15 text-orange-800 ring-1 ring-orange-400/40 shadow-sm shadow-orange-200";
    default:
      return "bg-violet-500/10 text-violet-800 ring-1 ring-violet-300/40 shadow-sm shadow-violet-100";
  }
}

function getColumnTone(status: string) {
  switch (status) {
    case "DONE":
      return "from-emerald-100 via-white to-emerald-200/80 border-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]";
    case "IN_PROGRESS":
      return "from-blue-100 via-indigo-50 to-violet-200/80 border-blue-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]";
    case "BLOCKED":
      return "from-orange-100 via-amber-50 to-red-100 border-orange-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]";
    default:
      return "from-violet-100 via-white to-sky-100 border-violet-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]";
  }
}

function canTransitionToStatus(
  userRole: string,
  task: { status: TaskStatus; isBlocked?: boolean; assignee?: { id?: string } | null },
  nextStatus: TaskStatus,
  currentUserId?: string,
) {
  if (userRole === "CLIENT_GUEST") return false;

  if (userRole === "PRODUCT_MANAGER") {
    if (task.status === "IN_PROGRESS" && nextStatus === "DONE") {
      return false;
    }
    return true;
  }

  if (userRole === "INTERNAL_TEAM") {
    if (nextStatus === "IN_PROGRESS") {
      return !task.isBlocked;
    }

    if (nextStatus === "DONE") {
      return task.assignee?.id === currentUserId;
    }

    return true;
  }

  return false;
}

function AuthShell({
  activeMode,
  setActiveMode,
}: {
  activeMode: "login" | "register";
  setActiveMode: (mode: "login" | "register") => void;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(239,68,68,0.18),transparent_18%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.18),transparent_22%),radial-gradient(circle_at_bottom_left,_rgba(34,197,94,0.16),transparent_22%),linear-gradient(135deg,#f8fafc_0%,#eef9ff_35%,#f5f3ff_70%,#fff7ed_100%)] p-4 text-slate-800 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-[32px] border border-white/60 bg-white/70 shadow-[0_30px_140px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative hidden overflow-hidden bg-[linear-gradient(135deg,#0b1020_0%,#112a53_25%,#143d77_48%,#0f766e_68%,#7c3aed_100%)] p-8 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 animate-gradient opacity-80 bg-[radial-gradient(circle_at_top_right,_rgba(239,68,68,0.5),_transparent_22%),radial-gradient(circle_at_bottom_left,_rgba(34,197,94,0.38),_transparent_24%),radial-gradient(circle_at_center,_rgba(59,130,246,0.38),_transparent_34%)]" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100 shadow-lg shadow-cyan-500/10">
              NodeWave
            </div>
            <h1 className="mt-8 max-w-md text-4xl font-black leading-tight text-white">
              Deliver high-value projects with clarity.
            </h1>
            <p className="mt-4 max-w-md text-base text-slate-200">
              Manage tasks, dependencies, ownership, and client visibility from a single command center built for modern product teams.
            </p>
          </div>

          <div className="relative z-10 grid gap-4">
            {[
              { label: "Projects tracked", value: "12", tone: "from-red-500/25 via-orange-400/15 to-yellow-300/10", glow: "shadow-red-500/25" },
              { label: "Team delivery", value: "94%", tone: "from-blue-500/25 via-cyan-400/15 to-violet-300/10", glow: "shadow-blue-500/25" },
              { label: "Client visibility", value: "Live", tone: "from-emerald-500/25 via-teal-400/15 to-green-300/10", glow: "shadow-emerald-500/25" },
            ].map((item, index) => (
              <div
                key={item.label}
                className={`animate-float rounded-2xl border border-white/10 bg-gradient-to-br ${item.tone} p-4 backdrop-blur-sm ${item.glow} transition-all duration-500 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-2xl ${index === 1 ? "animation-delay-200" : index === 2 ? "animation-delay-400" : ""}`}
                style={{ animationDelay: `${index * 0.6}s` }}
              >
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-200">{item.label}</p>
                <p className="mt-2 text-2xl font-bold text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center p-5 sm:p-8">
          <div className="w-full max-w-xl">
            <div className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200/80 bg-[linear-gradient(90deg,rgba(255,255,255,0.9),rgba(240,248,255,0.9),rgba(248,250,252,0.9))] p-1 shadow-inner shadow-slate-200/80">
              <button
                type="button"
                onClick={() => setActiveMode("login")}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
                  activeMode === "login"
                    ? "bg-[linear-gradient(90deg,#0f172a_0%,#2563eb_35%,#8b5cf6_100%)] text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-600 hover:text-slate-800 hover:bg-white/70"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setActiveMode("register")}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
                  activeMode === "register"
                    ? "bg-[linear-gradient(90deg,#0f172a_0%,#2563eb_35%,#8b5cf6_100%)] text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-600 hover:text-slate-800 hover:bg-white/70"
                }`}
              >
                Create account
              </button>
            </div>

            {activeMode === "login" ? <LoginCard /> : <RegisterCard setActiveMode={setActiveMode} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginCard() {
  const setSession = useAuthStore((state) => state.setSession);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const mutation = useMutation({
    mutationFn: ({ email, password }: LoginForm) => signIn(email, password),
    onSuccess: (data) => {
      setSession(data.token, data.user);
    },
  });

  return (
    <div className="rounded-[28px] border border-indigo-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#edf7ff_25%,#f5f3ff_56%,#fff7ed_100%)] p-6 shadow-[0_20px_65px_rgba(59,130,246,0.18)] transition-all duration-500 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-[0_30px_90px_rgba(59,130,246,0.22)] sm:p-8 animate-hue">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-500">Welcome back</p>
        <h2 className="mt-2 text-3xl font-black text-slate-900">Access your workspace</h2>
      </div>

      <div className="mb-5 rounded-2xl border border-indigo-200 bg-[linear-gradient(90deg,rgba(239,68,68,0.08),rgba(59,130,246,0.10),rgba(34,197,94,0.10),rgba(168,85,247,0.08))] p-3 text-sm text-slate-700 shadow-sm shadow-blue-100">
        <span className="font-semibold text-indigo-700">Live workspace</span> · project insights updated in real time
      </div>

      <form className="space-y-5" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
          <input
            type="email"
            {...register("email")}
            defaultValue="pm@nodewave.id"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-300 hover:bg-white hover:shadow-sm focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            placeholder="name@company.com"
          />
          {errors.email && <p className="mt-2 text-xs text-red-600">{errors.email.message}</p>}
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
          <input
            type="password"
            {...register("password")}
            defaultValue="Password123!"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-300 hover:bg-white hover:shadow-sm focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            placeholder="••••••••"
          />
          {errors.password && <p className="mt-2 text-xs text-red-600">{errors.password.message}</p>}
        </div>

        {mutation.isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
            {mutation.error instanceof Error ? mutation.error.message : "Login failed."}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || mutation.isPending}
          className="animate-gradient w-full rounded-2xl bg-[linear-gradient(90deg,#0f172a_0%,#ef4444_18%,#2563eb_42%,#22c55e_68%,#7c3aed_100%)] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(59,130,246,0.28)] transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-[0_18px_40px_rgba(124,58,237,0.28)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {mutation.isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-semibold text-slate-700">Demo accounts</p>
        <div className="mt-2 space-y-1.5">
          <p>PM · pm@nodewave.id / Password123!</p>
          <p>Frontend · frontend@nodewave.id / Password123!</p>
          <p>Client · client@acmecorp.com / Password123!</p>
        </div>
      </div>
    </div>
  );
}

function RegisterCard({ setActiveMode }: { setActiveMode: (mode: "login" | "register") => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "Ari Wibowo",
      email: "ari@nodewave.id",
      password: "Password123!",
      role: "PRODUCT_MANAGER",
      department: "PM",
      clientTenantId: "",
      avatarUrl: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: RegisterForm) =>
      signUp({
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role,
        department: values.department,
        clientTenantId: values.clientTenantId?.trim() || null,
        avatarUrl: values.avatarUrl?.trim() || null,
      }),
    onSuccess: () => {
      setActiveMode("login");
    },
  });

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_65px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_25px_80px_rgba(99,102,241,0.12)] sm:p-8">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Create account</p>
        <h2 className="mt-2 text-3xl font-black text-slate-900">Join the project hub</h2>
      </div>

      <div className="mb-5 rounded-2xl border border-violet-200 bg-[linear-gradient(90deg,rgba(239,68,68,0.08),rgba(34,197,94,0.09),rgba(59,130,246,0.10),rgba(168,85,247,0.08))] p-3 text-sm text-slate-700 shadow-sm shadow-violet-100">
        <span className="font-semibold text-violet-700">New team member?</span> start with a clean project workspace
      </div>

      <form className="space-y-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Full name</label>
          <input
            type="text"
            {...register("name")}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-300 hover:bg-white hover:shadow-sm focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            placeholder="Ari Wibowo"
          />
          {errors.name && <p className="mt-2 text-xs text-red-600">{errors.name.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
            <input
              type="email"
              {...register("email")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-300 hover:bg-white hover:shadow-sm focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="name@company.com"
            />
            {errors.email && <p className="mt-2 text-xs text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
            <input
              type="password"
              {...register("password")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-300 hover:bg-white hover:shadow-sm focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="Minimum 6 characters"
            />
            {errors.password && <p className="mt-2 text-xs text-red-600">{errors.password.message}</p>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Role</label>
            <select
              {...register("role")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-300 hover:bg-white hover:shadow-sm focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Department</label>
            <select
              {...register("department")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-300 hover:bg-white hover:shadow-sm focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            >
              {departmentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Client tenant ID (optional)</label>
          <input
            type="text"
            {...register("clientTenantId")}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-300 hover:bg-white hover:shadow-sm focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            placeholder="tenant-acme-corp"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Avatar URL (optional)</label>
          <input
            type="url"
            {...register("avatarUrl")}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition-all duration-200 hover:border-blue-300 hover:bg-white hover:shadow-sm focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            placeholder="https://example.com/avatar.png"
          />
        </div>

        {mutation.isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
            {mutation.error instanceof Error ? mutation.error.message : "Registration failed."}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || mutation.isPending}
          className="animate-gradient w-full rounded-2xl bg-[linear-gradient(90deg,#0f172a_0%,#ef4444_16%,#22c55e_45%,#2563eb_72%,#7c3aed_100%)] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(99,102,241,0.28)] transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-[0_18px_40px_rgba(139,92,246,0.30)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {mutation.isPending ? "Creating account..." : "Create account"}
        </button>
      </form>
    </div>
  );
}

function Dashboard() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["projects", token],
    queryFn: () => fetchProjects(token as string),
    enabled: !!token,
  });

  const usersQuery = useQuery({
    queryKey: ["users", token],
    queryFn: () => fetchUsers(token as string),
    enabled: !!token && user?.role === "PRODUCT_MANAGER",
  });

  const mutation = useMutation({
    mutationFn: ({
      taskId,
      status,
      version,
    }: {
      taskId: string;
      status: TaskStatus;
      version?: number;
    }) => updateTaskStatus(token as string, taskId, status, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: () =>
      createProject(token as string, {
        name: projectDraft.name,
        description: projectDraft.description,
        status: projectDraft.status as "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED",
        clientTenantId: projectDraft.clientTenantId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setShowProjectForm(false);
      setProjectDraft({ name: "", description: "", status: "ACTIVE", clientTenantId: "" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: ({ projectId, payload }: { projectId: string; payload: any }) =>
      createTask(token as string, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ projectId, payload }: { projectId: string; payload: { userId: string; roleInProject: string } }) =>
      addProjectMember(token as string, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const dependencyMutation = useMutation({
    mutationFn: ({ taskId, dependencies }: { taskId: string; dependencies: string[] }) =>
      createTaskDependency(token as string, taskId, dependencies),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const attachmentMutation = useMutation({
    mutationFn: ({ taskId, payload }: { taskId: string; payload: { fileName: string; fileUrl: string; fileType?: string; fileSize?: number } }) =>
      createAttachment(token as string, taskId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectDraft, setProjectDraft] = useState({
    name: "",
    description: "",
    status: "ACTIVE",
    clientTenantId: "",
  });
  const [taskDrafts, setTaskDrafts] = useState<Record<string, { title: string; description: string; department: string; assigneeId: string; isClientVisible: boolean }>>({});
  const [memberDrafts, setMemberDrafts] = useState<Record<string, { userId: string; roleInProject: string }>>({});
  const [dependencyDrafts, setDependencyDrafts] = useState<Record<string, string>>({});
  const [attachmentDrafts, setAttachmentDrafts] = useState<Record<string, { fileName: string; fileUrl: string; fileType: string; fileSize: number }>>({});

  const projects = useMemo<Project[]>(() => data?.data ?? [], [data]);
  const users = useMemo(() => usersQuery.data?.data ?? [], [usersQuery.data]);

  const aggregate = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        const metrics = project.metrics ?? {
          totalTasks: project.tasks.length,
          completedTasks: project.tasks.filter((task) => task.status === "DONE").length,
          blockedTasks: project.tasks.filter((task) => task.status === "BLOCKED").length,
          inProgressTasks: project.tasks.filter((task) => task.status === "IN_PROGRESS").length,
          todoTasks: project.tasks.filter((task) => task.status === "TODO").length,
          completionPercentage: "0%",
        };

        acc.totalTasks += metrics.totalTasks;
        acc.completedTasks += metrics.completedTasks;
        acc.blockedTasks += metrics.blockedTasks;
        acc.inProgressTasks += metrics.inProgressTasks;
        acc.todoTasks += metrics.todoTasks;
        return acc;
      },
      { totalTasks: 0, completedTasks: 0, blockedTasks: 0, inProgressTasks: 0, todoTasks: 0 },
    );
  }, [projects]);

  const roleAccessMap = {
    PRODUCT_MANAGER: [
      "Create project",
      "Create task",
      "Assign member",
      "Define dependency",
      "Upload attachment",
      "Manage task status and delivery flow",
    ],
    INTERNAL_TEAM: [
      "Create task",
      "Update task progress",
      "Define dependency",
      "Upload attachment",
      "Review project workstream status",
    ],
    CLIENT_GUEST: [
      "View project snapshot",
      "Track client-visible tasks",
      "Monitor progress and milestones",
      "See masked internal details only when allowed",
    ],
  } as const;

  const roleSummary = {
    PRODUCT_MANAGER: {
      badge: "PM command",
      accent: "from-violet-500/15 via-indigo-50 to-sky-50",
      focus: "Portfolio planning, team assignment, and dependency orchestration.",
    },
    INTERNAL_TEAM: {
      badge: "Delivery team",
      accent: "from-emerald-500/15 via-teal-50 to-cyan-50",
      focus: "Task execution, dependency handling, and cross-functional delivery updates.",
    },
    CLIENT_GUEST: {
      badge: "Client view",
      accent: "from-amber-500/15 via-orange-50 to-yellow-50",
      focus: "High-level project visibility with client-safe masking for internal activity.",
    },
  } as const;

  const handleStatusUpdate = (taskId: string, nextStatus: TaskStatus, version?: number) => {
    mutation.mutate({ taskId, status: nextStatus, version });
  };

  if (!token || !user) {
    return <AuthShell activeMode="login" setActiveMode={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),transparent_22%),radial-gradient(circle_at_top_right,_rgba(168,85,247,0.16),transparent_24%),radial-gradient(circle_at_bottom_left,_rgba(249,115,22,0.14),transparent_20%),linear-gradient(180deg,#edf6ff_0%,#f5f3ff_30%,#fff7ed_100%)] text-slate-800">
      <header className="border-b border-indigo-200/80 bg-white/75 backdrop-blur-xl shadow-[0_10px_30px_rgba(99,102,241,0.08)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">NodeWave</p>
            <h2 className="text-xl font-bold text-slate-900">Delivery command center</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-violet-50 px-3 py-2 text-right shadow-sm shadow-indigo-100/80">
              <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-600">Logged in as</p>
              <p className="text-sm font-semibold text-slate-800">{user.name}</p>
            </div>
            <button
              type="button"
              onClick={clearSession}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-gradient-to-r hover:from-blue-50 hover:to-violet-50 hover:text-blue-700 hover:shadow-md hover:shadow-blue-100"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-indigo-200/80 bg-white/80 p-4 shadow-[0_20px_55px_rgba(99,102,241,0.12)] backdrop-blur-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Workspace operations</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">Project and delivery controls</h3>
            </div>

            {user.role === "PRODUCT_MANAGER" && (
              <button
                type="button"
                onClick={() => setShowProjectForm((value) => !value)}
                className="rounded-xl bg-[linear-gradient(90deg,#0f172a_0%,#2563eb_35%,#8b5cf6_100%)] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-300 hover:-translate-y-0.5"
              >
                {showProjectForm ? "Close" : "New project"}
              </button>
            )}
          </div>

          {user.role === "PRODUCT_MANAGER" && showProjectForm && (
            <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
              <input
                value={projectDraft.name}
                onChange={(event) => setProjectDraft((current) => ({ ...current, name: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="Project name"
              />
              <select
                value={projectDraft.status}
                onChange={(event) => setProjectDraft((current) => ({ ...current, status: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="PLANNING">PLANNING</option>
                <option value="ON_HOLD">ON_HOLD</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
              <input
                value={projectDraft.clientTenantId}
                onChange={(event) => setProjectDraft((current) => ({ ...current, clientTenantId: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 md:col-span-2"
                placeholder="Client tenant ID (optional)"
              />
              <textarea
                value={projectDraft.description}
                onChange={(event) => setProjectDraft((current) => ({ ...current, description: event.target.value }))}
                className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 md:col-span-2"
                placeholder="Project description"
              />
              <button
                type="button"
                onClick={() => createProjectMutation.mutate()}
                disabled={createProjectMutation.isPending || !projectDraft.name.trim()}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70 md:col-span-2"
              >
                {createProjectMutation.isPending ? "Creating..." : "Create project"}
              </button>
            </div>
          )}

          {user.role !== "CLIENT_GUEST" && (
            <div className="mt-4 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 p-3 text-sm text-slate-700">
              {user.role === "PRODUCT_MANAGER"
                ? "PM can create new projects, assign members, and oversee delivery dependencies."
                : "Delivery roles can manage task updates, dependency tracking, and attachment uploads from the project board."}
            </div>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total tasks", value: aggregate.totalTasks, tone: "from-sky-200/80 via-white to-blue-200/80", accent: "text-blue-700", delay: "0s" },
            { label: "Completed", value: aggregate.completedTasks, tone: "from-emerald-200/80 via-white to-teal-200/80", accent: "text-emerald-700", delay: "0.1s" },
            { label: "In progress", value: aggregate.inProgressTasks, tone: "from-violet-200/80 via-white to-indigo-200/80", accent: "text-violet-700", delay: "0.2s" },
            { label: "Blocked", value: aggregate.blockedTasks, tone: "from-amber-200/80 via-white to-orange-200/80", accent: "text-amber-700", delay: "0.3s" },
          ].map((item) => (
            <div
              key={item.label}
              className={`animate-float rounded-2xl border border-slate-200 bg-gradient-to-br ${item.tone} p-4 shadow-sm transition-all duration-500 hover:-translate-y-2 hover:scale-[1.02] hover:border-blue-300 hover:shadow-[0_22px_45px_rgba(59,130,246,0.16)]`}
              style={{ animationDelay: item.delay }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{item.label}</p>
              <p className={`mt-3 text-3xl font-bold ${item.accent}`}>{item.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-indigo-200/80 bg-white/80 p-4 shadow-[0_20px_55px_rgba(99,102,241,0.12)] backdrop-blur-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Role access</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">Brief-aligned workspace permissions</h3>
            </div>
            <span className="inline-flex w-fit items-center rounded-full bg-gradient-to-r from-blue-100 via-indigo-100 to-violet-100 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm shadow-blue-100">{user.role}</span>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
            <div className="grid gap-3 md:grid-cols-2">
              {(roleAccessMap[user.role] ?? roleAccessMap.PRODUCT_MANAGER).map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50 p-3 text-sm text-slate-700 shadow-sm">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-base text-emerald-700">✓</span>
                  <span className="font-medium">{item}</span>
                </div>
              ))}
            </div>

            <div className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${roleSummary[user.role].accent} p-4`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{roleSummary[user.role].badge}</p>
              <h4 className="mt-2 text-lg font-bold text-slate-900">Role focus</h4>
              <p className="mt-2 text-sm leading-6 text-slate-700">{roleSummary[user.role].focus}</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-indigo-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.92)_0%,rgba(239,246,255,0.94)_35%,rgba(245,243,255,0.95)_100%)] p-4 shadow-[0_20px_55px_rgba(99,102,241,0.12)] backdrop-blur-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Overview</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">Portfolio board</h3>
            </div>
            <div className="rounded-full bg-gradient-to-r from-blue-100 via-indigo-100 to-violet-100 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm shadow-blue-100">{user.role}</div>
          </div>

          {mutation.isError && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {mutation.error instanceof Error ? mutation.error.message : "An update failed."}
            </div>
          )}

          {isLoading && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-600">Loading project data…</div>
          )}

          {isError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
              {error instanceof Error ? error.message : "There was an error loading the board."}
            </div>
          )}

          {!isLoading && !isError && projects.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
              No projects are available for this account yet. Ask the PM to create a project or assign you to one.
            </div>
          )}

          {!isLoading && !isError && projects.length > 0 && (
            <div className="space-y-6">
              {projects.map((project) => (
                <div key={project.id} className="rounded-2xl border border-indigo-200 bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_32%,#f5f3ff_66%,#fff7ed_100%)] p-4 shadow-[0_16px_40px_rgba(99,102,241,0.08)] transition-all duration-500 hover:-translate-y-1 hover:border-violet-300 hover:shadow-[0_22px_48px_rgba(124,58,237,0.12)]">
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Project</p>
                      <h4 className="text-xl font-bold text-slate-900">{project.name}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">{project.status}</span>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        {project.metrics?.completionPercentage ?? "0%"} complete
                      </span>
                    </div>
                  </div>

                  {user.role === "PRODUCT_MANAGER" && (
                    <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
                      <select
                        value={memberDrafts[project.id]?.userId ?? ""}
                        onChange={(event) =>
                          setMemberDrafts((current) => ({
                            ...current,
                            [project.id]: { userId: event.target.value, roleInProject: current[project.id]?.roleInProject ?? "Contributor" },
                          }))
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                      >
                        <option value="">Select member</option>
                        {users
                          .filter((item: { id: string; role: string }) => item.id !== user.id)
                          .map((item: { id: string; name: string; role: string }) => (
                            <option key={item.id} value={item.id}>{item.name} ({item.role})</option>
                          ))}
                      </select>
                      <input
                        value={memberDrafts[project.id]?.roleInProject ?? "Contributor"}
                        onChange={(event) =>
                          setMemberDrafts((current) => ({
                            ...current,
                            [project.id]: { userId: current[project.id]?.userId ?? "", roleInProject: event.target.value },
                          }))
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                        placeholder="Role in project"
                      />
                      <button
                        type="button"
                        disabled={addMemberMutation.isPending || !memberDrafts[project.id]?.userId}
                        onClick={() => {
                          const payload = memberDrafts[project.id];
                          if (!payload?.userId) return;
                          addMemberMutation.mutate({
                            projectId: project.id,
                            payload: {
                              userId: payload.userId,
                              roleInProject: payload.roleInProject || "Contributor",
                            },
                          });
                        }}
                        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Add member
                      </button>
                    </div>
                  )}

                  {(user.role === "PRODUCT_MANAGER" || user.role === "INTERNAL_TEAM") && (
                    <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-5">
                      <input
                        value={taskDrafts[project.id]?.title ?? ""}
                        onChange={(event) =>
                          setTaskDrafts((current) => ({
                            ...current,
                            [project.id]: {
                              title: event.target.value,
                              description: current[project.id]?.description ?? "",
                              department: current[project.id]?.department ?? "FRONTEND",
                              assigneeId: current[project.id]?.assigneeId ?? "",
                              isClientVisible: current[project.id]?.isClientVisible ?? true,
                            },
                          }))
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 md:col-span-2"
                        placeholder="Task title"
                      />
                      <select
                        value={taskDrafts[project.id]?.department ?? "FRONTEND"}
                        onChange={(event) =>
                          setTaskDrafts((current) => ({
                            ...current,
                            [project.id]: {
                              title: current[project.id]?.title ?? "",
                              description: current[project.id]?.description ?? "",
                              department: event.target.value,
                              assigneeId: current[project.id]?.assigneeId ?? "",
                              isClientVisible: current[project.id]?.isClientVisible ?? true,
                            },
                          }))
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                      >
                        <option value="FRONTEND">FRONTEND</option>
                        <option value="BACKEND">BACKEND</option>
                        <option value="UIUX">UIUX</option>
                        <option value="PM">PM</option>
                      </select>
                      <select
                        value={taskDrafts[project.id]?.assigneeId ?? ""}
                        onChange={(event) =>
                          setTaskDrafts((current) => ({
                            ...current,
                            [project.id]: {
                              title: current[project.id]?.title ?? "",
                              description: current[project.id]?.description ?? "",
                              department: current[project.id]?.department ?? "FRONTEND",
                              assigneeId: event.target.value,
                              isClientVisible: current[project.id]?.isClientVisible ?? true,
                            },
                          }))
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                      >
                        <option value="">Assignee</option>
                        {users.map((item: { id: string; name: string }) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={createTaskMutation.isPending || !(taskDrafts[project.id]?.title ?? "").trim()}
                        onClick={() => {
                          const payload = taskDrafts[project.id];
                          if (!payload || !payload.title.trim()) return;
                          createTaskMutation.mutate({
                            projectId: project.id,
                            payload: {
                              projectId: project.id,
                              title: payload.title,
                              description: payload.description,
                              department: payload.department,
                              assigneeId: payload.assigneeId || null,
                              isClientVisible: payload.isClientVisible,
                              dependencies: [],
                            },
                          });
                          setTaskDrafts((current) => ({
                            ...current,
                            [project.id]: { title: "", description: "", department: "FRONTEND", assigneeId: "", isClientVisible: true },
                          }));
                        }}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Add task
                      </button>
                      <textarea
                        value={taskDrafts[project.id]?.description ?? ""}
                        onChange={(event) =>
                          setTaskDrafts((current) => ({
                            ...current,
                            [project.id]: {
                              title: current[project.id]?.title ?? "",
                              description: event.target.value,
                              department: current[project.id]?.department ?? "FRONTEND",
                              assigneeId: current[project.id]?.assigneeId ?? "",
                              isClientVisible: current[project.id]?.isClientVisible ?? true,
                            },
                          }))
                        }
                        className="min-h-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 md:col-span-5"
                        placeholder="Task description"
                      />
                    </div>
                  )}

                  <div className="grid gap-4 xl:grid-cols-4">
                    {statusOrder.map((status) => {
                      const tasks = project.tasks.filter((task) => task.status === status);

                      return (
                        <div key={`${project.id}-${status}`} className={`rounded-2xl border bg-gradient-to-br ${getColumnTone(status)} p-3 transition-all duration-500 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-[0_16px_32px_rgba(148,163,184,0.22)]`}>
                          <div className="mb-3 flex items-center justify-between">
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${getStatusClasses(status)}`}>
                              {status}
                            </span>
                            <span className="text-xs text-slate-500">{tasks.length}</span>
                          </div>

                          <div className="space-y-3">
                            {tasks.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-5 text-center text-xs text-slate-500">
                                No tasks
                              </div>
                            ) : (
                              tasks.map((task) => (
                                <div key={task.id} className="rounded-xl border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_50%,#eef2ff_100%)] p-3 transition-all duration-500 hover:-translate-y-1 hover:scale-[1.01] hover:border-indigo-300 hover:shadow-[0_12px_24px_rgba(99,102,241,0.12)]">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-800">{task.title}</p>
                                      <p className="mt-1 text-[11px] text-slate-500">{task.department}</p>
                                    </div>
                                    {task.isBlocked && (
                                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-medium text-amber-700">
                                        Blocked
                                      </span>
                                    )}
                                  </div>

                                  <p className="mt-2 text-xs text-slate-600">{task.description || "No description available."}</p>

                                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                                    <span>{task.assignee?.name ?? "Unassigned"}</span>
                                    <span>{task.attachments?.length ?? 0} files</span>
                                  </div>

                                  {task.prerequisites && task.prerequisites.length > 0 && (
                                    <div className="mt-2 text-[10px] text-amber-700">
                                      Depends on: {task.prerequisites.map((item) => item.prerequisiteTask?.title ?? "Task").join(", ")}
                                    </div>
                                  )}

                                  {(user.role === "PRODUCT_MANAGER" || user.role === "INTERNAL_TEAM") && (
                                    <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white/80 p-2">
                                      <div className="grid gap-2">
                                        <input
                                          value={dependencyDrafts[task.id] ?? ""}
                                          onChange={(event) => setDependencyDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] outline-none focus:border-blue-500"
                                          placeholder="Dependency task IDs (comma separated)"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const raw = dependencyDrafts[task.id] ?? "";
                                            const ids = raw.split(",").map((value) => value.trim()).filter(Boolean);
                                            if (!ids.length) return;
                                            dependencyMutation.mutate({ taskId: task.id, dependencies: ids });
                                          }}
                                          className="rounded-lg bg-violet-600 px-2 py-1.5 text-[10px] font-semibold text-white"
                                        >
                                          Add dependency
                                        </button>
                                      </div>
                                      <div className="grid gap-2">
                                        <input
                                          value={attachmentDrafts[task.id]?.fileName ?? ""}
                                          onChange={(event) =>
                                            setAttachmentDrafts((current) => ({
                                              ...current,
                                              [task.id]: {
                                                fileName: event.target.value,
                                                fileUrl: current[task.id]?.fileUrl ?? "",
                                                fileType: current[task.id]?.fileType ?? "application/octet-stream",
                                                fileSize: current[task.id]?.fileSize ?? 0,
                                              },
                                            }))
                                          }
                                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] outline-none focus:border-blue-500"
                                          placeholder="Attachment name"
                                        />
                                        <input
                                          value={attachmentDrafts[task.id]?.fileUrl ?? ""}
                                          onChange={(event) =>
                                            setAttachmentDrafts((current) => ({
                                              ...current,
                                              [task.id]: {
                                                fileName: current[task.id]?.fileName ?? "",
                                                fileUrl: event.target.value,
                                                fileType: current[task.id]?.fileType ?? "application/octet-stream",
                                                fileSize: current[task.id]?.fileSize ?? 0,
                                              },
                                            }))
                                          }
                                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] outline-none focus:border-blue-500"
                                          placeholder="Attachment URL"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const payload = attachmentDrafts[task.id];
                                            if (!payload || !payload.fileName || !payload.fileUrl) return;
                                            attachmentMutation.mutate({
                                              taskId: task.id,
                                              payload: {
                                                fileName: payload.fileName,
                                                fileUrl: payload.fileUrl,
                                                fileType: payload.fileType,
                                                fileSize: payload.fileSize,
                                              },
                                            });
                                          }}
                                          className="rounded-lg bg-amber-600 px-2 py-1.5 text-[10px] font-semibold text-white"
                                        >
                                          Upload file
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {statusOrder
                                      .filter((option) => option !== task.status)
                                      .map((option) => {
                                        const disabled = !canTransitionToStatus(
                                          user.role,
                                          task,
                                          option,
                                          user.id,
                                        );

                                        return (
                                          <button
                                            key={`${task.id}-${option}`}
                                            type="button"
                                            onClick={() => handleStatusUpdate(task.id, option, task.version)}
                                            disabled={disabled || mutation.isPending}
                                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-medium text-slate-700 transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:bg-gradient-to-r hover:from-blue-50 hover:to-violet-50 hover:text-blue-700 hover:shadow-sm disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                                          >
                                            {option}
                                          </button>
                                        );
                                      })}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function Home() {
  const [activeMode, setActiveMode] = useState<"login" | "register">("login");
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  if (!token || !user) {
    return <AuthShell activeMode={activeMode} setActiveMode={setActiveMode} />;
  }

  return <Dashboard />;
}
