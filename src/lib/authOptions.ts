import type { NextAuthOptions, User as NextAuthUser, Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import dbConnect from '@/lib/db';
import User from '@shared/models/User';
import bcrypt from 'bcryptjs';

type AppUser = NextAuthUser & { id: string; username: string; tokens: number };

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        await dbConnect();

        if (!credentials?.email || !credentials.password) {
          throw new Error('Please enter your email and password.');
        }

        const user = await User.findOne({ email: credentials.email });
        if (!user?.password) {
          throw new Error('No user found with this email.');
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
        if (!isPasswordValid) {
          throw new Error('Invalid password.');
        }

        if (!user.emailVerified) {
          throw new Error('Please verify your email before logging in.');
        }

        const result: NextAuthUser = {
          id: user.uuid,
          name: user.name,
          email: user.email,
          // augmented fields via module augmentation
          username: user.username,
          tokens: user.tokens,
        } as unknown as NextAuthUser;
        return result;
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: NextAuthUser }) {
      if (user) {
        // copy custom fields from user to token
        const u = user as unknown as AppUser;
        token.id = u.id;
        token.username = u.username;
        token.tokens = u.tokens;
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) {
        // assign values from token to session.user (module augmentation allows these fields)
        // Types from module augmentation: id, username, tokens exist on Session['user']
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.tokens = typeof token.tokens === 'number' ? token.tokens : 0;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
    error: '/login',
  },
};
