import type { Department, Role } from "@prisma/client";

export interface JwtPayload {
	userId: string;
	email: string;
	role: Role;
	department: Department | null;
	clientTenantId: string | null;
}

export interface AuthenticatedUser {
	id: string;
	email: string;
	name: string;
	role: Role;
	department: Department | null;
	clientTenantId: string | null;
	avatarUrl: string | null;
}
