import {
	Department,
	ProjectStatus,
	Role,
	TaskStatus,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";

import { loginSchema, registerSchema } from "./dtos/auth.dto";
import {
	type AppVariables,
	authMiddleware,
} from "./middlewares/auth.middleware";
import { requireRole } from "./middlewares/rbac.middleware";
import prisma from "./prisma/client";
import { signToken } from "./utils/jwt";
import { maskProjectForUser, maskTaskForUser } from "./utils/masking";
import {
	canManageTaskOperations,
	canTransitionTaskStatus,
	isTaskBlockedByDependencies,
} from "./utils/task-permissions";

const app = new Hono<{ Variables: AppVariables }>();

app.use("*", logger());
app.use(
	"*",
	cors({
		origin: "*",
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	}),
);

const API_VERSION = "v1";

function buildPaginationMeta(page: number, limit: number, total: number) {
	const totalPages = Math.max(1, Math.ceil(total / limit));

	return {
		page,
		limit,
		total,
		totalPages,
		hasNextPage: page < totalPages,
		hasPreviousPage: page > 1,
	};
}

function normalizeStatusFilters(raw: string | undefined) {
	return raw
		? raw
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
}

async function createAuditLog(input: {
	entityName: string;
	entityId: string;
	projectId?: string | null;
	taskId?: string | null;
	userId: string;
	action: string;
	changedColumn?: string | null;
	oldValue?: string | null;
	newValue?: string | null;
}) {
	await prisma.auditLog.create({
		data: {
			entityName: input.entityName,
			entityId: input.entityId,
			projectId: input.projectId,
			taskId: input.taskId,
			userId: input.userId,
			action: input.action,
			changedColumn: input.changedColumn,
			oldValue: input.oldValue ?? null,
			newValue: input.newValue ?? null,
		},
	});
}

async function getTaskWithRelations(taskId: string) {
	return prisma.task.findFirst({
		where: {
			id: taskId,
			deletedAt: null,
		},
		include: {
			assignee: true,
			project: true,
			prerequisites: {
				include: {
					prerequisiteTask: true,
				},
			},
			dependents: {
				include: {
					dependentTask: true,
				},
			},
			attachments: true,
			comments: {
				include: {
					author: true,
				},
			},
		},
	});
}

async function checkPrerequisitesCompleted(taskId: string) {
	const prerequisites = await prisma.taskDependency.findMany({
		where: {
			dependentTaskId: taskId,
		},
		include: {
			prerequisiteTask: true,
		},
	});

	return !isTaskBlockedByDependencies(
		prerequisites.map((dependency) => dependency.prerequisiteTask),
	);
}

function computeProjectMetrics(tasks: Array<{ status: string }>) {
	const total = tasks.length;
	const completed = tasks.filter(
		(task) => task.status === TaskStatus.DONE,
	).length;
	const inProgress = tasks.filter(
		(task) => task.status === TaskStatus.IN_PROGRESS,
	).length;
	const blocked = tasks.filter(
		(task) => task.status === TaskStatus.BLOCKED,
	).length;
	const todo = tasks.filter((task) => task.status === TaskStatus.TODO).length;
	const completionPercentage =
		total > 0 ? Math.round((completed / total) * 100) : 0;

	return {
		totalTasks: total,
		completedTasks: completed,
		inProgressTasks: inProgress,
		blockedTasks: blocked,
		todoTasks: todo,
		completionPercentage: `${completionPercentage}%`,
		progressFraction: total > 0 ? completed / total : 0,
	};
}

function serializeUserForClient(user: {
	id: string;
	email: string;
	name: string;
	role: Role;
	department: Department | null;
	clientTenantId: string | null;
	avatarUrl: string | null;
}) {
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		role: user.role,
		department: user.department,
		clientTenantId: user.clientTenantId,
		avatarUrl: user.avatarUrl,
	};
}

app.get("/health", (c) => {
	return c.json({
		ok: true,
		service: "high-value-projects-backend",
		version: API_VERSION,
		environment: process.env.NODE_ENV || "development",
	});
});

