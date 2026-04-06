import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_DEBUG: z
      .string()
      .optional()
      .transform((val) => val === "true"),
  },
  server: {},
  // @ts-expect-error - workaround for missing type in env-core package
  runtimeEnv: import.meta.env,
});
