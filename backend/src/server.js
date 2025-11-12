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

const normEmail = (e) => (e || '').trim().toLowerCase();

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
      "timingType": "required|recommended",
      "category": "category name"
    }
  ]
}

TIMING TYPE CLASSIFICATION:
- "required": Policy-mandated deadlines, legal requirements, contract deadlines (e.g., venue booking 4 weeks before for campus policy, alcohol permit deadlines, insurance requirements)
- "recommended": Best practice timelines, suggestions for optimal planning (e.g., send invitations 2-3 weeks before, confirm catering 1 week before)

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
        timingType: item.timingType || 'recommended',
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
      
      // Ensure checklist items have timingType set
      if (eventData.checklist && Array.isArray(eventData.checklist)) {
        eventData.checklist = eventData.checklist.map(item => ({
          ...item,
          timingType: item.timingType || 'recommended'
        }));
      }
      
      // Ensure notifications object has defaults
      if (!eventData.notifications) {
        eventData.notifications = {};
      }
      if (eventData.notifications.emailOptIn === undefined) {
        eventData.notifications.emailOptIn = true;
      }
      if (eventData.notifications.reminderDays === undefined) {
        eventData.notifications.reminderDays = 5;
      }
      
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
    
    // Merge notifications object if provided
    if (req.body.notifications) {
      updateData.notifications = {
        ...(existingEvent.notifications || {}),
        ...req.body.notifications
      };
    }
    
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
        // Ensure timingType is preserved or set to default
        updateData.checklist = req.body.checklist.map((item, idx) => ({
          ...item,
          timingType: item.timingType || existingChecklist[idx]?.timingType || 'recommended'
        }));
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
          // Ensure new items have timingType set
          const newItemsWithTiming = newItems.map(item => ({
            ...item,
            timingType: item.timingType || 'recommended'
          }));
          updateData.checklist = [...existingChecklist, ...newItemsWithTiming];
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

// --- Collaboration API ---
// Enable collaboration for an event
app.post('/api/events/:id/collaboration/enable', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // TODO: Add proper authentication to verify ownership
    // For now, assume the request is from the owner
    
    if (!event.collaborationEnabled) {
      // Generate a URL-safe collaboration token
      const token = crypto.randomBytes(16).toString('base64url');
      event.collaborationId = token;
      event.collaborationEnabled = true;
      
      // Add activity log entry
      if (!event.activityLog) event.activityLog = [];
      event.activityLog.push({
        userId: event.userId,
        userName: 'Event Owner', // TODO: Get from authenticated user
        action: 'created',
        description: 'Enabled collaboration for this event',
        timestamp: new Date()
      });
      
      await event.save();
    }

    // Return collaboration URL
    const appUrl = (process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const collaborationUrl = `${appUrl}/collaborate/${event.collaborationId}`;
    res.json({ collaborationUrl, collaborationId: event.collaborationId });
  } catch (error) {
    console.error('❌ Enable collaboration error:', error);
    res.status(500).json({ error: 'Failed to enable collaboration' });
  }
});

// Disable collaboration for an event
app.post('/api/events/:id/collaboration/disable', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // TODO: Add proper authentication to verify ownership
    event.collaborationEnabled = false;
    event.collaborationId = null;
    event.collaborators = [];
    
    // Add activity log entry
    if (!event.activityLog) event.activityLog = [];
    event.activityLog.push({
      userId: event.userId,
      userName: 'Event Owner', // TODO: Get from authenticated user
      action: 'updated',
      description: 'Disabled collaboration for this event',
      timestamp: new Date()
    });
    
    await event.save();
    res.json({ message: 'Collaboration disabled successfully' });
  } catch (error) {
    console.error('❌ Disable collaboration error:', error);
    res.status(500).json({ error: 'Failed to disable collaboration' });
  }
});

