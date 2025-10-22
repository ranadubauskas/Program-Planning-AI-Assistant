// backend/src/policyRag.js
import { Policy, ProgramPlan, User } from './models.js';

/** Detect if tech policy is relevant for this message/plan */
function detectTechRelevance(message = '') {
  const m = String(message || '').toLowerCase();

  const kw = [
    // approvals / broadcast
    'email', 'bulk email', 'mass email', 'broadcast', 'listserv', 'mailing list',
    'newsletter', 'announcement',
    // channels
    'social media', 'instagram', 'facebook', 'x.com', 'twitter', 'linkedin', 'youtube',
    'website', 'web page', 'livestream', 'streaming', 'recording',
    // device / access / security
    'wifi', 'network', 'it', 'technology', 'acceptable use', 'aup', 'byod', 'malware',
    'credentials', 'password', 'data classification', 'privacy'
  ];

  return kw.some(k => m.includes(k));
}

/** Detect if alcohol policy is relevant */
function detectAlcoholRelevance(message = '', plan = null) {
  const m = String(message || '').toLowerCase();
  if (plan?.hasAlcohol === true) return true;
  const kw = ['alcohol', 'bartender', 'wet event', 'beer', 'wine', 'id check', 'abc'];
  return kw.some(k => m.includes(k));
}

/** Condense policies into short, model-friendly context */
function condensePoliciesToContext(policies = []) {
  return policies.map(p => {
    const reqs = (p.requirements || []).slice(0, 6); // keep it tight
    const cite = (p.citations || [])[0] || '';
    return [
      `• Category: ${p.category}`,
      `  Title: ${p.title}`,
      p.severity ? `  Severity: ${p.severity}` : null,
      reqs.length ? `  Key requirements:\n    - ${reqs.join('\n    - ')}` : null,
      cite ? `  Source: ${cite}` : null
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

/**
 * Get the most relevant policies for a message/plan/user, and suppress
 * Technology / Alcohol unless applicable.
 */
export async function buildPolicyContext({ message, planId, userId }) {
  // Fetch plan (optional) and user (optional) for filtering
  const plan = planId ? await ProgramPlan.findById(planId).lean() : null;
  const user = userId ? await User.findById(userId).lean() : null;

  const role = (user?.role || 'both').toLowerCase(); // 'student' | 'staff' | 'both'
  const programType = plan?.programType || 'other';

  // Pull policies roughly matching the plan’s type and role visibility
  const basePolicies = await Policy.find({
    $and: [
      { $or: [
        { programTypes: { $size: 0 } },               // applies to all
        { programTypes: programType },                // matches plan type
        { programTypes: 'other' }                     // generic
      ]},
      { $or: [
        { roleVisibility: 'both' },
        { roleVisibility: role }
      ]}
    ]
  }).lean();

  const techRelevant = detectTechRelevance(message);
  const alcoholRelevant = detectAlcoholRelevance(message, plan);

  // Filter out Technology / Alcohol when not relevant
  const filtered = basePolicies.filter(p => {
    const cat = (p.category || '').toLowerCase();
    if (cat.includes('technology')) return techRelevant;
    if (cat.includes('alcohol')) return alcoholRelevant;
    return true; // keep everything else
  });

  // (Optional) further limit to a sane number
  const capped = filtered.slice(0, 15);

  return {
    plan,
    user,
    techRelevant,
    alcoholRelevant,
    policies: capped,
    contextText: condensePoliciesToContext(capped)
  };
}
