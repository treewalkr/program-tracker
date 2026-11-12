# Sign-in

Live mode is invite-only: trainers sign in with Google. Set four vars in
`.env` (or `.env.local` for Docker): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI` and `ADMIN_EMAIL` (see `.env.example`).

- `ADMIN_EMAIL` is the platform admin. They can always sign in, and their first
  sign-in links the original trainer row, so every existing client and program stays put.
  (`TRAINER_EMAIL` still works as a fallback name.)
- The admin adds trainers at **Platform → Trainers** (`/admin`) by name and Google email.
  That email can then sign in; the first sign-in links the Google account.
- Each trainer sees only their own clients, programs and libraries. Any id that belongs
  to another trainer answers 404.
- Disabling a trainer signs them out everywhere and blocks sign-in. Unused invites can
  be removed; trainers who have signed in can only be disabled, so their data is kept.
- Google emails must be verified.
- Sessions are httpOnly cookies that last 30 days. The DB stores only a hash of each token.
- Google accepts plain `http` only for `localhost`. To sign in from another device
  (e.g. Tailscale), serve the web app over https, then point `GOOGLE_REDIRECT_URI` at
  `https://<that-host>/v1/auth/google/callback` and register that URI in Google.
- Demo (mock) mode needs no sign-in.
