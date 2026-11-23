// The app shares plain-JS modules with the web dashboard (translations,
// the small-sample rule, consent definitions) straight from ../../src, so
// numbers and wording can't drift. Metro only watches the project folder by
// default; add the repo's src/ so those imports resolve and hot-reload.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, "../../src")];

module.exports = config;
