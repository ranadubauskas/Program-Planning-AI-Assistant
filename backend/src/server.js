import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { connectDB } from './db.js'; 
import crypto from 'crypto';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { chatWithAmplify } from './amplifyClient.js';
import { User, ProgramPlan, Policy, Event } from './models.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Connect to MongoDB
let mongoConnected = false;
try {
  await connectDB(process.env.DATABASE_URL || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/program-planning');
  console.log('Connected to MongoDB');
  mongoConnected = true;
} catch (error) {
  console.warn('MongoDB connection failed:', error.message);
  console.log('Server will continue without MongoDB - some features may be limited');
}

// Middleware
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5173'], credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.get('/healthz', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    mongodb: mongoConnected ? 'connected' : 'disconnected',
    amplify: process.env.USE_AMPLIFY === 'true' ? 'enabled' : 'disabled'
  });
});

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { vanderbiltId, email, firstName, lastName, role } = req.body;
    
    if (!vanderbiltId || !email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    let user;
    if (mongoConnected) {
      try {
        user = await User.findOne({ vanderbiltId });
        if (!user) {
          user = new User({ vanderbiltId, email, firstName, lastName, role });
          await user.save();
        }
      } catch (dbError) {
        console.warn('Database error in auth, using fallback:', dbError.message);
        user = {
          _id: 'temp-' + vanderbiltId,
          vanderbiltId,
          email,
          firstName,
          lastName,
          role: role || 'student'
        };
      }
    } else {
      // Fallback user when MongoDB not available
      user = {
        _id: 'temp-' + vanderbiltId,
        vanderbiltId,
        email,
        firstName,
        lastName,
        role: role || 'student'
      };
    }
    
    const token = 'mock-jwt-token'; // In production, use proper JWT
    res.json({ user, token });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
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

  // Base "always relevant" buckets
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

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Load plan for relevance (role/location/hasAlcohol/programType). If you have user
    // info in session/JWT, you can also pass it into buildPolicyContext.
    let plan = null;
    if (planId && mongoConnected) {
      try {
        plan = await ProgramPlan.findById(planId).lean();
      } catch (planError) {
        console.warn('Could not load plan:', planError.message);
      }
    }
    const user = null; // replace with your authenticated user object if available

    // Build concise policy context (filtered by categories & relevance)
    let policyContext = '';
    if (mongoConnected) {
      try {
        policyContext = await buildPolicyContext({ user, plan, message });
      } catch (policyError) {
        console.warn('Could not build policy context:', policyError.message);
      }
    }

    // Prepend a system message with the context (only if we have one)
    const extraSystem = policyContext
      ? [{ role: 'system', content: policyContext }]
      : [];

    // Pass the last few turns + the policy context into the model
    const augmentedContext = [
      ...(context || []).slice(-10),
      ...extraSystem,
    ];

    let response;
    try {
      response = await chatWithAmplify(message, augmentedContext);
    } catch (chatError) {
      console.error('Chat with Amplify failed:', chatError);
      response = 'I apologize, but I\'m experiencing technical difficulties. Please try again in a moment.';
    }

    // Save conversation to plan if possible
    if (planId && mongoConnected && response) {
      try {
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
      } catch (saveError) {
        console.warn('Could not save conversation history:', saveError.message);
      }
    }

    res.json({ response });
  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ 
      error: 'Failed to process chat message',
      response: 'I apologize, but I encountered an error. Please try again.'
    });
  }
});

