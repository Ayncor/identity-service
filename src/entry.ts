import "reflect-metadata";

// Force reflect-metadata to be evaluated before loading the rest of the app.
// In Node ESM, static imports across sibling modules can evaluate in an order
// that causes decorator metadata to be missing at runtime.
await import("./main");

