// database/seed.js
import { connectDB, mongoose } from '../backend/src/db.js';
import 'dotenv/config';
import { Policy } from '../backend/src/models.js';

const POLICIES = [
  {
    category: 'Space Booking',
    title: 'Campus Space Reservation Requirements',
    description: 'All campus spaces must be reserved through the appropriate channels',
    requirements: [
      'Submit space request at least 2 weeks in advance',
      'Provide event details including expected attendance',
      'Get approval from facility manager',
      'Complete insurance requirements if needed'
    ],
    timeline: { minAdvanceNotice: 14, recommendedAdvanceNotice: 30 },
    applicableRoles: ['both'],
    programTypes: ['mixer', 'concert', 'workshop', 'lecture'],
    severity: 'critical'
  },
  {
    category: 'Alcohol Policy',
    title: 'Alcohol Service Guidelines',
    description: 'Special requirements for events serving alcohol',
    requirements: [
      'Must be registered as a wet event',
      'Licensed bartender required',
      'Security may be required based on attendance',
      'Must comply with state and local laws',
      'No alcohol service to minors'
    ],
    timeline: { minAdvanceNotice: 21, recommendedAdvanceNotice: 45 },
    applicableRoles: ['both'],
    programTypes: ['mixer', 'concert'],
    severity: 'critical'
  },
  {
    category: 'Marketing',
    title: 'Marketing and Promotion Guidelines',
    description: 'Requirements for advertising and promoting campus events',
    requirements: [
      'Follow brand guidelines for Vanderbilt materials',
      'Submit marketing materials for approval if using university logos',
      'Consider accessibility in all communications',
      'Include appropriate disclaimers'
    ],
    timeline: { minAdvanceNotice: 10, recommendedAdvanceNotice: 21 },
    applicableRoles: ['both'],
    programTypes: ['mixer', 'concert', 'workshop', 'lecture'],
    severity: 'warning'
  },
  {
    category: 'Financial',
    title: 'Budget and Payment Processing',
    description: 'Financial policies for program expenses',
    requirements: [
      'Staff: Can spend up to $500 without additional approval',
      'Students: Must get pre-approval for all expenses over $100',
      'All receipts must be submitted within 30 days',
      'Use approved vendors when possible'
    ],
    timeline: { minAdvanceNotice: 7, recommendedAdvanceNotice: 14 },
    applicableRoles: ['both'],
    programTypes: ['mixer', 'concert', 'workshop', 'lecture'],
    severity: 'warning' // was "high" → normalize to valid value
  },
  {
    category: 'Vendors',
    title: 'External Vendor Requirements',
    description: 'Requirements for hiring external vendors',
    requirements: [
      'Vendors must provide proof of insurance',
      'Background checks required for certain vendor types',
      'Contracts must be approved by appropriate office',
      'Payment processing requires advance notice'
    ],
    timeline: { minAdvanceNotice: 21, recommendedAdvanceNotice: 45 },
    applicableRoles: ['both'],
    programTypes: ['concert', 'workshop', 'lecture'],
    severity: 'warning' // was "high"
  },
  {
    category: 'Security',
    title: 'Security and Safety Requirements',
    description: 'Security requirements based on event type and size',
    requirements: [
      'Events over 100 people may require security',
      'Late-night events require additional safety measures',
      'Emergency contact information must be provided',
      'Evacuation plan required for large events'
    ],
    timeline: { minAdvanceNotice: 14, recommendedAdvanceNotice: 30 },
    applicableRoles: ['both'],
    programTypes: ['mixer', 'concert'],
    severity: 'critical'
  },
  {
    category: 'Catering',
    title: 'Food Service Guidelines',
    description: 'Requirements for providing food at events',
    requirements: [
      'Use approved campus catering or licensed vendors',
      'Consider dietary restrictions and allergies',
      'Food safety certification may be required',
      'Special permits needed for outdoor food service'
    ],
    timeline: { minAdvanceNotice: 10, recommendedAdvanceNotice: 21 },
    applicableRoles: ['both'],
    programTypes: ['mixer', 'workshop', 'lecture'],
    severity: 'warning'
  }
];

const uri =
  process.env.DATABASE_URL ||
  process.env.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/program-planning';

function normalizePolicy(doc) {
  // roles: ['both'] -> roleVisibility='both'
  const hasBoth = Array.isArray(doc.applicableRoles) && doc.applicableRoles.includes('both');
  const normalized = {
    ...doc,
    roleVisibility: hasBoth ? 'both' : undefined,
  };

  // severity synonyms just in case
  if (normalized.severity === 'high') normalized.severity = 'warning';

  return normalized;
}

async function seedDatabase() {
  try {
    await connectDB(uri);                // uses SAME mongoose instance as models
    console.log('Connected to MongoDB');

    // Optional: ensure indexes before writes
    await Policy.init();

    await Policy.deleteMany({});
    const result = await Policy.insertMany(POLICIES, { ordered: true });
    console.log(`✅ Seeding complete: inserted ${result.length} policies.`);
  } catch (err) {
    console.error('❌ Error seeding database:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
}

seedDatabase();
