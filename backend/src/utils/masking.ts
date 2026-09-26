import { Role } from "@prisma/client";

export interface MaskedUserSummary {
	name: string;
}

type MaskedTask = {
	assignee?: unknown;
	assigneeId?: string | null;
	department?: unknown;
	comments?: Array<{ isInternal?: boolean }>;
	auditLogs?: unknown[];
	prerequisites?: Array<{ prerequisiteTask?: MaskedTask }>;
	dependents?: Array<{ dependentTask?: MaskedTask }>;
	isClientVisible?: boolean;
	status?: string;
	[key: string]: unknown;
};

type MaskedProject = {
	tasks?: MaskedTask[];
	members?: unknown[];
	auditLogs?: unknown[];
	[key: string]: unknown;
};

export function maskTaskForUser(
	task: MaskedTask | null | undefined,
	userRole: Role,
) {
	if (!task) return null;

	if (userRole === Role.CLIENT_GUEST) {
		const {
			assignee,
			assigneeId,
			department,
			comments,
			auditLogs,
			...safeFields
		} = task;

		return {
			...safeFields,
			assignee: null,
			assigneeId: null,
			department: null,
			comments: comments
				? comments.filter((comment) => !comment.isInternal)
				: [],
			prerequisites: task.prerequisites
				? task.prerequisites.map((entry) => ({
						...entry,
						prerequisiteTask: entry.prerequisiteTask
							? maskTaskForUser(entry.prerequisiteTask, userRole)
							: undefined,
					}))
				: [],
			dependents: task.dependents
				? task.dependents.map((entry) => ({
						...entry,
						dependentTask: entry.dependentTask
							? maskTaskForUser(entry.dependentTask, userRole)
							: undefined,
					}))
				: [],
		};
	}

	return task;
}

export function maskProjectForUser(
	project: MaskedProject | null | undefined,
	userRole: Role,
) {
	if (!project) return null;

	const tasks = project.tasks || [];
	const clientVisibleTasks = tasks.filter((task) => task.isClientVisible);
	const relevantTasks =
		userRole === Role.CLIENT_GUEST ? clientVisibleTasks : tasks;

	const total = relevantTasks.length;
	const completed = relevantTasks.filter(
		(task) => task.status === "DONE",
	).length;
	const inProgress = relevantTasks.filter(
		(task) => task.status === "IN_PROGRESS",
	).length;
	const blocked = relevantTasks.filter(
		(task) => task.status === "BLOCKED",
	).length;
	const todo = relevantTasks.filter((task) => task.status === "TODO").length;
	const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

	const metrics = {
		totalTasks: total,
		completedTasks: completed,
		inProgressTasks: inProgress,
		blockedTasks: blocked,
		todoTasks: todo,
		completionPercentage: `${percentage}%`,
		progressFraction: total > 0 ? completed / total : 0,
	};

	if (userRole === Role.CLIENT_GUEST) {
		const { members, auditLogs, ...safeProject } = project;
		return {
			...safeProject,
			metrics,
			tasks: clientVisibleTasks.map((task) => maskTaskForUser(task, userRole)),
		};
	}

	return {
		...project,
		metrics,
		tasks: tasks.map((task) => maskTaskForUser(task, userRole)),
	};
}
