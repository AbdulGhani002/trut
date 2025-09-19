import { NextResponse, NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const playerName = request.cookies.get('playerName')?.value;

  // If not logged in and trying to access dashboard/root, send to /login
  if (!playerName && (pathname === '/' || pathname.startsWith('/(dashboard)'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If already logged in and visiting /login, go to dashboard
  if (playerName && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login'],
};


