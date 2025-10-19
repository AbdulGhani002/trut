import AuthForm from '@/components/AuthForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-3xl w-full">
        <header className="text-center mb-6">
          <h1 className="text-5xl font-extrabold tracking-tight">TRUT</h1>
          <p className="text-sm text-white/60">Bluff • Strategy • Psychology</p>
        </header>

        <div className="glass-panel max-w-md mx-auto p-6">
          <AuthForm />
        </div>
      </div>
    </div>
  );
}


