import "dotenv/config";
// Tests never run against production.
if (process.env.NODE_ENV === "production") throw new Error("Refusing to run tests with NODE_ENV=production");