// Get collaborative event by collaborationId (for collaborators)
app.get('/api/collaborate/:collaborationId', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const event = await Event.findOne({
      collaborationId: req.params.collaborationId,
      collaborationEnabled: true
    }).lean();

    if (!event) {
      return res.status(404).json({ error: 'Collaborative event not found or collaboration disabled' });
    }

    // Fetch owner basic profile
    let ownerInfo = null;
    try {
      const ownerUser = await User.findById(event.owner || event.userId)
        .select('firstName lastName email _id')
        .lean();
      if (ownerUser) {
        ownerInfo = {
          _id: ownerUser._id,
          firstName: ownerUser.firstName,
          lastName: ownerUser.lastName,
          email: (ownerUser.email || '').trim().toLowerCase(),
        };
      }
    } catch (e) {
      // non-fatal
      console.warn('Owner lookup failed:', e.message);
    }

    res.json({ ...event, ownerInfo });
  } catch (error) {
    console.error('❌ Get collaborative event error:', error);
    res.status(500).json({ error: 'Failed to load collaborative event' });
  }
});


// Add collaborator to event
app.post('/api/events/:id/collaborators', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { email: rawEmail, firstName, lastName, userId, permission = 'edit' } = req.body;
    const email = normEmail(rawEmail);

    
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Email, first name, and last name are required' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (!event.collaborationEnabled) {
      return res.status(400).json({ error: 'Collaboration is not enabled for this event' });
    }

    // Check if collaborator already exists
    const existingCollaborator = (event.collaborators || []).find(c => normEmail(c.email) === email);
    if (existingCollaborator) {
      return res.status(400).json({ error: 'User is already a collaborator' });
    }

    // Add collaborator
    const collaborator = {
      userId: userId || null,
      email,
      firstName: firstName,
      lastName: lastName,
      permission: permission,
      addedAt: new Date(),
      addedBy: event.userId, // TODO: Get from authenticated user
      lastActive: new Date()
    };

    event.collaborators.push(collaborator);
    
    // Add activity log entry
    if (!event.activityLog) event.activityLog = [];
    event.activityLog.push({
      userId: event.userId,
      userName: 'Event Owner', // TODO: Get from authenticated user
      action: 'added_collaborator',
      description: `Added ${firstName} ${lastName} as a collaborator`,
      timestamp: new Date(),
      metadata: { email, permission }
    });

    await event.save();
    res.json({ message: 'Collaborator added successfully', collaborator });
  } catch (error) {
    console.error('❌ Add collaborator error:', error);
    res.status(500).json({ error: 'Failed to add collaborator' });
  }
});

// Remove collaborator from event
app.delete('/api/events/:id/collaborators/:collaboratorId', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const collaboratorIndex = event.collaborators.findIndex(c => c._id.toString() === req.params.collaboratorId);
    if (collaboratorIndex === -1) {
      return res.status(404).json({ error: 'Collaborator not found' });
    }

    const removedCollaborator = event.collaborators[collaboratorIndex];
    event.collaborators.splice(collaboratorIndex, 1);
    
    // Add activity log entry
    if (!event.activityLog) event.activityLog = [];
    event.activityLog.push({
      userId: event.userId,
      userName: 'Event Owner', // TODO: Get from authenticated user
      action: 'removed_collaborator',
      description: `Removed ${removedCollaborator.firstName} ${removedCollaborator.lastName} as a collaborator`,
      timestamp: new Date(),
      metadata: { email: removedCollaborator.email }
    });

    await event.save();
    res.json({ message: 'Collaborator removed successfully' });
  } catch (error) {
    console.error('❌ Remove collaborator error:', error);
    res.status(500).json({ error: 'Failed to remove collaborator' });
  }
});

