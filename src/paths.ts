import { homedir } from "os";
import { join } from "path";

export const AGENTBOARD_DIR = join(homedir(), ".agentboard");
export const PROJECTS_FILE = join(AGENTBOARD_DIR, "projects.json");
export const SCHEDULE_FILE = join(AGENTBOARD_DIR, "schedule.json");
export const DEFAULT_PORT = 8123;
