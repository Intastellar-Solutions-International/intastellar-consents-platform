const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');

const client = {
  entry: path.resolve(__dirname, 'index.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
    publicPath: '/'
  },
  mode: "development",
  watch: true,
  watchOptions: {
    ignored: /node_modules/,
  },
  externals: {
    'react': 'React',
    'react-dom': 'ReactDOM',
    'react-router-dom': 'ReactRouterDOM'
  },
  devServer: {
    historyApiFallback: true,
    host: '0.0.0.0',           // optional: reachable from LAN too
    allowedHosts: ['cmp.inta.dev', '.inta.dev', 'inta.cmp'],
    // Forward /api/* to Vercel serverless (run `npm run dev:api` in another terminal, default port 3000).
    // Override with env: API_PROXY_TARGET=http://127.0.0.1:9999 npm start
    proxy: [
      {
        context: ['/api'],
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    ],
  },
  resolve: {
    modules: [
      'node_modules',
      path.resolve('node_modules')
    ]
  },
  module: {
    rules: [
      {
        test: /\.node$/,
        loader: "node-loader",
      },
      {
        test: /\.(jsx|js|ts)$/,
        include: path.resolve(__dirname),
        exclude: /node_modules/,
        use: [{
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              '@babel/preset-react'
            ]
          }
        }]
      },
      {
        test: /\.(css)$/,
        include: path.resolve(__dirname, 'src'),
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        use: [
          {
            loader: 'file-loader',
          },
        ],
      }
    ]
  },
};

// Standalone session-recording bundle (src/recorder-entry.js), served as a
// static /r.js asset alongside the SPA's own build output — NOT part of the
// dashboard bundle, and lazily loaded on customer sites by the embed script
// (api/a.js) only when recording is enabled and the visit is sampled in.
// Bundles rrweb fully (no externals) since it runs standalone on third-party
// pages, not inside this app.
const recorder = {
  entry: path.resolve(__dirname, 'src/recorder-entry.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'r.js',
    publicPath: '/',
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.(js|ts)$/,
        include: path.resolve(__dirname, 'src'),
        use: [{
          loader: 'babel-loader',
          options: { presets: ['@babel/preset-env'] },
        }],
      },
    ],
  },
};

module.exports = (env, argv) => {
  if (argv.mode === 'development') {
    client.devtool = 'source-map';
    client.mode = 'development';
    client.plugins = [
      new HtmlWebpackPlugin({
        template: "./index.html",
      }),
      new Dotenv({
        path: './.env', // Path to your .env file (default is './.env')
        safe: false,    // Set to true if you want to load a .env.example file for validation
      }),
    ]
  }

  if (argv.mode === 'production') {
    //...
    client.mode = "production";
    client.output.filename = "bundle.js";
    client.plugins = [
      new HtmlWebpackPlugin({
        template: "./production.html",
      }),
      new Dotenv({
        path: './.env', // Path to your .env file (default is './.env')
        safe: false,    // Set to true if you want to load a .env.example file for validation
      }),

    ]

  }

  return [client, recorder];
};