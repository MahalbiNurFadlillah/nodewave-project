import type { Context, Next } from "hono";
import prisma from "../prisma/client";
import type { AuthenticatedUser } from "../types/auth";
import { verifyToken } from "../utils/jwt";

export type AppVariables = {
	user: AuthenticatedUser;
};

export async function authMiddleware(
	c: Context<{ Variables: AppVariables }>,
	next: Next,
) {
	const authHeader = c.req.header("Authorization");
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return c.json(
			{ error: "Unauthorized: Missing or invalid Bearer token" },
			401,
		);
	}

	const token = authHeader.split(" ")[1];
	try {
		const payload = verifyToken(token);
		const user = await prisma.user.findFirst({
			where: {
				id: payload.userId,
				deletedAt: null,
			},
			select: {
				id: true,
				email: true,
				name: true,
				role: true,
				department: true,
				clientTenantId: true,
				avatarUrl: true,
			},
		});

		if (!user) {
			return c.json(
				{ error: "Unauthorized: User not found or account deactivated" },
				401,
			);
		}

		c.set("user", user);
		await next();
	} catch (err) {
		return c.json({ error: "Unauthorized: Invalid or expired token" }, 401);
	}
}