app.post("/api/auth/register", async (c) => {
	try {
		const body = registerSchema.parse(await c.req.json());

		const existingUser = await prisma.user.findUnique({
			where: {
				email: body.email.toLowerCase(),
			},
		});

		if (existingUser) {
			return c.json({ error: "A user with this email already exists." }, 409);
		}

		const passwordHash = await bcrypt.hash(body.password, 10);

		const user = await prisma.user.create({
			data: {
				email: body.email.toLowerCase(),
				passwordHash,
				name: body.name,
				role: body.role,
				department: body.department,
				clientTenantId: body.clientTenantId,
				avatarUrl: body.avatarUrl,
			},
		});

		const token = signToken({
			userId: user.id,
			email: user.email,
			role: user.role,
			department: user.department,
			clientTenantId: user.clientTenantId,
		});

		return c.json({
			token,
			user: serializeUserForClient(user),
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return c.json(
				{ error: error.issues[0]?.message || "Validation failed" },
				400,
			);
		}

		return c.json({ error: "Unable to register user." }, 500);
	}
});

app.post("/api/auth/login", async (c) => {
	try {
		const body = loginSchema.parse(await c.req.json());

		const user = await prisma.user.findUnique({
			where: {
				email: body.email.toLowerCase(),
			},
		});

		if (!user) {
			return c.json({ error: "Invalid email or password." }, 401);
		}

		const isPasswordValid = await bcrypt.compare(
			body.password,
			user.passwordHash,
		);
		if (!isPasswordValid) {
			return c.json({ error: "Invalid email or password." }, 401);
		}

		const token = signToken({
			userId: user.id,
			email: user.email,
			role: user.role,
			department: user.department,
			clientTenantId: user.clientTenantId,
		});

		return c.json({
			token,
			user: serializeUserForClient(user),
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return c.json(
				{ error: error.issues[0]?.message || "Validation failed" },
				400,
			);
		}

		return c.json({ error: "Unable to login." }, 500);
	}
});

app.get("/api/auth/me", authMiddleware, async (c) => {
	const user = c.get("user");
	return c.json({
		user,
	});
});

app.post("/api/auth/logout", authMiddleware, async (c) => {
	return c.json({ ok: true, message: "Logged out successfully." });
});

app.get("/api/users", authMiddleware, async (c) => {
	const users = await prisma.user.findMany({
		where: {
			deletedAt: null,
		},
		select: {
			id: true,
			name: true,
			email: true,
			role: true,
			department: true,
			avatarUrl: true,
			clientTenantId: true,
		},
		orderBy: {
			name: "asc",
		},
	});

	return c.json({ data: users });
});

app.post(
	"/api/projects/:id/members",
	authMiddleware,
	requireRole(Role.PRODUCT_MANAGER),
	async (c) => {
		try {
			const projectId = c.req.param("id");
			const payload = z
				.object({
					userId: z.string().min(1),
					roleInProject: z.string().min(1).default("Contributor"),
				})
				.parse(await c.req.json());

			const project = await prisma.project.findFirst({
				where: { id: projectId, deletedAt: null },
			});
			if (!project) {
				return c.json({ error: "Project not found." }, 404);
			}

			const user = await prisma.user.findFirst({
				where: { id: payload.userId, deletedAt: null },
			});
			if (!user) {
				return c.json({ error: "User not found." }, 404);
			}

			const existingMember = await prisma.projectMember.findFirst({
				where: {
					projectId,
					userId: payload.userId,
					deletedAt: null,
				},
			});

			if (existingMember) {
				return c.json({ error: "User is already a member of this project." }, 409);
			}

			const projectMember = await prisma.projectMember.create({
				data: {
					projectId,
					userId: payload.userId,
					roleInProject: payload.roleInProject,
				},
			});

			await createAuditLog({
				entityName: "ProjectMember",
				entityId: projectMember.id,
				projectId,
				userId: c.get("user").id,
				action: "CREATE",
				changedColumn: "membership",
				oldValue: null,
				newValue: JSON.stringify({
					userId: payload.userId,
					roleInProject: payload.roleInProject,
				}),
			});

			return c.json({ data: projectMember }, 201);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return c.json({ error: error.issues[0]?.message || "Validation failed." }, 400);
			}

			return c.json({ error: "Unable to add project member." }, 500);
		}
	},
);

app.post(
	"/api/tasks/:id/attachments",
	authMiddleware,
	async (c) => {
		try {
			const taskId = c.req.param("id");
			const payload = z
				.object({
					fileName: z.string().min(1),
					fileUrl: z.string().min(1),
					fileType: z.string().default("application/octet-stream"),
					fileSize: z.number().int().nonnegative().default(0),
				})
				.parse(await c.req.json());

			const user = c.get("user");
			const task = await prisma.task.findFirst({
				where: { id: taskId, deletedAt: null },
			});

			if (!task) {
				return c.json({ error: "Task not found." }, 404);
			}

			if (user.role !== Role.PRODUCT_MANAGER && user.role !== Role.INTERNAL_TEAM) {
				return c.json({ error: "You are not allowed to upload attachments." }, 403);
			}

			const attachment = await prisma.attachment.create({
				data: {
					taskId,
					fileName: payload.fileName,
					fileUrl: payload.fileUrl,
					fileType: payload.fileType,
					fileSize: payload.fileSize,
					uploadedById: user.id,
				},
			});

			await createAuditLog({
				entityName: "Attachment",
				entityId: attachment.id,
				projectId: task.projectId,
				taskId,
				userId: user.id,
				action: "CREATE",
				changedColumn: "attachment",
				oldValue: null,
				newValue: JSON.stringify({
					fileName: payload.fileName,
					fileType: payload.fileType,
					fileSize: payload.fileSize,
				}),
			});

			return c.json({ data: attachment }, 201);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return c.json({ error: error.issues[0]?.message || "Validation failed." }, 400);
			}

			return c.json({ error: "Unable to upload attachment." }, 500);
		}
	},
);

