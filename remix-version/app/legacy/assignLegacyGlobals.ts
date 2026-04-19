import * as React from "react";
import * as ReactDOM from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";
import * as ReactRouterDOM from "react-router-dom-v5";

type GlobalLegacy = typeof globalThis & {
  React: typeof React;
  ReactDOM: typeof ReactDOM & {
    createRoot: typeof createRoot;
    hydrateRoot: typeof hydrateRoot;
  };
  ReactRouterDOM: typeof ReactRouterDOM;
};

let assigned = false;

/** Expose the same globals the webpack HTML shell used (UMD React + RR v5). */
export function assignLegacyGlobals(): void {
  if (assigned || typeof window === "undefined") return;
  assigned = true;
  const g = globalThis as GlobalLegacy;
  g.React = React;
  g.ReactDOM = Object.assign(ReactDOM, { createRoot, hydrateRoot });
  g.ReactRouterDOM = ReactRouterDOM;
}
