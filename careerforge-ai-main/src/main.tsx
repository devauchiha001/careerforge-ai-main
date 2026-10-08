import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { getMissingEnv } from "./lib/env";

const root = createRoot(document.getElementById("root")!);
const missing = getMissingEnv();

// Validate configuration before Firebase initializes, so a missing .env shows
// setup instructions instead of a blank page.
if (missing.length) {
  root.render(
    <main className="config-error">
      <div className="card panel">
        <h1>Firebase isn't configured</h1>
        <p>CareerForge AI needs these environment variables, which are missing or empty:</p>
        <ul>{missing.map((name) => <li key={name}><code>{name}</code></li>)}</ul>
        <p>Copy <code>.env.example</code> to <code>.env</code>, fill in the values from Firebase Console → Project settings → Your apps, then restart <code>npm run dev</code>.</p>
      </div>
    </main>,
  );
} else {
  import("./App").then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
}