app.get("/api/projects", authMiddleware, async (c) => {
	const user = c.get("user");
	const search = c.req.query("search") ?? "";
	const page = Number(c.req.query("page") ?? "1");
	const limit = Number(c.req.query("limit") ?? "10");
	const sortBy = c.req.query("sortBy") ?? "updatedAt";
	const order = c.req.query("order") === "asc" ? "asc" : "desc";
	const statusFilter = normalizeStatusFilters(c.req.query("status"));

	const where: Prisma.ProjectWhereInput = {
		deletedAt: null,
		...(user.role === Role.CLIENT_GUEST
			? { clientTenantId: user.clientTenantId ?? null }
			: {}),
		...(user.role === Role.INTERNAL_TEAM
			? {
					members: {
						some: {
							userId: user.id,
						},
					},
				}
			: {}),
		...(statusFilter.length > 0
			? { status: { in: statusFilter as ProjectStatus[] } }
			: {}),
		...(search
			? {
					OR: [
						{ name: { contains: search, mode: "insensitive" } },
						{ description: { contains: search, mode: "insensitive" } },
					],
				}
			: {}),
	};

	const total = await prisma.project.count({ where });
	const projects = await prisma.project.findMany({
		where,
		include: {
			tasks: {
				where: { deletedAt: null },
				include: {
					assignee: true,
					prerequisites: { include: { prerequisiteTask: true } },
					comments: true,
				},
			},
			members: {
				include: {
					user: {
						select: {
							id: true,
							name: true,
							email: true,
							department: true,
							avatarUrl: true,
						},
					},
				},
			},
		},
		skip: (page - 1) * limit,
		take: limit,
		orderBy: {
			[sortBy]: order,
		},
	});

	const sanitizedProjects = projects.map((project) => {
		const safeProject = {
			...project,
			metrics: computeProjectMetrics(project.tasks),
			tasks: project.tasks.map((task) => ({
				...task,
				isBlocked:
					task.status !== TaskStatus.DONE &&
					task.prerequisites.some(
						(dependency) =>
							dependency.prerequisiteTask.status !== TaskStatus.DONE,
					),
			})),
		};

		return user.role === Role.CLIENT_GUEST
			? maskProjectForUser(safeProject, user.role)
			: safeProject;
	});

	return c.json({
		data: sanitizedProjects,
		meta: buildPaginationMeta(page, limit, total),
	});
});

app.get("/api/projects/:id", authMiddleware, async (c) => {
	const user = c.get("user");
	const projectId = c.req.param("id");

	const project = await prisma.project.findFirst({
		where: {
			id: projectId,
			deletedAt: null,
		},
		include: {
			tasks: {
				where: { deletedAt: null },
				include: {
					assignee: true,
					prerequisites: {
						include: {
							prerequisiteTask: true,
						},
					},
					comments: {
						include: {
							author: true,
						},
					},
				},
			},
			members: {
				include: {
					user: {
						select: {
							id: true,
							name: true,
							email: true,
							department: true,
							avatarUrl: true,
						},
					},
				},
			},
		},
	});

	if (!project) {
		return c.json({ error: "Project not found." }, 404);
	}

	if (
		user.role === Role.CLIENT_GUEST &&
		project.clientTenantId !== user.clientTenantId
	) {
		return c.json({ error: "You do not have access to this project." }, 403);
	}

	if (user.role === Role.INTERNAL_TEAM) {
		const isMember = project.members.some(
			(member) => member.userId === user.id,
		);
		if (!isMember) {
			return c.json({ error: "You are not assigned to this project." }, 403);
		}
	}

	const safeProject = {
		...project,
		metrics: computeProjectMetrics(project.tasks),
		tasks: project.tasks.map((task) => ({
			...task,
			isBlocked:
				task.status !== TaskStatus.DONE &&
				task.prerequisites.some(
					(dependency) =>
						dependency.prerequisiteTask.status !== TaskStatus.DONE,
				),
		})),
	};

	return c.json({
		data:
			user.role === Role.CLIENT_GUEST
				? maskProjectForUser(safeProject, user.role)
				: safeProject,
	});
});

