import { desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { highscores } from "../db/schema.js";

export type Highscore = {
  id: number;
  name: string;
  score: number;
  createdAt: Date;
};

export async function getHighscores(): Promise<Highscore[]> {
  return db.select().from(highscores).orderBy(desc(highscores.score)).limit(10);
}

export async function addHighscore(
  name: string,
  score: number
): Promise<Highscore> {
  const [inserted] = await db
    .insert(highscores)
    .values({ name, score })
    .returning();
  return inserted;
}

export function qualifiesForLeaderboard(
  score: number,
  list: Highscore[]
): boolean {
  if (score <= 0) return false;
  if (list.length < 10) return true;
  return score > list[list.length - 1].score;
}
