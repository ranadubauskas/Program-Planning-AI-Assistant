// database/seed.js
import 'dotenv/config';
import { connectDB } from '../backend/src/db.js';
import { Policy } from '../backend/src/models.js';

const POLICIES = [
  // ---------- Use of University Space ----------
  {
    category: 'Space Booking',
    title: 'Use of University Space & Reservation Requirements',
    description:
      'University space must be reserved via the appropriate channel (e.g., Student Centers/EMS). Vanderbilt may cancel events for safety/security concerns.',
    requirements: [
      'Reserve campus spaces via the official reservation process (e.g., EMS/Student Centers).',
      'Do not use space without a reservation (exceptions are narrow, e.g., informal study).',
      'Understand the University’s right of refusal/cancellation for safety or security concerns.',
    ],
    timeline: {
      minAdvanceNotice: 14,
      recommendedAdvanceNotice: 30
    },
    roleVisibility: 'both',
    programTypes: ['mixer', 'concert', 'workshop', 'lecture', 'other'],
    severity: 'critical',
    tags: ['space', 'reservation', 'EMS', 'student centers'],
    citations: [
      'https://studenthandbook.vanderbilt.edu/administrative-policies',           // admin policies hub
      'https://studenthandbook.vanderbilt.edu/use-of-university-space'           // use-of-space details
    ],
  },

  // ---------- Alcohol ----------
  {
    category: 'Alcohol',
    title: 'Alcohol at Events (Student Handbook & Student Centers)',
    description:
      'Alcohol service at events requires prior approval and adherence to university and law. Additional restrictions apply to recruitment events and undergraduate org events.',
    requirements: [
      'Follow Student Handbook alcohol policies; prohibition at recruitment events.',
      'If approved, alcohol service requires prior authorization through Student Centers (where applicable).',
      'Compliance with state/local law; no service to minors.',
      'Security and additional controls may be required based on event profile.',
    ],
    timeline: {
      minAdvanceNotice: 21,
      recommendedAdvanceNotice: 45
    },
    roleVisibility: 'both',
    programTypes: ['mixer', 'concert', 'lecture', 'workshop'],
    severity: 'critical',
    tags: ['alcohol', 'wet event', 'student centers', 'approvals'],
    citations: [
      'https://studenthandbook.vanderbilt.edu/administrative-policies',           // admin policies hub
      'https://studenthandbook.vanderbilt.edu/student-behavioral-policies',       // behavioral policies index
      'https://studenthandbook.vanderbilt.edu/alcohol-0',                         // alcohol overview
      'https://www.vanderbilt.edu/studentcenters/alcohol-at-events/'              // Student Centers alcohol at events
    ],
  },

  // ---------- Protection of Minors ----------
  {
    category: 'Protection of Minors',
    title: 'Youth Protection & Mandatory Reporting',
    description:
      'Programs involving minors require compliance with Vanderbilt’s Protection of Minors policy, including background checks, training, codes of conduct, and mandatory reporting.',
    requirements: [
      'Register programs serving minors (per Youth Protection guidance).',
      'Background checks and training for personnel interacting with minors.',
      'Adhere to Code of Conduct; report suspected abuse/neglect internally and externally as required.',
      'Follow operational expectations (supervision, transportation, site selection, emergencies).',
    ],
    timeline: {
      minAdvanceNotice: 30,
      recommendedAdvanceNotice: 60
    },
    roleVisibility: 'both',
    programTypes: ['mixer', 'concert', 'workshop', 'lecture', 'other'],
    severity: 'critical',
    tags: ['minors', 'youth protection', 'mandatory reporting', 'background checks'],
    citations: [
      'https://www.vanderbilt.edu/youthprotection/',                               // policy hub
      'https://www.vanderbilt.edu/youthprotection/policy/',                        // policy page
      'https://cdn.vanderbilt.edu/vu-URL/wp-content/uploads/sites/127/2021/01/19194314/Protection-of-Minors-Policy-Handbook-2021.pdf'
    ],
  },
  {
    category: 'Marketing',
    title: 'Marketing, Communications & Promotions',
    description:
      'Requirements that govern event promotion at Vanderbilt, including official communications, posting rules, political activity limits, ticketing, solicitation/fundraising, trademark use, and copyright compliance.',
    requirements: [
      // Official communications
      'Use official Vanderbilt channels as required; students are responsible for reading official university email notifications.',
      // Posting / notices
      'Follow posting rules for notices, posters, banners, and printed announcements; obtain location-specific approvals (e.g., Student Centers, Dining, Housing). No door-to-door solicitation; respect flyer and banner limits.',
      // Political activity
      'Do not use University resources to support/opppose political candidates. If candidates are hosted, access must be viewpoint-neutral and coordinated with the Division of Government & Community Relations.',
      // Ticketing
      'For RSO on-campus events, ticketing must be arranged through Student Centers and use the AudienceView platform.',
      // Sales / solicitation / fundraising
      'Sales, solicitation, and fundraising require prior authorization and must follow time/place/manner restrictions; external vendors may need an access/license agreement.',
      // Trademarks & branding
      'Use of Vanderbilt names, logos, and marks requires approval from the Office of Brand Engagement and Governance; do not imply University endorsement.',
      // Copyright
      'Comply with copyright law; do not distribute copyrighted materials without permission and avoid illegal file sharing.'
    ],
    timeline: { },
    roleVisibility: 'both',
    programTypes: ['mixer', 'concert', 'workshop', 'lecture', 'other'],
    severity: 'warning',
    tags: [
      'marketing', 'communications', 'posters', 'banners', 'solicitation',
      'fundraising', 'ticketing', 'AudienceView', 'political activity',
      'trademarks', 'branding', 'copyright'
    ],
    citations: [
      'https://studenthandbook.vanderbilt.edu/administrative-policies#7417', // Marketing & Communications (Handbook)
      'https://studenthandbook.vanderbilt.edu/administrative-policies'        // Administrative Policies index
    ],
  },
  // ---------- IT: Acceptable Use ----------
  {
    category: 'Technology',
    title: 'Acceptable Use of Technology Assets',
    description:
      'Defines acceptable/unacceptable uses of Vanderbilt IT assets; protects confidentiality, integrity, and availability of systems and data.',
    requirements: [
      // 1) General use & ownership
      'University data on any device (VU-owned or personal) remains Vanderbilt property and must follow the Data Classification Policy.',
      'Access/use/share Vanderbilt data only when authorized and necessary for your job or role.',
      'Promptly report suspected security or privacy incidents (e.g., theft, loss, unauthorized disclosure).',
      'VUIT/Cybersecurity may monitor equipment, systems, and network traffic for security/maintenance.',
      'Networks and systems may be audited periodically for policy compliance.',

      // 2) Unlawful & inappropriate use
      'Do not use university resources for any illegal activity under local, state, federal, or international law.',
      'Do not destroy data/equipment, defame others, copy copyrighted material without authorization, or engage in sexual exploitation/solicitation of a minor via electronic means.',
      'Follow applicable standards for inappropriate use and BYOD when using personally owned devices for Vanderbilt business.',

      // 3) Privacy
      'Access to another user’s electronic information requires a legitimate business purpose or that user’s consent, and must be limited to the minimum necessary.',
      'Do not attempt to gain unauthorized access to private information—even if left unprotected.',
      'Authorized officials may review electronic information for investigations, legal compliance, or maintenance following proper protocols.',
      'Do not publish/distribute recordings or images from non-public situations without consent of all parties.',
      'Users should not expect privacy in records created/stored/communicated with Vanderbilt IT assets; Vanderbilt may obtain and disclose such records when required by law or policy.',

      // 4) Intellectual property
      'Use copyrighted material (text, images, software, audio/video) only per license or applicable law; attribute properly.',
      'Do not acquire or share copyrighted materials without appropriate permission or license.'
    ],
    timeline: {},
    roleVisibility: 'both',
    programTypes: ['mixer', 'concert', 'workshop', 'lecture', 'other'],
    severity: 'warning',
    tags: [
      'acceptable use', 'technology', 'BYOD', 'data classification',
      'privacy', 'copyright', 'monitoring', 'policy'
    ],
    citations: [
      'https://it.vanderbilt.edu/about-us/policies/',
      'https://www.vanderbilt.edu/cybersecurity/policies/aup-policy/'
    ]
  },


  // ---------- IT: Electronic Communications ----------
  {
  category: 'Technology',
  title: 'Electronic Communications Policy',
  description:
    'Guidance for appropriate use of electronic communications/resources by employees; includes required approvals for mass communications and expectations for security, privacy, and professionalism.',
  requirements: [
    // A) Security of Information
    'Maintain security of info on systems; follow the Acceptable Use Policy.',
    'Use only resources you are approved to access; report excess/expired access to your supervisor.',
    'Protect credentials (accounts, passwords, PINs); never use another user’s authentication except with explicit, exceptional authorization.',
    'Be vigilant about malware (viruses/spyware/trojans); follow IT security recommendations.',
    'Do not attempt to gain unauthorized access to private information.',
    'Do not deploy destructive/info-gathering tools (e.g., keyloggers, sniffers); follow minimum security requirements.',

    // B) Communication Beyond Individual Area of Responsibility (mass comms)
    'Bulk/broadcast/mass messages require prior approval.',
    'University-wide: approval from the Vice Chancellor for Public Affairs (or designee).',
    'All-employee: approval from the Chief People Experience Officer (or designee).',
    'All University Central faculty: approval from the Provost (or designee); school-wide: dean (or designee).',
    'Students/house staff: approval from the appropriate Dean of Students or Associate Dean of GME (or designee).',
    'Safety/security messages: approval from VUPD Chief or EHS Director (or designee).',

    // C) Other Electronic Activities
    'Use Vanderbilt systems primarily for university purposes; incidental personal use requires supervisor approval/department guidelines.',
    'Know and follow your department’s expectations for system/equipment use.',
    'Do not install/download software that violates the Appropriate Use Policy or creates copyright/bandwidth issues.',
    'Prohibited uses include: political campaigning; unauthorized recording of Vanderbilt business; offensive/harassing content; implying university representation without authorization; improper disclosure/use of confidential info or trademarks; personal business; unauthorized solicitations; unapproved email signatures; excessive non-work use; unprofessional communications; uncoordinated recruiting; unauthorized long-distance charges; and any activity violating law or Vanderbilt policy (e.g., illegal file sharing, HIPAA/FERPA violations).',

    // D) Activity on External Systems (social, forums, etc.)
    'When using external platforms, do not identify as a Vanderbilt employee while sharing offensive/harassing/graphic content.',
    'Avoid unprofessional communications that could harm Vanderbilt’s reputation or mission.',
    'Do not act or imply acting on behalf of Vanderbilt without authorization (e.g., media/government contacts, public replies about Vanderbilt business).'
  ],
  timeline: {},
  roleVisibility: 'both',
  programTypes: ['mixer', 'concert', 'workshop', 'lecture', 'other'],
  severity: 'info',
  tags: [
    'electronic communications', 'bulk email', 'privacy', 'monitoring',
    'security', 'credentials', 'social media', 'professional conduct'
  ],
  citations: [
    'https://it.vanderbilt.edu/about-us/policies/'
    // Add your hosted PDF URL here if/when available.
  ]
},

];

async function run() {
  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/program-planning';
  await connectDB(uri);
  console.log('Connected to MongoDB');

  await Policy.deleteMany({});
  await Policy.insertMany(POLICIES);
  console.log(`✅ Inserted ${POLICIES.length} policies`);
  process.exit(0);
}

run().catch(e => {
  console.error('❌ Seeding error:', e);
  process.exit(1);
});
