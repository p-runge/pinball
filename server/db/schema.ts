import {
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const highscores = pgTable("highscores", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 32 }).notNull(),
  score: integer("score").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
