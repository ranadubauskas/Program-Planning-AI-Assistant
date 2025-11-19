// backend/src/models.js
import { mongoose } from './db.js';

const UserSchema = new mongoose.Schema({
  vanderbiltId: { type: String, required: true, unique: true },
  email:       { type: String, required: true, unique: true },
  firstName:   { type: String, required: true },
  lastName:    { type: String, required: true },
  role:        { type: String, enum: ['student', 'staff'], required: true },
  department:  { type: String },
  createdAt:   { type: Date, default: Date.now }
});

const ProgramPlanSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:       { type: String, required: true },
  programType: { type: String, enum: ['mixer', 'concert', 'workshop', 'lecture', 'other'], required: true },
  location: {
    type:   { type: String, enum: ['on-campus', 'off-campus'], required: true },
    venue:  String,
    capacity: Number
  },
  hasAlcohol: { type: Boolean, default: false },
  expectedAttendance: { type: Number },
  budget: {
    amount: Number,
    currency: { type: String, default: 'USD' }
  },
  timeline: {
    eventDate: Date,
    planningStartDate: Date,
    deadlines: [{
      task: String,
      dueDate: Date,
      completed: { type: Boolean, default: false }
    }]
  },
  checklist: [{
    category: String,
    task: String,
    description: String,
    dueDate: Date,
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
    completed: { type: Boolean, default: false },
    policyReference: String
  }],
  conversationHistory: [{
    role: { type: String, enum: ['user', 'assistant'] },
    content: String,
    timestamp: { type: Date, default: Date.now }
  }],
  status: {
    type: String,
    enum: ['planning', 'approved', 'in-progress', 'completed', 'cancelled'],
    default: 'planning'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ---- Policy schema (tolerant + normalized) ----
const PolicySchema = new mongoose.Schema(
  {
    category: { type: String, required: true, trim: true },
    title:    { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },

    requirements: { type: [String], default: [] },
    citations:    { type: [String], default: [] },
    tags:         { type: [String], default: [] },

    timeline: {
      minAdvanceNotice:         { type: Number, min: 0 },
      recommendedAdvanceNotice: { type: Number, min: 0 }
    },

    // canonical
    roleVisibility: {
      type: String,
      enum: ['student', 'staff', 'both'],
      default: 'both'
    },

    // accept legacy/app input, not stored by default
    applicableRoles: { type: [String], select: false, default: undefined },

    programTypes: { type: [String], default: [] },

    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info'
    }
  },
  { collection: 'policies', timestamps: true, versionKey: false }
);

// normalize roles + severity synonyms
PolicySchema.pre('validate', function () {
  if (Array.isArray(this.applicableRoles) && this.applicableRoles.length) {
    const set = new Set(this.applicableRoles.map(s => String(s).toLowerCase()));
    if (set.has('student') && set.has('staff')) this.roleVisibility = 'both';
    else if (set.has('student')) this.roleVisibility = 'student';
    else if (set.has('staff')) this.roleVisibility = 'staff';
    else if (set.has('both')) this.roleVisibility = 'both';
  }
  if (this.severity === 'high') this.severity = 'warning'; // tolerate 'high'
});

PolicySchema.index({ category: 1, roleVisibility: 1 });
PolicySchema.index({ title: 'text', description: 'text', category: 'text', tags: 'text' });

