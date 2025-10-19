import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import dbConnect from '@/lib/db';
import User from '@shared/models/User';

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const rawBody = await req.text();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });
  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({}, { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed.', err);
    return NextResponse.json({}, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.metadata?.email;
    const tokens = Number(session.metadata?.tokens || '0');
    if (email && tokens > 0) {
      await dbConnect();
      const user = await User.findOne({ email });
      if (user) {
        user.tokens = (user.tokens || 0) + tokens;
        await user.save();
      }
    }
  }

  return NextResponse.json({ received: true });
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
