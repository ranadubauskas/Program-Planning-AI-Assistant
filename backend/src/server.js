import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { connectDB } from './db.js'; 
import { chatWithAmplify } from './amplifyClient.js';
import { User, ProgramPlan, Policy, Event } from './models.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Connect to MongoDB
await connectDB(process.env.DATABASE_URL || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/program-planning');
console.log('Connected to MongoDB');

// Middleware
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5173'], credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.get('/healthz', (req, res) => res.send('OK'));

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { vanderbiltId, email, firstName, lastName, role } = req.body;
    
    let user = await User.findOne({ vanderbiltId });
    if (!user) {
      user = new User({ vanderbiltId, email, firstName, lastName, role });
      await user.save();
    }
    
    const token = 'mock-jwt-token'; // In production, use proper JWT
    res.json({ user, token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Program plans
app.get('/api/plans', async (req, res) => {
  try {
    const plans = await ProgramPlan.find({ userId: req.query.userId });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/plans', async (req, res) => {
  try {
    const plan = new ProgramPlan(req.body);
    await plan.save();
    res.json(plan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/plans/:id', async (req, res) => {
  try {
    const plan = await ProgramPlan.findById(req.params.id);
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Chat with AI
app.post('/api/chat', async (req, res) => {
  try {
    const { message, planId, context } = req.body;
    const response = await chatWithAmplify(message, context || []);
    
    if (planId) {
      await ProgramPlan.findByIdAndUpdate(planId, {
        $push: {
          conversationHistory: [
            { role: 'user', content: message },
            { role: 'assistant', content: response }
          ]
        }
      });
    }
    
    res.json({ response });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// Policies
app.get('/api/policies', async (req, res) => {
  try {
    const policies = await Policy.find();
    res.json(policies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Events API
app.get('/api/events', async (req, res) => {
  try {
    const { userId } = req.query;
    const events = await Event.find({ userId }).populate('planId', 'title');
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const event = new Event(req.body);
    await event.save();
    res.json(event);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('planId', 'title');
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/events/:id', async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(event);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
