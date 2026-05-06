// @ts-check
import { defineConfig } from "astro/config";

import vercel from "@astrojs/vercel";
import authproto from "@fujocoded/authproto";

// https://astro.build/config
export default defineConfig({
  site: "https://atmosphere.community",
  base: "/",
  output: "server",
  server: {
    host: true,
  },
  adapter: vercel(),
  session: {
    driver: { entrypoint: "unstorage/drivers/memory" },
  },
  security: {
    allowedDomains: [{ hostname: "atmosphere.community", protocol: "https" }],
  },
  integrations: [
    authproto({
      applicationName: "Atmosphere.community",
      applicationDomain: "https://atmosphere.community",
      scopes: {
        additionalScopes: [
          "repo:community.lexicon.calendar.rsvp?action=create&action=update",
        ],
      },
      driver: {
        name: "memory",
      },
    }),
  ],
});