// --- UPDATE: PUT /api/collaborate/:collaborationId
app.put('/api/collaborate/:collaborationId', async (req, res) => {
  const normEmail = (e) => (e || '').trim().toLowerCase();

  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { userId, userName, email: rawEmail, ...updateData } = req.body;
    const email = normEmail(rawEmail);

    if (!userId && !email) {
      return res.status(400).json({ error: 'userId or email is required' });
    }

    const event = await Event.findOne({
      collaborationId: req.params.collaborationId,
      collaborationEnabled: true
    });

    if (!event) {
      return res.status(404).json({ error: 'Collaborative event not found' });
    }

    // Owner or invited collaborator (by userId OR invited email) with edit/admin
    const isOwner = userId && String(event.owner || event.userId) === String(userId);
    const collaborator = (event.collaborators || []).find(c => {
      const idMatch = userId && c.userId && String(c.userId) === String(userId);
      const emailMatch = email && normEmail(c.email) === email;
      return idMatch || emailMatch;
    });

    const hasEditPermission = isOwner || (collaborator && ['edit', 'admin'].includes(collaborator.permission));
    if (!hasEditPermission) {
      // Uncomment for one-time debugging:
      // console.log('[COLLAB PUT] denied', { userId, email, isOwner, found: !!collaborator, perm: collaborator?.permission });
      return res.status(403).json({ error: 'Insufficient permissions to edit this event' });
    }

    // Update collaborator's last active; bind userId if we matched by email
    if (collaborator) {
      if (!collaborator.userId && userId) collaborator.userId = userId;
      collaborator.lastActive = new Date();
      // If collaborators is a plain array of objects (not strict subdocs), this helps:
      event.markModified && event.markModified('collaborators');
    }

    // Checklist activity logging (completed/uncompleted)
    if (updateData.checklist && Array.isArray(updateData.checklist)) {
      const existingChecklist = event.checklist || [];
      updateData.checklist.forEach((newItem, index) => {
        const oldItem = existingChecklist[index];
        if (oldItem && newItem.completed !== oldItem.completed) {
          if (!event.activityLog) event.activityLog = [];
          event.activityLog.push({
            userId: userId || null,
            userName: userName || 'Unknown User',
            action: newItem.completed ? 'completed_task' : 'uncompleted_task',
            description: `${newItem.completed ? 'Completed' : 'Uncompleted'} task: ${newItem.task}`,
            timestamp: new Date(),
            metadata: { taskIndex: index, taskId: newItem._id }
          });
        }
      });
    }

    // Apply updates
    Object.assign(event, updateData);
    event.updatedAt = new Date();

    // General update activity (if more than just checklist)
    const isChecklistOnlyUpdate = Object.keys(updateData).length === 1 && updateData.checklist;
    if (!isChecklistOnlyUpdate) {
      if (!event.activityLog) event.activityLog = [];
      event.activityLog.push({
        userId: userId || null,
        userName: userName || 'Unknown User',
        action: 'updated',
        description: 'Updated event details',
        timestamp: new Date(),
        metadata: { updatedFields: Object.keys(updateData) }
      });
    }

    await event.save();
    res.json(event);
  } catch (error) {
    console.error('❌ Update collaborative event error:', error);
    res.status(500).json({ error: 'Failed to update collaborative event' });
  }
});


// // Update collaborative event (with permission checking)
// app.put('/api/collaborate/:collaborationId', async (req, res) => {
//   try {
//     if (!mongoConnected) {
//       return res.status(503).json({ error: 'Database not connected' });
//     }

//     const { userId, userName, ...updateData } = req.body;
    
//     const event = await Event.findOne({ 
//       collaborationId: req.params.collaborationId, 
//       collaborationEnabled: true 
//     });
    
//     if (!event) {
//       return res.status(404).json({ error: 'Collaborative event not found' });
//     }

//     // Check permissions (owner or collaborator with edit permission)
//     const isOwner = String(event.owner || event.userId) === String(userId);
//     const collaborator = event.collaborators.find(c => String(c.userId) === String(userId));
//     const hasEditPermission = isOwner || (collaborator && ['edit', 'admin'].includes(collaborator.permission));
    
//     if (!hasEditPermission) {
//       return res.status(403).json({ error: 'Insufficient permissions to edit this event' });
//     }

//     // Update collaborator's last active time
//     if (collaborator) {
//       collaborator.lastActive = new Date();
//     }

//     // Handle checklist updates with activity tracking
//     if (updateData.checklist && Array.isArray(updateData.checklist)) {
//       const existingChecklist = event.checklist || [];
      