app.post(
	"/api/projects",
	authMiddleware,
	requireRole(Role.PRODUCT_MANAGER),
	async (c) => {
		try {
			const payload = z
				.object({
					name: z.string().min(2),
					description: z.string().optional().default(""),
					status: z
						.nativeEnum(ProjectStatus)
						.optional()
						.default(ProjectStatus.ACTIVE),
					clientTenantId: z.string().optional().nullable(),
				})
				.parse(await c.req.json());

			const project = await prisma.project.create({
				data: {
					name: payload.name,
					description: payload.description,
					status: payload.status,
					clientTenantId: payload.clientTenantId,
				},
			});

			await createAuditLog({
				entityName: "Project",
				entityId: project.id,
				projectId: project.id,
				userId: c.get("user").id,
				action: "CREATE",
				changedColumn: "project",
				oldValue: null,
				newValue: JSON.stringify({
					name: project.name,
					status: project.status,
				}),
			});

			return c.json({ data: project }, 201);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return c.json(
					{ error: error.issues[0]?.message || "Validation failed." },
					400,
				);
			}

			return c.json({ error: "Unable to create project." }, 500);
		}
	},
);

app.patch(
	"/api/projects/:id",
	authMiddleware,
	requireRole(Role.PRODUCT_MANAGER),
	async (c) => {
		const projectId = c.req.param("id");
		const payload = await c.req.json();

		const project = await prisma.project.findFirst({
			where: {
				id: projectId,
				deletedAt: null,
			},
		});

		if (!project) {
			return c.json({ error: "Project not found." }, 404);
		}

		const updateData: Record<string, unknown> = {};
		if (payload.name && typeof payload.name === "string")
			updateData.name = payload.name;
		if (
			payload.description !== undefined &&
			typeof payload.description === "string"
		)
			updateData.description = payload.description;
		if (payload.status && typeof payload.status === "string")
			updateData.status = payload.status;

		if (Object.keys(updateData).length === 0) {
			return c.json({ error: "No project fields to update." }, 400);
		}

		const updated = await prisma.project.update({
			where: { id: projectId },
			data: updateData,
		});

		for (const [column, value] of Object.entries(updateData)) {
			if (column === "updatedAt") continue;
			await createAuditLog({
				entityName: "Project",
				entityId: updated.id,
				projectId: updated.id,
				userId: c.get("user").id,
				action: "UPDATE",
				changedColumn: column,
				oldValue:
					project[column as keyof typeof project] !== undefined
						? String(project[column as keyof typeof project])
						: null,
				newValue: typeof value === "string" ? value : JSON.stringify(value),
			});
		}

		return c.json({ data: updated });
	},
);

app.delete(
	"/api/projects/:id",
	authMiddleware,
	requireRole(Role.PRODUCT_MANAGER),
	async (c) => {
		const projectId = c.req.param("id");
		const project = await prisma.project.findFirst({
			where: { id: projectId, deletedAt: null },
		});

		if (!project) {
			return c.json({ error: "Project not found." }, 404);
		}

		await prisma.project.update({
			where: { id: projectId },
			data: { deletedAt: new Date() },
		});

		await createAuditLog({
			entityName: "Project",
			entityId: projectId,
			projectId: projectId,
			userId: c.get("user").id,
			action: "SOFT_DELETE",
			changedColumn: "deletedAt",
			oldValue: null,
			newValue: JSON.stringify({ deleted: true }),
		});

		return c.json({ ok: true, message: "Project deleted successfully." });
	},
);

