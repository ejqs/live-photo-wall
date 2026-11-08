# live-photo-wall

A self-hosted photo wall for events. Guests scan a QR code and add photos from their phones, hosts approve them, and one or more full-screen walls (an LED wall, a lobby screen) play everything as a grid of swapping photos.

- **Guests** upload from a link or QR code. No account, no app. They see when their photo is about to appear.
- **Hosts** approve photos from any phone, upload a roster of prepared photos, design the overlay (title, fonts, PNG overlays, QR) and tune the motion.
- **Walls** are browsers in full screen. They cache every photo on disk and keep playing if the internet drops.
- **After the event**: download every photo as a zip with captions, or render the wall as an MP4.

Built with Next.js, better-auth, Drizzle (Postgres), Tailwind and shadcn/ui. Made to run on [Railway](https://railway.com) with a Postgres database and a Bucket.

## Run it locally

Needs Node 20.9+ and Postgres.

```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL, BETTER_AUTH_SECRET and OWNER_EMAIL
npm run db:migrate
npm run dev
```

Open http://localhost:3000/sign-in and create the owner account with the email you put in `OWNER_EMAIL`. Without a bucket configured, files are stored in `.data/storage`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |
| `npm run worker` | Background worker (MP4 export, retention cleanup). Needs Chromium and ffmpeg |
| `npm run lint` / `npm run typecheck` / `npm test` | Checks |

## Deploy on Railway

1. **Create a project** with a **Postgres** database and a **Bucket**.
2. **Web service**: add a service from this repository.
   - Variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `BETTER_AUTH_SECRET` (a long random string), `BETTER_AUTH_URL` (the service's public URL), `OWNER_EMAIL`, and the bucket's credentials (`AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`, `AWS_DEFAULT_REGION`; Railway can fill these from the Bucket).
   - Settings, Deploy: set the **pre-deploy command** to `npm run db:migrate`.
   - Settings, Networking: generate a domain.
3. **Worker service** (only needed for MP4 export and automatic cleanup): add a second service from the same repository.
   - Variables: the same as the web service, plus `RAILWAY_DOCKERFILE_PATH=worker/Dockerfile` and `RENDER_APP_URL=http://${{web.RAILWAY_PRIVATE_DOMAIN}}:${{web.PORT}}` (use your web service's name).
4. Open `/sign-in` on your domain and create the owner account.

**Your own domain.** In the web service, Settings, Networking, add a custom domain and create the DNS record Railway shows. Then update `BETTER_AUTH_URL` to the new address, and set the public address on the admin's Event settings page so QR codes use it.

**Scale.** One web instance handles a few hundred guests comfortably: images are resized on upload and served from an in-memory cache with immutable URLs. Live updates (approvals, wall sync) use an in-process event bus, so keep the web service at **one replica**.

## How it works

- **Photos** are re-encoded on upload (metadata and location stripped) into a 4096 px JPEG plus 1600 px and 400 px WebP versions, named by content hash.
- **Walls** pair with a six-letter key, download a manifest (design, motion, playlist, photo list) and cache everything through a service worker. They report status every 15 seconds and get changes over server-sent events.
- **Fast lane.** When a guest photo is approved, the primary wall reserves a cell a few seconds ahead and tells the server where and when, so the guest's phone can count down.
- **Motion** effects are JSON files in the `wallmotion/1` format (see `src/wallmotion`): a timeline of tweens on three layers per cell, with safe expressions and no code. The built-in effect is "whiten and drop". The admin has an editor with live validation and a prompt you can give an AI assistant to write new effects.
- **MP4 export.** The worker opens `/wall/render` in headless Chromium, advances a virtual clock one frame at a time, and pipes screenshots into ffmpeg, so the video is smooth no matter how slow the machine.
- **Retention.** Guest photo files are deleted a set number of days after the event ends (30 by default). Export links last 7 days.

## Roles

| Role | Can |
| --- | --- |
| Owner | Everything, including the team |
| Admin | Design, motion, walls, settings, exports |
| Moderator | Approve, reject and take down photos |

There's no public sign-up; the owner creates accounts on the Team page.

## Content and privacy

Logos, fonts and photos are uploaded through the admin and stored in your bucket. Don't commit them to the repository. Only upload fonts you're licensed to use.
