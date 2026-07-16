# Contributing to Arc Commerce

Thank you for your interest in contributing to Arc Commerce! We welcome contributions from the community.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Create a new branch for your changes
4. Make your changes
5. Submit a pull request

## Development Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start local Supabase (requires Docker)
npx supabase start
npx supabase migration up

# Start the development server
npm run dev
```

## Pull Request Process

1. Ensure your code follows the existing code style and passes linting (`npm run lint`).
2. Update documentation if your changes affect the public API or user-facing behavior.
3. Write clear, descriptive commit messages using [Conventional Commits](https://www.conventionalcommits.org/).
4. Keep pull requests focused — one feature or fix per PR.
5. Include a clear description of what your PR does and why.

## Reporting Issues

- Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) for bugs.
- Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) for new ideas.

## Code of Conduct

Please be respectful and constructive in all interactions. We are committed to providing a welcoming and inclusive experience for everyone.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
