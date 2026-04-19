# Intastellar Consents — Remix migration (`remix-version`)

This is the **Remix + Vite** shell for the existing dashboard: the full legacy app from `../src/App.js` is mounted client-side in one catch-all route (see **`app/legacy/`** and **[MIGRATION.md](./MIGRATION.md)**). All previous screens and URLs should behave as in the webpack build, while you can later replace pieces with native Remix loaders and routes.

- 📖 [Remix docs](https://remix.run/docs)

## Requirements

Use **Node 18+** (see `.nvmrc` for **20**). The sandbox default may be older; run `nvm use` before `npm run dev`.

## Development

```shellscript
cd remix-version
npm install
npm run dev
```

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

Now you'll need to pick a host to deploy it to.

### DIY

If you're familiar with deploying Node applications, the built-in Remix app server is production-ready.

Make sure to deploy the output of `npm run build`

- `build/server`
- `build/client`

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever css framework you prefer. See the [Vite docs on css](https://vitejs.dev/guide/features.html#css) for more information.
