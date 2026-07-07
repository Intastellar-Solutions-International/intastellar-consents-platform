const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
/* const nodeExternals = require('webpack-node-externals'); */

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
      new HtmlWebpackPlugin({
        template: "./index.html",
      })
    ]
  }

  if (argv.mode === 'production') {
    config.mode = 'production';
    config.plugins = [
      dotenv,
      new HtmlWebpackPlugin({
        template: "./production.html",
      })
    ]
  }

  return config;
};