//       // Check for checkbox changes to log activity
//       updateData.checklist.forEach((newItem, index) => {
//         const oldItem = existingChecklist[index];
//         if (oldItem && newItem.completed !== oldItem.completed) {
//           if (!event.activityLog) event.activityLog = [];
//           event.activityLog.push({
//             userId: userId,
//             userName: userName || 'Unknown User',
//             action: newItem.completed ? 'completed_task' : 'uncompleted_task',
//             description: `${newItem.completed ? 'Completed' : 'Uncompleted'} task: ${newItem.task}`,
//             timestamp: new Date(),
//             metadata: { taskIndex: index, taskId: newItem._id }
//           });
//         }
//       });
//     }

//     // Apply updates
//     Object.assign(event, updateData);
//     event.updatedAt = new Date();
    
//     // Log general update activity (if not just checkbox changes)
//     const isChecklistOnlyUpdate = Object.keys(updateData).length === 1 && updateData.checklist;
//     if (!isChecklistOnlyUpdate) {
//       if (!event.activityLog) event.activityLog = [];
//       event.activityLog.push({
//         userId: userId,
//         userName: userName || 'Unknown User',
//         action: 'updated',
//         description: 'Updated event details',
//         timestamp: new Date(),
//         metadata: { updatedFields: Object.keys(updateData) }
//       });
//     }

//     await event.save();
//     res.json(event);
//   } catch (error) {
//     console.error('❌ Update collaborative event error:', error);
//     res.status(500).json({ error: 'Failed to update collaborative event' });
//   }
// });

// // Join collaborative event (for users clicking collaboration link)
// app.post('/api/collaborate/:collaborationId/join', async (req, res) => {
//   try {
//     if (!mongoConnected) {
//       return res.status(503).json({ error: 'Database not connected' });
//     }

//     const { userId, email: rawEmail, firstName, lastName } = req.body;
//     const email = normEmail(rawEmail);
    
//     if (!email || !firstName || !lastName) {
//       return res.status(400).json({ error: 'Email, first name, and last name are required' });
//     }

//     const event = await Event.findOne({ 
//       collaborationId: req.params.collaborationId, 
//       collaborationEnabled: true 
//     });
    
//     if (!event) {
//       return res.status(404).json({ error: 'Collaborative event not found' });
//     }

//     // Check if user is already a collaborator
//     const existingCollaborator = (event.collaborators || []).find(c =>
//       normEmail(c.email) === email || (userId && c.userId && String(c.userId) === String(userId))
//     );

//     if (!existingCollaborator) {
//         return res.status(403).json({ error: 'This email is not invited to collaborate on this event.' });
//     }

//     if (!existingCollaborator) {
//       // Add as new collaborator with default edit permission
//       const collaborator = {
//         userId: userId || null,
//         email: email,
//         firstName: firstName,
//         lastName: lastName,
//         permission: 'edit',
//         addedAt: new Date(),
//         addedBy: null, // Self-joined
//         lastActive: new Date()
//       };

//       event.collaborators.push(collaborator);
      
//       // Add activity log entry
//       if (!event.activityLog) event.activityLog = [];
//       event.activityLog.push({
//         userId: userId,
//         userName: `${firstName} ${lastName}`,
//         action: 'joined',
//         description: `${firstName} ${lastName} joined as a collaborator`,
//         timestamp: new Date(),
//         metadata: { email }
//       });

//       await event.save();
//     } else {
//       // Update existing collaborator's last active time
//       existingCollaborator.lastActive = new Date();
//       await event.save();
//     }

//     res.json({ message: 'Successfully joined collaborative event', event });
//   } catch (error) {
//     console.error('❌ Join collaborative event error:', error);
//     res.status(500).json({ error: 'Failed to join collaborative event' });
//   }
// });

