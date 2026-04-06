import { Scene } from "phaser";
import { EventBus } from "../EventBus";

export class Game extends Scene {
  constructor() {
    super("Game");
  }

  create() {
    const { width, height } = this.scale;

    // Table boundaries
    const left = 40;
    const right = width - 40; // 440
    const top = 20;
    const bottom = height - 20; // 820

    // Plunger lane (right side)
    const plungerSep = right - 36; // 404 — separator between playfield and plunger lane
    const plungerEntryY = 200; // where ball can enter playfield from plunger lane

    // Bottom gutter diagonal start (where side walls angle inward)
    const gutterY = bottom - 200; // 620
    const gutterInnerLeft = left + 90; // 130 — where left gutter meets flipper level
    const gutterInnerRight = plungerSep - 90; // 314 — where right gutter meets flipper level

    // Flippers
    const flipperY = bottom - 60; // 760
    const flipperLeftOuter = gutterInnerLeft; // 130
    const flipperLeftInner = 215;
    const flipperRightInner = 230;
    const flipperRightOuter = gutterInnerRight; // 314
    const flipperTipY = flipperY - 12; // slight upward angle at inner tip

    const g = this.add.graphics();
    g.lineStyle(3, 0xcccccc, 1);

    // Outer table rectangle
    g.strokeRect(left, top, right - left, bottom - top);

    // Plunger lane separator (runs from entry point to the bottom)
    g.beginPath();
    g.moveTo(plungerSep, plungerEntryY);
    g.lineTo(plungerSep, bottom);
    g.strokePath();

    // Entry arch from plunger lane into playfield (small horizontal connector)
    g.beginPath();
    g.moveTo(plungerSep, plungerEntryY);
    g.lineTo(right, plungerEntryY);
    g.strokePath();

    // Left gutter diagonal
    g.beginPath();
    g.moveTo(left, gutterY);
    g.lineTo(gutterInnerLeft, flipperY);
    g.strokePath();

    // Right gutter diagonal
    g.beginPath();
    g.moveTo(plungerSep, gutterY);
    g.lineTo(gutterInnerRight, flipperY);
    g.strokePath();

    // Left flipper
    g.lineStyle(4, 0xffffff, 1);
    g.beginPath();
    g.moveTo(flipperLeftOuter, flipperY);
    g.lineTo(flipperLeftInner, flipperTipY);
    g.strokePath();

    // Right flipper
    g.beginPath();
    g.moveTo(flipperRightOuter, flipperY);
    g.lineTo(flipperRightInner, flipperTipY);
    g.strokePath();

    EventBus.emit("current-scene-ready", this);
  }
}
