"use client";
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function QueryBanners() {
  const params = useSearchParams();
  return (
    <>
      {params.get('success') && (
        <div className="mb-4 p-3 rounded bg-green-600/20 border border-green-500/30 text-green-200">Thank you! Tokens will be added shortly.</div>
      )}
      {params.get('canceled') && (
        <div className="mb-4 p-3 rounded bg-yellow-600/20 border border-yellow-500/30 text-yellow-200">Checkout canceled.</div>
      )}
    </>
  );
}

export default function ShopPage() {
  const [loading, setLoading] = useState(false);

  const handleBuy = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', { method: 'POST' });
      const data = await res.json();
  if (data.url) globalThis.location.href = data.url as string;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Shop</h1>
      <Suspense fallback={null}>
        <QueryBanners />
      </Suspense>
      <div className="glass-panel p-4 flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">1000 Tokens</div>
          <div className="text-white/60 text-sm">One-time purchase</div>
        </div>
        <button onClick={handleBuy} disabled={loading} className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">
          {loading ? 'Redirecting...' : '$5 Buy'}
        </button>
      </div>
    </div>
  );
}
