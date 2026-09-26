import { Role, TaskStatus } from "@prisma/client";

export function canManageTaskOperations(userRole: Role) {
	return userRole === Role.PRODUCT_MANAGER || userRole === Role.INTERNAL_TEAM;
}

export function isTaskBlockedByDependencies(
	prerequisites: Array<{ status?: TaskStatus | null }> = [],
) {
	return prerequisites.some(
		(dependency) => dependency.status !== TaskStatus.DONE,
	);
}

export function canTransitionTaskStatus({
	userRole,
	currentStatus,
	nextStatus,
	hasIncompleteDependencies = false,
	isAssignee = false,
}: {
	userRole: Role;
	currentStatus: TaskStatus;
	nextStatus: TaskStatus;
	hasIncompleteDependencies?: boolean;
	isAssignee?: boolean;
}) {
	if (userRole === Role.CLIENT_GUEST) {
		return false;
	}

	if (userRole === Role.PRODUCT_MANAGER) {
		if (currentStatus === TaskStatus.IN_PROGRESS && nextStatus === TaskStatus.DONE) {
			return false;
		}

		return true;
	}

	if (userRole === Role.INTERNAL_TEAM) {
		if (nextStatus === TaskStatus.IN_PROGRESS) {
			return !hasIncompleteDependencies;
		}

		if (nextStatus === TaskStatus.DONE) {
			return isAssignee || currentStatus === TaskStatus.IN_PROGRESS;
		}

		return true;
	}

	return false;
}
