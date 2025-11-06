# Contributing to GasGuard

Thank you for your interest in contributing to this project!

## How to Contribute

### Reporting Issues

If you find a bug or have a suggestion:

1. Check if the issue already exists
2. Open a new issue with:
   - Clear description
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - System information (OS, Node version, hardware)

### Code Contributions

1. Fork the repository
2. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Make your changes
4. Test thoroughly
5. Commit with clear messages:
   ```bash
   git commit -m "Add: brief description of changes"
   ```
6. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
7. Open a Pull Request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/yourusername/gasguard.git
cd gasguard

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Add JWT_SECRET to .env

# Run in development mode
npm run dev
```

### Code Style

- Use clear, descriptive variable names
- Add comments for complex logic
- Follow existing code structure
- Test on actual hardware when possible

### Commit Messages

Use clear commit messages:
- `Add: new feature`
- `Fix: bug description`
- `Update: component description`
- `Docs: documentation changes`

## Questions?

Open an issue for:
- Questions about the code
- Clarification on features
- Collaboration proposals
- Research inquiries

## Code of Conduct

- Be respectful and professional
- Provide constructive feedback
- Focus on the technical aspects
- Help others learn

---