app.get("/api/tasks", authMiddleware, async (c) => {
	const user = c.get("user");
	const search = c.req.query("search") ?? "";
	const page = Number(c.req.query("page") ?? "1");
	const limit = Number(c.req.query("limit") ?? "10");
	const statusFilter = normalizeStatusFilters(c.req.query("status"));
	const department = c.req.query("department");
	const projectId = c.req.query("projectId");
	const assigneeId = c.req.query("assigneeId");

	const where: Prisma.TaskWhereInput = {
		deletedAt: null,
		...(user.role === Role.CLIENT_GUEST ? { isClientVisible: true } : {}),
		...(user.role === Role.INTERNAL_TEAM
			? {
					project: {
						members: {
							some: {
								userId: user.id,
							},
						},
					},
				}
			: {}),
		...(projectId ? { projectId } : {}),
		...(assigneeId ? { assigneeId } : {}),
		...(department ? { department: department as Department } : {}),
		...(statusFilter.length > 0
			? { status: { in: statusFilter as TaskStatus[] } }
			: {}),
		...(search
			? {
					OR: [
						{ title: { contains: search, mode: "insensitive" } },
						{ description: { contains: search, mode: "insensitive" } },
					],
				}
			: {}),
	};

	const total = await prisma.task.count({ where });
	const tasks = await prisma.task.findMany({
		where,
		include: {
			assignee: true,
			project: true,
			prerequisites: {
				include: {
					prerequisiteTask: true,
				},
			},
			dependents: {
				include: {
					dependentTask: true,
				},
			},
			comments: {
				include: {
					author: true,
				},
			},
			attachments: true,
		},
		skip: (page - 1) * limit,
		take: limit,
		orderBy: { updatedAt: "desc" },
	});

	const payload = tasks.map((task) => ({
		...task,
		isBlocked:
			task.status !== TaskStatus.DONE &&
			task.prerequisites.some(
				(dependency) => dependency.prerequisiteTask.status !== TaskStatus.DONE,
			),
		...(user.role === Role.CLIENT_GUEST
			? maskTaskForUser(task, user.role)
			: task),
	}));

	return c.json({
		data: payload,
		meta: buildPaginationMeta(page, limit, total),
	});
});

app.get("/api/tasks/:id", authMiddleware, async (c) => {
	const user = c.get("user");
	const taskId = c.req.param("id");

	const task = await getTaskWithRelations(taskId);
	if (!task) {
		return c.json({ error: "Task not found." }, 404);
	}

	if (user.role === Role.CLIENT_GUEST && !task.isClientVisible) {
		return c.json({ error: "This task is not visible to clients." }, 403);
	}

	if (user.role === Role.INTERNAL_TEAM) {
		const projectMember = await prisma.projectMember.findFirst({
			where: {
				projectId: task.projectId,
				userId: user.id,
			},
		});

		if (!projectMember) {
			return c.json({ error: "You are not assigned to this project." }, 403);
		}
	}

	const enrichedTask = {
		...task,
		isBlocked:
			task.status !== TaskStatus.DONE &&
			task.prerequisites.some(
				(dependency) => dependency.prerequisiteTask.status !== TaskStatus.DONE,
			),
	};

	return c.json({
		data:
			user.role === Role.CLIENT_GUEST
				? maskTaskForUser(enrichedTask, user.role)
				: enrichedTask,
	});
});

app.post(
	"/api/tasks",
	authMiddleware,
	async (c) => {
		const user = c.get("user");
		if (!canManageTaskOperations(user.role)) {
			return c.json({ error: "You are not allowed to create tasks." }, 403);
		}

		try {
			const payload = z
				.object({
					projectId: z.string().min(1),
					title: z.string().min(3),
					description: z.string().optional().default(""),
					department: z.nativeEnum(Department),
					assigneeId: z.string().optional().nullable(),
					isClientVisible: z.boolean().optional().default(false),
					dependencies: z.array(z.string()).optional().default([]),
				})
				.parse(await c.req.json());

			const project = await prisma.project.findFirst({
				where: {
					id: payload.projectId,
					deletedAt: null,
				},
			});

			if (!project) {
				return c.json({ error: "Project not found." }, 404);
			}

			const task = await prisma.task.create({
				data: {
					projectId: payload.projectId,
					title: payload.title,
					description: payload.description,
					department: payload.department,
					assigneeId: payload.assigneeId,
					isClientVisible: payload.isClientVisible,
					version: 1,
				},
				include: {
					assignee: true,
				},
			});

			if (payload.dependencies.length > 0) {
				const dependencyTasks = await prisma.task.findMany({
					where: {
						id: { in: payload.dependencies },
						projectId: payload.projectId,
						deletedAt: null,
					},
				});

				if (dependencyTasks.length !== payload.dependencies.length) {
					await prisma.task.delete({ where: { id: task.id } });
					return c.json(
						{
							error:
								"One or more dependency tasks are invalid for this project.",
						},
						400,
					);
				}

				await prisma.taskDependency.createMany({
					data: payload.dependencies.map((dependencyTaskId) => ({
						dependentTaskId: task.id,
						prerequisiteTaskId: dependencyTaskId,
					})),
				});
			}

			await createAuditLog({
				entityName: "Task",
				entityId: task.id,
				projectId: task.projectId,
				taskId: task.id,
				userId: c.get("user").id,
				action: "CREATE",
				changedColumn: "task",
				oldValue: null,
				newValue: JSON.stringify({
					title: task.title,
					department: task.department,
					projectId: task.projectId,
				}),
			});

			return c.json({ data: task }, 201);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return c.json(
					{ error: error.issues[0]?.message || "Validation failed." },
					400,
				);
			}

			return c.json({ error: "Unable to create task." }, 500);
		}
	},
);

