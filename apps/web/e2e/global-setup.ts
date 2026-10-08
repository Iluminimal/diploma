import { spawnSync } from "node:child_process";
import path from "node:path";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./support/env";

/**
 * Makes sure the administrator the admin tests sign in as exists. It goes through the same CLI an
 * operator uses (`make create-admin`), so it also covers that path. Safe to repeat: an existing
 * account is promoted and given this password.
 */
export default function globalSetup() {
  const result = spawnSync(
    "uv",
    ["run", "python", "-m", "lookalike.cli", "create-admin", "--email", ADMIN_EMAIL, "--name", "E2E Admin"],
    {
      cwd: path.resolve(__dirname, "../../api"),
      env: { ...process.env, ADMIN_PASSWORD },
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(`Could not create the e2e administrator:\n${result.stdout}\n${result.stderr}`);
  }
}
