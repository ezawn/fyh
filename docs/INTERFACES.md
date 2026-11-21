# Shared interfaces

The contract everyone builds against. **Status: DRAFT, review before coding.**
Change this file only on a branch, and tell the team, because other people's code depends on it.

Anything marked `TODO` still needs a decision. The `Example` entries show the format; replace them with real ones.

## Conventions
- All requests and responses are JSON (`Content-Type: application/json`).
- IDs are strings. Timestamps are ISO 8601 UTC strings (`"2026-11-21T12:00:00Z"`).
- Field names use `camelCase`.
- Base URL: `TODO` (e.g. `/api/v1`).
- Auth: `TODO` (e.g. `Authorization: Bearer <token>`, or none).

## Data types

### Example: `User`
```ts
type User = {
  id: string;
  name: string;
  createdAt: string; // ISO 8601
};
```

### TODO: `<Type>`
```ts
type TODO = {
  id: string;
};
```

## API routes

| Method | Path | Request body | Response | Owner |
|--------|------|--------------|----------|-------|
| GET | `/users/:id` (example) | none | `User` | TODO |
| POST | `/users` (example) | `{ name: string }` | `201` + `User` | TODO |
| TODO | TODO | TODO | TODO | TODO |

## Errors
Every error response uses the same shape, with a matching HTTP status (400, 401, 404, 500…):
```ts
type ApiError = {
  error: {
    code: string;    // machine-readable, e.g. "NOT_FOUND"
    message: string; // human-readable
  };
};
```

## Open questions
- What is fyh, and what does it store? (Needed before real types can be filled in.)
- Stack: language / framework for backend and frontend?
- Who owns which routes and types?