app.post(
	"/api/tasks/:id/dependencies",
	authMiddleware,
	async (c) => {
		const user = c.get("user");
		if (!canManageTaskOperations(user.role)) {
			return c.json({ error: "You are not allowed to manage task dependencies." }, 403);
		}

		try {
			const taskId = c.req.param("id");
			const payload = z
				.object({
					dependencies: z.array(z.string()).min(1),
				})
				.parse(await c.req.json());

			const task = await prisma.task.findFirst({
				where: { id: taskId, deletedAt: null },
			});

			if (!task) {
				return c.json({ error: "Task not found." }, 404);
			}

			const prerequisites = await prisma.task.findMany({
				where: {
					id: { in: payload.dependencies },
					projectId: task.projectId,
					deletedAt: null,
				},
			});

			if (prerequisites.length !== payload.dependencies.length) {
				return c.json(
					{ error: "One or more dependency tasks do not belong to this project." },
					400,
				);
			}

			const rows = payload.dependencies.map((dependencyTaskId) => ({
				prerequisiteTaskId: dependencyTaskId,
				dependentTaskId: taskId,
			}));

			await prisma.taskDependency.createMany({
				data: rows,
				skipDuplicates: true,
			});

			await createAuditLog({
				entityName: "TaskDependency",
				entityId: taskId,
				projectId: task.projectId,
				taskId,
				userId: c.get("user").id,
				action: "DEPENDENCY_ADD",
				changedColumn: "dependencies",
				oldValue: null,
				newValue: JSON.stringify(rows),
			});

			return c.json({ data: { taskId, dependencies: rows } }, 201);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return c.json(
					{ error: error.issues[0]?.message || "Validation failed." },
					400,
				);
			}

			return c.json({ error: "Unable to update task dependencies." }, 500);
		}
	},
);

app.delete(
	"/api/tasks/:id/dependencies/:dependencyId",
	authMiddleware,
	async (c) => {
		const user = c.get("user");
		if (!canManageTaskOperations(user.role)) {
			return c.json({ error: "You are not allowed to manage task dependencies." }, 403);
		}

		const taskId = c.req.param("id");
		const dependencyId = c.req.param("dependencyId");

		const dependency = await prisma.taskDependency.findFirst({
			where: { id: dependencyId, dependentTaskId: taskId },
			include: { prerequisiteTask: true },
		});

		if (!dependency) {
			return c.json({ error: "Dependency not found." }, 404);
		}

		await prisma.taskDependency.delete({ where: { id: dependency.id } });
		await createAuditLog({
			entityName: "TaskDependency",
			entityId: dependency.id,
			projectId: dependency.prerequisiteTask.projectId,
			taskId,
			userId: c.get("user").id,
			action: "DEPENDENCY_REMOVE",
			changedColumn: "dependencies",
			oldValue: JSON.stringify({ prerequisiteTaskId: dependency.prerequisiteTaskId }),
			newValue: null,
		});

		return c.json({ ok: true, message: "Dependency removed." });
	},
);

