'use client';
//

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { resendVerificationEmail } from '@/app/actions';

export default function AuthForm() {
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ [k: string]: string }>({});
  const router = useRouter();
  let btnText = 'Login';
  if (isRegister) btnText = 'Register';
  if (loading) btnText = 'Please wait';

  const validateForm = (data: Record<string, string>, registerMode: boolean) => {
    const errs: { [k: string]: string } = {};
    const emailVal = data.email ?? '';
    const passVal = data.password ?? '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) errs.email = 'Enter a valid email address.';
    if (passVal.length < 6) errs.password = 'Password must be at least 6 characters.';

    if (registerMode) {
      const nameVal = data.name ?? '';
      const userVal = data.username ?? '';
      if (nameVal.trim().length < 3) errs.name = 'Name must be at least 3 characters.';
      if (!/^\w+$/.test(userVal) || userVal.length < 3) {
        errs.username = 'Username must be at least 3 chars and contain only letters, numbers, underscores.';
      }
    }
    return errs;
  };

  const doRegister = async (data: Record<string, string>) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setIsRegister(false);
        setError('Registration successful. Please check your email to verify your account.');
        return true;
      }
      const { message } = await res.json();
      setError(message || 'Registration failed.');
      return false;
    } catch {
      setError('An unexpected error occurred during registration.');
      return false;
    }
  };

  const doLogin = async (data: Record<string, string>) => {
    const result = await signIn('credentials', {
      redirect: false,
      email: data.email,
      password: data.password,
    });
    if (result?.error) {
      if (/verify your email/i.test(result.error)) {
        setError('Please verify your email. You can request a new verification email below.');
      } else {
        setError('Invalid email or password');
      }
      return false;
    }
    router.push('/');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries()) as Record<string, string>;

    // client-side validation before submitting
    const clientErrors = validateForm(data, isRegister);

    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setLoading(false);
      return;
    }
    setFieldErrors({});

    if (isRegister) await doRegister(data);
    else await doLogin(data);
    setLoading(false);
  };

  const handleFieldChange = (name: string, value: string) => {
    // live field validation via map
    const validators: Record<string, (v: string) => string | undefined> = {
      email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Invalid email'),
      password: (v) => (v.length < 6 ? 'Password too short' : undefined),
      username: (v) => (v.length < 3 || !/^\w+$/.test(v) ? 'Invalid username' : undefined),
      name: (v) => (v.trim().length < 3 ? 'Name too short' : undefined),
    };
    const message = validators[name]?.(value);
    const next = { ...fieldErrors };
    if (message) next[name] = message; else delete next[name];
    setFieldErrors(next);
  };

  return (
    <div className="w-full max-w-md">
      <form className="glass-panel p-6 mb-4" onSubmit={handleSubmit}>
        <h2 className="text-3xl font-extrabold mb-4 text-center">{isRegister ? 'Create account' : 'Welcome back'}</h2>

        {isRegister && (
          <div className="mb-4">
            <label className="block text-white/80 text-sm font-semibold mb-2" htmlFor="name">Name</label>
            <input onChange={(e) => handleFieldChange('name', e.target.value)} className="w-full rounded-md px-3 py-2 bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:outline-none" type="text" id="name" name="name" required />
            {fieldErrors.name && <p className="text-rose-400 text-sm mt-1">{fieldErrors.name}</p>}
          </div>
        )}
        {isRegister && (
            <div className="mb-4">
                <label className="block text-white/80 text-sm font-semibold mb-2" htmlFor="username">Username</label>
            <input onChange={(e) => handleFieldChange('username', e.target.value)} className="w-full rounded-md px-3 py-2 bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:outline-none" type="text" id="username" name="username" required />
            {fieldErrors.username && <p className="text-rose-400 text-sm mt-1">{fieldErrors.username}</p>}
            </div>
        )}
        <div className="mb-4">
          <label className="block text-white/80 text-sm font-semibold mb-2" htmlFor="email">Email</label>
          <input onChange={(e) => handleFieldChange('email', e.target.value)} className="w-full rounded-md px-3 py-2 bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:outline-none" type="email" id="email" name="email" required />
          {fieldErrors.email && <p className="text-rose-400 text-sm mt-1">{fieldErrors.email}</p>}
        </div>
        <div className="mb-6">
          <label className="block text-white/80 text-sm font-semibold mb-2" htmlFor="password">Password</label>
          <input onChange={(e) => handleFieldChange('password', e.target.value)} className="w-full rounded-md px-3 py-2 bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:outline-none" type="password" id="password" name="password" required />
          {fieldErrors.password && <p className="text-rose-400 text-sm mt-1">{fieldErrors.password}</p>}
        </div>

        {error && <p className="text-rose-400 text-sm italic mb-4">{error}</p>}

        <div className="flex items-center gap-3">
          <button className="flex-1 px-4 py-2 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 transition text-white font-semibold shadow-lg flex items-center justify-center gap-2" type="submit" disabled={loading || Object.keys(fieldErrors).length > 0}>
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>
            ) : null}
            <span>{btnText}</span>
          </button>
          <button type="button" onClick={() => { setIsRegister(!isRegister); setError(''); }} className="px-3 py-2 rounded-md bg-white/3 hover:bg-white/5 text-sm text-white/90">
            {isRegister ? 'Have an account' : 'Register'}
          </button>
        </div>
      </form>
      <div className="text-center text-white/60 text-sm mt-2">
        {error && /verify your email/i.test(error) ? (
          <button
            type="button"
            className="underline text-white/80 hover:text-white"
            onClick={async () => {
              const emailInput = (document.getElementById('email') as HTMLInputElement | null)?.value;
              if (emailInput) {
                await resendVerificationEmail(emailInput);
                alert('If your account exists and is unverified, a verification email has been sent.');
              }
            }}
          >
            Resend verification email
          </button>
        ) : null}
      </div>
      <p className="text-center text-white/60 text-sm mt-2">
        By continuing you agree to our <span className="underline">Terms</span> and <span className="underline">Privacy</span>.
      </p>
    </div>
  );
}
