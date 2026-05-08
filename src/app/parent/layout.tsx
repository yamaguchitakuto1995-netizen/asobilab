import { redirect } from "next/navigation";
import { ParentHeader } from "@/components/ParentHeader";
import { getCurrentUser } from "@/lib/auth";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.accountRole !== "parent") redirect("/");

  return (
    <div className="min-h-screen flex flex-col">
      <ParentHeader email={user.email} />
      <div className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</div>
      </div>
    </div>
  );
}
