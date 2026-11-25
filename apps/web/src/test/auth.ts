import { useAuth } from "@/features/auth/auth-store";
import type { Role } from "@/features/auth/roles";

/** Тестэд тухайн role-тэй хэрэглэгч нэвтэрсэн төлөвт оруулна. */
export function signInAs(role: Role) {
  useAuth.setState({
    status: "signedIn",
    accessToken: "t",
    user: {
      id: 1,
      email: "a@b.co",
      full_name: "Ada",
      role,
      avatar_url: null,
      has_password: true,
      phone: null,
      email_verified: false,
      phone_verified: false,
      providers: [] as string[],
    },
  });
}
