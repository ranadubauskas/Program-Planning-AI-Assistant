# program-planning-assistant - Full-Stack Application

## Project Overview
This is a full-stack application created on 10/13/2025 by ranadubauskas.

**Tech Stack:**
- Frontend: react
- Backend: express
- Database: mongodb


## Core Instructions

You are Claude Code, assisting with the program-planning-assistant full-stack application. Your primary responsibilities are:

### Architecture Guidelines

1. **Frontend (react)**
   - Use functional components with TypeScript
   - Implement proper state management (Context API or Redux Toolkit)
   - Follow React best practices and hooks patterns
   - Ensure responsive design with Tailwind CSS

2. **Backend (express)**
   - Structure with MVC pattern
   - Use TypeScript for type safety
   - Implement proper middleware
   - Use async/await for asynchronous operations
   - Implement proper error handling

3. **Database (mongodb)**
   - Design document schemas thoughtfully
   - Use Mongoose for ODM (if Node.js)
   - Implement proper indexing
   - Consider sharding for scale


5. **Code Quality**
   - Write clean, maintainable code
   - Follow SOLID principles
   - Implement comprehensive error handling
   - Write unit and integration tests
   - Use proper logging
   - Document complex logic
   - Keep functions small and focused



### Development Workflow

1. **Planning Phase**
   - Understand requirements thoroughly
   - Design data models first
   - Plan API endpoints
   - Consider scalability

2. **Implementation Phase**
   - Start with database schema
   - Build backend API
   - Implement frontend features
   - Add authentication if needed
   - Write tests alongside code

3. **Testing Phase**
   - Unit test individual components
   - Integration test API endpoints
   - E2E test critical user flows
   - Performance test under load

4. **Deployment Phase**
   - Monitor application health
   - Set up logging and monitoring

## Project Structure

```
program-planning-assistant/
├── frontend/          # react application
├── backend/           # express API
├── database/          # Database migrations and seeds


├── docs/              # Documentation
├── scripts/           # Utility scripts
└── README.md          # Project documentation
```

## Available Commands

### Development
- `npm run dev` - Start development servers
- `npm run build` - Build for production
- `npm test` - Run test suite
- `npm run lint` - Check code quality


### Database
- `npm run db:migrate` - Run migrations
- `npm run db:seed` - Seed database
- `npm run db:reset` - Reset database

## Environment Variables

Ensure these are configured in `.env`:

```
# Database
DATABASE_URL=mongodb://localhost/program-planning-assistant_db

# Backend
PORT=3000
NODE_ENV=development

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Getting Started

1. Install dependencies: `npm install` in both frontend and backend
2. Set up environment variables
3. Initialize database: `npm run db:migrate`

5. Start development: `npm run dev`

## Additional Notes

- Keep security as a top priority
- Write tests for critical functionality
- Document API endpoints
- Use consistent code style
- Regular commits with clear messages


---
*Generated with Full-Stack Application Template v1.0.0*