import net from "node:net";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

async function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = new net.Socket();
		socket.setTimeout(800);
		socket.once("connect", () => {
			socket.destroy();
			resolve(true);
		});
		socket.once("timeout", () => {
			socket.destroy();
			resolve(false);
		});
		socket.once("error", () => {
			resolve(false);
		});
		socket.connect(port, host);
	});
}

let pgInstance: EmbeddedPostgres | null = null;

export async function ensurePostgresRunning() {
	const isRunning = await isPortOpen(5432);
	if (isRunning) {
		console.log(
			"[Database] PostgreSQL is already active and listening on port 5432.",
		);
		return;
	}

	console.log("[Database] Starting embedded PostgreSQL server...");
	const dbDir = path.resolve(process.cwd(), ".pg_data");
	pgInstance = new EmbeddedPostgres({
		databaseDir: dbDir,
		user: "postgres",
		password: "postgrespassword",
		port: 5432,
		persistent: true,
	});

	try {
		await pgInstance.initialise();
	} catch {
		// Already initialised
	}

	await pgInstance.start();

	try {
		await pgInstance.createDatabase("high_value_projects");
	} catch {
		// Database may already exist
	}

	console.log("[Database] Embedded PostgreSQL server started successfully.");
}
