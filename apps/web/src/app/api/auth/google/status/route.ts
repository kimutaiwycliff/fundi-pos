import { googleConfigured } from '@/lib/google-oauth';

// Lets the login/signup pages hide the Google button until it's set up.
export function GET() {
  return Response.json({ enabled: googleConfigured() });
}