app.patch("/api/tasks/:id", authMiddleware, async (c) => {
	const user = c.get("user");
	const taskId = c.req.param("id");
	const payload = (await c.req.json()) as Record<string, unknown>;

	const task = await getTaskWithRelations(taskId);
	if (!task) {
		return c.json({ error: "Task not found." }, 404);
	}

	if (user.role === Role.CLIENT_GUEST) {
		return c.json({ error: "Client access is read-only." }, 403);
	}

	if (user.role === Role.INTERNAL_TEAM) {
		const isProjectMember = await prisma.projectMember.findFirst({
			where: {
				projectId: task.projectId,
				userId: user.id,
			},
		});

		if (!isProjectMember) {
			return c.json({ error: "You are not assigned to this project." }, 403);
		}
	}

	if (typeof payload.version === "number" && payload.version !== task.version) {
		return c.json(
			{
				error:
					"Conflict: task was modified by another user. Please refresh and retry.",
				version: task.version,
			},
			409,
		);
	}

	const updateData: Record<string, unknown> = {};
	const changedFields: Array<{
		column: string;
		oldValue: unknown;
		newValue: unknown;
	}> = [];

	if ("title" in payload && typeof payload.title === "string") {
		if (user.role !== Role.PRODUCT_MANAGER) {
			return c.json({ error: "Only PMs can update the task title." }, 403);
		}
		if (payload.title !== task.title) {
			changedFields.push({
				column: "title",
				oldValue: task.title,
				newValue: payload.title,
			});
			updateData.title = payload.title;
		}
	}

	if ("description" in payload && typeof payload.description === "string") {
		if (user.role !== Role.PRODUCT_MANAGER) {
			return c.json(
				{ error: "Internal team members cannot edit the task description." },
				403,
			);
		}
		if (payload.description !== task.description) {
			changedFields.push({
				column: "description",
				oldValue: task.description,
				newValue: payload.description,
			});
			updateData.description = payload.description;
		}
	}

	if ("status" in payload && typeof payload.status === "string") {
		const nextStatus = payload.status as TaskStatus;

		if (
			task.status === TaskStatus.IN_PROGRESS &&
			nextStatus === TaskStatus.DONE &&
			user.role === Role.PRODUCT_MANAGER
		) {
			return c.json(
				{
					error:
						"PM cannot move a task from In Progress to Done. Only the assignee can complete it.",
				},
				403,
			);
		}

		const dependenciesCompleted = await checkPrerequisitesCompleted(task.id);
		const canTransition = canTransitionTaskStatus({
			userRole: user.role,
			currentStatus: task.status,
			nextStatus,
			hasIncompleteDependencies: !dependenciesCompleted,
			isAssignee: task.assigneeId === user.id,
		});

		if (!canTransition) {
			const message =
				user.role === Role.PRODUCT_MANAGER
					? "PM cannot move a task from In Progress to Done. Only the assignee can complete it."
					: "This task is blocked by incomplete dependencies or is not allowed in the current state.";

			return c.json({ error: message }, 403);
		}

		if (task.status !== nextStatus) {
			changedFields.push({
				column: "status",
				oldValue: task.status,
				newValue: nextStatus,
			});
			updateData.status = nextStatus;
		}
	}

	if ("assigneeId" in payload && payload.assigneeId !== undefined) {
		if (user.role !== Role.PRODUCT_MANAGER) {
			return c.json({ error: "Only PMs can reassign tasks." }, 403);
		}
		if (payload.assigneeId !== task.assigneeId) {
			changedFields.push({
				column: "assigneeId",
				oldValue: task.assigneeId,
				newValue: payload.assigneeId,
			});
			updateData.assigneeId = payload.assigneeId || null;
		}
	}

	if (
		"isClientVisible" in payload &&
		typeof payload.isClientVisible === "boolean"
	) {
		if (user.role !== Role.PRODUCT_MANAGER) {
			return c.json({ error: "Only PMs can toggle client visibility." }, 403);
		}
		if (payload.isClientVisible !== task.isClientVisible) {
			changedFields.push({
				column: "isClientVisible",
				oldValue: task.isClientVisible,
				newValue: payload.isClientVisible,
			});
			updateData.isClientVisible = payload.isClientVisible;
		}
	}

	if ("department" in payload && typeof payload.department === "string") {
		if (user.role !== Role.PRODUCT_MANAGER) {
			return c.json({ error: "Only PMs can change task department." }, 403);
		}
		if (payload.department !== task.department) {
			changedFields.push({
				column: "department",
				oldValue: task.department,
				newValue: payload.department,
			});
			updateData.department = payload.department;
		}
	}

	if (Object.keys(updateData).length === 0) {
		return c.json({ data: task, message: "No changes detected." });
	}

	const updatedTask = await prisma.task.update({
		where: { id: task.id },
		data: {
			...updateData,
			version: {
				increment: 1,
			},
		},
		include: {
			assignee: true,
			project: true,
			prerequisites: { include: { prerequisiteTask: true } },
			dependents: { include: { dependentTask: true } },
			attachments: true,
			comments: { include: { author: true } },
		},
	});

	for (const field of changedFields) {
		await createAuditLog({
			entityName: "Task",
			entityId: task.id,
			projectId: task.projectId,
			taskId: task.id,
			userId: user.id,
			action: "UPDATE",
			changedColumn: field.column,
			oldValue:
				field.oldValue === null || field.oldValue === undefined
					? null
					: JSON.stringify(field.oldValue),
			newValue:
				field.newValue === null || field.newValue === undefined
					? null
					: JSON.stringify(field.newValue),
		});
	}

	return c.json({
		data: {
			...updatedTask,
			isBlocked:
				updatedTask.status !== TaskStatus.DONE &&
				updatedTask.prerequisites.some(
					(dependency) =>
						dependency.prerequisiteTask.status !== TaskStatus.DONE,
				),
		},
	});
});

