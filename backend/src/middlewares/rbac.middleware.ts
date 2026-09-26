import type { Department, Role } from "@prisma/client";
import type { Context, Next } from "hono";
import type { AppVariables } from "./auth.middleware";

export function requireRole(...allowedRoles: Role[]) {
	return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
		const user = c.get("user");
		if (!user) {
			return c.json({ error: "Unauthorized: Authentication required" }, 401);
		}

		if (!allowedRoles.includes(user.role)) {
			return c.json(
				{
					error: `Forbidden: Access restricted to roles [${allowedRoles.join(", ")}]. Current role: ${user.role}`,
				},
				403,
			);
		}

		await next();
	};
}

export function requireDepartment(...allowedDepartments: Department[]) {
	return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
		const user = c.get("user");
		if (!user) {
			return c.json({ error: "Unauthorized: Authentication required" }, 401);
		}

		// PM can bypass department checks if they have PM role, or if their department matches
		if (user.role === Role.PRODUCT_MANAGER) {
			await next();
			return;
		}

		if (!user.department || !allowedDepartments.includes(user.department)) {
			return c.json(
				{
					error: `Forbidden: Action restricted to departments [${allowedDepartments.join(", ")}]. Current department: ${user.department || "None"}`,
				},
				403,
			);
		}

		await next();
	};
}
