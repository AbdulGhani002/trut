import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default function LoginPage() {
  async function saveName(formData: FormData) {
    'use server';
    const raw = String(formData.get('name') || '').trim().slice(0, 20);
    const name = raw.length > 0 ? raw : 'Guest';
    const cs = await cookies();
    cs.set('playerName', name, { path: '/', maxAge: 60 * 60 * 24 * 365 });
    redirect('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md glass-panel p-6">
        <div className="text-center mb-6">
          <h1 className="text-5xl font-extrabold">TRUT</h1>
          <p className="text-white/60 mt-2">Bluff • Strategy • Psychology</p>
        </div>
        <form action={saveName} className="space-y-4">
          <label className="block text-sm text-white/80">Enter your name</label>
          <input
            name="name"
            required
            placeholder="e.g. Alex"
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 outline-none"
          />
          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 transition font-semibold"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}


