import {
	Department,
	PrismaClient,
	ProjectStatus,
	Role,
	TaskStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
	console.log("🌱 Starting database seeding...");

	// Clean existing data in reverse order of foreign keys
	await prisma.auditLog.deleteMany();
	await prisma.comment.deleteMany();
	await prisma.attachment.deleteMany();
	await prisma.taskDependency.deleteMany();
	await prisma.task.deleteMany();
	await prisma.projectMember.deleteMany();
	await prisma.project.deleteMany();
	await prisma.user.deleteMany();

	console.log("🧹 Cleaned existing tables.");

	const passwordHash = await bcrypt.hash("Password123!", 10);

	// 1. Create Users
	const pmUser = await prisma.user.create({
		data: {
			email: "pm@nodewave.id",
			passwordHash,
			name: "Alex Rivera (Product Manager)",
			avatarUrl:
				"https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
			role: Role.PRODUCT_MANAGER,
			department: Department.PM,
		},
	});

	const uiuxUser = await prisma.user.create({
		data: {
			email: "uiux@nodewave.id",
			passwordHash,
			name: "Sarah Chen (Lead UI/UX Designer)",
			avatarUrl:
				"https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
			role: Role.INTERNAL_TEAM,
			department: Department.UIUX,
		},
	});

	const backendUser = await prisma.user.create({
		data: {
			email: "backend@nodewave.id",
			passwordHash,
			name: "David Kim (Senior Backend Engineer)",
			avatarUrl:
				"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
			role: Role.INTERNAL_TEAM,
			department: Department.BACKEND,
		},
	});

	const frontendUser = await prisma.user.create({
		data: {
			email: "frontend@nodewave.id",
			passwordHash,
			name: "Maya Patel (Senior Frontend Engineer)",
			avatarUrl:
				"https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150",
			role: Role.INTERNAL_TEAM,
			department: Department.FRONTEND,
		},
	});

	const clientAcmeUser = await prisma.user.create({
		data: {
			email: "client@acmecorp.com",
			passwordHash,
			name: "Robert Vance (VP of Product, Acme Corp)",
			avatarUrl:
				"https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150",
			role: Role.CLIENT_GUEST,
			department: Department.CLIENT,
			clientTenantId: "tenant-acme-corp",
		},
	});

	const clientBetaUser = await prisma.user.create({
		data: {
			email: "client@betacorp.com",
			passwordHash,
			name: "Elena Rostova (CTO, Beta Logistics)",
			avatarUrl:
				"https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150",
			role: Role.CLIENT_GUEST,
			department: Department.CLIENT,
			clientTenantId: "tenant-beta-corp",
		},
	});

	console.log(
		"👤 Created users: PM, UI/UX, Backend, Frontend, and Multi-Tenant Client Guests.",
	);

	// 2. Create Projects
	const projectAcme = await prisma.project.create({
		data: {
			name: "Enterprise Fintech SuperApp",
			description:
				"Next-generation digital banking platform with multi-currency wallets, biometric authorization, and cross-border settlement.",
			status: ProjectStatus.ACTIVE,
			clientTenantId: "tenant-acme-corp",
		},
	});

	const projectBeta = await prisma.project.create({
		data: {
			name: "Global Autonomous Logistics Hub",
			description:
				"Real-time telemetry, automated dispatching, and dynamic route optimization dashboard for freight fleets.",
			status: ProjectStatus.ACTIVE,
			clientTenantId: "tenant-beta-corp",
		},
	});

	console.log("📁 Created projects: Acme Fintech and Beta Logistics.");

	// 3. Project Memberships
	await prisma.projectMember.createMany({
		data: [
			{
				projectId: projectAcme.id,
				userId: pmUser.id,
				roleInProject: "Product Owner",
			},
			{
				projectId: projectAcme.id,
				userId: uiuxUser.id,
				roleInProject: "Lead Designer",
			},
			{
				projectId: projectAcme.id,
				userId: backendUser.id,
				roleInProject: "Backend Architect",
			},
			{
				projectId: projectAcme.id,
				userId: frontendUser.id,
				roleInProject: "Frontend Lead",
			},

			// Project Beta has only PM and Backend
			{
				projectId: projectBeta.id,
				userId: pmUser.id,
				roleInProject: "Product Owner",
			},
			{
				projectId: projectBeta.id,
				userId: backendUser.id,
				roleInProject: "Backend Developer",
			},
		],
	});

	// 4. Create Tasks in Project Acme
	// Task A: UI Design (DONE)
	const taskUI = await prisma.task.create({
		data: {
			projectId: projectAcme.id,
			title: "Checkout Flow Design System & UI Specs",
			description:
				"Create interactive Figma prototypes and design specifications for multi-step checkout, one-click Apple Pay / Google Pay, and currency conversion modal.",
			department: Department.UIUX,
			status: TaskStatus.DONE,
			assigneeId: uiuxUser.id,
			isClientVisible: true,
			version: 2,
		},
	});

	// Task B: Backend API (IN_PROGRESS)
	const taskBackendAPI = await prisma.task.create({
		data: {
			projectId: projectAcme.id,
			title: "Payment Gateway Integration & Webhook Handler",
			description:
				"Implement idempotent payment intent endpoints, webhook receivers with signature verification, and ledger accounting database transactions.",
			department: Department.BACKEND,
			status: TaskStatus.IN_PROGRESS,
			assigneeId: backendUser.id,
			isClientVisible: false, // Internal backend task - masked from client
			version: 1,
		},
	});

	// Task C: Frontend Slicing (BLOCKED - depends on Task A and Task B)
	const taskFrontendSlicing = await prisma.task.create({
		data: {
			projectId: projectAcme.id,
			title: "Frontend Checkout Screen Slicing & State Machine",
			description:
				"Integrate the UI/UX Figma design with the payment intent API. Must handle card inputs, 3D Secure redirect modal, and error fallback states.",
			department: Department.FRONTEND,
			status: TaskStatus.BLOCKED,
			assigneeId: frontendUser.id,
			isClientVisible: true,
			version: 1,
		},
	});

	// Task D: Auth & Identity (DONE)
	const taskAuth = await prisma.task.create({
		data: {
			projectId: projectAcme.id,
			title: "OAuth2 & Biometric Session Management API",
			description:
				"Deliver JWT authentication with token rotation, refresh tokens, and rate-limiting middleware.",
			department: Department.BACKEND,
			status: TaskStatus.DONE,
			assigneeId: backendUser.id,
			isClientVisible: true,
			version: 3,
		},
	});

	// Task E: Client-Visible UI Header (IN_PROGRESS)
	const taskHeader = await prisma.task.create({
		data: {
			projectId: projectAcme.id,
			title: "Global Responsive Navigation & Account Drawer",
			description:
				"Responsive desktop & mobile navbar with tenant switcher, user profile drawer, and notification center.",
			department: Department.FRONTEND,
			status: TaskStatus.IN_PROGRESS,
			assigneeId: frontendUser.id,
			isClientVisible: true,
			version: 2,
		},
	});

	// Task F: Security Audit & Penetration Testing (TODO)
	const taskSecurity = await prisma.task.create({
		data: {
			projectId: projectAcme.id,
			title: "OWASP Top 10 Security Audit & Penetration Test",
			description:
				"Comprehensive static analysis, dependency vulnerability scan, and external API penetration testing.",
			department: Department.BACKEND,
			status: TaskStatus.TODO,
			assigneeId: backendUser.id,
			isClientVisible: false,
			version: 1,
		},
	});

	console.log("📋 Created tasks for Project Acme.");

	// 5. Create Task Dependencies
	// Task C depends on Task A (UIUX) and Task B (BACKEND)
	await prisma.taskDependency.createMany({
		data: [
			{
				prerequisiteTaskId: taskUI.id,
				dependentTaskId: taskFrontendSlicing.id,
			},
			{
				prerequisiteTaskId: taskBackendAPI.id,
				dependentTaskId: taskFrontendSlicing.id,
			},
			{ prerequisiteTaskId: taskAuth.id, dependentTaskId: taskHeader.id },
		],
	});

	console.log(
		"🔗 Linked DAG task dependencies: Frontend Slicing blocked by Backend API & UI Design.",
	);

	// 6. Create Attachments
	await prisma.attachment.createMany({
		data: [
			{
				taskId: taskUI.id,
				fileName: "checkout_figma_specs_v2.4.pdf",
				fileUrl:
					"https://storage.nodewave.internal/deliverables/checkout_figma_specs.pdf",
				fileSize: 4829100,
				fileType: "application/pdf",
				uploadedById: uiuxUser.id,
			},
			{
				taskId: taskBackendAPI.id,
				fileName: "payment_webhook_openapi_spec.json",
				fileUrl:
					"https://storage.nodewave.internal/deliverables/openapi_spec.json",
				fileSize: 124500,
				fileType: "application/json",
				uploadedById: backendUser.id,
			},
		],
	});

	// 7. Create Comments (including internal comments)
	await prisma.comment.createMany({
		data: [
			{
				taskId: taskFrontendSlicing.id,
				authorId: frontendUser.id,
				content:
					"I am waiting for David to complete the Payment Intent webhook before I can begin work on the payment form slicing.",
				isInternal: true,
			},
			{
				taskId: taskBackendAPI.id,
				authorId: backendUser.id,
				content:
					"Stripe webhook listener is in testing on sandbox environment. Expect completion today.",
				isInternal: true,
			},
			{
				taskId: taskUI.id,
				authorId: uiuxUser.id,
				content:
					"All design review notes from the client have been addressed in Figma version 2.4.",
				isInternal: false,
			},
		],
	});

	// 8. Create Audit Logs for Yesterday & Today (enables Daily Standup Summary testing!)
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	yesterday.setHours(16, 30, 0, 0);

	const yesterdayEarlier = new Date(yesterday);
	yesterdayEarlier.setHours(11, 15, 0, 0);

	await prisma.auditLog.createMany({
		data: [
			{
				entityName: "Task",
				entityId: taskUI.id,
				projectId: projectAcme.id,
				taskId: taskUI.id,
				userId: uiuxUser.id,
				action: "STATUS_CHANGE",
				changedColumn: "status",
				oldValue: "IN_PROGRESS",
				newValue: "DONE",
				createdAt: yesterday,
			},
			{
				entityName: "Task",
				entityId: taskAuth.id,
				projectId: projectAcme.id,
				taskId: taskAuth.id,
				userId: backendUser.id,
				action: "STATUS_CHANGE",
				changedColumn: "status",
				oldValue: "IN_PROGRESS",
				newValue: "DONE",
				createdAt: yesterdayEarlier,
			},
			{
				entityName: "Task",
				entityId: taskHeader.id,
				projectId: projectAcme.id,
				taskId: taskHeader.id,
				userId: frontendUser.id,
				action: "STATUS_CHANGE",
				changedColumn: "status",
				oldValue: "TODO",
				newValue: "IN_PROGRESS",
				createdAt: yesterday,
			},
			{
				entityName: "Task",
				entityId: taskFrontendSlicing.id,
				projectId: projectAcme.id,
				taskId: taskFrontendSlicing.id,
				userId: pmUser.id,
				action: "STATUS_CHANGE",
				changedColumn: "status",
				oldValue: "TODO",
				newValue: "BLOCKED",
				createdAt: new Date(),
			},
		],
	});

	console.log("📜 Seeded immutable audit trail entries.");
	console.log("✅ Seeding completed successfully!");
	console.log("\nDefault Test Accounts:");
	console.log("1. Product Manager:  pm@nodewave.id       / Password123!");
	console.log("2. UI/UX Designer:   uiux@nodewave.id     / Password123!");
	console.log("3. Backend Engineer: backend@nodewave.id  / Password123!");
	console.log("4. Frontend Engineer:frontend@nodewave.id / Password123!");
	console.log("5. Acme Client:      client@acmecorp.com  / Password123!");
	console.log("6. Beta Client:      client@betacorp.com  / Password123!");
}

main()
	.catch((e) => {
		console.error("Error during seeding:", e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
