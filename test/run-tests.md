# Running Tests

## To run all tests

```bash
npm test
```

## To run tests in watch mode

```bash
npm run test:watch
```

## To run tests with coverage

```bash
npm run test:coverage
```

## To run specific tests

```bash
# Run tests matching a pattern
npm test -- --testNamePattern="USD"

# Run a specific test file
npm test test/price-detection.test.js
```
