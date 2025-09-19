'use server';

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function logout() {
  // This will run on the server to delete the cookie and redirect
  const cs = await cookies();
  cs.delete('playerName');
  redirect('/login');
}
