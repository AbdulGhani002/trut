import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });
    const origin = req.headers.get('origin') || (process.env.NEXTAUTH_URL ?? 'http://localhost:3001');

    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: '1000 Tokens' },
            unit_amount: 500,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/shop?success=1`,
      cancel_url: `${origin}/shop?canceled=1`,
      metadata: {
        userId: session.user.id,
        email: session.user.email,
        tokens: '1000',
      },
    });

    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error('Stripe session error:', e);
    return NextResponse.json({ message: 'Failed to create checkout session' }, { status: 500 });
  }
}
