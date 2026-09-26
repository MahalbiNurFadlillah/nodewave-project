import { describe, expect, it } from "bun:test";
import { Role, TaskStatus } from "@prisma/client";

import {
	canManageTaskOperations,
	canTransitionTaskStatus,
	isTaskBlockedByDependencies,
} from "./task-permissions";

describe("task permission rules", () => {
	it("blocks internal engineers from starting work before dependencies are done", () => {
		const canStart = canTransitionTaskStatus({
			userRole: Role.INTERNAL_TEAM,
			currentStatus: TaskStatus.TODO,
			nextStatus: TaskStatus.IN_PROGRESS,
			hasIncompleteDependencies: true,
		});

		expect(canStart).toBe(false);
	});

	it("allows PM to move a task from in progress to blocked but not directly to done", () => {
		const canComplete = canTransitionTaskStatus({
			userRole: Role.PRODUCT_MANAGER,
			currentStatus: TaskStatus.IN_PROGRESS,
			nextStatus: TaskStatus.DONE,
			hasIncompleteDependencies: false,
		});

		expect(canComplete).toBe(false);
	});

	it("flags tasks blocked when prerequisites remain incomplete", () => {
		expect(
			isTaskBlockedByDependencies([
				{ status: TaskStatus.DONE },
				{ status: TaskStatus.TODO },
			]),
		).toBe(true);
	});

	it("allows internal team members to manage task operations and dependencies", () => {
		expect(canManageTaskOperations(Role.INTERNAL_TEAM)).toBe(true);
		expect(canManageTaskOperations(Role.PRODUCT_MANAGER)).toBe(true);
		expect(canManageTaskOperations(Role.CLIENT_GUEST)).toBe(false);
	});
});
