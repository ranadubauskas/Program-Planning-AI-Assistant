# Vanderbilt Program Planning Assistant

An AI-powered conversational assistant to help Vanderbilt students and staff navigate program planning policies, timelines, and requirements.

## Members
Rana Dubauskas & Blanche Stora

## Staff Fellow
EJ Edney

## The Problem
Program planning at Vanderbilt is fragmented, confusing, and time-consuming. Students and staff must navigate multiple policies, approval processes, timelines, and vendor requirements across different offices. Missing a single step—like submitting a space request, alcohol approval, or marketing timeline—can delay or jeopardize the entire event. There is currently no centralized, guided system to help planners understand what they need, when they need it, and how to stay compliant.

The **Vanderbilt Program Planning Assistant** solves this problem by offering a unified, intelligent planning experience where users can receive personalized guidance, understand policies and requirements, track required tasks, and successfully navigate every step of the planning process.


## Features

- **AI-Powered Chat Interface**: Get personalized guidance for program planning
- **Interactive Checklists**: Track your progress with automatically generated task lists
- **Generate Communications**: Generate custom communications & view them anytime to help with marketing the event 
- **Email Notifications**: Stay on track with planning with email notification reminders
- **Checklist Sharing**: Share plan with multiple people to collaborate and view history of activity on event  
- **Note-taking**: Save & update notes on event progress or updates 
- **Policy Integration**: Access relevant policies with tiered warnings and citations
- **Role-Based Guidance**: Different guidance for students vs. staff
- **Data Persistence**: Save and continue your planning sessions
- **Best Practices & Estimated Timeline**: View best practices, tips, and estimated timeline for your planning task
- **Continue Chat to Update Plan**: Dynamically update checklist as requirements for event change

## Tech Stack

- **Frontend**: React with Vite, Tailwind CSS, React Router
- **Backend**: Express.js with MongoDB
- **AI**: Amplify AI API integration
- **Database**: MongoDB with Mongoose

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- MongoDB (local installation or MongoDB Atlas)
- Git

### Installation

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd program-planning-assistant
   npm run setup
   ```

2. **Set up environment variables**:
   
   **backend/.env**
   ```bash
   PORT=3001
   DATABASE_URL=mongodb+srv://ranadubauskas:[Password]@cluster0.rkcmykg.mongodb.net/program-planning?appName=Cluster0
   MONGODB_URI=mongodb+srv://ranadubauskas:[Password]@cluster0.rkcmykg.mongodb.net/program-planning?appName=Cluster0
   PUBLIC_APP_URL=http://localhost:3000

   USE_AMPLIFY=true
   AMPLIFY_BASE_URL=https://prod-api.vanderbilt.ai
   AMPLIFY_AUTH_SCHEME=bearer
   AMPLIFY_API_KEY=<YOUR_REAL_AMPLIFY_KEY>
   AMPLIFY_MODEL=gpt-4.1-mini
   AMPLIFY_PATH=/chat
   JWT_SECRET=<generate-a-strong-random-string>
   ```

   **How to generate JWT_SECRET:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

3. **Start MongoDB** (if using local installation):
   ```bash
   mongod
   ```

4. **Seed the database with policies**:
   ```bash
   npm run seed
   ```

5. **Start the application**:
   ```bash
   npm run dev
   ```

   This will start:
   - Backend server on http://localhost:3001
   - Frontend development server on http://localhost:3000

## Application Structure

```
program-planning-assistant/
├── backend/
│   ├── src/
│   │   ├── server.js          # Express server
│   │   ├── models.js          # MongoDB schemas
│   │   └── amplifyClient.js   # AI integration
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── pages/            # Page components
│   │   └── main.jsx          # App entry point
│   └── package.json
├── database/
│   └── seed.js               # Database seeding script
└── .env                      # Environment configuration
```

## Usage

1. **Login**: Use the simple authentication form (any valid Vanderbilt ID format)
2. **Start Planning**: Click "Start New Plan" or go to the AI Assistant
3. **Chat with AI**: Describe your program and get personalized guidance
4. **Track Progress**: View generated checklists and track completion
5. **Manage Plans**: Access all your plans from the dashboard

## Program Types Supported

- **Mixers**: Social events and networking
- **Concerts**: Musical performances and entertainment
- **Workshops**: Educational and skill-building sessions
- **Lectures**: Academic and informational presentations

## Key Features

### AI Assistant
- Asks clarifying questions about your event
- Provides policy-specific guidance
- Generates customized checklists
- Offers timeline recommendations

### Policy Categories
- Space Booking Requirements
- Alcohol Service Guidelines
- Marketing and Promotion
- Financial Policies
- Vendor Requirements
- Security and Safety
- Catering Guidelines

### User Roles
- **Students**: Lower spending limits, additional approval requirements
- **Staff**: Higher autonomy, different policy applications

## API Endpoints

### Authentication
- `POST /api/auth/login` - User authentication

### Program Plans
- `GET /api/plans` - Get user's plans
- `POST /api/plans` - Create new plan
- `GET /api/plans/:id` - Get specific plan
- `PUT /api/plans/:id` - Update plan

### AI Chat
- `POST /api/chat` - Chat with AI assistant

### Policies
- `GET /api/policies` - Get all policies

## Development

### Backend Development
```bash
cd backend
npm run dev
```

### Frontend Development
```bash
cd frontend
npm run dev
```

### Database Operations
```bash
npm run seed  # Seed with sample policies
```

## Testing

Run the test suites:
```bash
npm test
```

## Environment Variables

The application uses these environment variables (already configured in `.env`):

- `PORT`: Backend server port (3001)
- `DATABASE_URL`: MongoDB connection string
- `AMPLIFY_BASE_URL`: Amplify AI API endpoint
- `AMPLIFY_API_KEY`: API key for Amplify AI
- `JWT_SECRET`: JWT signing secret

## Troubleshooting

### Common Issues

1. **MongoDB Connection Error**:
   - Ensure MongoDB is running locally or update DATABASE_URL for Atlas
   
2. **Port Already in Use**:
   - Change PORT in .env file or stop other applications using ports 3000/3001

3. **AI API Errors**:
   - Verify AMPLIFY_API_KEY is correct
   - Check network connectivity

4. **Build Errors**:
   - Run `npm run install:all` to ensure all dependencies are installed
   - Clear node_modules and reinstall if needed

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC License - see LICENSE file for details