app.delete("/api/tasks/:id", authMiddleware, async (c) => {
	const user = c.get("user");
	const taskId = c.req.param("id");

	const task = await prisma.task.findFirst({
		where: {
			id: taskId,
			deletedAt: null,
		},
	});

	if (!task) {
		return c.json({ error: "Task not found." }, 404);
	}

	if (user.role !== Role.PRODUCT_MANAGER && user.role !== Role.INTERNAL_TEAM) {
		return c.json({ error: "You are not allowed to delete tasks." }, 403);
	}

	await prisma.task.update({
		where: { id: taskId },
		data: { deletedAt: new Date() },
	});

	await createAuditLog({
		entityName: "Task",
		entityId: taskId,
		projectId: task.projectId,
		taskId,
		userId: user.id,
		action: "SOFT_DELETE",
		changedColumn: "deletedAt",
		oldValue: null,
		newValue: JSON.stringify({ deleted: true }),
	});

	return c.json({ ok: true, message: "Task was soft deleted." });
});

app.get("/api/standup-summary", authMiddleware, async (c) => {
	const user = c.get("user");
	const projectId = c.req.query("projectId");

	if (!projectId) {
		return c.json({ error: "projectId is required." }, 400);
	}

	if (user.role === Role.CLIENT_GUEST) {
		return c.json(
			{ error: "Client guest cannot access stand-up summaries." },
			403,
		);
	}

	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	yesterday.setHours(0, 0, 0, 0);

	const today = new Date(yesterday);
	today.setDate(today.getDate() + 1);

	const logs = await prisma.auditLog.findMany({
		where: {
			projectId,
			createdAt: {
				gte: yesterday,
				lt: today,
			},
		},
		include: {
			user: true,
		},
		orderBy: { createdAt: "asc" },
	});

	const byDepartment = new Map<
		string,
		{ completed: string[]; blocked: string[] }
	>();

	for (const log of logs) {
		const department = log.user.department ?? "UNKNOWN";
		const bucket = byDepartment.get(department) ?? {
			completed: [],
			blocked: [],
		};

		if (
			log.action === "UPDATE" &&
			log.changedColumn === "status" &&
			log.newValue?.includes("DONE")
		) {
			bucket.completed.push(`${log.entityName}:${log.entityId}`);
		}

		if (log.changedColumn === "status" && log.newValue?.includes("BLOCKED")) {
			bucket.blocked.push(`${log.entityName}:${log.entityId}`);
		}

		byDepartment.set(department, bucket);
	}

	return c.json({
		data: {
			projectId,
			date: yesterday.toISOString(),
			summary: Object.fromEntries(
				Array.from(byDepartment.entries()).map(([department, value]) => [
					department,
					{
						completedYesterday: value.completed,
						blockedToday: value.blocked,
					},
				]),
			),
		},
	});
});

export default app;

if (import.meta.main) {
	const port = Number(process.env.PORT ?? 4000);

	if (typeof Bun !== "undefined") {
		Bun.serve({
			port,
			hostname: "0.0.0.0",
			fetch: app.fetch,
		});
		console.log(`High-value projects API running on http://localhost:${port}`);
	} else {
		const { serve } = await import("@hono/node-server");
		serve(
			{
				hostname: "0.0.0.0",
				port,
				fetch: app.fetch,
			},
			(info) => {
				console.log(
					`High-value projects API running on http://${info.address}:${info.port}`,
				);
			},
		);
	}
}
