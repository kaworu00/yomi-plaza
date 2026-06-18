import { cookies } from "next/headers";
import { getLocalProfile } from "@/lib/local-db";

export const demoSessionCookie = "huangquan_demo_session";

export function getDemoProfileFromCookie() {
  const session = cookies().get(demoSessionCookie)?.value;
  return getLocalProfile(session ?? null);
}
