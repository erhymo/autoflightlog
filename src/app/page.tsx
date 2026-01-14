import { redirect } from "next/navigation";

export default function Home() {
  // Root entrypoint: send user into the app shell.
  // AuthGate will redirect to /login if no user is authenticated.
  // (Kept server-side to avoid client-side flicker.)
  redirect("/app/dashboard");
}
