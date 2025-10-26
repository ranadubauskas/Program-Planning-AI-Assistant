import React, { useState, useEffect, useRef } from 'react';
import MessageBubble from '../components/MessageBubble.jsx';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { PaperAirplaneIcon, DocumentArrowUpIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

const Chat = ({ user }) => {
  const { planId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [eventContext, setEventContext] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Check for event context from navigation state
    if (location.state?.eventContext) {
      setEventContext(location.state.eventContext);
      initializeEventChat(location.state.eventContext);
    } else if (planId) {
      fetchPlan();
    } else {
      // Start with welcome message
      setMessages([{
        role: 'assistant',
        content: `Hello ${user.firstName}! I'm your Vanderbilt Program Planning Assistant. I can help you navigate policies, timelines, and requirements for campus events.

To get started, tell me about the program you're planning:


1. **Event Type:** What type of event? (mixer, concert, workshop, lecture, etc.)
2. **Location:** Will it be on-campus or off-campus?
3. **Alcohol:** Will alcohol be involved?
4. **Technology:** Do you plan to email communications & will you require AV support or Wifi?
4. **Expected Attendance:** How many people do you expect to attend?
5. **Target Date:** When are you planning to hold it?

I'll guide you through all the necessary steps and create a personalized checklist!`,
        timestamp: new Date()
      }]);
    }
  }, [planId, user.firstName, location.state]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-save event updates when conversation progresses (in event context mode)
  useEffect(() => {
    // Only auto-save if we're in event context mode and have meaningful conversation
    if (eventContext && messages.length >= 3) { // Initial message + at least 1 exchange
      // Debounce auto-save to avoid excessive API calls
      const timeoutId = setTimeout(() => {
        autoUpdateEvent();
      }, 2000); // Wait 2 seconds after last message

      return () => clearTimeout(timeoutId);
    }
  }, [messages, eventContext]);

  const fetchPlan = async () => {
    try {
      const response = await axios.get(`/api/plans/${planId}`);
      setPlan(response.data);
      setMessages(response.data.conversationHistory || []);
    } catch (error) {
      console.error('Error fetching plan:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const initializeEventChat = (eventCtx) => {
    const eventDate = eventCtx.eventDate ? new Date(eventCtx.eventDate).toLocaleDateString() : 'Not set';
    
    setMessages([{
      role: 'assistant',
      content: `Hello ${user.firstName}! I see you're continuing our conversation about "${eventCtx.title}".

**Event Details:**
- **Title:** ${eventCtx.title}
- **Date:** ${eventDate}
- **Description:** ${eventCtx.description || 'No description provided'}

I have all the context from our previous conversation. How can I help you continue planning this event? You can ask me to:

• Update or modify the checklist
• Add new tasks or requirements
• Get guidance on specific policies or procedures
• Help with timing and logistics
• Answer questions about university requirements

What would you like to work on next?`,
      timestamp: new Date()
    }]);
  };

  const autoUpdateEvent = async () => {
    if (!eventContext || messages.length < 2) return;

    try {
      console.log('🔄 Auto-updating event with latest chat...');
      
      // Get the conversation content for AI processing
      const conversationContent = messages.slice(1) // Skip the initial message
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n\n');
      
      // Use AI to update the event based on the conversation
      const eventUpdateData = await generateEventUpdateWithAI(conversationContent, eventContext);
      
      const updatePayload = {
        ...eventUpdateData,
        sourceMessage: {
          content: conversationContent,
          timestamp: new Date(),
          conversationContext: messages.slice(-5).map(m => m.content) // Last 5 messages for context
        }
      };
      
      console.log('📤 Auto-updating event:', eventContext.eventId);
      
      const response = await axios.put(`/api/events/${eventContext.eventId}`, updatePayload);
      console.log('✅ Event auto-updated successfully');
      
      return response.data;
    } catch (error) {
      console.error('Auto-update error:', error);
      // Don't show error to user - this is a background operation
    }
  };

  const generateEventUpdateWithAI = async (conversationContent, eventCtx) => {
    try {
      const response = await axios.post('/api/chat/generate-event-update', {
        conversation: conversationContent,
        existingEvent: eventCtx,
        instructions: `Based on this conversation, update the event details. Extract any new checklist items, updated descriptions, changed dates, or other modifications discussed. Preserve existing information unless explicitly changed in the conversation.`
      });
      
      return response.data.eventData;
    } catch (error) {
      console.error('Error generating event update:', error);
      // Return minimal update to avoid breaking
      return {
        description: eventCtx.description,
        checklist: []
      };
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);

    try {
      const chatPayload = {
        message: inputMessage.trim(),
        planId: planId,
        context: messages.slice(-10) // Send last 10 messages for context
      };

      // Add event context if we're continuing from SavedEvents
      if (eventContext) {
        chatPayload.eventContext = eventContext;
        // Include event details in context for AI
        const eventContextMessage = {
          role: 'system',
          content: `Event Context: User is continuing conversation about "${eventContext.title}" (ID: ${eventContext.eventId}). Event date: ${eventContext.eventDate || 'Not set'}. Description: ${eventContext.description || 'None'}. Previous message context: ${eventContext.sourceMessage?.content || 'None'}.`
        };
        chatPayload.context = [eventContextMessage, ...chatPayload.context];
      }

      const response = await axios.post('/api/chat', chatPayload);

      const assistantMessage = {
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your message. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEvent = async (content, timestamp, currentPlanId) => {
    try {
      console.log('🔄 Starting event save process...');
      console.log('Content:', content);
      console.log('User ID:', user._id);
      
      // Use AI to intelligently generate event data
      console.log('🤖 Generating event data with AI...');
      const eventData = await generateEventWithAI(content, timestamp, currentPlanId);
      console.log('✅ Event data generated:', eventData);
      
      const eventPayload = {
        ...eventData,
        userId: user._id,
        planId: currentPlanId || planId,
        sourceMessage: {
          content,
          timestamp,
          conversationContext: messages.slice(-3).map(m => m.content) // Last 3 messages for context
        }
      };
      
      console.log('📤 Sending event to backend:', eventPayload);
      
      const response = await axios.post('/api/events', eventPayload);

      console.log('✅ Event saved successfully:', response.data);
      alert('Event saved successfully!'); // Temporary feedback
    } catch (error) {
      console.error('❌ Error saving event:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      alert(`Failed to save event: ${error.response?.data?.error || error.message}`);
    }
  };

  const generateEventWithAI = async (content, timestamp, currentPlanId) => {
    try {
      console.log('🤖 Starting AI event generation...');
      
      // Create a focused prompt for the AI to generate structured event data
      const eventPrompt = `Based on this message, create a structured event with a comprehensive time-organized checklist:

"${content}"

Generate a JSON response with this exact structure:
{
  "title": "Event Name (e.g., 'Mixer April 2026', 'Team Meeting December 2024')",
  "description": "Brief 1-2 sentence summary of the event",
  "eventDate": "YYYY-MM-DD format if a date is mentioned, or null",
  "category": "meeting|deadline|task|milestone|other",
  "priority": "low|medium|high|critical",
  "checklist": [
    {
      "task": "Clear task description",
      "dueDate": "YYYY-MM-DD format - when this task should be completed",
      "priority": "low|medium|high|critical",
      "completed": false
    }
  ]
}

COMPREHENSIVE TIMELINE RULES (work backwards from event date):

**6+ MONTHS OUT - Strategic Planning:**
- Budget planning and funding requests
- Concept development and proposals
- Sponsorship outreach
- Initial venue research for large events

**3-6 MONTHS OUT - Major Bookings & Permissions:**
- Venue booking and contracts
- Permits and licenses
- Security arrangements
- Insurance requirements
- Speaker/performer bookings
- Major vendor contracts

**1-3 MONTHS OUT - Marketing & Communications:**
- Marketing strategy and materials
- Website updates and social media
- Publicity campaigns
- Guest confirmations
- Registration setup

**2-4 WEEKS OUT - Invitations & RSVPs:**
- Send invitations
- Guest list management
- RSVP tracking
- Ticket distribution
- Dietary requirements collection

**1-2 WEEKS OUT - Catering & Supplies:**
- Finalize catering orders
- Purchase supplies and decorations
- Coordinate material deliveries
- Prepare welcome materials/swag
- Menu final approvals

**WEEK OF EVENT - Final Preparations:**
- Confirm all arrangements
- Final headcount to vendors
- Prepare event program/agenda
- Brief staff and volunteers
- Final venue walkthrough

**2-3 DAYS BEFORE - Setup & Equipment:**
- Equipment setup and testing
- AV and technical preparations
- Stage/room setup
- Signage installation
- Final venue preparations

**DAY OF EVENT:**
- Event execution and management
- Real-time coordination
- Problem solving

**AFTER EVENT:**
- Cleanup and breakdown
- Equipment returns
- Thank you communications
- Event evaluation
- Final invoicing and reports

Generate 8-15 relevant tasks across these time periods. Make tasks specific and actionable.

Only return the JSON, no other text.`;

      console.log('📡 Calling AI chat API for event generation...');
      const aiResponse = await axios.post('/api/chat', {
        message: eventPrompt,
        planId: currentPlanId,
        context: [] // No context needed for this focused task
      });

      console.log('🤖 AI Response received:', aiResponse.data);
      
      // Parse the AI response to get structured data
      const aiContent = aiResponse.data.response;
      console.log('📝 AI Content:', aiContent);
      
      // Try to extract JSON from the AI response
      let eventData;
      try {
        // Look for JSON in the response
        const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          eventData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in AI response');
        }
      } catch (parseError) {
        console.warn('⚠️ Failed to parse AI response, using fallback:', parseError);
        // Fallback to simple extraction if AI parsing fails
        eventData = extractEventFromContent(content, timestamp, currentPlanId);
        console.log('🔄 Fallback event data:', eventData);
      }

      // Validate and clean the data
      const eventDate = eventData.eventDate ? new Date(eventData.eventDate) : null;
      let checklist = eventData.checklist || [];
      
      console.log('📋 Raw checklist:', checklist);
      
      // Always apply time organization to the checklist
      if (checklist.length > 0) {
        checklist = organizeChecklistByTimePeriods(checklist, eventDate);
        console.log('🗓️ Organized checklist:', checklist);
      }
      
      const finalEventData = {
        title: eventData.title || 'Event from Chat',
        description: eventData.description || 'Event planning checklist',
        eventDate: eventDate,
        category: eventData.category || 'task',
        priority: eventData.priority || 'medium',
        checklist: checklist,
        timeline: [], // Focus on checklist
        status: 'pending'
      };
      
      console.log('✅ Final event data:', finalEventData);
      return finalEventData;

    } catch (error) {
      console.warn('⚠️ AI event generation failed, using fallback:', error);
      // Fallback to the original extraction method if AI call fails
      const fallbackData = extractEventFromContent(content, timestamp, currentPlanId);
      console.log('🔄 Fallback extraction result:', fallbackData);
      return fallbackData;
    }
  };

  const extractEventFromContent = (content, timestamp, currentPlanId) => {
    console.log('🔄 Extracting event from content (fallback method)...');
    
    const lines = content.split('\n');
    const lowerContent = content.toLowerCase();
    
    // Smart event naming logic
    let title = generateSmartEventName(content);
    let eventDate = extractMainEventDate(content);
    let category = detectEventCategory(content);
    let priority = detectPriority(content);
    
    console.log('📊 Extracted basic info:', { title, eventDate, category, priority });
    
    // Focus on extracting and organizing checklist with intelligent due dates
    const checklist = extractAndOrganizeChecklist(content, eventDate);
    console.log('📋 Extracted checklist:', checklist);
    
    // Create minimal description (just the event summary, not the full content)
    let description = extractEventSummary(content);

    const extractedData = {
      title,
      description,
      eventDate,
      category,
      priority,
      checklist,
      timeline: [], // Focus on checklist, minimal timeline
      status: 'pending'
    };
    
    console.log('📦 Complete extracted data:', extractedData);
    return extractedData;
  };

  const generateSmartEventName = (content) => {
    const lowerContent = content.toLowerCase();
    
    // Extract event type and date for naming
    let eventType = 'Event';
    let dateStr = '';
    
    // Detect event type
    if (lowerContent.includes('mixer')) eventType = 'Mixer';
    else if (lowerContent.includes('concert')) eventType = 'Concert';
    else if (lowerContent.includes('workshop')) eventType = 'Workshop';
    else if (lowerContent.includes('meeting')) eventType = 'Meeting';
    else if (lowerContent.includes('conference')) eventType = 'Conference';
    else if (lowerContent.includes('lecture')) eventType = 'Lecture';
    else if (lowerContent.includes('seminar')) eventType = 'Seminar';
    else if (lowerContent.includes('event')) eventType = 'Event';
    
    // Extract date information for naming
    const monthYearRegex = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i;
    const monthMatch = content.match(monthYearRegex);
    
    if (monthMatch) {
      const month = monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1);
      const year = monthMatch[2];
      dateStr = ` ${month} ${year}`;
    } else {
      // Try to extract just year or month
      const yearMatch = content.match(/\b(202[4-9]|20[3-9]\d)\b/);
      const monthOnlyMatch = content.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
      
      if (yearMatch) {
        dateStr = ` ${yearMatch[0]}`;
      } else if (monthOnlyMatch) {
        const month = monthOnlyMatch[0].charAt(0).toUpperCase() + monthOnlyMatch[0].slice(1);
        dateStr = ` ${month}`;
      }
    }
    
    return `${eventType}${dateStr}`;
  };

  const extractMainEventDate = (content) => {
    // Try various date formats
    const dateFormats = [
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,  // MM/DD/YYYY or MM-DD-YYYY
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i,  // Month DD, YYYY
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i  // Month YYYY
    ];
    
    for (const regex of dateFormats) {
      const match = content.match(regex);
      if (match) {
        try {
          return new Date(match[0]);
        } catch (e) {
          continue;
        }
      }
    }
    return null;
  };

  const detectEventCategory = (content) => {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('meeting') || lowerContent.includes('conference')) return 'meeting';
    if (lowerContent.includes('deadline') || lowerContent.includes('due')) return 'deadline';
    if (lowerContent.includes('milestone')) return 'milestone';
    return 'task';
  };

  const detectPriority = (content) => {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('critical') || lowerContent.includes('urgent') || lowerContent.includes('asap')) return 'critical';
    if (lowerContent.includes('high') || lowerContent.includes('important') || lowerContent.includes('priority')) return 'high';
    if (lowerContent.includes('low') || lowerContent.includes('optional')) return 'low';
    return 'medium';
  };

  const extractAndOrganizeChecklist = (content, mainEventDate) => {
    const lines = content.split('\n');
    const checklist = [];
    
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const taskText = trimmed.substring(1).trim();
        if (taskText) {
          const taskInfo = parseTaskWithDueDate(taskText, mainEventDate);
          checklist.push(taskInfo);
        }
      }
    });
    
    // Organize checklist by time periods and add time period labels
    return organizeChecklistByTimePeriods(checklist, mainEventDate);
  };

  const organizeChecklistByTimePeriods = (checklist, eventDate) => {
    if (!eventDate || !checklist || checklist.length === 0) {
      // If no event date, just sort by due date and return as is
      checklist.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
      return checklist;
    }

    const eventDateTime = new Date(eventDate);
    const now = new Date();
    
    // Categorize tasks by time periods
    const timePeriods = {
      '6+ months out': [],
      '3-6 months out': [],
      '1-3 months out': [],
      '2-4 weeks out': [],
      '1-2 weeks out': [],
      'Week of event': [],
      'Day of event': [],
      'After event': []
    };
    
    checklist.forEach(task => {
      if (!task.dueDate) {
        // Tasks without due dates go to the earliest applicable period
        timePeriods['3-6 months out'].push(task);
        return;
      }
      
      const dueDate = new Date(task.dueDate);
      const daysUntilEvent = Math.ceil((eventDateTime - dueDate) / (1000 * 60 * 60 * 24));
      
      // Categorize based on how far before the event the task is due
      if (daysUntilEvent >= 180) { // 6+ months
        timePeriods['6+ months out'].push(task);
      } else if (daysUntilEvent >= 90) { // 3-6 months
        timePeriods['3-6 months out'].push(task);
      } else if (daysUntilEvent >= 30) { // 1-3 months
        timePeriods['1-3 months out'].push(task);
      } else if (daysUntilEvent >= 14) { // 2-4 weeks
        timePeriods['2-4 weeks out'].push(task);
      } else if (daysUntilEvent >= 7) { // 1-2 weeks
        timePeriods['1-2 weeks out'].push(task);
      } else if (daysUntilEvent >= 1) { // Week of event
        timePeriods['Week of event'].push(task);
      } else if (daysUntilEvent >= 0) { // Day of event
        timePeriods['Day of event'].push(task);
      } else { // After event
        timePeriods['After event'].push(task);
      }
    });
    
    // Create organized checklist with time period headers
    const organizedChecklist = [];
    
    Object.entries(timePeriods).forEach(([period, tasks]) => {
      if (tasks.length > 0) {
        // Add time period header
        organizedChecklist.push({
          task: `--- ${period.toUpperCase()} ---`,
          isTimeHeader: true,
          timePeriod: period,
          dueDate: null,
          priority: 'medium',
          completed: false
        });
        
        // Sort tasks within the period by priority (critical first) then by due date
        tasks.sort((a, b) => {
          const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          const aPriority = priorityOrder[a.priority] || 2;
          const bPriority = priorityOrder[b.priority] || 2;
          
          if (aPriority !== bPriority) return aPriority - bPriority;
          
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate) - new Date(b.dueDate);
        });
        
        // Add the sorted tasks
        organizedChecklist.push(...tasks);
      }
    });
    
    return organizedChecklist;
  };

  const parseTaskWithDueDate = (taskText, mainEventDate) => {
    // Extract due date from task text if present
    let task = taskText;
    let dueDate = null;
    let priority = 'medium';
    
    // Look for due date patterns in the task text
    const dueDatePatterns = [
      /\(due\s+([^)]+)\)/i,
      /\(by\s+([^)]+)\)/i,
      /due\s+([a-z]+ \d{1,2})/i,
      /by\s+([a-z]+ \d{1,2})/i
    ];
    
    for (const pattern of dueDatePatterns) {
      const match = taskText.match(pattern);
      if (match) {
        try {
          dueDate = new Date(match[1]);
          task = taskText.replace(match[0], '').trim();
          break;
        } catch (e) {
          continue;
        }
      }
    }
    
    // Assign smart default due dates based on task type if no explicit date
    if (!dueDate && mainEventDate) {
      dueDate = getSmartDueDate(task, mainEventDate);
    }
    
    // Determine priority from task text
    if (task.toLowerCase().includes('urgent') || task.toLowerCase().includes('critical')) {
      priority = 'critical';
    } else if (task.toLowerCase().includes('important') || task.toLowerCase().includes('asap')) {
      priority = 'high';
    }
    
    return {
      task: task,
      description: '',
      dueDate,
      priority,
      completed: false
    };
  };

  const getSmartDueDate = (task, mainEventDate) => {
    const taskLower = task.toLowerCase();
    const eventDate = new Date(mainEventDate);
    
    // Smart due date assignment based on task type
    if (taskLower.includes('book') || taskLower.includes('reserve') || taskLower.includes('venue')) {
      // Booking tasks - 3-4 weeks before
      return new Date(eventDate.getTime() - (25 * 24 * 60 * 60 * 1000));
    } else if (taskLower.includes('invitation') || taskLower.includes('invite') || taskLower.includes('rsvp')) {
      // Invitation tasks - 2-3 weeks before  
      return new Date(eventDate.getTime() - (18 * 24 * 60 * 60 * 1000));
    } else if (taskLower.includes('catering') || taskLower.includes('food') || taskLower.includes('menu')) {
      // Catering tasks - 1-2 weeks before
      return new Date(eventDate.getTime() - (10 * 24 * 60 * 60 * 1000));
    } else if (taskLower.includes('setup') || taskLower.includes('equipment') || taskLower.includes('av')) {
      // Setup tasks - 2-3 days before
      return new Date(eventDate.getTime() - (2 * 24 * 60 * 60 * 1000));
    } else if (taskLower.includes('agenda') || taskLower.includes('material') || taskLower.includes('prepare')) {
      // Preparation tasks - 1 week before
      return new Date(eventDate.getTime() - (7 * 24 * 60 * 60 * 1000));
    } else {
      // Default - 1 week before
      return new Date(eventDate.getTime() - (7 * 24 * 60 * 60 * 1000));
    }
  };

  const extractEventSummary = (content) => {
    const lines = content.split('\n');
    // Take first non-bullet point line as summary
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('•') && !trimmed.startsWith('-') && !trimmed.startsWith('*')) {
        return trimmed.length > 150 ? trimmed.substring(0, 150) + '...' : trimmed;
      }
    }
    return 'Event planning checklist';
  };

  const formatMessage = (content) => {
    // Simple formatting for bullet points and line breaks
    return content.split('\n').map((line, index) => (
      <div key={index} className={line.trim().startsWith('•') || line.trim().startsWith('-') ? 'ml-4' : ''}>
        {line}
      </div>
    ));
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {eventContext && (
              <button
                onClick={() => navigate('/saved-events', { 
                  state: { selectedEventId: eventContext.eventId }
                })}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Back to Event Details"
              >
                <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
              </button>
            )}
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {eventContext ? `Planning: ${eventContext.title}` : plan ? plan.title : 'New Program Plan'}
              </h1>
              <p className="text-sm text-gray-500">
                {eventContext 
                  ? 'Continue planning your event with AI assistance'
                  : 'AI-powered program planning assistance'
                }
              </p>
            </div>
          </div>
          {(plan || eventContext) && (
            <div className="text-sm text-gray-500">
              {plan ? `Plan ID: ${plan._id}` : `Event: ${eventContext?.eventId}`}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
  {/* Messages */}
<div className="flex-1 overflow-y-auto p-6 space-y-4">
  {messages.map((m, i) => (
    <MessageBubble
      key={i}
      role={m.role}
      content={m.content}
      timestamp={m.timestamp}
      onSaveEvent={handleSaveEvent}
      user={user}
      planId={planId}
    />
  ))}

  {loading && (
    <div className="flex justify-start">
      <div className="bg-white border border-gray-200 text-gray-900 px-4 py-3 rounded-lg">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-vanderbilt-gold"></div>
          <span className="text-sm">AI is thinking...</span>
        </div>
      </div>
    </div>
  )}

  <div ref={messagesEndRef} />
</div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <form onSubmit={handleSendMessage} className="flex space-x-4">
          <div className="flex-1">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder="Ask me about program planning policies, timelines, requirements..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-vanderbilt-gold focus:border-vanderbilt-gold resize-none"
              rows="3"
              disabled={loading}
            />
          </div>
          <div className="flex flex-col space-y-2">
            <button
              type="submit"
              disabled={loading || !inputMessage.trim()}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-vanderbilt-gold hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-vanderbilt-gold disabled:opacity-50"
            >
              <PaperAirplaneIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-vanderbilt-gold"
            >
              <DocumentArrowUpIcon className="h-4 w-4" />
            </button>
          </div>
        </form>
        <div className="mt-2 text-xs text-gray-500">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
};

export default Chat;