# Contributing to arc-commerce

Thank you for your interest in contributing to arc-commerce! This document provides guidelines and instructions for contributing to the project.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Code Style Guidelines](#code-style-guidelines)
- [Commit Message Conventions](#commit-message-conventions)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Issue Reporting](#issue-reporting)
- [Security](#security)

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. By participating in this project, you agree to abide by our code of conduct:

- **Be respectful:** Treat everyone with respect and kindness
- **Be constructive:** Provide helpful feedback and suggestions
- **Be collaborative:** Work together towards common goals
- **Be professional:** Maintain professional conduct in all interactions

---

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- **Node.js v22+** installed (use `nvm` with `.nvmrc`)
- **npm** (comes with Node.js)
- **Git** for version control
- **Supabase CLI** (`npm install -g supabase`)
- **Docker Desktop** (for local Supabase)
- **Circle API credentials** (API key and Entity Secret)

### Fork and Clone

1. **Fork the repository** on GitHub by clicking the "Fork" button

2. **Clone your fork:**
```bash
   git clone https://github.com/YOUR_USERNAME/arc-commerce.git
   cd arc-commerce
```

3. **Add upstream remote:**
```bash
   git remote add upstream https://github.com/circlefin/arc-commerce.git
```

4. **Install dependencies:**
```bash
   npm install
```

### Set Up Environment

1. **Copy environment file:**
```bash
   cp .env.example .env.local
```

2. **Configure Supabase** (choose local or remote):
```bash
   # Local (Docker required)
   npx supabase start
   npx supabase migration up
   
   # OR Remote
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
```

3. **Add Circle credentials** to `.env.local`

4. **Run the development server:**
```bash
   npm run dev
```

---

## Development Workflow

### Branch Naming

Use descriptive branch names following this pattern:

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions/updates

Examples:
```bash
git checkout -b feature/add-credit-export
git checkout -b fix/webhook-signature-verification
git checkout -b docs/admin-dashboard-guide
```

### Making Changes

1. **Create a branch:**
```bash
   git checkout -b feature/your-feature-name
```

2. **Make your changes** following our [Code Style Guidelines](#code-style-guidelines)

3. **Test your changes:**
```bash
   npm run lint
   npm test
   npm run build
```

4. **Commit with conventional commits:**
```bash
   git add .
   git commit -m "feat: add credit purchase export feature"
```

5. **Keep your branch updated:**
```bash
   git fetch upstream
   git rebase upstream/main
```

6. **Push to your fork:**
```bash
   git push origin feature/your-feature-name
```

---

## Pull Request Process

### Before Submitting

Ensure your PR meets these requirements:

- [ ] Code follows our style guidelines
- [ ] All tests pass locally
- [ ] No linting errors: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Documentation updated (if needed)
- [ ] Commits follow [Conventional Commits](#commit-message-conventions)
- [ ] Branch is up-to-date with `main`

### Submitting a PR

1. **Push your branch** to your fork

2. **Open a Pull Request** on GitHub

3. **Fill out the PR template** completely:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring

## Testing
- [ ] Tested locally
- [ ] All tests pass
- [ ] Linting passes

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

### Review Process

- Maintainers will review your PR
- Address feedback by pushing new commits
- Once approved, maintainers will merge

**Review timeline:** Circle is an enterprise project - expect reviews to take several days to weeks.

---

## Code Style Guidelines

### TypeScript

```typescript
// Use explicit types
function calculateCreditCost(credits: number): number {
  return credits * 0.1
}

// Use interfaces for objects
interface CreditPurchase {
  userId: string
  amount: number
  transactionId: string
}

// Async/await over promises
async function purchaseCredits(amount: number): Promise<CreditPurchase> {
  const result = await createTransaction(amount)
  return result
}
```

### React Components

```typescript
// Functional components with TypeScript
interface DashboardProps {
  userId: string
  credits: number
}

export default function Dashboard({ userId, credits }: DashboardProps) {
  return (
    <div className="dashboard">
      <h1>Credits: {credits}</h1>
    </div>
  )
}
```

### API Routes

```typescript
// Type request/response
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    // Validate input
    if (!body.amount) {
      return NextResponse.json(
        { error: 'Amount required' },
        { status: 400 }
      )
    }
    
    // Process request
    const result = await processPayment(body)
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('Payment error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### Naming Conventions

- **Variables/Functions:** `camelCase`
- **Components:** `PascalCase`
- **Constants:** `UPPER_SNAKE_CASE`
- **Files:** `kebab-case.ts` or `PascalCase.tsx` for components

---

## Commit Message Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format
<type>(<scope>): <description>
[optional body]
[optional footer]

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Test additions or updates
- `chore`: Maintenance tasks

### Examples

```bash
# Feature
git commit -m "feat(credits): add bulk credit purchase"

# Bug fix
git commit -m "fix(webhook): correct signature verification"

# Documentation
git commit -m "docs(readme): update installation instructions"

# With body
git commit -m "feat(admin): add transaction export

Allows admins to export transaction history to CSV.
Includes filters for date range and user."
```

---

## Testing Guidelines

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- path/to/test.test.ts

# Run in watch mode
npm test -- --watch
```

### Writing Tests

```typescript
// Example test
import { describe, it, expect } from '@jest/globals'
import { calculateCreditCost } from '@/lib/credits'

describe('Credit Calculations', () => {
  it('should calculate credit cost correctly', () => {
    expect(calculateCreditCost(100)).toBe(10)
  })
  
  it('should handle zero credits', () => {
    expect(calculateCreditCost(0)).toBe(0)
  })
})
```

### Test Coverage

Aim for:
- Unit tests for utility functions
- Integration tests for API routes
- Component tests for UI logic

---

## Documentation

### Code Comments

```typescript
/**
 * Purchases credits for a user using USDC
 * @param userId - User's unique identifier
 * @param amount - Number of credits to purchase
 * @returns Transaction details
 * @throws Error if payment fails
 */
async function purchaseCredits(
  userId: string,
  amount: number
): Promise<Transaction> {
  // Implementation
}
```

### README Updates

When adding features:
- Update relevant sections in README.md
- Add examples if applicable
- Update environment variable documentation

### Architecture Documentation

For significant changes:
- Update `docs/ARCHITECTURE.md`
- Add diagrams if helpful (Mermaid format)
- Explain design decisions

---

## Issue Reporting

### Bug Reports

Use this template:

```markdown
## Bug Description
Clear description of the bug

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: [e.g., macOS 14]
- Node version: [e.g., v22.0.0]
- Browser: [e.g., Chrome 120]

## Screenshots
If applicable
```

### Feature Requests

```markdown
## Feature Description
Clear description of the proposed feature

## Use Case
Why this feature is needed

## Proposed Solution
How you envision this working

## Alternatives Considered
Other approaches you've thought about
```

---

## Security

### Reporting Vulnerabilities

**DO NOT** open public issues for security vulnerabilities.

Instead:
1. Review `SECURITY.md` in the repository
2. Report via Circle's bug bounty program
3. Email security contacts privately

### Security Best Practices

- Never commit API keys or secrets
- Use environment variables for sensitive data
- Validate all user inputs
- Keep dependencies updated
- Follow OWASP guidelines

---

## Getting Help

- **Questions:** Open a GitHub Discussion
- **Bugs:** Open an Issue
- **Chat:** Join Circle's developer community (if available)
- **Documentation:** Check the `docs/` folder

---

## License

By contributing to arc-commerce, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

---

**Thank you for contributing to arc-commerce!** 🎉

Your contributions help improve USDC payment infrastructure and make it easier for developers to integrate Circle's technology.