// Event schema for saved events from chat
const EventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.Mixed, required: true }, // Allow both ObjectId and string for temp users
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProgramPlan' },
  title: { type: String, required: true },
  description: { type: String },
  eventDate: { type: Date },
  category: { type: String, enum: ['meeting', 'deadline', 'task', 'milestone', 'other'], default: 'other' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  status: { type: String, enum: ['pending', 'in-progress', 'completed', 'cancelled'], default: 'pending' },
  
  // Event details that can be updated through chat
  expectedAttendance: { type: Number },
  location: {
    type: { type: String, enum: ['on-campus', 'off-campus'] },
    venue: String,
    address: String,
    room: String
  },
  budget: {
    amount: Number,
    currency: { type: String, default: 'USD' }
  },
  hasAlcohol: { type: Boolean, default: false },
  requiresAV: { type: Boolean, default: false },
  cateringRequired: { type: Boolean, default: false },
  potentiallyControversial: { type: Boolean, default: false }, // Event may have potential for disruption
  eventType: { type: String, enum: ['mixer', 'concert', 'workshop', 'lecture', 'meeting', 'social', 'academic', 'other'], default: 'other' },
  
  // Enhanced checklist with timeline
  checklist: [{
    task: { type: String, required: true },
    description: String,
    dueDate: Date,
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    completed: { type: Boolean, default: false },
    completedAt: Date,
    estimatedHours: Number,
    category: String,
    dependencies: [String], // References to other tasks
    isTimeHeader: { type: Boolean, default: false }, // For time period headers
    timePeriod: String, // Time period label for headers
    timingType: { type: String, enum: ['required', 'recommended'], default: 'recommended' } // Required vs recommended timing
  }],
  
  // Timeline milestones
  timeline: [{
    milestone: { type: String, required: true },
    dueDate: Date,
    completed: { type: Boolean, default: false },
    completedAt: Date,
    description: String,
    associatedTasks: [String] // References to checklist items
  }],
  
  // Original chat context
  sourceMessage: {
    content: String,
    timestamp: Date,
    conversationContext: [String] // Array of related message contents
  },
  
  // User notes
  notes: { type: String },
  
  // Notifications
  notifications: {
    emailOptIn: { type: Boolean, default: true },
    reminderDays: { type: Number, default: 5, min: 1, max: 30 }, // Days before due date to send reminder
  },
 
  // Public sharing
  shareId: { type: String, unique: true, sparse: true },
  shareEnabled: { type: Boolean, default: false },
  shareCreatedAt: { type: Date },
  
  // Collaboration features
  collaborationEnabled: { type: Boolean, default: false },
  collaborationId: { type: String, unique: true, sparse: true }, // Separate ID for collaboration access
  collaborators: [{
    userId: { type: mongoose.Schema.Types.Mixed }, // Allow both ObjectId and string for temp users
    email: String,
    firstName: String,
    lastName: String,
    permission: { type: String, enum: ['view', 'edit', 'admin'], default: 'edit' },
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: mongoose.Schema.Types.Mixed }, // User who added this collaborator
    lastActive: { type: Date, default: Date.now }
  }],
  owner: { type: mongoose.Schema.Types.Mixed }, // Original creator of the event (set automatically)
  
  // Activity tracking for collaboration
  activityLog: [{
    userId: { type: mongoose.Schema.Types.Mixed },
    userName: String,
    action: { type: String, enum: ['created', 'updated', 'completed_task', 'uncompleted_task', 'added_collaborator', 'removed_collaborator', 'joined'] },
    description: String,
    timestamp: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed } // Store additional action data
  }],
  
  // Generated communications storage
  generatedCommunications: [{
    communicationType: { type: String, required: true },
    tone: { type: String, required: true },
    content: { type: String, required: true },
    characterCount: { type: Number },
    characterLimit: { type: Number },
    withinLimit: { type: Boolean },
    customInstructions: String,
    generatedAt: { type: Date, default: Date.now },
    generatedBy: { type: mongoose.Schema.Types.Mixed } // User who generated it
  }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt field on save and set owner if not set
EventSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Set owner to userId if not already set (for backward compatibility)
  if (!this.owner && this.userId) {
    this.owner = this.userId;
  }
  
  next();
});

// Helpful indexes for public lookups and collaboration
EventSchema.index({ shareId: 1 }, { sparse: true });
EventSchema.index({ collaborationId: 1 }, { unique: true, sparse: true });
EventSchema.index({ 'collaborators.userId': 1 });
EventSchema.index({ owner: 1 });

export const User = mongoose.model('User', UserSchema);
export const ProgramPlan = mongoose.model('ProgramPlan', ProgramPlanSchema);
export const Policy = mongoose.model('Policy', PolicySchema);
export const Event = mongoose.model('Event', EventSchema);
