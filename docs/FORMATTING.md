# Code Formatting Guide

This project uses Prettier for consistent code formatting across all contributors.

## Setup

The formatting tools are automatically installed when you run:

```bash
npm install
```

## Automatic Formatting

### Pre-commit Hook

Code is automatically formatted when you commit changes. The pre-commit hook runs Prettier on all staged files.

### Manual Formatting

Format all files:

```bash
npm run format
```

Check formatting without changing files:

```bash
npm run format:check
```

## Configuration

Formatting rules are defined in `.prettierrc.json`:

- 2 spaces for indentation
- Semicolons required
- Double quotes for strings
- Trailing commas in ES5
- 80 character line width

## Editor Integration

### Cursor / VS Code

The `.prettierrc.json` file will be automatically detected. Enable "Format on Save":

1. Open Settings (`Cmd+,` or `Ctrl+,`)
2. Search for "format on save"
3. Check the box

## Commit Messages

Commits must follow the conventional format:

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, `revert`

Examples:

- `feat: add Bitcoin support`
- `fix(popup): correct tooltip positioning`
- `docs: update API documentation`

## Ignored Files

See `.prettierignore` for files that won't be formatted (build outputs, dependencies, etc.)
