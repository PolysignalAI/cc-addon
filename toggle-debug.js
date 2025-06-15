#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const constantsPath = path.join(__dirname, "cc/src/constants.js");
let content = fs.readFileSync(constantsPath, "utf8");

// Find current DEBUG value
const currentMatch = content.match(/export\s+const\s+DEBUG\s*=\s*(true|false)/);
if (!currentMatch) {
  console.error("❌ Could not find DEBUG flag in constants.js");
  process.exit(1);
}

const currentValue = currentMatch[1] === "true";
const newValue = !currentValue;

// Toggle the value
content = content.replace(
  /export\s+const\s+DEBUG\s*=\s*(true|false)/,
  `export const DEBUG = ${newValue}`
);

fs.writeFileSync(constantsPath, content);

console.log(`✅ DEBUG flag toggled from ${currentValue} to ${newValue}`);
console.log(
  `📦 Run 'node build.js' to rebuild with ${newValue ? "debug logging enabled" : "debug logging disabled"}`
);
