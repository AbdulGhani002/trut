import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      tokens: number;
      name: string;
      email: string;
    };
  }

  interface User {
    id: string;
    username: string;
    tokens: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    username: string;
    tokens: number;
  }
}
