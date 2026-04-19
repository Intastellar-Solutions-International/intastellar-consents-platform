# Intastellar Consents — Remix migration (`remix-version`)

This is the **Remix + Vite** port of the webpack/React Router app in the repo root. It mirrors legacy URLs; most routes are **placeholders** until components are moved over. See **[MIGRATION.md](./MIGRATION.md)** for the route map and porting notes.

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
