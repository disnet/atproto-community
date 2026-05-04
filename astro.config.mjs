// @ts-check
import { defineConfig } from "astro/config";
import authproto from "@fujocoded/authproto";

import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  site: "https://atmosphere.community",
  base: "/",
  output: "static",
  server: {
    host: true,
  },
  adapter: node({
    mode: "standalone",
  }),
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
