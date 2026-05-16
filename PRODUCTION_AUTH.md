# Google Login Production Plan

The current desktop app has a Google sign-in placeholder so the user flow can be tested. To make it real, configure Google OAuth and add a backend auth service.

## Google Cloud Setup

1. Create a Google Cloud project.
2. Open **APIs & Services > OAuth consent screen**.
3. Configure the app name, support email, logo, privacy policy, and terms URL.
4. Open **Credentials** and create an OAuth client.
5. For a desktop app, use OAuth Authorization Code with PKCE.
6. For a web callback service, add an HTTPS redirect URI such as:

```text
https://api.example.com/auth/google/callback
```

For the Supabase project created for this app:

```text
Supabase URL: https://sjrnklqreabuyissnpwu.supabase.co
Supabase OAuth callback: https://sjrnklqreabuyissnpwu.supabase.co/auth/v1/callback
Desktop redirect URL: ulteraview://auth-callback
```

In the Supabase Dashboard, enable Google under **Authentication > Providers > Google**, then add `ulteraview://auth-callback` under **Authentication > URL Configuration > Redirect URLs**.

## Required Backend Endpoints

```text
GET  /auth/google/start
GET  /auth/google/callback
POST /auth/logout
GET  /auth/me
```

## Production Session Rules

- Store user sessions in secure HTTP-only cookies.
- Use short-lived access sessions and refresh tokens.
- Store users in PostgreSQL.
- Require login before creating or joining a remote session.
- Attach `userId` to every audit event.

## Desktop Flow

1. User clicks **Sign in with Google**.
2. Desktop opens the system browser to `/auth/google/start`.
3. User signs in with Google.
4. Backend redirects to a local deep link or shows a one-time code.
5. Desktop exchanges the one-time code for an app session.

## Security Notes

- Do not put `GOOGLE_CLIENT_SECRET` in the Electron app.
- Do not trust profile information sent from the renderer.
- Verify Google tokens on the backend only.
- Use HTTPS in production.