// Chat endpoint for generating event updates from conversations
app.post('/api/chat/generate-event-update', async (req, res) => {
  try {
    const { conversation, existingEvent, instructions } = req.body;

    if (!conversation || !existingEvent) {
      return res.status(400).json({ error: 'Conversation and existing event data are required' });
    }

    // Create a focused prompt for event update
    const updatePrompt = `${instructions || 'Update the event based on this conversation.'}

EXISTING EVENT DATA:
Title: ${existingEvent.title}
Description: ${existingEvent.description || 'Not provided'}
Date: ${existingEvent.eventDate || 'Not set'}
Category: ${existingEvent.category || 'Not set'}
Priority: ${existingEvent.priority || 'Not set'}
Expected Attendance: ${existingEvent.expectedAttendance || 'Not set'}
Location: ${existingEvent.location?.venue || 'Not set'}
Budget: ${existingEvent.budget?.amount || 'Not set'}
Has Alcohol: ${existingEvent.hasAlcohol || false}
Event Type: ${existingEvent.eventType || 'Not set'}

CONVERSATION TO ANALYZE:
${conversation}

Analyze this conversation and extract ONLY information that has changed or been explicitly discussed. Look for:
- Changes to number of attendees/people/guests/expected attendance
- Updates to event description or details
- New or modified dates
- Budget changes or mentions
- Location updates (venue, room, etc.)
- Event type changes
- Alcohol policy mentions
- New tasks or checklist items
- Priority or category changes

Respond in valid JSON format with only the fields that were discussed or changed:
{
  "title": "new title if changed",
  "description": "updated description if discussed", 
  "eventDate": "YYYY-MM-DD if new date mentioned",
  "expectedAttendance": number_if_discussed,
  "location": {
    "venue": "venue name if mentioned",
    "room": "room if mentioned"
  },
  "budget": {
    "amount": number_if_discussed
  },
  "hasAlcohol": boolean_if_discussed,
  "eventType": "type if changed",
  "category": "category if changed",
  "priority": "priority if changed",
  "checklist": [
    {
      "task": "task description",
      "dueDate": "YYYY-MM-DD or null",
      "priority": "low|medium|high|critical",
      "category": "category name"
    }
  ]
}

IMPORTANT: Only include fields that were actually discussed or changed. Omit any fields not mentioned in the conversation.`;

    let response;
    try {
      response = await chatWithAmplify(updatePrompt, []);
    } catch (chatError) {
      console.error('Chat with Amplify failed for event update:', chatError);
      throw new Error('AI processing failed');
    }

    // Try to parse the JSON response
    let eventData;
    try {
      // Remove any markdown code blocks if present
      const cleanResponse = response.replace(/```json\s*|\s*```/g, '').trim();
      eventData = JSON.parse(cleanResponse);
    } catch (parseError) {
      console.warn('Could not parse AI response as JSON, using fallback');
      eventData = {
        description: existingEvent.description || '',
        checklist: []
      };
    }

    // Ensure we only include fields that make sense
    const filteredEventData = {};
    
    if (eventData.title && eventData.title !== existingEvent.title) {
      filteredEventData.title = eventData.title;
    }
    if (eventData.description) {
      filteredEventData.description = eventData.description;
    }
    if (eventData.eventDate && eventData.eventDate !== existingEvent.eventDate) {
      filteredEventData.eventDate = eventData.eventDate;
    }
    if (eventData.category && eventData.category !== existingEvent.category) {
      filteredEventData.category = eventData.category;
    }
    if (eventData.priority && eventData.priority !== existingEvent.priority) {
      filteredEventData.priority = eventData.priority;
    }
    
    // Handle new fields
    if (typeof eventData.expectedAttendance === 'number' && eventData.expectedAttendance !== existingEvent.expectedAttendance) {
      filteredEventData.expectedAttendance = eventData.expectedAttendance;
    }
    if (eventData.location) {
      const locationUpdates = {};
      if (eventData.location.venue && eventData.location.venue !== existingEvent.location?.venue) {
        locationUpdates.venue = eventData.location.venue;
      }
      if (eventData.location.room && eventData.location.room !== existingEvent.location?.room) {
        locationUpdates.room = eventData.location.room;
      }
      if (Object.keys(locationUpdates).length > 0) {
        filteredEventData.location = { ...existingEvent.location, ...locationUpdates };
      }
    }
    if (eventData.budget && typeof eventData.budget.amount === 'number' && eventData.budget.amount !== existingEvent.budget?.amount) {
      filteredEventData.budget = { ...existingEvent.budget, amount: eventData.budget.amount };
    }
    if (typeof eventData.hasAlcohol === 'boolean' && eventData.hasAlcohol !== existingEvent.hasAlcohol) {
      filteredEventData.hasAlcohol = eventData.hasAlcohol;
    }
    if (eventData.eventType && eventData.eventType !== existingEvent.eventType) {
      filteredEventData.eventType = eventData.eventType;
    }
    
    if (eventData.checklist && Array.isArray(eventData.checklist) && eventData.checklist.length > 0) {
      filteredEventData.checklist = eventData.checklist.map(item => ({
        task: item.task || '',
        dueDate: item.dueDate || null,
        completed: false,
        priority: item.priority || 'medium',
        category: item.category || 'general'
      }));
    }

    filteredEventData.updatedAt = new Date();

    res.json({ eventData: filteredEventData });
  } catch (error) {
    console.error('Generate event update error:', error);
    res.status(500).json({ 
      error: 'Failed to generate event update',
      eventData: { description: '', checklist: [] } // Fallback
    });
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
    console.log('📋 Getting events for userId:', userId);
    
    if (mongoConnected) {
      // Find events by userId (works with both ObjectId and string)
      const events = await Event.find({ userId }).populate('planId', 'title');
      console.log('📅 Found events:', events.length);
      res.json(events);
    } else {
      // Return empty array when database not available
      console.log('MongoDB not connected, returning empty events array');
      res.json([]);
    }
  } catch (error) {
    console.error('❌ Events get error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    console.log('📥 Received event save request:', req.body);
    
    if (mongoConnected) {
      // Validate the event data before saving
      const eventData = {
        ...req.body,
        // Ensure userId is properly handled (can be ObjectId or string for temp users)
        userId: req.body.userId,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      console.log('💾 Saving event to MongoDB:', eventData);
      
      const event = new Event(eventData);
      await event.save();
      
      console.log('✅ Event saved successfully:', event._id);
      res.json(event);
    } else {
      // Return mock success when database not available
      console.log('MongoDB not connected, creating temporary event');
      const tempEvent = {
        _id: 'temp-' + Date.now(),
        ...req.body,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      res.json(tempEvent);
    }
  } catch (error) {
    console.error('❌ Events post error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      errors: error.errors
    });
    res.status(400).json({ 
      error: error.message,
      details: error.errors || 'Validation failed'
    });
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
    console.log('🔄 Updating event:', req.params.id);
    console.log('📝 Update data:', req.body);
    
    // Get the existing event first
    const existingEvent = await Event.findById(req.params.id);
    if (!existingEvent) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Handle checklist updates intelligently
    let updateData = { ...req.body };
    if (req.body.checklist && Array.isArray(req.body.checklist)) {
      const existingChecklist = existingEvent.checklist || [];
      
      // Check if this is a complete checklist replacement (like checkbox updates)
      // or just new items being added
      const isFullChecklistUpdate = req.body.checklist.length === existingChecklist.length;
      
      if (isFullChecklistUpdate) {
        // This is likely a checkbox update - use the provided checklist directly
        console.log('🔄 Full checklist update (likely checkbox toggle)');
        console.log('📊 Comparing states:');
        req.body.checklist.forEach((newItem, index) => {
          const oldItem = existingChecklist[index];
          if (oldItem && newItem.completed !== oldItem.completed) {
            console.log(`   Item ${index}: "${newItem.task}" changed from ${oldItem.completed} to ${newItem.completed}`);
          }
        });
        updateData.checklist = req.body.checklist;
      } else {
        // This is adding new items - use the original merging logic
        const newItems = req.body.checklist.filter(newItem => {
          return !existingChecklist.some(existingItem => 
            existingItem.task.toLowerCase().includes(newItem.task.toLowerCase().substring(0, 20)) ||
            newItem.task.toLowerCase().includes(existingItem.task.toLowerCase().substring(0, 20))
          );
        });
        
        if (newItems.length > 0) {
          console.log(`➕ Adding ${newItems.length} new checklist items`);
          updateData.checklist = [...existingChecklist, ...newItems];
        } else {
          // No new items to add, keep existing checklist
          delete updateData.checklist;
          console.log('✅ No new checklist items to add');
        }
      }
    }

    updateData.updatedAt = new Date();

    const event = await Event.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    console.log('✅ Event updated successfully');
    res.json(event);
  } catch (error) {
    console.error('❌ Event update error:', error);
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

// --- Public Sharing ---
// Create or return a public share link for an event
app.post('/api/events/:id/share', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (!event.shareEnabled || !event.shareId) {
      // Generate a URL-safe share token
      const token = crypto.randomBytes(12).toString('base64url');
      event.shareId = token;
      event.shareEnabled = true;
      event.shareCreatedAt = new Date();
      await event.save();
    }

    // Frontend base URL for pretty public page
    const appUrl = (process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const shareUrl = `${appUrl}/public/events/${event.shareId}`;
    res.json({ shareUrl, shareId: event.shareId });
  } catch (error) {
    console.error('❌ Create share link error:', error);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// Public endpoint to fetch a shared event by token (no auth required)
async function getPublicEventHandler(req, res) {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const event = await Event.findOne({ shareId: req.params.shareId, shareEnabled: true }).lean();
    if (!event) {
      return res.status(404).json({ error: 'Shared event not found' });
    }

    // Return a safe, read-only view
    const { _id, userId, __v, ...publicEvent } = event;
    res.json({ ...publicEvent, id: event._id });
  } catch (error) {
    console.error('❌ Public event fetch error:', error);
    res.status(500).json({ error: 'Failed to load shared event' });
  }
}

// Public routes
app.get('/public/events/:shareId', getPublicEventHandler);
app.get('/api/public/events/:shareId', getPublicEventHandler);

// Add global error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
try {
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📊 Status:`);
    console.log(`   - MongoDB: ${mongoConnected ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`   - Amplify: ${process.env.USE_AMPLIFY === 'true' ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`📡 Health check: http://localhost:${PORT}/healthz`);
  });
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}

// --- Email notifications (5 days before due) ---
const mailTransport = (() => {
  if (!process.env.SMTP_HOST) {
    console.log('📧 Email disabled (no SMTP_HOST). Will log emails to console.');
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
})();

function signUnsubscribe(userId, eventId) {
  const secret = process.env.JWT_SECRET || 'change-me';
  const data = `${userId}|${eventId}`;
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

app.get('/api/notifications/unsubscribe', async (req, res) => {
  try {
    const { uid, eid, sig } = req.query;
    if (!uid || !eid || !sig) return res.status(400).send('Invalid unsubscribe link.');
    const expected = signUnsubscribe(String(uid), String(eid));
    if (sig !== expected) return res.status(400).send('Invalid or expired unsubscribe signature.');

    if (!mongoConnected) return res.status(503).send('Database unavailable.');
    const event = await Event.findById(eid);
    if (!event || String(event.userId) !== String(uid)) return res.status(404).send('Event not found.');

    event.notifications = { ...(event.notifications || {}), emailOptIn: false };
    await event.save();
    res.send('You have been unsubscribed from email notifications for this event.');
  } catch (e) {
    console.error('Unsubscribe error:', e);
    res.status(500).send('Failed to process unsubscribe.');
  }
});

async function sendReminderEmail({ to, user, event, tasks }) {
  const baseApp = (process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const unsubscribeSig = signUnsubscribe(String(user._id), String(event._id));
  const unsubscribeUrl = `${(process.env.PUBLIC_API_URL || `http://localhost:${PORT}`).replace(/\/$/, '')}/api/notifications/unsubscribe?uid=${user._id}&eid=${event._id}&sig=${unsubscribeSig}`;

  const subject = `Reminder: ${tasks.length} task(s) due in 5 days for ${event.title}`;
  const lines = tasks.map(t => `• ${t.task}${t.dueDate ? ` (due ${new Date(t.dueDate).toLocaleDateString()})` : ''}`);
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5; color:#111">
      <h2 style="margin:0 0 8px 0;">Upcoming tasks for: ${event.title}</h2>
      <p>The following task(s) are due in 5 days:</p>
      <ul>${lines.map(li => `<li>${li}</li>`).join('')}</ul>
      <p>
        View event: <a href="${baseApp}/events" target="_blank">Open Saved Events</a>
      </p>
      <hr />
      <p style="font-size:12px;color:#666">To stop receiving these emails for this event, <a href="${unsubscribeUrl}">unsubscribe here</a>.</p>
    </div>
  `;

  if (!mailTransport) {
    console.log('📧 [DRY-RUN] To:', to, 'Subject:', subject, 'HTML length:', html.length);
    return;
  }
  await mailTransport.sendMail({ from: process.env.SMTP_FROM || 'no-reply@program-planning.local', to, subject, html });
}

// Run every day at 08:00 server time
cron.schedule('0 8 * * *', async () => {
  if (!mongoConnected) return;
  try {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5);
    const start = new Date(target); start.setHours(0,0,0,0);
    const end = new Date(target); end.setHours(23,59,59,999);

    const events = await Event.find({ 'notifications.emailOptIn': { $ne: false } }).lean();
    for (const ev of events) {
      const dueTasks = (ev.checklist || []).filter(it => !it.isTimeHeader && !it.completed && it.dueDate && (new Date(it.dueDate) >= start && new Date(it.dueDate) <= end));
      if (!dueTasks.length) continue;

      // Load user email
      let user = null;
      try { user = await User.findById(ev.userId).lean(); } catch {}
      if (!user?.email) continue;

      await sendReminderEmail({ to: user.email, user, event: ev, tasks: dueTasks });
    }
  } catch (e) {
    console.error('Cron email job error:', e);
  }
});