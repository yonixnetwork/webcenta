import { SecuritySection } from "@/components/account/sections";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Security" };

export default async function SecurityPage() {
  const user = await requireUser("/account/security");
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Security</h1>
      <SecuritySection user={user} />
    </>
  );
}
