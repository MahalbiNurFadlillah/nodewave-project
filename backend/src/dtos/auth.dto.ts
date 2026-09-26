import { Department, Role } from "@prisma/client";
import { z } from "zod";

export const loginSchema = z.object({
	email: z.string().email({ message: "Valid email address is required" }),
	password: z
		.string()
		.min(6, { message: "Password must be at least 6 characters" }),
});

export const registerSchema = z.object({
	email: z.string().email(),
	password: z.string().min(6),
	name: z.string().min(2),
	role: z.nativeEnum(Role),
	department: z.nativeEnum(Department).optional().nullable(),
	clientTenantId: z.string().optional().nullable(),
	avatarUrl: z.string().url().optional().nullable(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
