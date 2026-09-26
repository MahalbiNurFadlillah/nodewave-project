import jwt from "jsonwebtoken";
import type { JwtPayload } from "../types/auth";

const JWT_SECRET =
	process.env.JWT_SECRET ||
	"nodewave-super-secret-jwt-key-for-high-value-projects-2026";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export function signToken(payload: JwtPayload): string {
	return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
	return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
