import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
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

const MSG_RE = {
  alcohol: /\b(alcohol|beer|wine|bartend|wet\s*event|id\s*check|21\+)\b/i,
  tech: /\b(email(s)?|bulk\s*email|mass\s*email|listserv|mailchimp|social\s*media|wifi|wi-?fi|it\s|cyber|malware|password|credential|record(ing)?|av\b|software|download|install|BYOD|device|HIPAA|FERPA)\b/i,
  minors: /\b(minor(s)?|under\s*18|youth|camp|K-?12|child|children)\b/i,
};

function isAlcoholRelevant({ message, plan }) {
  return Boolean(MSG_RE.alcohol.test(message || '') || (plan && plan.hasAlcohol));
}
function isTechRelevant({ message }) {
  return Boolean(MSG_RE.tech.test(message || ''));
}
function isMinorsRelevant({ message }) {
  return Boolean(MSG_RE.minors.test(message || ''));
}

async function buildPolicyContext({ user, plan, message }) {
  // Load all policies once, filter in-memory (small set). If you prefer, query by category.
  const all = await Policy.find().lean();

  const programType = plan?.programType || 'other';
  const role = (user?.role || 'both').toLowerCase(); // 'student' | 'staff' | 'both'
  const campus = plan?.location?.type || 'on-campus';

  // Base “always relevant” buckets
  const want = [];

  // Space booking (usually relevant for on-campus)
  if (campus === 'on-campus') {
    want.push('Use of Space', 'Space Booking'); // support either label
  }

  // Marketing/Comms
  want.push('Marketing and Communications', 'Marketing');

  // Alcohol
  if (isAlcoholRelevant({ message, plan })) {
    want.push('Alcohol Policy', 'Alcohol');
  }

  // Technology / Electronic Communications (only if relevant)
  if (isTechRelevant({ message })) {
    want.push('Technology', 'Electronic Communications');
  }

  // Protection of minors (only if relevant)
  if (isMinorsRelevant({ message })) {
    want.push('Protection of Minors');
  }

  // Filter by wanted categories + role + program type
  const relevant = all.filter(p => {
    const catOk = want.some(w => p.category?.toLowerCase().includes(w.toLowerCase()));
    if (!catOk) return false;

    const roleOk =
      (p.roleVisibility || 'both') === 'both' ||
      (p.roleVisibility || 'both') === role;

    const typeOk =
      !p.programTypes?.length || p.programTypes.includes(programType);

    return roleOk && typeOk;
  });

  if (!relevant.length) return '';

  // Short, bounded context string (kept under ~1–2k tokens)
  const lines = [];
  lines.push('POLICY CONTEXT (concise):');
  for (const p of relevant.slice(0, 12)) { // cap to avoid overlong prompts
    const reqs = (p.requirements || []).slice(0, 6).map(r => `• ${r}`);
    const cites = (p.citations || []).slice(0, 2).map(u => `(${u})`).join(' ');
    lines.push(
      `- ${p.category}: ${p.title}${cites ? ' ' + cites : ''}\n  ${reqs.join('\n  ')}`
    );
  }
  return lines.join('\n');
}

// Chat with AI
app.post('/api/chat', async (req, res) => {
  try {
    const { message, planId, context } = req.body;

    // Load plan for relevance (role/location/hasAlcohol/programType). If you have user
    // info in session/JWT, you can also pass it into buildPolicyContext.
    const plan = planId ? await ProgramPlan.findById(planId).lean() : null;
    const user = null; // replace with your authenticated user object if available

    // Build concise policy context (filtered by categories & relevance)
    const policyContext = await buildPolicyContext({ user, plan, message });

    // Prepend a system message with the context (only if we have one)
    const extraSystem = policyContext
      ? [{ role: 'system', content: policyContext }]
      : [];

    // Pass the last few turns + the policy context into the model
    const augmentedContext = [
      ...(context || []).slice(-10),
      ...extraSystem,
    ];

    const response = await chatWithAmplify(message, augmentedContext);

    if (planId) {
      await ProgramPlan.findByIdAndUpdate(
        planId,
        {
          $push: {
            conversationHistory: {
              $each: [
                { role: 'user', content: message, timestamp: new Date() },
                { role: 'assistant', content: response, timestamp: new Date() },
              ],
            },
          },
        },
        { new: true }
      );
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
