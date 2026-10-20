import { spawnSync } from "node:child_process";
import path from "node:path";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./support/env";

/**
 * Admin тестүүдийн нэвтэрдэг админ байгаа эсэхийг баталгаажуулна. Оператор ашигладаг CLI-аар (`make
 * create-admin`) дамждаг тул тэр замыг мөн шалгана. Давтан ажиллуулахад аюулгүй: байгаа account-ыг
 * админ болгож, энэ нууц үгийг өгнө.
 */
export default function globalSetup() {
  const result = spawnSync(
    "uv",
    ["run", "python", "-m", "angel.cli.admin", "create-admin", "--email", ADMIN_EMAIL, "--name", "E2E Admin"],
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
