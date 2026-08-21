import { getCurrentUser } from "@/lib/auth";

// Placeholder until M4: the real overview screen (one route, one component, branching on role) is
// built there, reading GET /api/dashboard. Auth + role resolution now live in (app)/layout.tsx —
// this page can assume `getCurrentUser()` returns a user.
export default async function Home() {
  const user = await getCurrentUser();
  // Not reachable in practice — the layout already redirects signed-out visitors — but
  // getCurrentUser()'s return type is nullable, so TypeScript needs this checked here too.
  if (!user) return null;

  return (
    <div className="px-8 py-10">
      <h1 className="text-2xl font-extrabold tracking-[-0.6px]">AHD Dashboard</h1>

      <div className="mt-6 max-w-md rounded-card border border-line p-[22px]">
        <div className="text-sm font-bold">{user.name}</div>
        <div className="mt-1 text-[12.5px] text-ink-3">{user.email}</div>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-pill bg-cyan-bg px-2.5 py-1 text-[11.5px] font-semibold text-cyan-ink">
          <span className="h-1.5 w-1.5 rounded-pill bg-cyan" />
          {user.role === "manager" ? "Manager" : "Creator"}
        </span>
      </div>
    </div>
  );
}
