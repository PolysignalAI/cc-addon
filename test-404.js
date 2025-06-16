const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  // Listen for failed requests
  const failed404s = [];
  page.on("response", (response) => {
    if (response.status() === 404) {
      failed404s.push(response.url());
    }
  });

  // Also listen for console messages
  page.on("console", (msg) => {
    console.log("Console:", msg.type(), msg.text());
  });

  page.on("pageerror", (error) => {
    console.log("Page error:", error.message);
  });

  await page.goto("http://localhost:8000/");

  // Wait a bit for everything to load
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("\n404 Errors found:");
  failed404s.forEach((url) => console.log("  -", url));

  await browser.close();
})();
