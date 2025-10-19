"use server";

export async function resendVerificationEmail(email: string) {
  await fetch(`/api/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    cache: 'no-store',
  });
}
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function logout() {
  // This will run on the server to delete the cookie and redirect
  const cs = await cookies();
  cs.delete('playerName');
  redirect('/login');
}
