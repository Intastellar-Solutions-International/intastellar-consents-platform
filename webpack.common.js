const path = require('path');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
/* const nodeExternals = require('webpack-node-externals'); */

// Emit src/sw.js as a raw, un-bundled asset so the service worker context
// doesn't break on webpack's CommonJS wrapper (exports / require).
class CopySwPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('CopySwPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'CopySwPlugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
        () => {
          const src = path.resolve(__dirname, 'src/sw.js');
          const content = fs.readFileSync(src, 'utf8');
          compilation.emitAsset('sw.js', new compiler.webpack.sources.RawSource(content));
        }
      );
    });
  }
}

const config = {
  entry: {
    intastellarAnalytics: path.resolve(__dirname, '/index.js'),
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, "./dist"),
    clean: true,
    publicPath: "/"
  },
  
  externals: {},
  module: {
    rules: [
      {
          test: /\.node$/,
          loader: "node-loader",
      },
      {
          test: /\.(jsx|js)$/,
          include: path.resolve(__dirname),
          exclude: /node_modules/,
          use: [{
          loader: 'babel-loader',
          options: {
              presets: [
              [
                  '@babel/preset-env',
                  { targets: "defaults" }
              ],
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
          test: /\.(png|jpe?g|gif)$/i,
          use: [
            {
              loader: 'file-loader',
            },
          ],
      }
    ]
  }
};

module.exports = (env, argv) => {
  const dotenv = new Dotenv({ systemvars: true });

  if (argv.mode === 'development') {
    config.devtool = 'source-map';
    config.mode = 'development';
    config.plugins = [
      dotenv,
      new HtmlWebpackPlugin({ template: "./index.html" }),
      new CopySwPlugin(),
    ];
    config.devServer = {
      port: 8080,
      hot: true,
      historyApiFallback: true,
      static: './dist',
      proxy: [
        {
          context: ['/api'],
          target: 'https://www.intastellarconsents.com',
          changeOrigin: true,
          secure: true,
        },
      ],
    };
  }

  if (argv.mode === 'production') {
    config.mode = 'production';
    config.plugins = [
      dotenv,
      new HtmlWebpackPlugin({ template: "./production.html" }),
      new CopySwPlugin(),
    ]
  }

  return config;
};