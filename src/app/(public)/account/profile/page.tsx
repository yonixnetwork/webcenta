import { ProfileSection } from "@/components/account/sections";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser("/account/profile");
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Profile</h1>
      <ProfileSection user={user} />
    </>
  );
}