// --- JOIN: POST /api/collaborate/:collaborationId/join
app.post('/api/collaborate/:collaborationId/join', async (req, res) => {
  const normEmail = (e) => (e || '').trim().toLowerCase();

  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { userId, email: rawEmail, firstName, lastName } = req.body;
    const email = normEmail(rawEmail);

    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Email, first name, and last name are required' });
    }

    const event = await Event.findOne({
      collaborationId: req.params.collaborationId,
      collaborationEnabled: true
    });

    if (!event) {
      return res.status(404).json({ error: 'Collaborative event not found' });
    }

    // Must have been invited by email (invite-only)
    const collaborator = (event.collaborators || []).find(c =>
      normEmail(c.email) === email || (userId && c.userId && String(c.userId) === String(userId))
    );

    if (!collaborator) {
      return res.status(403).json({ error: 'This email is not invited to collaborate on this event.' });
    }

    // Bind userId if missing; refresh names; update lastActive
    if (!collaborator.userId && userId) collaborator.userId = userId;
    if (firstName) collaborator.firstName = firstName;
    if (lastName)  collaborator.lastName  = lastName;
    collaborator.lastActive = new Date();

    // Log join activity
    if (!event.activityLog) event.activityLog = [];
    event.activityLog.push({
      userId: userId || null,
      userName: `${firstName} ${lastName}`,
      action: 'joined',
      description: `${firstName} ${lastName} joined with invited email`,
      timestamp: new Date(),
      metadata: { email }
    });

    await event.save();
    res.json({ message: 'Successfully joined collaborative event', event });
  } catch (error) {
    console.error('❌ Join collaborative event error:', error);
    res.status(500).json({ error: 'Failed to join collaborative event' });
  }
});


// Get activity log for collaborative event
app.get('/api/collaborate/:collaborationId/activity', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const event = await Event.findOne({ 
      collaborationId: req.params.collaborationId, 
      collaborationEnabled: true 
    }).select('activityLog').lean();
    
    if (!event) {
      return res.status(404).json({ error: 'Collaborative event not found' });
    }

    // Sort activity log by timestamp (newest first) and limit to last 50 entries
    const activityLog = (event.activityLog || [])
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 50);

    res.json({ activityLog });
  } catch (error) {
    console.error('❌ Get activity log error:', error);
    res.status(500).json({ error: 'Failed to get activity log' });
  }
});

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

async function sendReminderEmail({ to, user, event, tasks, reminderDays }) {
  const baseApp = (process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const unsubscribeSig = signUnsubscribe(String(user._id), String(event._id));
  const unsubscribeUrl = `${(process.env.PUBLIC_API_URL || `http://localhost:${PORT}`).replace(/\/$/, '')}/api/notifications/unsubscribe?uid=${user._id}&eid=${event._id}&sig=${unsubscribeSig}`;

  const daysText = reminderDays === 1 ? '1 day' : `${reminderDays} days`;
  const subject = `Reminder: ${tasks.length} task(s) due in ${daysText} for ${event.title}`;
  const lines = tasks.map(t => `• ${t.task}${t.dueDate ? ` (due ${new Date(t.dueDate).toLocaleDateString()})` : ''}`);
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5; color:#111">
      <h2 style="margin:0 0 8px 0;">Upcoming tasks for: ${event.title}</h2>
      <p>The following task(s) are due in ${daysText}:</p>
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
    const events = await Event.find({ 'notifications.emailOptIn': { $ne: false } }).lean();
    
    for (const ev of events) {
      // Use per-event reminderDays, default to 5 if not set
      const reminderDays = ev.notifications?.reminderDays || 5;
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + reminderDays);
      const start = new Date(target); start.setHours(0,0,0,0);
      const end = new Date(target); end.setHours(23,59,59,999);

      const dueTasks = (ev.checklist || []).filter(it => 
        !it.isTimeHeader && 
        !it.completed && 
        it.dueDate && 
        (new Date(it.dueDate) >= start && new Date(it.dueDate) <= end)
      );
      
      if (!dueTasks.length) continue;

      // Load user email
      let user = null;
      try { user = await User.findById(ev.userId).lean(); } catch {}
      if (!user?.email) continue;

      await sendReminderEmail({ to: user.email, user, event: ev, tasks: dueTasks, reminderDays });
    }
  } catch (e) {
    console.error('Cron email job error:', e);
  }
});